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
