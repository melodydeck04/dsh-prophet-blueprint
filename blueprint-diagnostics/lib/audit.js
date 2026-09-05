/**
 * One-pass audit over a DSH session.jsonl export.
 *
 * Walks the streamed records and produces an immutable report object that
 * downstream rendering (report.js, compare.js) can present as Markdown
 * without re-reading the file. The audit never throws on unknown event
 * kinds; it just keeps per-event-kind byte totals and counts.
 *
 * @module @dsh-plugins/design-blueprint-diagnostics/audit
 */

import { THRESHOLDS, classify, worstOf } from "./thresholds.js";

const RESERVED_KINDS = new Set([
	"assistant/chunk",
	"reasoning-chunks",
	"tool/call",
	"tool/result",
	"assistant/message",
	"user/message",
	"turn/start",
	"turn/end",
	"llm/retry",
	"llm/retry-started",
	"compaction/start",
	"compaction/end",
	"compaction/summary",
	"sandbox/mode",
	"permission/preset",
	"approval/policy",
	"agent/inbox/spliced",
	"command/run",
	"command/done",
	"session/end-seed",
	"request/header",
	"web/deepseek-search-llm-request",
	"todo/write",
	"step/start",
	"step/end",
	"text-chunks",
	"tool-call-chunks",
	"task/status",
	"task/done",
]);

/**
 * @typedef {Object} AuditReport
 * @property {string} sourcePath
 * @property {number | null} version
 * @property {{ parsed: number, skipped: number }} summary
 * @property {{ first: number | null, last: number | null, durationMs: number | null }} duration
 * @property {Record<string, { count: number, bytes: number }>} perKind
 * @property {{ turns: number, retryTurns: number, retryEvents: number, dominantPolicyKey: string | null, perTurn: number[] }} retries
 * @property {{ starts: number, ends: number, interrupted: number }} compactions
 * @property {Record<string, number>} toolNames
 * @property {number[]} turnDurationsMs
 * @property {{ kind: string, size: number, seq: number, time: number }[]} topAssistantMessages
 * @property {{ kind: string, size: number, seq: number, time: number }[]} topToolResults
 * @property {{ kind: string, size: number, seq: number, time: number }[]} topReasoningChunks
 * @property {{ kind: string, size: number, seq: number, time: number }[]} topUserMessages
 * @property {Record<string, "green" | "yellow" | "red">} verdicts
 * @property {{
 *   boundaries: Array<{
 *     seq: number, time: number, todoId: string, spec: string, req: string, ac: string,
 *     title: string, sessionId: string | null,
 *     segmentBytes: { assistant: number, toolResult: number, reasoning: number, user: number },
 *     segmentDurationMs: number
 *   }>,
 *   totalBoundaries: number,
 *   totalMissedSavingsBytes: number,
 *   verdict: "green" | "yellow" | "red"
 * }} compactBoundaries
 * @property {{ color: "green" | "yellow" | "red", dominant: string | null }} summary
 */

/**
 * Audit one session.jsonl file.
 *
 * @param {string} filePath
 * @param {AsyncIterable<{ record: object, summary: { parsed: number, skipped: number, version: number | null } }>} [source]
 * @returns {Promise<AuditReport>}
 */
