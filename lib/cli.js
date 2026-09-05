#!/usr/bin/env node
//#region lib/types/cli.js
/** CLI for blueprint initialization, staged audits, stamps, and hook setup. */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadConfig } from "./config.js";
import { confirmTranslationPair, inspectDocumentation } from "./docs.js";
import { initBlueprint } from "./init.js";
import { installHook } from "./install-hook.js";
import { resolveBlueprintRoot } from "./project-root.js";
import { formatScanSummary, scan } from "./scan.js";
import { workingTreeSnapshot } from "./snapshot.js";
import { atomicWrite, refreshStampsInContent, verifyAllStamps } from "./stamps.js";
import { evaluateSpec as evaluateDecomposition, buildDecompositionTemplate, loadThresholds as loadDecompositionThresholds } from "./spec-decomposition.js";
import { resolveTodoPath, loadTodosForSpec } from "./spec-todos.js";
import { TodoSchemaError, loadTodoList, saveTodoList } from "./todo-store.js";
import { buildTaskDoneEvent, buildTaskStatusEvent } from "./todo-events.js";
import { approveFeatureProposal } from "./workflow.js";
import { requestFeatureVerification } from "./verification.js";
import { runSkillsCommand } from "./skills/cli.js";

const USAGE = `design-blueprint — spec lifecycle and correspondence checks

Usage:
  design-blueprint init [--cwd <path>]
  design-blueprint scan [--cwd <path>] [--all] [--json] [--severity <level>]
  design-blueprint docs {list | check | confirm <file>} [--cwd <path>] [--json]
  design-blueprint approve <feature-id> --spec-hash <sha256> --yes [--cwd <path>] [--json]
  design-blueprint verification request <feature-id> --spec-hash <sha256> --yes [--cwd <path>] [--json]
  design-blueprint todo {list | show <id> | mark <id> <status> | status} --spec <spec.md> [--cwd <path>] [--session-id <id>] [--json]
  design-blueprint spec {decompose | explain} --spec <spec.md> [--cwd <path>] [--out <dir>] [--force] [--json]
  design-blueprint stamp {--verify | --refresh | --acknowledge} [--cwd <path>] [--force]
  design-blueprint install-hook [--local | --global] [--uninstall] [--cwd <path>]
  design-blueprint skills {list | show <name> | info <name>} [--cwd <path>] [--no-line-numbers] [--json]
  design-blueprint --version

scan checks the exact Git index by default. --all checks the working tree.
The local pre-commit hook is the default; global installation must be explicit.
docs confirm records reviewed semantic equivalence; mechanical checks cannot prove translation quality.
approve is the hash-bound fallback for an explicit developer decision when Blueprint Web is unavailable.
verification request is the implementation Session's bounded handoff; it never completes the Feature.
todo list/show/mark manages a Spec's persistent TODO list and emits task/done events to session.jsonl.
spec decompose/explain surfaces the Spec's decomposition assessment and writes parent + sub-Spec patches under <out>.
skills list/show/info inspects the bundled DSH Skills; the subcommand is read-only.
`;

const TODO_VALID_STATUSES = new Set(["pending", "in-progress", "done"]);

function parseArgs(argv) {
	const output = { command: argv[0] ?? null, flags: {}, positional: [] };
	for (let index = 1; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token.startsWith("--")) {
			output.positional.push(token);
			continue;
		}
		const equal = token.indexOf("=");
		if (equal >= 0) {
			output.flags[token.slice(2, equal)] = token.slice(equal + 1);
			continue;
		}
		const key = token.slice(2);
		if (key === "cwd" || key === "severity" || key === "spec-hash" || key === "spec" || key === "session-id" || key === "out" || key === "force" || key === "line-numbers") {
			const value = argv[++index];
			if (!value || value.startsWith("--")) throw new Error(`--${key} requires a value`);
			output.flags[key] = value;
		} else {
			output.flags[key] = true;
		}
	}
	return output;
}

function filterIssues(issues, severity) {
	if (severity === "all") return issues;
	if (severity === "required" || severity === "recommended") return issues.filter((issue) => issue.severity === severity);
	throw new Error(`unknown --severity value: ${severity}`);
}

