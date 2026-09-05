import test from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { streamSession, collectSession } from "../lib/stream.js";

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "sample-session.jsonl");

test("streamSession yields one record at a time and skips malformed lines", async () => {
	let parsed = 0;
	let skipped = 0;
	let version = null;
	for await (const { record, summary } of streamSession(FIXTURE)) {
		parsed = summary.parsed;
		skipped = summary.skipped;
		if (record && record.type === "session") version = record.version;
	}
	assert.equal(parsed, 18, "should parse all valid records");
	assert.equal(skipped, 1, "should skip the single malformed line");
	assert.equal(version, 0, "should record the session version from the first session event");
});

test("streamSession does not load the whole file into memory", async () => {
	let observed = 0;
	for await (const _ of streamSession(FIXTURE)) {
		observed += 1;
	}
	assert.ok(observed >= 1, "should produce at least one record");
});

test("collectSession returns all records and a final summary", async () => {
	const { records, summary } = await collectSession(FIXTURE);
	assert.ok(records.length >= 15, "should collect at least the valid records");
	assert.equal(summary.parsed, 18);
	assert.equal(summary.skipped, 1);
});

test("streamSession skips empty lines without counting them as skipped", async () => {
	const path = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "blanks.jsonl");
	const { writeFile, mkdir } = await import("node:fs/promises");
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, "{\"a\":1}\n\n{\"b\":2}\n", "utf8");
	const collected = await collectSession(path);
	assert.equal(collected.summary.parsed, 2, "should count both valid JSON lines");
	assert.equal(collected.summary.skipped, 0, "should not count the empty line as skipped");
});
