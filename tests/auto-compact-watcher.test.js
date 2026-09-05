import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initBlueprint } from "../lib/init.js";
import { serializeFeature } from "../lib/features.js";
import { createAutoCompactWatcher } from "../lib/auto-compact-watcher.js";

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

**Nothing.**

## Acceptance criteria

- AC-1: exists.

## Verification

- AC-1: test: \`tests/fixtures/dummy.test.js\`

## Risks

None.
`;

const SPEC_B = `# Spec: Bar

Status: proposed
Feature: bar

## Problem

Sibling.

## Scope

- allow: \`tests/fixtures/bar.md\`

## Proposal

Sibling.

## Alternatives considered

**Nothing.**

## Acceptance criteria

- AC-1: exists.

## Verification

- AC-1: test: \`tests/fixtures/dummy.test.js\`

## Risks

None.
`;

async function makeProject() {
	const root = await mkdtemp(join(tmpdir(), "blueprint-acw-"));
	await initBlueprint(root);
	const fooFeature = serializeFeature({
		id: "foo",
		title: "Foo",
		status: "active",
		parentId: null,
		summary: "Foo",
		scope: ["tests/fixtures/**"],
		documents: [{ level: "required", path: "tests/fixtures/foo.md" }],
		acceptance: ["Foo exists."],
		components: ["foo-component"],
	});
	const barFeature = serializeFeature({
		id: "bar",
		title: "Bar",
		status: "active",
		parentId: null,
		summary: "Bar",
		scope: ["tests/fixtures/bar.md"],
		documents: [{ level: "required", path: "tests/fixtures/bar.md" }],
		acceptance: ["Bar exists."],
		components: ["bar-component"],
	});
	await writeFile(join(root, ".blueprint", "features", "foo.md"), fooFeature, "utf8");
	await writeFile(join(root, ".blueprint", "features", "bar.md"), barFeature, "utf8");
	await mkdir(join(root, "tests", "fixtures"), { recursive: true });
	await writeFile(join(root, "tests", "fixtures", "foo.md"), SPEC, "utf8");
	await writeFile(join(root, "tests", "fixtures", "bar.md"), SPEC_B, "utf8");
	return root;
}

async function writeTaskDone(root, { spec, time, seq, todoId = `T${seq}` }) {
	const record = { type: "task/done", time, seq, data: { todoId, spec, req: `REQ-X-${seq}`, ac: `AC-X-${seq}`, title: "x" } };
	await appendFile(join(root, "session.jsonl"), JSON.stringify(record) + "\n", "utf8");
}

async function padSession(root, targetBytes, lastTime) {
	const padLine = `{"type":"assistant/chunk","time":${lastTime + 1},"seq":9999,"data":{"text":"${"x".repeat(500)}"}}\n`;
	let total = 0;
	const lines = [];
	while (total < targetBytes) {
		lines.push(padLine);
		total += padLine.length;
	}
	await appendFile(join(root, "session.jsonl"), lines.join(""), "utf8");
}

function makeStubCtx(compactNow) {
	return { compaction: { compactNow } };
}

function makeStubLogger() {
	const entries = { info: [], warn: [] };
	return {
		info: (msg) => entries.info.push(msg),
		warn: (msg) => entries.warn.push(msg),
		entries,
	};
}

test("createAutoCompactWatcher: factory returns captureAgent/tick/dispose (AC-WATCH-001 shape)", () => {
	const ctx = makeStubCtx(async () => null);
	const watcher = createAutoCompactWatcher({ ctx });
	assert.equal(typeof watcher.captureAgent, "function");
	assert.equal(typeof watcher.tick, "function");
	assert.equal(typeof watcher.dispose, "function");
});

