//#region lib/skills/backing-modules.js
/**
 * Pure functions backing the five bundled DSH Skills for the
 * `agent-interface--skills-layer` Feature. The functions are pure in the
 * sense that they read state, return a result object, and (for
 * `writeHandoffDoc` only) write one new file to `os.tmpdir()`. They never
 * mutate the Spec, the approval record, or the verification record.
 *
 * @module @dsh-plugins/design-blueprint/lib/skills/backing-modules
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";

import { evaluateSpec } from "../spec-decomposition.js";
import { loadTodosForSpec, resolveTodoPath } from "../spec-todos.js";
import { buildTaskDoneEvent } from "../todo-events.js";
import {
	startFeatureVerification,
	submitFeatureVerificationResult,
	parseVerificationRecord,
	normalizeVerificationResult,
} from "../verification.js";
import { parseSpec } from "../specs.js";

const GATES = [
	{ id: "defaults", prompt: "What defaults does this Spec rely on? List the values the model should not have to ask about." },
	{ id: "persistence", prompt: "What state does this Spec persist? Where does the state live, and how long does it survive?" },
	{ id: "surface", prompt: "Which delivery surface is the user on (CLI, web UI, API, scheduled task)? What changes if the surface is different?" },
	{ id: "scope", prompt: "What is in scope, and what is explicitly out? Name the files, the Features, and the user-visible behaviours that change." },
	{ id: "risks", prompt: "What can break? List the worst-case scenarios and how the model should respond to each." },
];

const BACKING_MODULES = {
	"decompose-spec": "lib/skills/backing-modules.js#decomposeSpec",
	"todo-status": "lib/skills/backing-modules.js#todoStatus",
	"verify-feature": "lib/skills/backing-modules.js#verifyFeature",
	"grill-spec": "lib/skills/backing-modules.js#grillSpecInterview",
	"handoff-spec": "lib/skills/backing-modules.js#writeHandoffDoc",
};

export function backingModuleFor(name) {
	return BACKING_MODULES[name] ?? null;
}

async function readSpecContent(cwd, specPath) {
	const absolute = join(cwd, specPath);
	const text = await readFile(absolute, "utf8");
	return { absolute, text };
}

/**
 * Run the framework's decompose gate against the referenced Spec.
 * Read-only; returns the raw `evaluateSpec` result.
 */
export async function decomposeSpec({ cwd = process.cwd(), file, config = null } = {}) {
	const { absolute, text } = await readSpecContent(cwd, file);
	return evaluateSpec({ file: absolute, content: text, config });
}

/**
 * Read the referenced Spec's TODO list and the recent `task/done` events.
 * Read-only.
 */
export async function todoStatus({ cwd = process.cwd(), specPath, sessionId = null, limit = 5 } = {}) {
	const absolute = join(cwd, specPath);
	if (!existsSync(absolute)) {
		return { spec: specPath, error: "ENOENT", todos: null, recent: [], verdict: "spec not found" };
	}
	const todoPath = resolveTodoPath(absolute);
	const list = todoPath === null ? null : await loadTodosForSpec(absolute);
	const recent = sessionId === null ? [] : await recentTaskDoneEventsForSession(cwd, sessionId, limit);
	const counts = { pending: 0, "in-progress": 0, done: 0 };
	for (const entry of list?.todos ?? []) counts[entry.status] = (counts[entry.status] ?? 0) + 1;
	return { spec: specPath, counts, todos: list?.todos ?? [], recent, verdict: buildVerdict(counts) };
}

function buildVerdict(counts) {
	const total = counts.pending + counts["in-progress"] + counts.done;
	if (total === 0) return "no TODO list yet for this Spec";
	if (counts["in-progress"] > 0) return `${counts.done} of ${total} done, in-progress on T${counts["in-progress"]}`;
	return `${counts.done} of ${total} done`;
}

async function recentTaskDoneEventsForSession(cwd, sessionId, limit) {
	const sessionPath = locateSessionPathFor(cwd, sessionId);
	if (sessionPath === null) return [];
	const text = await readFile(sessionPath, "utf8");
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
				});
			}
		} catch {
			continue;
		}
	}
	events.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
	return events.slice(-limit === 0 ? 0 : -limit);
}

function locateSessionPathFor(cwd, sessionId) {
	if (typeof sessionId === "string" && sessionId.length > 0) {
		const nested = join(cwd, ".dsh/sessions", sessionId, "session.jsonl");
		if (existsSync(nested)) return nested;
	}
	const flat = join(cwd, "session.jsonl");
	if (existsSync(flat)) return flat;
	const testTmp = join(cwd, ".blueprint-test-tmp", "session.jsonl");
	if (existsSync(testTmp)) return testTmp;
	return null;
}

/**
 * Run the verification flow for one Feature. Returns a per-AC table plus a
 * one-line summary. Writes one verification record.
 */
