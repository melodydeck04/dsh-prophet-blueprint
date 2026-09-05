import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initBlueprint } from "../lib/init.js";
import { serializeFeature } from "../lib/features.js";
import {
	evaluateTrigger,
	maybeAutoCompact,
	bytesBetweenTimestamps,
	BYTE_THRESHOLD_BYTES,
	_resetDispatchWarning,
} from "../lib/todo-compact-trigger.js";

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
	const root = await mkdtemp(join(tmpdir(), "blueprint-tct-"));
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

async function writeTaskDone(root, { spec, time, seq }) {
	const record = { type: "task/done", time, seq, data: { todoId: `T${seq}`, spec, req: `REQ-X-${seq}`, ac: `AC-X-${seq}`, title: "x" } };
	await appendFile(join(root, "session.jsonl"), JSON.stringify(record) + "\n", "utf8");
}

test("evaluateTrigger: same feature returns 'same-feature' (AC-SWITCH-001)", () => {
	assert.equal(
		evaluateTrigger({ previousFeatureId: "F", currentFeatureId: "F", bytesSincePreviousTaskDone: 500000 }),
		"same-feature",
	);
});

test("evaluateTrigger: different feature under threshold returns 'under-threshold' (AC-SWITCH-002)", () => {
	assert.equal(
		evaluateTrigger({ previousFeatureId: "F1", currentFeatureId: "F2", bytesSincePreviousTaskDone: 100000 }),
		"under-threshold",
	);
});

test("evaluateTrigger: different feature over threshold returns 'fire' (AC-SWITCH-003)", () => {
	assert.equal(
		evaluateTrigger({ previousFeatureId: "F1", currentFeatureId: "F2", bytesSincePreviousTaskDone: 500000 }),
		"fire",
	);
});

test("evaluateTrigger: null previous feature returns 'no-previous-task' (AC-SWITCH-004)", () => {
	assert.equal(
		evaluateTrigger({ previousFeatureId: null, currentFeatureId: "F2", bytesSincePreviousTaskDone: 500000 }),
		"no-previous-task",
	);
});

test("evaluateTrigger: null current feature returns 'no-previous-task' (AC-SWITCH-005)", () => {
	assert.equal(
		evaluateTrigger({ previousFeatureId: "F1", currentFeatureId: null, bytesSincePreviousTaskDone: 500000 }),
		"no-previous-task",
	);
});

