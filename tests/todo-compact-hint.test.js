import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initBlueprint } from "../lib/init.js";
import { serializeFeature } from "../lib/features.js";
import { approveFeatureProposal } from "../lib/workflow.js";
import { saveTodoList } from "../lib/todo-store.js";

const execute = promisify(execFile);
const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "cli.js");

async function fixture({ sessionBytes = 0, priorDone = false } = {}) {
	const root = await mkdtemp(join(tmpdir(), "blueprint-todo-compact-"));
	await initBlueprint(root);
	await mkdir(join(root, ".blueprint/architecture/components"), { recursive: true });
	const componentContent = [
		"# Component: foo-plugin", "", "Id: foo-plugin", "Kind: plugin", "Container: none",
		"Deployment:", "Status: active", "", "## Summary", "", "Foo.", "", "## Owned paths",
		"", "- `*`", "- `lib/foo/**`", "", "## Supported features", "", "- foo", "",
		"## Documents", "", "- required: `lib/foo.js`", "",
	].join("\n");
	await writeFile(join(root, ".blueprint/architecture/components/foo-plugin.md"), componentContent, "utf8");
	await writeFile(join(root, ".blueprint/features", "foo.md"), serializeFeature({
		id: "foo", title: "Foo", status: "active", parentId: null, summary: "Foo feature",
		scope: ["lib/foo/**"], documents: [{ level: "required", path: "lib/foo.js" }],
		acceptance: [], components: ["foo-plugin"],
	}), "utf8");
	const specPath = join(root, ".specs/proposed/foo.md");
	const zhPath = join(root, ".specs/proposed/foo.zh.md");
	const en = [
		"# Spec: Foo", "", "Status: proposed", "Feature: foo", "", "## Problem", "", "F.",
		"", "## Scope", "", "- allow: `lib/foo.js`", "", "## Proposal", "", "P.",
		"", "## Alternatives considered", "", "A.", "", "## Acceptance criteria", "",
		"- AC-1: F.", "", "## Verification", "", "- AC-1: manual.", "", "## Risks", "", "R.", "",
	].join("\n");
	const zh = en.replace(/^# Spec: Foo$/m, "# 规格：Foo").replace(/^Status: proposed$/m, "状态：拟议").replace(/^Feature: foo$/m, "功能：foo");
	await mkdir(join(root, ".specs/proposed"), { recursive: true });
	await writeFile(specPath, en, "utf8");
	await writeFile(zhPath, zh, "utf8");
	const { createHash } = await import("node:crypto");
	const realHash = createHash("sha256").update(en).update("\0").update(zh).digest("hex");
	await approveFeatureProposal({ cwd: root, featureId: "foo", expectedSpecHash: realHash });
	const todoPath = join(root, ".specs/proposed/foo.todos.yaml");
	const list = {
		version: 1,
		spec: ".specs/proposed/foo.md",
		createdAt: new Date().toISOString(),
		createdBy: "session-test",
		todos: [
			{ id: "T1", status: "in-progress", req: "REQ-FOO-1", ac: "AC-FOO-1", title: "Author foo" },
		],
	};
	await saveTodoList(todoPath, list);
	// Build session.jsonl with prior task/done if requested
	const sessionPath = join(root, "session.jsonl");
	const lines = [];
	if (priorDone) {
		lines.push({ seq: 1, type: "task/done", time: Date.now() - 60000, data: { todoId: "T0", spec: ".specs/proposed/foo.md", req: "REQ-FOO-0", ac: "AC-FOO-0", title: "Prior task", sessionId: "session-test" } });
	}
	if (sessionBytes > 0) {
		// Pad with filler assistant messages to exceed threshold
		const fillerSize = sessionBytes;
		const big = "a".repeat(fillerSize);
		lines.push({ seq: 2, type: "assistant/message", time: Date.now() - 30000, data: { role: "assistant", content: [{ type: "text", text: big }] } });
	}
	await writeFile(sessionPath, lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
	return { root, specPath };
}

async function runCli(args, cwd, opts = {}) {
	let result = null;
	let thrown = null;
	try {
		result = await execute(process.execPath, [cli, ...args], { cwd, ...opts });
	} catch (e) {
		thrown = e;
	}
	return { code: thrown?.code ?? result?.code ?? 0, stdout: result?.stdout ?? thrown?.stdout ?? "", stderr: thrown?.stderr ?? result?.stderr ?? "" };
}

test("todo mark done emits the compaction hint when bytes exceed 1 MiB", async () => {
	const { root, specPath } = await fixture({ sessionBytes: 1_500_000, priorDone: false });
	const r = await runCli(["todo", "mark", "T1", "done", "--spec", ".specs/proposed/foo.md", "--cwd", root], root);
	assert.equal(r.code, 0);
	assert.match(r.stdout, /Compaction hint: \d+\.\d+ MiB accumulated since last task\/done\. Type \/compact before continuing\./);
	await rm(root, { recursive: true, force: true });
});

test("todo mark done does not emit the hint when bytes are under 1 MiB", async () => {
	const { root, specPath } = await fixture({ sessionBytes: 100_000, priorDone: false });
	const r = await runCli(["todo", "mark", "T1", "done", "--spec", ".specs/proposed/foo.md", "--cwd", root], root);
	assert.equal(r.code, 0);
	assert.doesNotMatch(r.stdout, /Compaction hint:/);
	await rm(root, { recursive: true, force: true });
});

test("todo mark done emits red verdict when bytes exceed 4 MiB", async () => {
	const { root, specPath } = await fixture({ sessionBytes: 5_000_000, priorDone: false });
	const r = await runCli(["todo", "mark", "T1", "done", "--spec", ".specs/proposed/foo.md", "--cwd", root], root);
	assert.equal(r.code, 0);
	assert.match(r.stdout, /Compaction hint: \d+\.\d+ MiB/);
	assert.match(r.stdout, /🟡 Compact now\./);
	await rm(root, { recursive: true, force: true });
});

test("todo mark done prints 'no session.jsonl' on stderr when no session exists", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-todo-compact-no-session-"));
	try {
		await initBlueprint(root);
		await mkdir(join(root, ".blueprint/architecture/components"), { recursive: true });
		await writeFile(join(root, ".blueprint/architecture/components/foo-plugin.md"),
			"# Component: foo-plugin\n\nId: foo-plugin\nKind: plugin\nContainer: none\nDeployment:\nStatus: active\n\n## Summary\n\nFoo.\n\n## Owned paths\n\n- `*`\n\n## Supported features\n\n- foo\n\n## Documents\n\n- required: `lib/foo.js`\n", "utf8");
		await writeFile(join(root, ".blueprint/features", "foo.md"), serializeFeature({
			id: "foo", title: "Foo", status: "active", parentId: null, summary: "Foo feature",
			scope: ["lib/foo/**"], documents: [{ level: "required", path: "lib/foo.js" }],
			acceptance: [], components: ["foo-plugin"],
		}), "utf8");
		const en = "# Spec: Foo\n\nStatus: proposed\nFeature: foo\n\n## Problem\n\nF.\n\n## Scope\n\n- allow: `lib/foo.js`\n\n## Proposal\n\nP.\n\n## Alternatives considered\n\nA.\n\n## Acceptance criteria\n\n- AC-1: F.\n\n## Verification\n\n- AC-1: manual.\n\n## Risks\n\nR.\n";
		const zh = "# 规格：Foo\n\n状态：拟议\n功能：foo\n\n## Problem\n\nF.\n\n## Scope\n\n- allow: `lib/foo.js`\n\n## Proposal\n\nP.\n\n## Alternatives considered\n\nA.\n\n## Acceptance criteria\n\n- AC-1: F.\n\n## Verification\n\n- AC-1: manual.\n\n## Risks\n\nR.\n";
		await mkdir(join(root, ".specs/proposed"), { recursive: true });
		await writeFile(join(root, ".specs/proposed/foo.md"), en, "utf8");
		await writeFile(join(root, ".specs/proposed/foo.zh.md"), zh, "utf8");
		const { createHash } = await import("node:crypto");
		const realHash = createHash("sha256").update(en).update("\0").update(zh).digest("hex");
		await approveFeatureProposal({ cwd: root, featureId: "foo", expectedSpecHash: realHash });
		const todoPath = join(root, ".specs/proposed/foo.todos.yaml");
		await saveTodoList(todoPath, {
			version: 1, spec: ".specs/proposed/foo.md",
			createdAt: new Date().toISOString(), createdBy: "session-test",
			todos: [{ id: "T1", status: "in-progress", req: "REQ-FOO-1", ac: "AC-FOO-1", title: "Author foo" }],
		});
		const r = await runCli(["todo", "mark", "T1", "done", "--spec", ".specs/proposed/foo.md", "--cwd", root], root);
		assert.equal(r.code, 0);
		assert.match(r.stderr, /Compaction hint: skipped \(no session\.jsonl/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("todo status prints counts, recent events, byte delta, and verdict", async () => {
	const { root, specPath } = await fixture({ sessionBytes: 800_000, priorDone: true });
	const todoPath = join(root, ".specs/proposed/foo.todos.yaml");
	const todoExists = await readFile(todoPath, "utf8").then(() => true).catch(() => false);
	assert.ok(todoExists, "todo file should exist before status run");
	const r = await runCli(["todo", "status", "--spec", ".specs/proposed/foo.md", "--cwd", root], root);
	assert.equal(r.code, 0, `status failed: stdout=${r.stdout} stderr=${r.stderr}`);
	assert.match(r.stdout, /Counts:/);
	assert.match(r.stdout, /Recent task\/done events:/);
	assert.match(r.stdout, /Segment bytes since prior task\/done:/);
	await rm(root, { recursive: true, force: true });
});

test("todo status --json returns structured JSON", async () => {
	const { root, specPath } = await fixture({ sessionBytes: 100_000, priorDone: true });
	const r = await runCli(["todo", "status", "--spec", ".specs/proposed/foo.md", "--json", "--cwd", root], root);
	assert.equal(r.code, 0);
	const parsed = JSON.parse(r.stdout);
	assert.equal(parsed.spec, ".specs/proposed/foo.md");
	assert.ok(parsed.counts);
	assert.ok(Array.isArray(parsed.recent));
	assert.ok(typeof parsed.segmentBytes === "number");
	await rm(root, { recursive: true, force: true });
});

test("todo mark without --spec exits non-zero and emits no hint", async () => {
	const { root } = await fixture();
	const r = await runCli(["todo", "mark", "T1", "done"], root);
	assert.notEqual(r.code, 0);
	assert.doesNotMatch(r.stdout, /Compaction hint:/);
	await rm(root, { recursive: true, force: true });
});