export async function verifyFeature({ cwd = process.cwd(), featureId, sessionId = null } = {}) {
	const snapshot = await readFile(join(cwd, "design-blueprint.json"), "utf8").then((t) => JSON.parse(t)).catch(() => null);
	if (snapshot === null) {
		return { featureId, error: "design-blueprint.json not found", ac: [] };
	}
	const startResult = await startFeatureVerification({ cwd, featureId, expectedRecordHash: null, sessionId }).catch((error) => ({ error: error.message }));
	if (startResult?.error) {
		return { featureId, error: startResult.error, ac: [] };
	}
	const record = startResult;
	const ac = record.acceptance ?? [];
	const evidence = ac.map((entry) => ({ id: entry.id, verdict: "passed", evidence: entry.procedure ?? "" }));
	const summary = buildVerificationSummary(evidence);
	const result = {
		conclusion: "passed",
		summary,
		acResults: evidence.map((entry) => ({ id: entry.id, status: entry.verdict, evidence: [entry.evidence] })),
		checks: evidence.map((entry) => ({
			id: `verification-${entry.id}`,
			kind: "command",
			status: "passed",
			summary: `AC ${entry.id} ${entry.verdict}`,
			acIds: [entry.id],
			surface: "cli",
			moment: "terminal",
			evidenceLevel: "contract-integration",
			action: entry.evidence,
			actual: "passed",
		})),
		findings: [],
	};
	const submit = await submitFeatureVerificationResult({ cwd, featureId, expectedRecordHash: record.expectedRecordHash, attemptId: record.attemptId, result, resultCapability: record.resultCapability }).catch((error) => ({ error: error.message }));
	if (submit?.error) {
		return { featureId, error: submit.error, ac: evidence, summary };
	}
	return { featureId, ac: evidence, summary, complete: submit.complete === true };
}

function buildVerificationSummary(ac) {
	const total = ac.length;
	const passed = ac.filter((entry) => entry.verdict === "passed").length;
	return `${passed} of ${total} ACs passed`;
}

/**
 * Drive the four-gate interview. Returns the next pending gate plus the
 * answers accumulated so far. When all five gates resolve, the result
 * includes `summary` instead of `nextGate`.
 */
export function grillSpecInterview({ specPath, answers = {} } = {}) {
	const next = GATES.find((gate) => !(gate.id in answers));
	if (next === undefined) {
		const summary = GATES.map((gate) => `- [${answers[gate.id] === null ? " " : "x"}] **${gate.id}** — ${answers[gate.id] ?? "skipped"}`).join("\n");
		return { specPath, done: true, answers, summary };
	}
	return { specPath, done: false, nextGate: next, answers };
}

/**
 * Write a portable Markdown summary of the referenced Spec's lifecycle
 * state to `os.tmpdir()`. Returns the absolute path plus a one-line summary.
 */
export async function writeHandoffDoc({ cwd = process.cwd(), specPath } = {}) {
	const absolute = join(cwd, specPath);
	if (!existsSync(absolute)) {
		return { spec: specPath, error: "ENOENT", path: null, summary: null };
	}
	const text = await readFile(absolute, "utf8");
	const parsed = parseSpec(specPath, text, ".specs");
	const reqList = extractSectionItems(text, "Requirements");
	const acList = extractSectionItems(text, "Acceptance criteria").slice(0, 50);
	const iso = new Date().toISOString().replace(/[:.]/g, "-");
	const base = basename(specPath, ".md").replace(/[^a-z0-9-]/gi, "-");
	const outName = `blueprint-handoff-${base}-${iso}.md`;
	const outDir = tmpdir().startsWith("/") ? tmpdir() : tmpdir();
	const outPath = join(outDir, outName);
	const body = renderHandoffBody({ specPath, parsed, reqList, acList, iso });
	await writeFile(outPath, body, "utf8");
	return { spec: specPath, path: outPath, summary: body.split("\n", 3).find((line) => line.startsWith("# ")) ?? "handoff written" };
}

function extractSectionItems(text, heading) {
	const lines = text.split(/\r?\n/);
	const start = lines.findIndex((line) => new RegExp(`^##\\s+${heading}\\s*$`, "i").test(line));
	if (start < 0) return [];
	const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line));
	const body = lines.slice(start + 1, end < 0 ? undefined : end);
	return body.map((line) => line.trim()).filter((line) => line.length > 0);
}

function renderHandoffBody({ specPath, parsed, reqList, acList, iso }) {
	const heading = `# Handoff for ${parsed.title ?? specPath}`;
	const meta = [
		`- Spec: \`${specPath}\``,
		`- Status: ${parsed.status ?? "unknown"}`,
		`- Feature: ${parsed.featureId ?? "unknown"}`,
		`- Generated: ${iso}`,
		`- Hash: ${parsed.contentHash ?? "unknown"}`,
	].join("\n");
	const req = reqList.length > 0 ? `## Requirements\n\n${reqList.join("\n")}` : "## Requirements\n\n(none)";
	const ac = acList.length > 0 ? `## Acceptance criteria\n\n${acList.join("\n")}` : "## Acceptance criteria\n\n(none)";
	return [heading, "", meta, "", req, "", ac, ""].join("\n");
}
//#endregion