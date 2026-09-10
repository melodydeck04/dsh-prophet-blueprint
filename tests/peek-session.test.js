import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import zlib from "node:zlib";

import { decodeSessionBuffer, findSessions, main, readSession, renderTree } from "../tools/peek-session.mjs";

function compressedFrame(records) {
	return zlib.zstdCompressSync(Buffer.from(`${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8"));
}

async function writeFixtureSession(root, { storageProject = "--D-AI-project-with-hyphen--", storageSession, records, extraFrames = [], torn = false }) {
	const directory = join(root, storageProject, storageSession);
	await mkdir(directory, { recursive: true });
	const data = Buffer.concat([compressedFrame(records), ...extraFrames.map(compressedFrame), ...(torn ? [Buffer.from([0x28, 0xb5])] : [])]);
	const file = join(directory, "session.jsonl.zstd");
	await writeFile(file, data);
	return file;
}

async function fixtureRoot() {
	const root = await mkdtemp(join(tmpdir(), "peek-session-"));
	await writeFixtureSession(root, {
		storageSession: "parent-storage",
		records: [
			{ type: "session", version: 1, id: "parent-1", createdAt: 1, cwd: "D:\\AI\\project-with-hyphen", delegationDepth: 0, agentPreset: "standard" },
			{ type: "user/message", seq: 1, time: 1000, data: { content: "parent request" } },
		],
		extraFrames: [[{ type: "assistant/message", seq: 2, time: 2000, data: { message: { content: "parent reply" } } }]],
	});
	await writeFixtureSession(root, {
		storageSession: "child-storage",
		records: [
			{ type: "session", version: 1, id: "child-1", createdAt: 2, cwd: "D:\\AI\\project-with-hyphen", parentSession: "parent-1", origin: "subagent", delegationDepth: 1, agentPreset: "standard" },
			{ type: "tool/call", seq: 1, time: 3000, data: { name: "read", arguments: "{\"path\":\"x\"}" } },
		],
	});
	await writeFixtureSession(root, {
		storageSession: "orphan-storage",
		records: [
			{ type: "session", version: 1, id: "orphan-1", createdAt: 3, cwd: "D:\\AI\\project-with-hyphen", parentSession: "missing-parent", origin: "subagent", delegationDepth: 1 },
		],
	});
	return root;
}

async function invoke(root, argv) {
	const output = [];
	const errors = [];
	const code = await main(argv, { root, stdout: (line) => output.push(line), stderr: (line) => errors.push(line) });
	return { code, output, errors };
}

test("decodes concatenated zstd frames and retains complete frames before a torn tail", () => {
	const first = compressedFrame([{ type: "session", id: "one" }]);
	const second = compressedFrame([{ type: "user/message", data: { content: "two" } }]);
	const decoded = decodeSessionBuffer(Buffer.concat([first, second, Buffer.from([0x28, 0xb5])]));
	assert.equal(decoded.frameCount, 2);
	assert.notEqual(decoded.tornStart, null);
	assert.deepEqual(decoded.records.map((record) => record.type), ["session", "user/message"]);
});

test("uses persisted headers instead of the ambiguous storage directory for project and subagent metadata", async (t) => {
	const root = await fixtureRoot();
	t.after(() => rm(root, { recursive: true, force: true }));
	const sessions = await findSessions(root);
	const child = sessions.find((session) => session.id === "child-1");
	assert.equal(child.project, "D:\\AI\\project-with-hyphen");
	assert.equal(child.storageProject, "--D-AI-project-with-hyphen--");
	assert.equal(child.origin, "subagent");
	assert.equal(child.parentSession, "parent-1");
	assert.equal(child.delegationDepth, 1);
});

test("renders nested subagents and visible orphaned children", async (t) => {
	const root = await fixtureRoot();
	t.after(() => rm(root, { recursive: true, force: true }));
	const lines = renderTree(await findSessions(root));
	assert.ok(lines.some((line) => line.includes("[session]") && line.includes("parent-1")));
	assert.ok(lines.some((line) => line.includes("└─ [subagent]") && line.includes("child-1")));
	assert.ok(lines.some((line) => line.includes("[orphan]") && line.includes("orphan-1")));
});

test("supports deterministic list, summary, filters, JSON, and an actionable missing-session error", async (t) => {
	const root = await fixtureRoot();
	t.after(() => rm(root, { recursive: true, force: true }));
	const list = await invoke(root, ["--list"]);
	assert.equal(list.code, 0);
	assert.equal(list.output.length, 3);
	assert.ok(list.output.every((line) => line.includes("D:\\AI\\project-with-hyphen")));

	const summary = await invoke(root, ["parent-1", "--summary"]);
	assert.equal(summary.code, 0);
	const parsedSummary = JSON.parse(summary.output[0]);
	assert.deepEqual(parsedSummary.childSessionIds, ["child-1"]);
	assert.equal(parsedSummary.cwd, "D:\\AI\\project-with-hyphen");

	const detail = await invoke(root, ["parent-1", "--type", "user/message", "--last", "1", "--json"]);
	assert.equal(detail.code, 0);
	assert.deepEqual(JSON.parse(detail.output[0]).data, { content: "parent request" });

	const missing = await invoke(root, ["does-not-exist"]);
	assert.equal(missing.code, 1);
	assert.match(missing.errors.join("\n"), /searched root/);
});

test("never writes to the selected sessions root", async (t) => {
	const root = await fixtureRoot();
	t.after(() => rm(root, { recursive: true, force: true }));
	const files = [
		join(root, "--D-AI-project-with-hyphen--", "parent-storage", "session.jsonl.zstd"),
		join(root, "--D-AI-project-with-hyphen--", "child-storage", "session.jsonl.zstd"),
		join(root, "--D-AI-project-with-hyphen--", "orphan-storage", "session.jsonl.zstd"),
	];
	const before = await Promise.all(files.map(async (file) => createHash("sha256").update(await readFile(file)).digest("hex")));
	assert.equal((await invoke(root, ["--list"])).code, 0);
	assert.equal((await invoke(root, ["--tree"])).code, 0);
	assert.equal((await invoke(root, ["parent-1", "--summary"])).code, 0);
	assert.equal((await invoke(root, ["parent-1", "--last", "1"])).code, 0);
	const after = await Promise.all(files.map(async (file) => createHash("sha256").update(await readFile(file)).digest("hex")));
	assert.deepEqual(after, before);
});

test("reports a torn tail from a stored session without dropping the header", async (t) => {
	const root = await mkdtemp(join(tmpdir(), "peek-session-torn-"));
	t.after(() => rm(root, { recursive: true, force: true }));
	const file = await writeFixtureSession(root, {
		storageSession: "torn-storage",
		records: [{ type: "session", id: "torn-1", cwd: "D:\\AI\\torn" }],
		torn: true,
	});
	const decoded = await readSession(file);
	assert.notEqual(decoded.tornStart, null);
	assert.equal(decoded.records[0].id, "torn-1");
	const summary = await invoke(root, ["torn-1", "--summary"]);
	assert.equal(JSON.parse(summary.output[0]).tornFrame, true);
});
