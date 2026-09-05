import test from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile, mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { audit } from "../lib/audit.js";
import { renderMarkdown } from "../lib/report.js";
import { compare } from "../lib/compare.js";

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures", "sample-session.jsonl");

async function writeJsonl(path, lines) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, lines.map((line) => JSON.stringify(line)).join("\n") + "\n", "utf8");
}

function at(seq, type, time, data) {
	return { seq, time, type, data };
}

test("audit emits an empty Compact boundaries section for sessions with no task/done events", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-compact-empty-"));
	try {
		const path = join(root, "session.jsonl");
		await writeJsonl(path, [
			{ type: "session", version: 0, id: "s1" },
			at(1, "turn/start", 1, { turn: 1 }),
			at(2, "assistant/message", 2, { role: "assistant", content: [{ type: "text", text: "x" }] }),
			at(3, "turn/end", 3, { turn: 1 }),
		]);
		const report = await audit(path);
		assert.ok(report.compactBoundaries);
		assert.equal(report.compactBoundaries.boundaries.length, 0);
		assert.equal(report.compactBoundaries.totalBoundaries, 0);
		assert.equal(report.compactBoundaries.totalMissedSavingsBytes, 0);
		assert.equal(report.compactBoundaries.verdict, "green");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("audit emits one boundary per task/done event with segment bytes", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-compact-one-"));
	try {
		const path = join(root, "session.jsonl");
		await writeJsonl(path, [
			{ type: "session", version: 0, id: "s1" },
			at(1, "turn/start", 100, { turn: 1 }),
			at(2, "assistant/message", 110, { role: "assistant", content: [{ type: "text", text: "a".repeat(2000) }] }),
			at(3, "turn/end", 120, { turn: 1 }),
			at(4, "turn/start", 200, { turn: 2 }),
			at(5, "task/done", 210, { todoId: "T1", spec: ".specs/proposed/foo.md", req: "REQ-X-1", ac: "AC-X-001", title: "Author foo", sessionId: "session-x" }),
			at(6, "tool/result", 220, { name: "read", content: "x".repeat(5000) }),
			at(7, "turn/end", 230, { turn: 2 }),
			at(8, "turn/start", 300, { turn: 3 }),
			at(9, "task/done", 310, { todoId: "T2", spec: ".specs/proposed/foo.md", req: "REQ-X-2", ac: "AC-X-002", title: "Wire foo", sessionId: "session-x" }),
			at(10, "assistant/message", 320, { role: "assistant", content: [{ type: "text", text: "b".repeat(1500) }] }),
			at(11, "turn/end", 330, { turn: 3 }),
		]);
		const report = await audit(path);
		const cb = report.compactBoundaries;
		assert.equal(cb.boundaries.length, 2);
		// Boundary 1 covers events 5..8 = tool/result at 220
		assert.equal(cb.boundaries[0].todoId, "T1");
		assert.ok(cb.boundaries[0].segmentBytes.toolResult >= 5000);
		// Boundary 2 covers events 9..end = assistant/message at 320
		assert.equal(cb.boundaries[1].todoId, "T2");
		assert.ok(cb.boundaries[1].segmentBytes.assistant >= 1500);
		assert.ok(cb.totalMissedSavingsBytes > 0);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("audit classifies Compact boundaries verdict by total missed savings", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-compact-verdict-"));
	try {
		const path = join(root, "session.jsonl");
		const big = "a".repeat(1_500_000); // 1.5 MiB — crosses yellowAt 1 MiB
		await writeJsonl(path, [
			{ type: "session", version: 0, id: "s1" },
			at(1, "turn/start", 100, { turn: 1 }),
			at(2, "task/done", 110, { todoId: "T1", spec: "s.md", req: "r", ac: "a", title: "t", sessionId: "x" }),
			at(3, "assistant/message", 130, { role: "assistant", content: [{ type: "text", text: big }] }),
			at(4, "turn/end", 140, { turn: 1 }),
		]);
		const report = await audit(path);
		assert.equal(report.compactBoundaries.verdict, "yellow");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("report renders Compact boundaries section", async () => {
	const report = await audit(FIXTURE);
	const md = renderMarkdown(report);
	if (report.compactBoundaries.boundaries.length === 0) {
		assert.match(md, /## Compact boundaries[\s\S]*no task\/done events/);
	} else {
		assert.match(md, /## Compact boundaries[\s\S]*task\/done events: \d+/);
		assert.match(md, /missed compact savings:/);
	}
});

test("compare adds compact-boundaries row", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-compact-compare-"));
	try {
		const pathA = join(root, "a.jsonl");
		const pathB = join(root, "b.jsonl");
		await writeJsonl(pathA, [
			{ type: "session", version: 0, id: "a" },
			at(1, "turn/start", 100, { turn: 1 }),
			at(2, "assistant/message", 110, { role: "assistant", content: [{ type: "text", text: "x".repeat(500_000) }] }),
			at(3, "task/done", 120, { todoId: "T1", spec: "s.md", req: "r", ac: "a", title: "t", sessionId: "x" }),
		]);
		await writeJsonl(pathB, [
			{ type: "session", version: 0, id: "b" },
			at(1, "turn/start", 100, { turn: 1 }),
			at(2, "task/done", 110, { todoId: "T1", spec: "s.md", req: "r", ac: "a", title: "t", sessionId: "x" }),
		]);
		const left = await audit(pathA);
		const right = await audit(pathB);
		const rows = compare(left, right, { labelLeft: "before", labelRight: "after" });
		const boundary = rows.find((r) => r.dimension === "compact boundaries missed");
		assert.ok(boundary);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