async function runScan(flags) {
	const result = await scan({ cwd: flags.cwd, all: flags.all === true });
	const issues = filterIssues(result.issues, flags.severity ?? "all");
	if (flags.json) process.stdout.write(JSON.stringify({ ...result, issues }, null, 2) + "\n");
	else process.stdout.write(formatScanSummary(result, issues));
	return issues.some((issue) => issue.severity === "required") ? 1 : 0;
}

async function runSpec(flags, positional) {
	const cwd = flags.cwd ?? process.cwd();
	const action = positional[0];
	if (!new Set(["decompose", "explain", "show"]).has(action)) throw new Error("spec action must be decompose, explain, or show");
	const specPath = typeof flags.spec === "string" ? flags.spec : null;
	if (specPath === null) throw new Error("spec requires --spec <spec.md>");
	const specAbsolute = join(cwd, specPath);
	if (!existsSync(specAbsolute)) throw new Error(`spec file not found: ${specPath}`);
	const text = await readFile(specAbsolute, "utf8");
	const thresholds = loadDecompositionThresholds(null);
	if (action === "show") {
		const rendered = renderSpecForReview(text, { allowEscape: flags.json === true, lineNumbers: flags["no-line-numbers"] !== true });
		if (flags.json) process.stdout.write(JSON.stringify({ file: specPath, lineCount: rendered.lineCount, byteCount: rendered.byteCount, content: rendered.content }, null, 2) + "\n");
		else process.stdout.write(rendered.content);
		return 0;
	}
	if (action === "explain") {
		const result = evaluateDecomposition({ file: specPath, content: text, config: thresholds });
		if (flags.json) {
			process.stdout.write(JSON.stringify(result, null, 2) + "\n");
		} else {
			process.stdout.write(`Spec: ${specPath}\n`);
			process.stdout.write(`Observed: ${JSON.stringify(result.observed)}\n`);
			process.stdout.write(`ok: ${result.ok}\n`);
			for (const v of result.violations) process.stdout.write(`- [${v.check}] ${v.message}\n  fix: ${v.fix}\n`);
			if (result.suggestion) {
				process.stdout.write(`Suggested decomposition (${result.suggestion.subSpecCount} sub-specs):\n`);
				for (const a of result.suggestion.allocations) {
					process.stdout.write(`  - sub-${a.index + 1}: REQ-${a.reqStart}..${a.reqEnd} (${a.reqCount})\n`);
				}
			}
		}
		return result.ok ? 0 : 1;
	}
	// decompose
	const evaluate = evaluateDecomposition({ file: specPath, content: text, config: thresholds });
	if (evaluate.ok) {
		process.stdout.write(`Spec is within decomposition thresholds; nothing to decompose.\n`);
		return 0;
	}
	if (!evaluate.suggestion) throw new Error("decomposition failed: no suggestion produced");
	const template = buildDecompositionTemplate({ file: specPath, content: text, suggestion: evaluate.suggestion, parentFeature: null });
	const outDir = typeof flags.out === "string" ? join(cwd, flags.out) : join(cwd, `${specPath.replace(/\.md$/, "")}.decomposition`);
	if (existsSync(outDir)) {
		if (flags.force !== true) throw new Error(`output directory already exists: ${outDir}; pass --force to overwrite`);
	}
	await mkdir(outDir, { recursive: true });
	const parentFile = join(outDir, "parent.md");
	await atomicWrite(parentFile, template.parent.body);
	process.stdout.write(`Wrote parent: ${parentFile}\n`);
	for (const sub of template.subSpecs) {
		const subFile = join(outDir, sub.file);
		await mkdir(dirname(subFile), { recursive: true });
		await atomicWrite(subFile, sub.body);
		process.stdout.write(`Wrote sub-spec: ${subFile}\n`);
	}
	return 0;
}

