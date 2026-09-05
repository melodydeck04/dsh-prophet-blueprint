import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { initBlueprint } from "../lib/init.js";
import { serializeFeature } from "../lib/features.js";
import { serializeComponent } from "../lib/architecture.js";

const execute = promisify(execFile);
const cli = fileURLToPath(new URL("../lib/cli.js", import.meta.url));

const SPEC = `# Spec: Foo

Status: proposed
Feature: foo

## Problem

Need a feature.

## Scope

- allow: \`tests/fixtures/**\`

## Proposal

Add a feature.

## Alternatives considered

**Nothing.** Rejected because nothing would happen.

## Acceptance criteria

- AC-1: exists.

## Verification

- AC-1: test: \`tests/fixtures/dummy.test.js\`

## Risks

None.
`;

const SAMPLE_TODOS = `version: 1
spec: tests/fixtures/foo.md
createdAt: 2026-09-02T15:00:00Z
createdBy: session-abc
todos:
  - id: T1
    status: pending
    req: REQ-X-1
    ac: AC-X-001
    title: first task
  - id: T2
    status: in-progress
    req: REQ-X-2
    ac: AC-X-002
    title: second task
`;

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "blueprint-cli-todo-"));
	await initBlueprint(root);
	await writeFile(join(root, ".blueprint", "features", "foo.md"), serializeFeature({
		id: "foo",
		title: "Foo",
		status: "planned",
		parentId: null,
		summary: "Foo feature",
		scope: ["tests/fixtures/**"],
		documents: [{ level: "required", path: "tests/fixtures/foo.md" }],
		acceptance: ["Foo exists."],
		components: ["foo-component"],
	}), "utf8");
	await mkdir(join(root, ".blueprint", "architecture", "components"), { recursive: true });
	await writeFile(join(root, ".blueprint", "architecture", "components", "foo-component.md"), serializeComponent({
		id: "foo-component",
		title: "Foo component",
		kind: "service",
		containerId: null,
		deployment: null,
		status: "active",
		summary: "Owns Foo.",
		ownedPaths: ["tests/fixtures/**"],
		contracts: [],
		dependencies: [],
		supportedFeatures: ["foo"],
		documents: [{ level: "required", path: "tests/fixtures/foo.md" }],
	}), "utf8");
	await mkdir(join(root, "tests", "fixtures"), { recursive: true });
	await writeFile(join(root, "tests", "fixtures", "foo.md"), SPEC, "utf8");
	return root;
}

async function writeTodoYaml(root) {
	await mkdir(join(root, "tests", "fixtures"), { recursive: true });
	await writeFile(join(root, "tests", "fixtures", "foo.todos.yaml"), SAMPLE_TODOS, "utf8");
}

async function ensureFixturesDir(root) {
	await mkdir(join(root, "tests", "fixtures"), { recursive: true });
}

async function writeSecondSpec(root) {
	const SPEC_B = `# Spec: Bar

Status: proposed
Feature: foo

## Problem

Need a sibling feature.

## Scope

- allow: \`tests/fixtures/bar.md\`

## Proposal

Add a sibling.

## Alternatives considered

**Nothing.** Rejected because nothing would happen.

## Acceptance criteria

- AC-1: exists.

## Verification

- AC-1: test: \`tests/fixtures/dummy.test.js\`

## Risks

None.
`;
	await writeFile(join(root, "tests", "fixtures", "bar.md"), SPEC_B, "utf8");
	const todoPath = join(root, "tests", "fixtures", "bar.todos.yaml");
	const yaml = `version: 1
spec: tests/fixtures/bar.md
createdAt: 2026-09-02T15:00:00Z
createdBy: session-abc
todos:
  - id: B1
    status: pending
    req: REQ-Y-1
    ac: AC-Y-001
    title: bar task
`;
	await writeFile(todoPath, yaml, "utf8");
}

async function addBarToFeatureDocs(root) {
	const { serializeFeature: serialize } = await import("../lib/features.js");
	const featurePath = join(root, ".blueprint", "features", "bar.md");
	const body = serialize({
		id: "bar",
		title: "Bar",
		status: "active",
		parentId: null,
		summary: "Bar feature",
		scope: ["tests/fixtures/bar.md"],
		documents: [{ level: "required", path: "tests/fixtures/bar.md" }],
		acceptance: ["Bar exists."],
		components: ["bar-component"],
	});
	await writeFile(featurePath, body, "utf8");
}

async function padSession(root, targetBytes) {
	const { appendFile, readFile: read } = await import("node:fs/promises");
	const sessionPath = join(root, "session.jsonl");
	const existing = await read(sessionPath, "utf8").catch(() => "");
	const lastTime = Math.max(0, ...[...existing.matchAll(/"time":(\d+)/g)].map((match) => Number(match[1])));
	const padTime = lastTime + 1;
	const lineTemplate = `{"type":"assistant/chunk","time":__TIME__,"seq":__SEQ__,"data":{"text":"__PAD__"}}\n`;
	const padText = "x".repeat(500);
	const lines = [];
	let total = 0;
	let seq = 1;
	while (total < targetBytes) {
		lines.push(lineTemplate.replace("__TIME__", String(padTime)).replace("__SEQ__", String(seq)).replace("__PAD__", padText));
		total += lineTemplate.length + padText.length;
		seq += 1;
	}
	await appendFile(sessionPath, lines.join(""), "utf8");
}

async function runCli(args, root, env = {}) {
	return execute(process.execPath, [cli, ...args, "--cwd", root], {
		cwd: root,
		env: { ...process.env, ...env },
	});
}