test("createAutoCompactWatcher: tick before captureAgent is no-op (AC-WATCH-001)", async () => {
	const root = await makeProject();
	try {
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		await writeTaskDone(root, { spec: "tests/fixtures/foo.md", time: 1000, seq: 1 });
		const ctx = makeStubCtx(async () => null);
		const watcher = createAutoCompactWatcher({ ctx });
		const result = await watcher.tick({ cwd: root, sessionId: "s1", nowMs: 2000 });
		assert.deepEqual(result, { skipped: "no-agent" });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("createAutoCompactWatcher: fires compactNow on Feature switch + >= 200 KiB (AC-WATCH-002)", async () => {
	const root = await makeProject();
	try {
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		await writeTaskDone(root, { spec: "tests/fixtures/foo.md", time: 1000, seq: 1 });
		await padSession(root, 500 * 1024, 1000);
		await writeTaskDone(root, { spec: "tests/fixtures/bar.md", time: 9_999_999_999, seq: 2 });
		const calls = [];
		const ctx = makeStubCtx(async (agent, signal, commandId) => {
			calls.push({ agent, signal, commandId });
		});
		const logger = makeStubLogger();
		const watcher = createAutoCompactWatcher({ ctx, logger });
		const fakeAgent = { id: "fake-agent" };
		const fakeSignal = new AbortController().signal;
		watcher.captureAgent("s1", { agent: fakeAgent, signal: fakeSignal, commandId: "blueprint-auto-compact" });
		const result = await watcher.tick({ cwd: root, sessionId: "s1", nowMs: 9_999_999_999 });
		assert.equal(result.invoked, true, JSON.stringify(result));
		assert.equal(result.reason, "feature-switch");
		assert.equal(result.previousFeatureId, "foo");
		assert.equal(calls.length, 1);
		assert.equal(calls[0].agent, fakeAgent);
		assert.equal(calls[0].signal, fakeSignal);
		assert.equal(calls[0].commandId, "blueprint-auto-compact");
		const session = await readFile(join(root, "session.jsonl"), "utf8");
		assert.match(session, /"type":"compact\/auto-fired"/);
		assert.match(session, /"previousFeatureId":"foo"/);
		assert.match(session, /"currentFeatureId":"bar"/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("createAutoCompactWatcher: skips on same-feature (AC-WATCH-003)", async () => {
	const root = await makeProject();
	try {
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		await writeTaskDone(root, { spec: "tests/fixtures/foo.md", time: 1000, seq: 1 });
		await writeTaskDone(root, { spec: "tests/fixtures/foo.md", time: 2000, seq: 2 });
		const calls = [];
		const ctx = makeStubCtx(async () => { calls.push("fired"); });
		const watcher = createAutoCompactWatcher({ ctx, logger: makeStubLogger() });
		watcher.captureAgent("s1", { agent: { id: "a" }, signal: undefined, commandId: "x" });
		const result = await watcher.tick({ cwd: root, sessionId: "s1", nowMs: 2000 });
		assert.equal(result.invoked, false);
		assert.equal(result.reason, "same-feature");
		assert.equal(calls.length, 0);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("createAutoCompactWatcher: skips on under-threshold (AC-WATCH-003)", async () => {
	const root = await makeProject();
	try {
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		await writeTaskDone(root, { spec: "tests/fixtures/foo.md", time: 1000, seq: 1 });
		await writeTaskDone(root, { spec: "tests/fixtures/bar.md", time: 2000, seq: 2 });
		const calls = [];
		const ctx = makeStubCtx(async () => { calls.push("fired"); });
		const watcher = createAutoCompactWatcher({ ctx, logger: makeStubLogger() });
		watcher.captureAgent("s1", { agent: { id: "a" }, signal: undefined, commandId: "x" });
		const result = await watcher.tick({ cwd: root, sessionId: "s1", nowMs: 2000 });
		assert.equal(result.invoked, false);
		assert.equal(result.reason, "under-threshold");
		assert.equal(calls.length, 0);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("createAutoCompactWatcher: skips on no-prior-task (AC-WATCH-003)", async () => {
	const root = await makeProject();
	try {
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		await writeTaskDone(root, { spec: "tests/fixtures/bar.md", time: 1000, seq: 1 });
		const calls = [];
		const ctx = makeStubCtx(async () => { calls.push("fired"); });
		const watcher = createAutoCompactWatcher({ ctx, logger: makeStubLogger() });
		watcher.captureAgent("s1", { agent: { id: "a" }, signal: undefined, commandId: "x" });
		const result = await watcher.tick({ cwd: root, sessionId: "s1", nowMs: 1000 });
		assert.equal(result.invoked, false);
		assert.equal(result.reason, "no-previous-task");
		assert.equal(calls.length, 0);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("createAutoCompactWatcher: dedups replays (AC-WATCH-004)", async () => {
	const root = await makeProject();
	try {
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		await writeTaskDone(root, { spec: "tests/fixtures/foo.md", time: 1000, seq: 1 });
		await padSession(root, 500 * 1024, 1000);
		await writeTaskDone(root, { spec: "tests/fixtures/bar.md", time: 9_999_999_999, seq: 2 });
		const calls = [];
		const ctx = makeStubCtx(async () => { calls.push("fired"); });
		const watcher = createAutoCompactWatcher({ ctx, logger: makeStubLogger() });
		watcher.captureAgent("s1", { agent: { id: "a" }, signal: undefined, commandId: "x" });
		const first = await watcher.tick({ cwd: root, sessionId: "s1", nowMs: 9_999_999_999 });
		assert.equal(first.invoked, true);
		const second = await watcher.tick({ cwd: root, sessionId: "s1", nowMs: 9_999_999_999 });
		assert.equal(second.skipped, "already-processed");
		assert.equal(calls.length, 1, "compactNow called once across two ticks");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("createAutoCompactWatcher: catches compactNow errors and returns dispatch-failed (AC-WATCH-005)", async () => {
	const root = await makeProject();
	try {
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		await writeTaskDone(root, { spec: "tests/fixtures/foo.md", time: 1000, seq: 1 });
		await padSession(root, 500 * 1024, 1000);
		await writeTaskDone(root, { spec: "tests/fixtures/bar.md", time: 9_999_999_999, seq: 2 });
		const ctx = makeStubCtx(async () => { throw new Error("DSH compaction busy"); });
		const logger = makeStubLogger();
		const watcher = createAutoCompactWatcher({ ctx, logger });
		watcher.captureAgent("s1", { agent: { id: "a" }, signal: undefined, commandId: "x" });
		const result = await watcher.tick({ cwd: root, sessionId: "s1", nowMs: 9_999_999_999 });
		assert.equal(result.invoked, false);
		assert.equal(result.reason, "dispatch-failed");
		assert.match(result.error, /DSH compaction busy/);
		assert.ok(logger.entries.warn.length >= 1);
		const session = await readFile(join(root, "session.jsonl"), "utf8");
		assert.match(session, /"type":"task\/done".*"spec":"tests\/fixtures\/foo.md"/);
		assert.doesNotMatch(session, /compact\/auto-fired/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("createAutoCompactWatcher: dispose clears agent stash (AC-WATCH-006)", async () => {
	const root = await makeProject();
	try {
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		await writeTaskDone(root, { spec: "tests/fixtures/bar.md", time: 1000, seq: 1 });
		const ctx = makeStubCtx(async () => null);
		const watcher = createAutoCompactWatcher({ ctx, logger: makeStubLogger() });
		watcher.captureAgent("s1", { agent: { id: "a" }, signal: undefined, commandId: "x" });
		watcher.dispose();
		const result = await watcher.tick({ cwd: root, sessionId: "s1", nowMs: 2000 });
		assert.deepEqual(result, { skipped: "no-agent" });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("createAutoCompactWatcher: returns skipped='no-compaction-service' when ctx.compaction absent", async () => {
	const root = await makeProject();
	try {
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		await writeTaskDone(root, { spec: "tests/fixtures/foo.md", time: 1000, seq: 1 });
		const logger = makeStubLogger();
		const watcher = createAutoCompactWatcher({ ctx: {}, logger });
		watcher.captureAgent("s1", { agent: { id: "a" }, signal: undefined, commandId: "x" });
		const result = await watcher.tick({ cwd: root, sessionId: "s1", nowMs: 2000 });
		assert.equal(result.skipped, "no-compaction-service");
		assert.ok(logger.entries.info.length >= 1, "info log emitted exactly once at boot");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
