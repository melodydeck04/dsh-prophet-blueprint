import test from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile, mkdir } from "node:fs/promises";
import { audit } from "../lib/audit.js";
import { renderMarkdown } from "../lib/report.js";

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "sample-session.jsonl");

test("renderMarkdown produces a document with the expected sections", async () => {
	const report = await audit(FIXTURE);
	const md = renderMarkdown(report, { label: "sample" });
	assert.match(md, /^# Blueprint diagnostics — sample/);
	assert.match(md, /Verdict: /);
	assert.match(md, /## Counts/);
	assert.match(md, /## Retries/);
	assert.match(md, /## Compactions/);
	assert.match(md, /## Tool names/);
	assert.match(md, /## Turn durations/);
	assert.match(md, /## Top largest events/);
	assert.match(md, /### Assistant messages/);
	assert.match(md, /### Tool results/);
	assert.match(md, /### Reasoning chunks/);
	assert.match(md, /### User messages/);
});

test("renderMarkdown handles an empty report without throwing", async () => {
	const path = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "empty.jsonl");
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, JSON.stringify({ type: "session", version: 0, id: "empty" }) + "\n", "utf8");
	const report = await audit(path);
	const md = renderMarkdown(report, { label: "empty" });
	assert.match(md, /^# Blueprint diagnostics — empty/);
	assert.match(md, /Verdict: 🟢/);
});

test("renderMarkdown reddens when top assistant message exceeds the red threshold", async () => {
	const { writeFile, mkdir } = await import("node:fs/promises");
	const path = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "huge.jsonl");
	await mkdir(dirname(path), { recursive: true });
	const bigContent = "x".repeat(300 * 1024);
	await writeFile(path, [
		JSON.stringify({ type: "session", version: 0, id: "huge" }),
		JSON.stringify({ type: "turn/start", seq: 1, time: 1, data: { turn: 1 } }),
		JSON.stringify({ type: "assistant/message", seq: 2, time: 2, data: { role: "assistant", content: [{ type: "text", text: bigContent }] } }),
		JSON.stringify({ type: "turn/end", seq: 3, time: 3, data: { turn: 1 } }),
	].join("\n") + "\n", "utf8");
	const report = await audit(path);
	const md = renderMarkdown(report, { label: "huge" });
	assert.match(md, /Verdict: 🔴/);
});
