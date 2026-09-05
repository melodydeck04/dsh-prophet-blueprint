import test from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile, mkdir } from "node:fs/promises";
import { audit } from "../lib/audit.js";
import { compare, renderCompareMarkdown } from "../lib/compare.js";

async function writeJsonl(path, lines) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, lines.map((line) => JSON.stringify(line)).join("\n") + "\n", "utf8");
}

test("compare produces a row per comparison dimension", async () => {
	const leftPath = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "left.jsonl");
	const rightPath = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "right.jsonl");
	await writeJsonl(leftPath, [
		{ type: "session", version: 0, id: "left" },
		{ type: "turn/start", seq: 1, time: 1, data: { turn: 1 } },
		{ type: "assistant/message", seq: 2, time: 2, data: { role: "assistant", content: [{ type: "text", text: "x" }] } },
		{ type: "turn/end", seq: 3, time: 3, data: { turn: 1 } },
	]);
	await writeJsonl(rightPath, [
		{ type: "session", version: 0, id: "right" },
		{ type: "turn/start", seq: 1, time: 1, data: { turn: 1 } },
		{ type: "turn/start", seq: 2, time: 2, data: { turn: 2 } },
		{ type: "assistant/message", seq: 3, time: 3, data: { role: "assistant", content: [{ type: "text", text: "y" }] } },
		{ type: "turn/end", seq: 4, time: 4, data: { turn: 1 } },
		{ type: "turn/end", seq: 5, time: 5, data: { turn: 2 } },
	]);
	const left = await audit(leftPath);
	const right = await audit(rightPath);
	const rows = compare(left, right, { labelLeft: "before", labelRight: "after" });
	const dims = rows.map((row) => row.dimension);
	assert.ok(dims.includes("turns"));
	assert.ok(dims.includes("assistant bytes"));
	assert.ok(dims.includes("retry events"));
	assert.ok(dims.includes("compaction starts"));
});

test("compare flags significant deltas", async () => {
	const leftPath = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "delta-left.jsonl");
	const rightPath = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "delta-right.jsonl");
	await writeJsonl(leftPath, [
		{ type: "session", version: 0, id: "l" },
		{ type: "turn/start", seq: 1, time: 1, data: { turn: 1 } },
		{ type: "tool/result", seq: 2, time: 2, data: { name: "read", content: "x".repeat(100) } },
		{ type: "turn/end", seq: 3, time: 3, data: { turn: 1 } },
	]);
	await writeJsonl(rightPath, [
		{ type: "session", version: 0, id: "r" },
		{ type: "turn/start", seq: 1, time: 1, data: { turn: 1 } },
		{ type: "tool/result", seq: 2, time: 2, data: { name: "read", content: "x".repeat(1000) } },
		{ type: "turn/end", seq: 3, time: 3, data: { turn: 1 } },
	]);
	const left = await audit(leftPath);
	const right = await audit(rightPath);
	const rows = compare(left, right);
	const largest = rows.find((row) => row.dimension === "largest tool result");
	assert.ok(largest, "should produce a largest tool result row");
	assert.equal(largest.significant, true, "10x size growth should be flagged significant");
});

test("renderCompareMarkdown emits one table", () => {
	const md = renderCompareMarkdown([
		{ dimension: "events", left: 10, right: 20, delta: "+10", significant: true },
		{ dimension: "turns", left: 3, right: 3, delta: "±0", significant: false },
	], "before", "after");
	assert.match(md, /# Blueprint diagnostics — compare/);
	assert.match(md, /\| dimension \| before \| after \| delta \|/);
	assert.match(md, /\| events \| 10 \| 20 \| \+10 ⚠ \|/);
	assert.match(md, /\| turns \| 3 \| 3 \| ±0 \|/);
});
