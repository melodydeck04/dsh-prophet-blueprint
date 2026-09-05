//#region lib/auto-compact-watcher.js
/**
 * Host-side session-file watcher that dispatches DSH's `/compact` slash command.
 *
 * The CLI subprocess (`node lib/cli.js todo mark …`) writes `task/done` events
 * to `session.jsonl` but cannot call `ctx.compaction.compactNow(...)` because
 * it has no handle on the host's cordis `ctx`. The watcher runs inside the
 * plugin's own cordis fiber and consumes new `task/done` events written by
 * the CLI. When the Feature-switch + 200 KiB predicate says fire, the watcher
 * invokes the same `ctx.compaction.compactNow(agent, signal, commandId)` call
 * that `@deepseek-ai/dsh-command-compact` uses internally for the human
 * `/compact` slash command.
 *
 * The watcher is chat-driven: `lib/orchestration.js#dispatchCommand` calls
 * `captureAgent` and `tick` on every `/blueprint` invocation. There is no
 * timer — every DSH session that uses `/blueprint` triggers the tick path;
 * sessions that do not invoke `/blueprint` simply never trigger the watcher.
 *
 * When the host's `ctx.compaction.compactNow` is not a function (CI / lint,
 * or a DSH release that predates `@deepseek-ai/dsh-compaction`), `apply(ctx)`
 * wires a no-op watcher that logs a one-time `info` message and otherwise
 * returns `{ skipped: 'no-compaction-service' }`. This keeps the CLI's
 * `no-dispatch-surface` outcome line meaningful in non-DSH runs.
 *
 * @module @dsh-plugins/design-blueprint/lib/auto-compact-watcher
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { maybeAutoCompact, _resetDispatchWarning } from "./todo-compact-trigger.js";
import { featureIdForSpecPath } from "./spec-todos.js";

const COMMAND_ID = "blueprint-auto-compact";

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
 * Stable dedup key for a `task/done` event. Prefers the event's `seq`; falls
 * back to `time+todoId` so events without a `seq` still deduplicate.
 */
function taskDoneKey(record) {
	if (typeof record?.seq === "number") return `seq:${record.seq}`;
	const time = typeof record?.time === "number" ? record.time : 0;
	const todoId = typeof record?.data?.todoId === "string" ? record.data.todoId : "";
	return `time:${time}:todo:${todoId}`;
}

/** Walk the file and return every `task/done` record with a parsed dedup key. */
function readAllTaskDoneRecords(sessionPath) {
	let text;
	try {
		text = readFileSync(sessionPath, "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") return [];
		throw error;
	}
	const records = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		try {
			const record = JSON.parse(trimmed);
			if (record?.type !== "task/done") continue;
			records.push({ record, key: taskDoneKey(record) });
		} catch {
			continue;
		}
	}
	return records;
}

/**
 * Create the host-side watcher. Holds per-session state and dispatches via
 * `ctx.compaction.compactNow` when the trigger fires.
 *
 * @param {{
 *   ctx: { compaction?: { compactNow?: (...args: unknown[]) => Promise<unknown> } },
 *   logger?: { info?: (msg: string) => void, warn?: (msg: string) => void },
 * }} input
 */