async function runStamp(flags) {
	const cwd = flags.cwd ?? process.cwd();
	const modes = ["verify", "refresh", "acknowledge"].filter((mode) => flags[mode]);
	if (modes.length !== 1) throw new Error("stamp requires exactly one of --verify, --refresh, or --acknowledge");
	const { workingTreeSnapshot } = await import("./snapshot.js");
	const snapshot = await workingTreeSnapshot(cwd);
	if (modes[0] === "verify") {
		const rows = verifyAllStamps(snapshot.files, cwd);
		for (const row of rows) process.stdout.write(`${row.status === "current" ? "✓" : "⚠"} ${row.file}${row.lineNumber ? `:${row.lineNumber}` : ""} → ${row.target} (${row.status})\n`);
		return rows.some((row) => row.status !== "current") ? 1 : 0;
	}
	const updates = [];
	for (const file of snapshot.files) {
		const absolute = join(cwd, ...file.split("/"));
		if (!existsSync(absolute)) continue;
		let content;
		try { content = await readFile(absolute, "utf8"); } catch { continue; }
		const updated = refreshStampsInContent(content, cwd);
		if (updated !== content) updates.push({ file, absolute, content, updated });
	}
	if (updates.length === 0) {
		process.stdout.write("No stale stamps found.\n");
		return 0;
	}
	if (modes[0] === "refresh" && !flags.force) {
		process.stdout.write(`Preview: ${updates.length} file(s) would change. Re-run with --force to apply.\n`);
		return 0;
	}
	for (const update of updates) atomicWrite(update.absolute, update.updated, update.content);
	process.stdout.write(`${modes[0] === "acknowledge" ? "Acknowledged" : "Refreshed"} ${updates.length} file(s).\n`);
	return 0;
}