test("maybeAutoCompact: same-feature case writes nothing (AC-TRIG-001)", async () => {
	const root = await makeProject();
	try {
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		await writeTaskDone(root, { spec: "tests/fixtures/foo.md", time: 1000, seq: 1 });
		const calls = [];
		const dispatch = (name) => { calls.push(name); };
		const result = await maybeAutoCompact({
			cwd: root,
			sessionId: "s1",
			currentTaskSpecPath: "tests/fixtures/foo.md",
			currentFeatureId: "foo",
			nowMs: 2000,
			dispatch,
		});
		assert.deepEqual(result, { invoked: false, reason: "same-feature", bytesSincePreviousTaskDone: result.bytesSincePreviousTaskDone });
		assert.equal(calls.length, 0, "dispatch must not be called on same-feature");
		const session = await readFile(join(root, "session.jsonl"), "utf8");
		assert.doesNotMatch(session, /compact\/auto-fired/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("maybeAutoCompact: under-threshold case writes nothing (AC-TRIG-002)", async () => {
	const root = await makeProject();
	try {
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		await writeTaskDone(root, { spec: "tests/fixtures/foo.md", time: 1000, seq: 1 });
		const calls = [];
		const dispatch = (name) => { calls.push(name); };
		const result = await maybeAutoCompact({
			cwd: root,
			sessionId: "s2",
			currentTaskSpecPath: "tests/fixtures/bar.md",
			currentFeatureId: "bar",
			nowMs: 2000,
			dispatch,
		});
		assert.equal(result.invoked, false);
		assert.equal(result.reason, "under-threshold");
		assert.equal(calls.length, 0);
		const session = await readFile(join(root, "session.jsonl"), "utf8");
		assert.doesNotMatch(session, /compact\/auto-fired/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("maybeAutoCompact: no-previous-task case writes nothing (AC-TRIG-003)", async () => {
	const root = await makeProject();
	try {
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		const calls = [];
		const dispatch = (name) => { calls.push(name); };
		const result = await maybeAutoCompact({
			cwd: root,
			sessionId: "s3",
			currentTaskSpecPath: "tests/fixtures/bar.md",
			currentFeatureId: "bar",
			nowMs: 2000,
			dispatch,
		});
		assert.equal(result.invoked, false);
		assert.equal(result.reason, "no-previous-task");
		assert.equal(calls.length, 0);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("maybeAutoCompact: fire case dispatches and writes event (AC-TRIG-004)", async () => {
	const root = await makeProject();
	try {
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		await writeTaskDone(root, { spec: "tests/fixtures/foo.md", time: 1000, seq: 1 });
		const padLine = `{"type":"assistant/chunk","time":1001,"seq":2,"data":{"text":"${"x".repeat(500)}"}}\n`;
		let total = 0;
		const lines = [];
		while (total < 500 * 1024) {
			lines.push(padLine);
			total += padLine.length;
		}
		await appendFile(join(root, "session.jsonl"), lines.join(""), "utf8");
		const calls = [];
		const dispatch = async (name) => { calls.push(name); };
		const result = await maybeAutoCompact({
			cwd: root,
			sessionId: "s4",
			currentTaskSpecPath: "tests/fixtures/bar.md",
			currentFeatureId: "bar",
			nowMs: 9_999_999_999,
			dispatch,
		});
		assert.equal(result.invoked, true, JSON.stringify(result));
		assert.equal(result.reason, "feature-switch");
		assert.deepEqual(calls, ["compact"], "dispatch must be called exactly once with 'compact'");
		const session = await readFile(join(root, "session.jsonl"), "utf8");
		assert.match(session, /"type":"compact\/auto-fired"/);
		assert.match(session, /"previousFeatureId":"foo"/);
		assert.match(session, /"currentFeatureId":"bar"/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("maybeAutoCompact: dispatch failure does not roll back task/done (AC-TRIG-005)", async () => {
	const root = await makeProject();
	try {
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		await writeTaskDone(root, { spec: "tests/fixtures/foo.md", time: 1000, seq: 1 });
		const padLine = `{"type":"assistant/chunk","time":1001,"seq":2,"data":{"text":"${"x".repeat(500)}"}}\n`;
		let total = 0;
		const lines = [];
		while (total < 500 * 1024) {
			lines.push(padLine);
			total += padLine.length;
		}
		await appendFile(join(root, "session.jsonl"), lines.join(""), "utf8");
		const dispatch = async () => { throw new Error("DSH unavailable"); };
		const result = await maybeAutoCompact({
			cwd: root,
			sessionId: "s5",
			currentTaskSpecPath: "tests/fixtures/bar.md",
			currentFeatureId: "bar",
			nowMs: 9_999_999_999,
			dispatch,
			logger: { warn: () => {} },
		});
		assert.equal(result.invoked, false);
		assert.equal(result.reason, "dispatch-failed");
		assert.match(result.error, /DSH unavailable/);
		const session = await readFile(join(root, "session.jsonl"), "utf8");
		assert.match(session, /"type":"task\/done"/, "task/done must remain after dispatch failure");
		assert.doesNotMatch(session, /compact\/auto-fired/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("maybeAutoCompact: no dispatch callback logs once and returns 'no-dispatch-surface'", async () => {
	const root = await makeProject();
	try {
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		await writeTaskDone(root, { spec: "tests/fixtures/foo.md", time: 1000, seq: 1 });
		const padLine = `{"type":"assistant/chunk","time":1001,"seq":2,"data":{"text":"${"x".repeat(500)}"}}\n`;
		let total = 0;
		const lines = [];
		while (total < 500 * 1024) {
			lines.push(padLine);
			total += padLine.length;
		}
		await appendFile(join(root, "session.jsonl"), lines.join(""), "utf8");
		_resetDispatchWarning();
		const warnings = [];
		const result = await maybeAutoCompact({
			cwd: root,
			sessionId: "s6",
			currentTaskSpecPath: "tests/fixtures/bar.md",
			currentFeatureId: "bar",
			nowMs: 9_999_999_999,
			dispatch: null,
			logger: { warn: (msg) => warnings.push(msg) },
		});
		assert.equal(result.invoked, false);
		assert.equal(result.reason, "no-dispatch-surface");
		assert.equal(warnings.length, 1);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("bytesBetweenTimestamps counts only lines in the (lo, hi] window", async () => {
	const root = await makeProject();
	try {
		await writeFile(join(root, "session.jsonl"), "", "utf8");
		const a = `{"type":"assistant/chunk","time":1000,"seq":1,"data":{"text":"aaaa"}}\n`;
		const b = `{"type":"assistant/chunk","time":2000,"seq":2,"data":{"text":"bbbb"}}\n`;
		const c = `{"type":"assistant/chunk","time":3000,"seq":3,"data":{"text":"cccc"}}\n`;
		const d = `{"type":"assistant/chunk","time":4000,"seq":4,"data":{"text":"dddd"}}\n`;
		await appendFile(join(root, "session.jsonl"), a + b + c + d, "utf8");
		const sessionPath = join(root, "session.jsonl");
		const inWindow = await bytesBetweenTimestamps(sessionPath, 1000, 3000);
		assert.equal(inWindow, Buffer.byteLength(b, "utf8") + Buffer.byteLength(c, "utf8"));
		const before = await bytesBetweenTimestamps(sessionPath, 0, 999);
		assert.equal(before, 0);
		const uptoA = await bytesBetweenTimestamps(sessionPath, 0, 1000);
		assert.equal(uptoA, Buffer.byteLength(a, "utf8"));
		const afterD = await bytesBetweenTimestamps(sessionPath, 3000, 9_999_999_999);
		assert.equal(afterD, Buffer.byteLength(d, "utf8"));
	} finally {
		await rm(root, {recursive: true, force: true });
	}
});

test("BYTE_THRESHOLD_BYTES is 200 KiB", () => {
	assert.equal(BYTE_THRESHOLD_BYTES, 200 * 1024);
});