export function createAutoCompactWatcher({ ctx, logger = {} } = {}) {
	const sessionAgents = new Map(); // sessionId -> { agent, signal, commandId }
	const sessionLastSeen = new Map(); // sessionId -> { key, time }
	let noCompactionWarned = false;
	const hasCompactNow = typeof ctx?.compaction?.compactNow === "function";

	if (!hasCompactNow && typeof logger.info === "function" && !noCompactionWarned) {
		noCompactionWarned = true;
		logger.info("auto-compact: skipped (no DSH compaction service in this profile; manual /compact required).");
	}

	return {
		/**
		 * Record the active session's agent for the next tick. The agent is
		 * captured from `invocation.agent` in the orchestrator's
		 * `dispatchCommand` so the watcher can pass it to `compactNow` later.
		 *
		 * `capture` may be `null` or missing fields; the watcher tolerates the
		 * shape by treating a missing `agent` as a no-op for future ticks.
		 */
		captureAgent(sessionId, capture) {
			if (typeof sessionId !== "string" || sessionId.length === 0) return;
			if (capture == null || capture.agent == null) return;
			sessionAgents.set(sessionId, {
				agent: capture.agent,
				signal: capture.signal,
				commandId: typeof capture.commandId === "string" ? capture.commandId : COMMAND_ID,
			});
		},

		/**
		 * Scan `session.jsonl` for any `task/done` event that has not yet been
		 * consumed by this watcher, evaluate the trigger, and dispatch via
		 * `ctx.compaction.compactNow` when the predicate says fire.
		 *
		 * Returns one of:
		 *   - `{ skipped: 'no-agent' }` when no agent stash entry exists.
		 *   - `{ skipped: 'no-compaction-service' }` when `ctx.compaction.compactNow` is absent.
		 *   - `{ skipped: 'no-session-file' }` when `session.jsonl` is missing.
		 *   - `{ skipped: 'no-new-task-done' }` when nothing new arrived since the last tick.
		 *   - `{ skipped: 'already-processed', key }` when the new event was already consumed.
		 *   - `{ invoked: false, reason, bytesSincePreviousTaskDone?, error? }` for the four skip reasons.
		 *   - `{ invoked: true, reason: 'feature-switch', previousFeatureId, currentFeatureId, bytesSincePreviousTaskDone }` on fire.
		 */
		async tick({ cwd, sessionId, nowMs } = {}) {
			if (!hasCompactNow) return { skipped: "no-compaction-service" };
			if (typeof cwd !== "string" || typeof sessionId !== "string" || sessionId.length === 0) {
				return { skipped: "no-session-file" };
			}
			const stash = sessionAgents.get(sessionId);
			if (stash === undefined) return { skipped: "no-agent" };

			const sessionPath = locateSessionPath(cwd, sessionId);
			if (sessionPath === null) return { skipped: "no-session-file" };

			const records = readAllTaskDoneRecords(sessionPath);
			if (records.length === 0) return { skipped: "no-new-task-done" };

			const lastSeen = sessionLastSeen.get(sessionId);
			const lastRecord = records[records.length - 1];
			if (lastSeen !== undefined && lastSeen.key === lastRecord.key) {
				return { skipped: "already-processed", key: lastRecord.key };
			}

			const priorRecord = records.length >= 2 ? records[records.length - 2].record : null;
			const priorSpecPath = typeof priorRecord?.data?.spec === "string" ? priorRecord.data.spec : null;
			const priorFeatureId = priorSpecPath === null ? null : featureIdForSpecPath(priorSpecPath, cwd);

			const currentSpecPath = typeof lastRecord.record?.data?.spec === "string" ? lastRecord.record.data.spec : null;
			const currentFeatureId = currentSpecPath === null ? null : featureIdForSpecPath(currentSpecPath, cwd);

			const eventTime = typeof lastRecord.record?.time === "number" ? lastRecord.record.time : (typeof nowMs === "number" ? nowMs : Date.now());

			const fireAndForgetDispatch = (cmd) => {
				if (!hasCompactNow) return Promise.resolve(null);
				try {
					return Promise.resolve(ctx.compaction.compactNow(stash.agent, stash.signal, stash.commandId));
				} catch (error) {
					return Promise.reject(error);
				}
			};

			_resetDispatchWarning();

			const result = await maybeAutoCompact({
				cwd,
				sessionId,
				currentTaskSpecPath: currentSpecPath,
				currentFeatureId,
				nowMs: eventTime,
				dispatch: fireAndForgetDispatch,
				logger,
			});

			sessionLastSeen.set(sessionId, { key: lastRecord.key, time: eventTime });

			if (result.reason === "feature-switch" && result.invoked === true && priorFeatureId !== null) {
				result.previousFeatureId = priorFeatureId;
			}

			return result;
		},

		/** Clear all state. Called on plugin unload. */
		dispose() {
			sessionAgents.clear();
			sessionLastSeen.clear();
		},
	};
}