test("todo list prints a table for a known Spec", async () => {
	const root = await fixture();
	try {
		await writeTodoYaml(root);
		const { stdout } = await runCli(["todo", "list", "--spec", "tests/fixtures/foo.md"], root);
		assert.match(stdout, /T1/);
		assert.match(stdout, /T2/);
		assert.match(stdout, /REQ-X-1/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("todo list prints a placeholder when no YAML exists", async () => {
	const root = await fixture();
	try {
		await ensureFixturesDir(root);
		const { stdout } = await runCli(["todo", "list", "--spec", "tests/fixtures/foo.md"], root);
		assert.match(stdout, /no TODO list yet/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("todo show prints the matching entry", async () => {
	const root = await fixture();
	try {
		await writeTodoYaml(root);
		const { stdout } = await runCli(["todo", "show", "T2", "--spec", "tests/fixtures/foo.md"], root);
		assert.match(stdout, /T2/);
		assert.match(stdout, /second task/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("todo mark done writes the YAML and emits task/done to session.jsonl", async () => {
	const root = await fixture();
	try {
		await writeTodoYaml(root);
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		await runCli(["todo", "mark", "T1", "done", "--spec", "tests/fixtures/foo.md", "--session-id", "session-xyz"], root);
		const yaml = await readFile(join(root, "tests", "fixtures", "foo.todos.yaml"), "utf8");
		assert.match(yaml, /status: done/);
		assert.match(yaml, /doneAt:/);
		assert.match(yaml, /doneBy: session-xyz/);
		const session = await readFile(join(root, "session.jsonl"), "utf8");
		assert.match(session, /"type":"task\/status"/);
		assert.match(session, /"type":"task\/done"/);
		assert.match(session, /"todoId":"T1"/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("todo mark is idempotent on the same target status", async () => {
	const root = await fixture();
	try {
		await writeTodoYaml(root);
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		await runCli(["todo", "mark", "T1", "done", "--spec", "tests/fixtures/foo.md", "--session-id", "s1"], root);
		await runCli(["todo", "mark", "T1", "done", "--spec", "tests/fixtures/foo.md", "--session-id", "s2"], root);
		const session = await readFile(join(root, "session.jsonl"), "utf8");
		const matches = session.match(/"type":"task\/done"/g) ?? [];
		assert.equal(matches.length, 1, "second mark must not emit a duplicate task/done");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("todo mark refuses an unknown status", async () => {
	const root = await fixture();
	try {
		await writeTodoYaml(root);
		await assert.rejects(
			runCli(["todo", "mark", "T1", "blocked", "--spec", "tests/fixtures/foo.md"], root),
			/status must be one of/,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("todo mark done on a fresh session prints 'no previous task' (AC-CLI-004)", async () => {
	const root = await fixture();
	try {
		await writeTodoYaml(root);
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		const { stdout } = await runCli(["todo", "mark", "T1", "done", "--spec", "tests/fixtures/foo.md", "--session-id", "session-fresh"], root);
		assert.match(stdout, /Marked T1 .* -> done/);
		assert.match(stdout, /Auto-compact: skipped \(no previous task\)\./);
		assert.doesNotMatch(stdout, /Compaction hint:/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("todo mark done on the same Spec twice prints 'same feature' (AC-CLI-002)", async () => {
	const root = await fixture();
	try {
		await writeTodoYaml(root);
		await mkdir(join(root, "tests", "fixtures"), { recursive: true });
		const todoPath = join(root, "tests", "fixtures", "foo.todos.yaml");
		const yaml = `version: 1
spec: tests/fixtures/foo.md
createdAt: 2026-09-02T15:00:00Z
createdBy: session-abc
todos:
  - id: T1
    status: pending
    req: REQ-X-1
    ac: AC-X-001
    title: first
  - id: T2
    status: pending
    req: REQ-X-2
    ac: AC-X-002
    title: second
`;
		await writeFile(todoPath, yaml, "utf8");
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		await runCli(["todo", "mark", "T1", "done", "--spec", "tests/fixtures/foo.md", "--session-id", "s-same-1"], root);
		const { stdout } = await runCli(["todo", "mark", "T2", "done", "--spec", "tests/fixtures/foo.md", "--session-id", "s-same-2"], root);
		assert.match(stdout, /Auto-compact: skipped \(same feature as previous: foo\)\./);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("todo mark done on a different Spec with small bytes prints 'under threshold' (AC-CLI-003)", async () => {
	const root = await fixture();
	try {
		await writeTodoYaml(root);
		await writeSecondSpec(root);
		await addBarToFeatureDocs(root);
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		await runCli(["todo", "mark", "T1", "done", "--spec", "tests/fixtures/foo.md", "--session-id", "s-under-1"], root);
		const { stdout } = await runCli(["todo", "mark", "B1", "done", "--spec", "tests/fixtures/bar.md", "--session-id", "s-under-2"], root);
		assert.match(stdout, /Auto-compact: skipped \(under threshold: \d+ bytes < 200 KiB\)\./);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("todo mark done on a different Spec with > 200 KiB bytes reports no-dispatch-surface (AC-CLI-001 / no real DSH surface in this build)", async () => {
	const root = await fixture();
	try {
		await writeTodoYaml(root);
		await writeSecondSpec(root);
		await addBarToFeatureDocs(root);
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		await runCli(["todo", "mark", "T1", "done", "--spec", "tests/fixtures/foo.md", "--session-id", "s-big-1"], root);
		await padSession(root, 500 * 1024);
		const { stdout, stderr } = await runCli(["todo", "mark", "B1", "done", "--spec", "tests/fixtures/bar.md", "--session-id", "s-big-2"], root);
		assert.match(stdout, /Auto-compact: skipped \(no DSH slash-command dispatch surface/);
		assert.match(stderr, /Auto-compact: skipped \(no DSH slash-command dispatch surface/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