export async function audit(filePath, source) {
	const records = source ?? collectSource(filePath);

	const perKind = Object.create(null);
	const toolNames = Object.create(null);
	const turnDurations = [];
	const turnStartTimes = new Map();
	const retryPerTurn = new Map();
	const retryPolicyCounts = new Map();
	let retryEvents = 0;
	let turnCount = 0;
	let version = null;
	let parsed = 0;
	let skipped = 0;
	let firstTs = null;
	let lastTs = null;
	let compactionStarts = 0;
	let compactionEnds = 0;
	const topAssistantMessages = [];
	const topToolResults = [];
	const topReasoningChunks = [];
	const topUserMessages = [];
	const taskDoneBoundaries = [];

	for await (const { record, summary } of records) {
		if (summary) {
			if (typeof summary.parsed === "number") parsed = summary.parsed;
			if (typeof summary.skipped === "number") skipped = summary.skipped;
			if (summary.version !== null && summary.version !== undefined) version = summary.version;
		}
		if (record === null || typeof record !== "object") continue;
		const t = record.type;
		if (typeof t !== "string") {
			skipped += 1;
			continue;
		}
		const size = approximateSize(record);
		perKind[t] = perKind[t] ?? { count: 0, bytes: 0 };
		perKind[t].count += 1;
		perKind[t].bytes += size;
		if (record.time) {
			if (firstTs === null || record.time < firstTs) firstTs = record.time;
			if (lastTs === null || record.time > lastTs) lastTs = record.time;
		}
		if (t === "turn/start") {
			turnCount += 1;
			turnStartTimes.set(record.seq ?? turnCount, record.time);
		} else if (t === "turn/end") {
			const start = turnStartTimes.get(record.seq);
			if (typeof start === "number" && typeof record.time === "number") {
				turnDurations.push(record.time - start);
			}
		} else if (t === "llm/retry" || t === "llm/retry-started") {
			retryEvents += 1;
			const turn = record.data?.turn;
			if (turn !== undefined) {
				const key = String(turn);
				retryPerTurn.set(key, (retryPerTurn.get(key) ?? 0) + 1);
			}
			const policy = record.data?.policyKey;
			if (typeof policy === "string") {
				retryPolicyCounts.set(policy, (retryPolicyCounts.get(policy) ?? 0) + 1);
			}
		} else if (t === "compaction/start") {
			compactionStarts += 1;
		} else if (t === "compaction/end") {
			compactionEnds += 1;
		} else if (t === "tool/call") {
			const name = record.data?.name ?? record.data?.toolName ?? "?";
			toolNames[name] = (toolNames[name] ?? 0) + 1;
		} else if (t === "tool/result") {
			pushTop(topToolResults, { kind: t, size, seq: record.seq, time: record.time }, 8);
		} else if (t === "assistant/message") {
			pushTop(topAssistantMessages, { kind: t, size, seq: record.seq, time: record.time }, 10);
		} else if (t === "reasoning-chunks") {
			pushTop(topReasoningChunks, { kind: t, size, seq: record.seq, time: record.time }, 8);
		} else if (t === "user/message") {
			pushTop(topUserMessages, { kind: t, size, seq: record.seq, time: record.time }, 8);
		} else if (t === "task/done") {
			taskDoneBoundaries.push({
				seq: record.seq,
				time: record.time,
				todoId: record.data?.todoId ?? "",
				spec: record.data?.spec ?? "",
				req: record.data?.req ?? "",
				ac: record.data?.ac ?? "",
				title: record.data?.title ?? "",
				sessionId: record.data?.sessionId ?? null,
			});
		}
	}

	const retryTurns = retryPerTurn.size;
	const dominantPolicyKey = topKey(retryPolicyCounts);
	const retryRate = turnCount > 0 ? retryEvents / turnCount : 0;
	const compactionInterrupted = Math.max(0, compactionStarts - compactionEnds);

	const compactBoundaries = computeCompactBoundaries(perKind, topToolResults, topAssistantMessages, topReasoningChunks, topUserMessages, taskDoneBoundaries);

	const verdicts = {
		"retry-rate-per-turn": classify(retryRate, THRESHOLDS["retry-rate-per-turn"]),
		"compaction-completeness": classify(compactionInterrupted, THRESHOLDS["compaction-completeness"]),
		"reasoning-chunk-bytes": classify(topSize(topReasoningChunks), THRESHOLDS["reasoning-chunk-bytes"]),
		"assistant-message-bytes": classify(topSize(topAssistantMessages), THRESHOLDS["assistant-message-bytes"]),
		"tool-result-bytes": classify(topSize(topToolResults), THRESHOLDS["tool-result-bytes"]),
		"compact-boundaries-missed": classify(compactBoundaries.totalMissedSavingsBytes, THRESHOLDS["compact-boundaries-missed"]),
	};
	const color = worstOf(verdicts);
	const dominant = pickDominant(verdicts, color);

	return {
		sourcePath: filePath,
		version,
		summary: { parsed, skipped },
		duration: {
			first: firstTs,
			last: lastTs,
			durationMs: firstTs !== null && lastTs !== null ? lastTs - firstTs : null,
		},
		perKind,
		retries: {
			turns: retryTurns,
			retryTurns,
			retryEvents,
			dominantPolicyKey,
			perTurn: sortMapDesc(retryPerTurn),
		},
		compactions: {
			starts: compactionStarts,
			ends: compactionEnds,
			interrupted: compactionInterrupted,
		},
		toolNames,
		turnDurationsMs: turnDurations,
		topAssistantMessages,
		topToolResults,
		topReasoningChunks,
		topUserMessages,
		verdicts,
		compactBoundaries,
		verdict: {
			color,
			dominant,
		},
	};
}

/**
 * @typedef {Object} CompactBoundary
 * @property {number} seq
 * @property {number} time
 * @property {string} todoId
 * @property {string} spec
 * @property {string} req
 * @property {string} ac
 * @property {string} title
 * @property {string | null} sessionId
 * @property {{ assistant: number, toolResult: number, reasoning: number, user: number }} segmentBytes
 * @property {number} segmentDurationMs
 */