async function runDocs(flags, positional) {
	const action = positional[0] ?? "check";
	if (!new Set(["list", "check", "confirm"]).has(action)) throw new Error("docs action must be list, check, or confirm");
	const cwd = flags.cwd ?? process.cwd();
	if (action === "confirm") {
		if (positional.length !== 2) throw new Error("docs confirm requires exactly one pair path");
		const result = await confirmTranslationPair(cwd, positional[1]);
		if (flags.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
		else process.stdout.write(`Confirmed translation pair: ${result.owner} ↔ ${result.counterpart}\n`);
		return 0;
	}
	if (positional.length > 1) throw new Error(`docs ${action} does not accept a pair path`);
	const root = await resolveBlueprintRoot(cwd);
	const snapshot = await workingTreeSnapshot(root);
	const configResult = await loadConfig(snapshot);
	const result = await inspectDocumentation(snapshot, configResult.config);
	if (flags.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
	else {
		for (const pair of result.pairs) process.stdout.write(`${pair.status}\t${pair.owner}\n`);
		if (result.pairs.length === 0) process.stdout.write("No bilingual document pairs are configured.\n");
		if (action === "check") {
			for (const entry of result.issues) process.stdout.write(`- [${entry.severity}] ${entry.file}: ${entry.message}\n`);
		}
	}
	return action === "check" && result.issues.some((entry) => entry.severity === "required") ? 1 : 0;
}

async function runApprove(flags, positional) {
	if (positional.length !== 1) throw new Error("approve requires exactly one feature id");
	if (typeof flags["spec-hash"] !== "string") throw new Error("approve requires --spec-hash <sha256>");
	const cwd = flags.cwd ?? process.cwd();
	const featureId = positional[0];
	const expectedSpecHash = flags["spec-hash"];
	if (flags.show === true) {
		const approvalRecordPath = join(cwd, ".blueprint/approvals", `${featureId}.json`);
		let sourcePath = null;
		try {
			const existing = JSON.parse(await readFile(approvalRecordPath, "utf8"));
			if (existing?.spec) sourcePath = existing.spec;
		} catch (error) {
			if (error?.code !== "ENOENT") throw error;
		}
		if (sourcePath === null) {
			throw new Error(`approve --show needs an existing approval record at ${approvalRecordPath} so the CLI knows which Spec source file to render; run 'design-blueprint approve <feature> --spec-hash <hash> --yes' first to create one`);
		}
		const specAbsolute = join(cwd, sourcePath);
		if (!existsSync(specAbsolute)) throw new Error(`approved Spec source not found: ${sourcePath}`);
		const text = await readFile(specAbsolute, "utf8");
		const rendered = renderSpecForReview(text, { allowEscape: false, lineNumbers: true });
		if (flags.json) {
			process.stdout.write(JSON.stringify({
				featureId,
				spec: sourcePath,
				specHash: expectedSpecHash,
				lineCount: rendered.lineCount,
				byteCount: rendered.byteCount,
				content: rendered.content,
			}, null, 2) + "\n");
		} else {
			process.stdout.write(`# Blueprint approve — ${featureId}\n`);
			process.stdout.write(`Spec source: ${sourcePath}\n`);
			process.stdout.write(`Hash: ${expectedSpecHash}\n`);
			process.stdout.write(`Lines: ${rendered.lineCount}  Bytes: ${rendered.byteCount}\n\n`);
			process.stdout.write(rendered.content);
			process.stdout.write("\n");
		}
		if (flags.yes !== true) return 0;
	}
	if (flags.yes !== true) throw new Error("approve requires --yes to confirm the direct developer decision");
	const result = await approveFeatureProposal({
		cwd,
		featureId,
		expectedSpecHash,
	});
	if (flags.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
	else process.stdout.write(`Approved ${result.record.featureId} at ${result.record.specHash}: ${result.file}\n`);
	return 0;
}

/**
 * Render a Spec's text content for terminal review.
 *
 * The output adds a four-character gutter column with one-based line numbers
 * by default. The renderer rejects content carrying the ESC byte (`\u001b`)
 * unless `allowEscape` is true, and strips CR bytes so log injection cannot
 * rewrite terminal output.
 *
 * @param {string} text
 * @param {{ allowEscape?: boolean, lineNumbers?: boolean }} options
 * @returns {{ content: string, lineCount: number, byteCount: number }}
 */
function renderSpecForReview(text, options = {}) {
	const allowEscape = options.allowEscape === true;
	const lineNumbers = options.lineNumbers !== false;
	const safeText = stripDangerousBytes(text, allowEscape);
	const lines = safeText.split("\n");
	const lastIsEmpty = lines.length > 0 && lines[lines.length - 1] === "";
	if (lastIsEmpty) lines.pop();
	const lineCount = lines.length;
	const trailingNewline = text.endsWith("\n");
	const body = lineNumbers
		? lines.map((line, index) => `${String(index + 1).padStart(4)}  ${line}`).join("\n") + (trailingNewline ? "\n" : "")
		: safeText;
	return { content: body, lineCount, byteCount: Buffer.byteLength(safeText, "utf8") };
}

function stripDangerousBytes(text, allowEscape) {
	let stripped = text.replace(/\r\n?/g, "\n");
	if (!allowEscape && stripped.includes("\u001b")) {
		throw new Error("Spec content contains ESC bytes (\\u001b); refusing to print unless --json is set to avoid terminal escape abuse");
	}
	return stripped;
}

async function runVerification(flags, positional) {
	if (positional[0] !== "request" || positional.length !== 2) throw new Error("verification requires 'request <feature-id>'");
	if (flags.yes !== true) throw new Error("verification request requires --yes after implementation self-checks");
	if (typeof flags["spec-hash"] !== "string") throw new Error("verification request requires --spec-hash <sha256>");
	const result = await requestFeatureVerification({
		cwd: flags.cwd ?? process.cwd(),
		featureId: positional[1],
		expectedSpecHash: flags["spec-hash"],
	});
	if (flags.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
	else process.stdout.write(`Verification queued for ${result.record.featureId} at ${result.record.snapshot.kind}:${result.record.snapshot.digest}\n`);
	return 0;
}

async function version() {
	const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
	return manifest.version;
}

async function runTodo(flags, positional) {
	const cwd = flags.cwd ?? process.cwd();
	const action = positional[0];
	if (!new Set(["list", "show", "mark", "status"]).has(action)) throw new Error("todo action must be list, show, mark, or status");
	const specPath = typeof flags.spec === "string" ? flags.spec : null;
	if (specPath === null) throw new Error("todo requires --spec <spec.md>");
	const specAbsolute = join(cwd, specPath);
	if (!existsSync(specAbsolute)) throw new Error(`spec file not found: ${specPath}`);
	const todoPath = resolveTodoPath(specAbsolute);
	if (todoPath === null && action !== "mark") {
		if (flags.json) process.stdout.write(JSON.stringify({ spec: specPath, todos: null }, null, 2) + "\n");
		else process.stdout.write("(no TODO list yet for this Spec)\n");
		return 0;
	}
	const list = todoPath === null ? null : await loadTodoList(todoPath);
	if (action === "list") {
		if (list === null) {
			if (flags.json) process.stdout.write(JSON.stringify({ spec: specPath, todos: [] }, null, 2) + "\n");
			else process.stdout.write("(no TODO list yet for this Spec)\n");
			return 0;
		}
		if (flags.json) process.stdout.write(JSON.stringify({ spec: specPath, todoPath, todos: list.todos }, null, 2) + "\n");
		else process.stdout.write(formatTodoTable(list.todos) + "\n");
		return 0;
	}
	if (action === "show") {
		const id = positional[1];
		if (typeof id !== "string") throw new Error("todo show requires <id>");
		if (list === null) throw new Error("no TODO list to show entries from");
		const entry = list.todos.find((entry) => entry.id === id);
		if (entry === undefined) throw new Error(`TODO '${id}' not found in ${specPath}`);
		if (flags.json) process.stdout.write(JSON.stringify(entry, null, 2) + "\n");
		else process.stdout.write(formatTodoTable([entry]) + "\n");
		return 0;
	}
	if (action === "status") {
		return await runTodoStatus(flags, positional);
	}
	// mark
	const id = positional[1];
	const status = positional[2];
	if (typeof id !== "string" || typeof status !== "string") throw new Error("todo mark requires <id> <status>");
	if (!TODO_VALID_STATUSES.has(status)) throw new Error(`status must be one of ${[...TODO_VALID_STATUSES].join(", ")}`);
	const now = new Date();
	const seq = now.valueOf();
	const time = now.valueOf();
	const sessionId = typeof flags["session-id"] === "string" && flags["session-id"].length > 0
		? flags["session-id"]
		: (process.env.DSH_SESSION_ID ?? "unknown");
	const specRelative = specPath.replace(/\\/g, "/");
	let workingList = list;
	if (workingList === null) {
		workingList = {
			version: 1,
			spec: specRelative,
			createdAt: now.toISOString(),
			createdBy: sessionId,
			todos: [],
		};
	}
	const existing = workingList.todos.find((entry) => entry.id === id);
	if (existing === undefined) throw new Error(`TODO '${id}' not found in ${specPath}`);
	if (existing.status === status) {
		process.stdout.write(`TODO '${id}' already at status '${status}'; no event written.\n`);
		return 0;
	}
	const from = existing.status;
	existing.status = status;
	if (status === "done") {
		existing.doneAt = now.toISOString();
		existing.doneBy = sessionId;
	}
	const targetPath = todoPath ?? `${specAbsolute.replace(/\.md$/, "")}.todos.yaml`;
	const saveResult = await saveTodoList(targetPath, workingList);
	if (saveResult.violations.length > 0) throw new TodoSchemaError(saveResult.violations);
	await appendSessionEvents(cwd, [
		buildTaskStatusEvent({ todoId: id, from, to: status, spec: specRelative, req: existing.req, ac: existing.ac, seq, time, sessionId }),
		...(status === "done" ? [buildTaskDoneEvent({ todoId: id, spec: specRelative, req: existing.req, ac: existing.ac, title: existing.title, seq: seq + 1, time, sessionId })] : []),
	]);
	process.stdout.write(`Marked ${id} ${from} -> ${status}\n`);
	if (status === "done") {
		process.stdout.write(`Emitted task/done event at seq ${seq + 1}.\n`);
		await emitCompactHint(cwd, sessionId, time);
	}
	return 0;
}

async function runTodoStatus(flags, positional) {
	const cwd = flags.cwd ?? process.cwd();
	const specPath = typeof flags.spec === "string" ? flags.spec : null;
	if (specPath === null) throw new Error("todo status requires --spec <spec.md>");
	const specAbsolute = join(cwd, specPath);
	if (!existsSync(specAbsolute)) throw new Error(`spec file not found: ${specPath}`);
	const todoPath = resolveTodoPath(specAbsolute);
	const list = todoPath === null ? null : await loadTodoList(todoPath);
	const sessionId = typeof flags["session-id"] === "string" && flags["session-id"].length > 0 ? flags["session-id"] : null;
	const sessionPath = locateSessionPath(cwd, sessionId);
	const recent = sessionPath === null ? [] : await recentTaskDoneEvents(sessionPath, 3);
	const { lo, hi } = lastWindow(recent, sessionPath);
	const bytes = sessionPath === null ? 0 : await readSessionSegmentBytes(sessionPath, lo, hi);
	const verdict = classifyCompactBytes(bytes);
	const counts = { pending: 0, "in-progress": 0, done: 0 };
	for (const entry of list?.todos ?? []) counts[entry.status] = (counts[entry.status] ?? 0) + 1;
	if (flags.json) {
		process.stdout.write(JSON.stringify({ spec: specPath, counts, recent, segmentBytes: bytes, segmentWindow: { lo, hi }, verdict }, null, 2) + "\n");
	} else {
		process.stdout.write(`Spec: ${specPath}\n`);
		process.stdout.write(`Counts: pending=${counts.pending} in-progress=${counts["in-progress"]} done=${counts.done}\n`);
		if (recent.length === 0) process.stdout.write(`Recent task/done events: none yet\n`);
		else {
			process.stdout.write(`Recent task/done events:\n`);
			for (const r of recent) process.stdout.write(`  - ${r.todoId} ${r.ac} @ ${new Date(r.time).toISOString()} ${r.title}\n`);
		}
		process.stdout.write(`Segment bytes since prior task/done: ${formatBytes(bytes)} ${verdictEmoji(verdict)} (${verdict})\n`);
	}
	return 0;
}

async function emitCompactHint(cwd, sessionId, nowMs) {
	const sessionPath = locateSessionPath(cwd, sessionId);
	if (sessionPath === null) {
		process.stderr.write(`Compaction hint: skipped (no session.jsonl at <path>).\n`);
		return;
	}
	const recent = await recentTaskDoneEvents(sessionPath, 1);
	const prior = recent[0];
	const lo = typeof prior?.time === "number" && prior.time < nowMs ? prior.time : 0;
	const hi = nowMs;
	const bytes = await readSessionSegmentBytes(sessionPath, lo, hi);
	const verdict = classifyCompactBytes(bytes);
	if (verdict === "green") return;
	const human = (bytes / (1024 * 1024)).toFixed(2);
	const trail = verdict === "red" ? " 🟡 Compact now." : "";
	process.stdout.write(`Compaction hint: ${human} MiB accumulated since last task/done. Type /compact before continuing.${trail}\n`);
}

function locateSessionPath(cwd, sessionId) {
	if (typeof sessionId === "string" && sessionId.length > 0) {
		const nested = join(cwd, ".dsh/sessions", sessionId, "session.jsonl");
		if (existsSync(nested)) return nested;
	}
	const flat = join(cwd, "session.jsonl");
	if (existsSync(flat)) return flat;
	return null;
}

async function readSessionSegmentBytes(sessionPath, lo, hi) {
	let text;
	try {
		text = await readFile(sessionPath, "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") return 0;
		throw error;
	}
	let total = 0;
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		try {
			const record = JSON.parse(trimmed);
			if (typeof record?.time !== "number") continue;
			if (record.time <= lo) continue;
			if (record.time > hi) continue;
			total += Buffer.byteLength(trimmed, "utf8") + 1;
		} catch {
			continue;
		}
	}
	return total;
}

async function recentTaskDoneEvents(sessionPath, limit) {
	let text;
	try {
		text = await readFile(sessionPath, "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") return [];
		throw error;
	}
	const events = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		try {
			const record = JSON.parse(trimmed);
			if (record?.type === "task/done") {
				events.push({
					todoId: record.data?.todoId ?? "",
					spec: record.data?.spec ?? "",
					req: record.data?.req ?? "",
					ac: record.data?.ac ?? "",
					title: record.data?.title ?? "",
					time: typeof record.time === "number" ? record.time : 0,
					sessionId: record.data?.sessionId ?? null,
				});
			}
		} catch {
			continue;
		}
	}
	events.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
	return events.slice(-limit === 0 ? 0 : -limit);
}

function lastWindow(recent, sessionPath) {
	if (recent.length === 0) return { lo: 0, hi: 0 };
	if (recent.length === 1) return { lo: 0, hi: recent[0].time };
	const last = recent[recent.length - 1];
	const prior = recent[recent.length - 2];
	return { lo: prior.time, hi: last.time };
}

function classifyCompactBytes(bytes) {
	if (bytes >= 4 * 1024 * 1024) return "red";
	if (bytes >= 1 * 1024 * 1024) return "yellow";
	return "green";
}

function verdictEmoji(verdict) {
	if (verdict === "red") return "🔴";
	if (verdict === "yellow") return "🟡";
	return "🟢";
}

function formatBytes(bytes) {
	if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KiB`;
	return `${bytes} B`;
}

function formatTodoTable(todos) {
	const header = "| id | status | req | ac | title | doneAt |";
	const sep = "| --- | --- | --- | --- | --- | --- |";
	const rows = todos.map((entry) => `| ${entry.id} | ${entry.status} | ${entry.req} | ${entry.ac} | ${entry.title} | ${entry.doneAt ?? ""} |`);
	return [header, sep, ...rows].join("\n");
}

async function appendSessionEvents(cwd, events) {
	const sessionPath = join(cwd, "session.jsonl");
	if (!existsSync(sessionPath)) return;
	const text = events.map((event) => JSON.stringify(event)).join("\n") + "\n";
	await appendFile(sessionPath, text, "utf8");
}

async function main() {
	const parsed = parseArgs(process.argv.slice(2));
	if (parsed.flags.help || parsed.command === null || parsed.command === "help" || parsed.command === "--help" || parsed.command === "-h") {
		process.stdout.write(USAGE);
		return 0;
	}
	if (parsed.command !== "docs" && parsed.command !== "approve" && parsed.command !== "verification" && parsed.command !== "todo" && parsed.command !== "spec" && parsed.command !== "skills" && parsed.positional.length > 0) throw new Error(`unexpected positional arguments: ${parsed.positional.join(" ")}`);
	if (parsed.command === "init") {
		const result = await initBlueprint(parsed.flags.cwd ?? process.cwd());
		if (result.created.length > 0) process.stdout.write(`Created: ${result.created.join(", ")}\n`);
		if (result.updated.length > 0) process.stdout.write(`Updated: ${result.updated.join(", ")}\n`);
		if (result.created.length === 0 && result.updated.length === 0) process.stdout.write("Blueprint files already exist; nothing changed.\n");
		return 0;
	}
	if (parsed.command === "scan") return runScan(parsed.flags);
	if (parsed.command === "docs") return runDocs(parsed.flags, parsed.positional);
	if (parsed.command === "approve") return runApprove(parsed.flags, parsed.positional);
	if (parsed.command === "verification") return runVerification(parsed.flags, parsed.positional);
	if (parsed.command === "todo") return runTodo(parsed.flags, parsed.positional);
	if (parsed.command === "spec") return runSpec(parsed.flags, parsed.positional);
	if (parsed.command === "skills") return runSkillsCommand({ positional: parsed.positional, flags: parsed.flags }, parsed.flags.cwd ?? process.cwd());
	if (parsed.command === "stamp") return runStamp(parsed.flags);
	if (parsed.command === "install-hook") {
		if (parsed.flags.local && parsed.flags.global) throw new Error("choose either --local or --global");
		const scope = parsed.flags.global ? "global" : "local";
		const result = await installHook({ scope, uninstall: parsed.flags.uninstall === true, cwd: parsed.flags.cwd ?? process.cwd() });
		process.stdout.write(`${result.uninstalled ? "Removed" : "Installed"} ${scope} hook: ${result.hookPath}\n`);
		return 0;
	}
	if (parsed.command === "--version" || parsed.command === "-V") {
		process.stdout.write(`design-blueprint ${await version()}\n`);
		return 0;
	}
	throw new Error(`unknown subcommand: ${parsed.command}`);
}

try {
	process.exitCode = await main();
} catch (error) {
	process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 2;
}
//#endregion
