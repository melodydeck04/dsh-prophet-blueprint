//#region lib/todo-compact-trigger.js
/**
 * Auto-compact on Feature switch.
 *
 * The framework listens for `task/done` events and decides whether to call
 * DSH's `/compact` slash command. The decision is a two-gate predicate:
 *
 *   1. Feature-switch: the just-completed task's Spec path belongs to a
 *      different Feature than the immediately previous `task/done` event's
 *      Spec path.
 *   2. Byte floor: at least 200 KiB of conversation has accumulated since the
 *      previous `task/done` event. A successful compact summarises the
 *      conversation and drops the byte count, so this gate implicitly
 *      rate-limits the trigger without needing a separate cooldown.
 *
 * Three outcomes are possible besides "fire": "same-feature" (the
 * developer stayed on one Feature), "under-threshold" (Feature switch
 * detected but not enough conversation), and "no-previous-task" (no
 * prior `task/done` to compare against).
 *
 * The dispatch path uses dependency injection. Tests pass a stub that
 * records the call. The CLI integration passes a no-op dispatch today;
 * a future Spec may wire the real DSH input-trigger surface.
 *
 * @module @dsh-plugins/design-blueprint/lib/todo-compact-trigger
 */

import { appendFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { featureIdForSpecPath } from "./spec-todos.js";

/** Bytes below this threshold block the auto-compact. */
export const BYTE_THRESHOLD_BYTES = 200 * 1024;

/** Locate the active `session.jsonl` for a session. Returns null if absent. */
function locateSessionPath(cwd, sessionId) {
	if (typeof sessionId === "string" && sessionId.length > 0) {
		const nested = join(cwd, ".dsh/sessions", sessionId, "session.jsonl");
		if (existsSync(nested)) return nested;
	}
	const flat = join(cwd, "session.jsonl");
	if (existsSync(flat)) return flat;
	return null;
}

/**
 * Read every record from `session.jsonl`. Bad lines are skipped; an absent
 * file returns `[]`. Records are returned in file order.
 */
async function readSessionRecords(sessionPath) {
	if (!existsSync(sessionPath)) return [];
	const text = await readFile(sessionPath, "utf8");
	const records = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		try {
			records.push(JSON.parse(trimmed));
		} catch {
			continue;
		}
	}
	return records;
}

/**
 * Sum byte size of every line in `session.jsonl` whose `time` is in
 * `(lo, hi]`. Bytes are UTF-8 length + 1 for the trailing newline, matching
 * the convention used by `lib/cli.js#readSessionSegmentBytes`.
 */
export async function bytesBetweenTimestamps(sessionPath, lo, hi) {
	if (!existsSync(sessionPath)) return 0;
	const text = await readFile(sessionPath, "utf8");
	let total = 0;
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		try {
			const record = JSON.parse(trimmed);
			if (typeof record?.time !== "number") continue;
			if (record.time <= lo) continue;
			if (record.time > hi) continue;
			total += Buffer.byteLength(trimmed, "utf8") + 1;
		} catch {
			continue;
		}
	}
	return total;
}

/**
 * Pure predicate. Returns one of four outcome strings.
 *
 *   - "fire"             — Feature ids differ AND bytes >= threshold.
 *   - "same-feature"     — Feature ids match (both non-null).
 *   - "under-threshold"  — Feature ids differ but bytes < threshold.
 *   - "no-previous-task" — either side has no Feature id.
 */
export function evaluateTrigger({ previousFeatureId, currentFeatureId, bytesSincePreviousTaskDone }) {
	if (previousFeatureId === null || previousFeatureId === undefined
		|| currentFeatureId === null || currentFeatureId === undefined) {
		return "no-previous-task";
	}
	if (previousFeatureId === currentFeatureId) return "same-feature";
	if (bytesSincePreviousTaskDone < BYTE_THRESHOLD_BYTES) return "under-threshold";
	return "fire";
}

/**
 * Look up the most recent `task/done` event before `nowMs` in
 * `session.jsonl`. Returns the record's `data.spec` and `time`, or `null`
 * when no prior task exists.
 */