/**
 * Walk every `task/done` event, treat it as a natural compact boundary, and
 * measure the bytes that landed in the segment between this boundary and the
 * next one. Sessions without any `task/done` events produce an empty
 * `boundaries` array and `totalMissedSavingsBytes = 0`.
 *
 * @param {Record<string, { count: number, bytes: number }>} perKind
 * @param {Array<{ kind: string, size: number, seq: number, time: number }>} topToolResults
 * @param {Array<{ kind: string, size: number, seq: number, time: number }>} topAssistantMessages
 * @param {Array<{ kind: string, size: number, seq: number, time: number }>} topReasoningChunks
 * @param {Array<{ kind: string, size: number, seq: number, time: number }>} topUserMessages
 * @param {Array<{ seq: number, time: number, todoId: string, spec: string, req: string, ac: string, title: string, sessionId: string | null, from?: string, to?: string }>} taskDoneBoundaries
 */
function computeCompactBoundaries(perKind, topToolResults, topAssistantMessages, topReasoningChunks, topUserMessages, taskDoneBoundaries) {
	const sortedBoundaries = [...taskDoneBoundaries].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
	if (sortedBoundaries.length === 0) {
		return { boundaries: [], totalBoundaries: 0, totalMissedSavingsBytes: 0, verdict: "green" };
	}
	const buckets = [
		{ kind: "assistant/message", entries: topAssistantMessages },
		{ kind: "tool/result", entries: topToolResults },
		{ kind: "reasoning-chunks", entries: topReasoningChunks },
		{ kind: "user/message", entries: topUserMessages },
	];
	const out = [];
	let total = 0;
	for (let i = 0; i < sortedBoundaries.length; i += 1) {
		const here = sortedBoundaries[i];
		const next = sortedBoundaries[i + 1];
		const lo = here.time ?? 0;
		const hi = next?.time ?? Number.POSITIVE_INFINITY;
		const segmentBytes = { assistant: 0, toolResult: 0, reasoning: 0, user: 0 };
		for (const bucket of buckets) {
			for (const entry of bucket.entries) {
				const t = entry.time ?? 0;
				if (t > lo && t <= hi) segmentBytes[bucketToKey(bucket.kind)] += entry.size ?? 0;
			}
		}
		const segmentBytesTotal = segmentBytes.assistant + segmentBytes.toolResult + segmentBytes.reasoning + segmentBytes.user;
		const segmentDurationMs = hi === Number.POSITIVE_INFINITY ? null : (hi - lo);
		out.push({
			seq: here.seq,
			time: lo,
			todoId: here.todoId,
			spec: here.spec,
			req: here.req,
			ac: here.ac,
			title: here.title,
			sessionId: here.sessionId,
			segmentBytes,
			segmentDurationMs: segmentDurationMs ?? 0,
		});
		total += segmentBytesTotal;
	}
	const verdict = classify(total, THRESHOLDS["compact-boundaries-missed"]);
	return { boundaries: out, totalBoundaries: out.length, totalMissedSavingsBytes: total, verdict };
}

function bucketToKey(kind) {
	if (kind === "assistant/message") return "assistant";
	if (kind === "tool/result") return "toolResult";
	if (kind === "reasoning-chunks") return "reasoning";
	if (kind === "user/message") return "user";
	return "assistant";
}

async function* collectSource(filePath) {
	const { streamSession } = await import("./stream.js");
	yield* streamSession(filePath);
}

function approximateSize(record) {
	try {
		return JSON.stringify(record).length;
	} catch {
		return 0;
	}
}

function pushTop(list, entry, limit) {
	list.push(entry);
	list.sort((a, b) => b.size - a.size);
	if (list.length > limit) list.length = limit;
}

function topSize(list) {
	return list.length > 0 ? list[0].size : 0;
}

function topKey(counts) {
	let best = null;
	let bestCount = 0;
	for (const [key, value] of counts.entries()) {
		if (value > bestCount) {
			best = key;
			bestCount = value;
		}
	}
	return best;
}

function sortMapDesc(map) {
	const entries = [...map.entries()];
	entries.sort((a, b) => b[1] - a[1]);
	return entries.map(([key, value]) => ({ turn: key, count: value }));
}

function pickDominant(verdicts, color) {
	if (color === "green") return null;
	let best = null;
	let bestSize = 0;
	for (const [dimension, verdict] of Object.entries(verdicts)) {
		if (verdict !== color) continue;
		const size = THRESHOLDS[dimension];
		if (size && size.redAt > bestSize) {
			bestSize = size.redAt;
			best = dimension;
		}
	}
	return best;
}
