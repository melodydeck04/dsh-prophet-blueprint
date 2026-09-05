import test from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { audit } from "../lib/audit.js";
import { collectSession } from "../lib/stream.js";

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "sample-session.jsonl");

test("audit produces a structured report from a session fixture", async () => {
	const report = await audit(FIXTURE);
	assert.equal(report.sourcePath, FIXTURE);
	assert.equal(report.version, 0);
	assert.ok(report.summary.parsed >= 15, "should count parsed records");
	assert.equal(report.summary.skipped, 1);
	assert.ok(report.perKind["turn/start"], "should record turn/start counts");
	assert.ok(report.perKind["assistant/message"], "should record assistant/message counts");
	assert.ok(report.toolNames["read"] >= 1, "should record tool names");
	assert.equal(report.compactions.starts, 1);
	assert.equal(report.compactions.ends, 1);
	assert.equal(report.compactions.interrupted, 0);
});

test("audit groups llm/retry events by turn and surfaces the dominant policy key", async () => {
	const report = await audit(FIXTURE);
	assert.ok(report.retries.retryEvents >= 2, "fixture has two retry events on turn 1");
	assert.equal(report.retries.retryTurns, 1, "fixture has retries on exactly one turn");
	assert.ok(report.retries.dominantPolicyKey, "should record a dominant policy key");
	assert.ok(report.retries.perTurn[0].count >= 2);
});

test("audit classifies compaction completeness", async () => {
	const report = await audit(FIXTURE);
	assert.ok("compaction-completeness" in report.verdicts);
});

test("audit tracks per-event-kind byte totals and top lists", async () => {
	const report = await audit(FIXTURE);
	const totalAssistantBytes = report.perKind["assistant/message"]?.bytes ?? 0;
	assert.ok(totalAssistantBytes > 0);
	assert.ok(Array.isArray(report.topAssistantMessages));
	assert.ok(Array.isArray(report.topToolResults));
	assert.ok(Array.isArray(report.topReasoningChunks));
});

test("audit verdict colors reflect threshold rules", async () => {
	const report = await audit(FIXTURE);
	assert.ok(["green", "yellow", "red"].includes(report.verdict.color));
	assert.ok(report.verdict.dominant === null || typeof report.verdict.dominant === "string");
});

test("audit handles a session with no retry events without throwing", async () => {
	const { writeFile, mkdir } = await import("node:fs/promises");
	const path = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "no-retry.jsonl");
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, [
		JSON.stringify({ type: "session", version: 0, id: "x" }),
		JSON.stringify({ type: "turn/start", seq: 1, time: 1, data: { turn: 1 } }),
		JSON.stringify({ type: "turn/end", seq: 2, time: 2, data: { turn: 1 } }),
	].join("\n") + "\n", "utf8");
	const report = await audit(path);
	assert.equal(report.retries.retryEvents, 0);
	assert.equal(report.retries.retryTurns, 0);
	assert.equal(report.retries.dominantPolicyKey, null);
});

async function* makeAsync(array) {
	for (const record of array) {
		yield { record, summary: { parsed: 0, skipped: 0, version: null } };
	}
}

void makeAsync;