async function mostRecentPriorTaskDone(sessionPath, nowMs) {
	const records = await readSessionRecords(sessionPath);
	for (let index = records.length - 1; index >= 0; index -= 1) {
		const record = records[index];
		if (record?.type !== "task/done") continue;
		if (typeof record?.time !== "number") continue;
		if (record.time >= nowMs) continue;
		return { spec: typeof record?.data?.spec === "string" ? record.data.spec : null, time: record.time };
	}
	return null;
}

/**
 * Append one `compact/auto-fired` event to `session.jsonl`. The record
 * follows the same `seq` / `time` shape as `task/done` so the diagnostics
 * package's stream parser can read it without changes.
 */
async function appendAutoFiredEvent(sessionPath, { previousFeatureId, currentFeatureId, bytesSincePreviousTaskDone, nowMs }) {
	if (!existsSync(sessionPath)) return;
	const event = {
		type: "compact/auto-fired",
		seq: nowMs,
		time: nowMs,
		data: { reason: "feature-switch", previousFeatureId, currentFeatureId, bytesSincePreviousTaskDone },
	};
	await appendFile(sessionPath, JSON.stringify(event) + "\n", "utf8");
}

/**
 * Run the auto-compact decision and (if fire) dispatch DSH's `/compact`.
 *
 * @param {{
 *   cwd: string,
 *   sessionId: string | null,
 *   currentTaskSpecPath: string,
 *   currentFeatureId: string | null,
 *   nowMs: number,
 *   dispatch?: ((slashCommand: string) => void | Promise<void>) | null,
 *   logger?: { warn?: (msg: string) => void, info?: (msg: string) => void },
 * }} input
 * @returns {Promise<{ invoked: boolean, reason: string, error?: string, bytesSincePreviousTaskDone?: number }>}
 */
export async function maybeAutoCompact({ cwd, sessionId, currentTaskSpecPath, currentFeatureId, nowMs, dispatch = null, logger = {} }) {
	const sessionPath = locateSessionPath(cwd, sessionId);
	if (sessionPath === null) return { invoked: false, reason: "no-previous-task" };

	const prior = await mostRecentPriorTaskDone(sessionPath, nowMs);
	if (prior === null || prior.spec === null) return { invoked: false, reason: "no-previous-task" };
	if (currentFeatureId === null || currentFeatureId === undefined) return { invoked: false, reason: "no-previous-task" };

	const previousFeatureId = featureIdForSpecPath(prior.spec, cwd);
	if (previousFeatureId === null) return { invoked: false, reason: "no-previous-task" };

	const bytesSincePreviousTaskDone = await bytesBetweenTimestamps(sessionPath, prior.time, nowMs);
	const verdict = evaluateTrigger({ previousFeatureId, currentFeatureId, bytesSincePreviousTaskDone });
	if (verdict !== "fire") return { invoked: false, reason: verdict, bytesSincePreviousTaskDone };

	if (typeof dispatch !== "function") {
		if (logger?.warn && !maybeAutoCompact._warnedNoDispatch) {
			maybeAutoCompact._warnedNoDispatch = true;
			logger.warn("Auto-compact: skipped (no DSH slash-command dispatch surface; pass a dispatch callback to enable).");
		}
		return { invoked: false, reason: "no-dispatch-surface", bytesSincePreviousTaskDone };
	}

	try {
		await dispatch("compact");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (logger?.warn) logger.warn(`Auto-compact: dispatch failed (${message}).`);
		return { invoked: false, reason: "dispatch-failed", error: message, bytesSincePreviousTaskDone };
	}

	await appendAutoFiredEvent(sessionPath, { previousFeatureId, currentFeatureId, bytesSincePreviousTaskDone, nowMs });
	return { invoked: true, reason: "feature-switch", bytesSincePreviousTaskDone };
}

/** Reset the one-time warning flag. Exported for tests. */
export function _resetDispatchWarning() {
	maybeAutoCompact._warnedNoDispatch = false;
}
//#endregion
