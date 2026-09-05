/**
 * Builders for the `task/done` and `task/status` events that Phase 1 emits
 * when a developer marks a TODO as done. Phase 3 (`compact-at-checkpoint`)
 * reads these events from `session.jsonl` to surface natural compact
 * boundaries.
 *
 * @module @dsh-plugins/design-blueprint/todo-events
 */

/**
 * @param {{ todoId: string, from: string, to: string, spec: string, req: string, ac: string, seq: number, time: number, sessionId?: string | null }} input
 * @returns {{ type: "task/status", seq: number, time: number, data: object }}
 */
export function buildTaskStatusEvent({ todoId, from, to, spec, req, ac, seq, time, sessionId = null }) {
	const data = { todoId, from, to, spec, req, ac };
	if (sessionId !== null && sessionId !== undefined) data.sessionId = sessionId;
	return { type: "task/status", seq, time, data };
}

/**
 * @param {{ todoId: string, spec: string, req: string, ac: string, title: string, seq: number, time: number, sessionId?: string | null }} input
 * @returns {{ type: "task/done", seq: number, time: number, data: object }}
 */
export function buildTaskDoneEvent({ todoId, spec, req, ac, title, seq, time, sessionId = null }) {
	const data = { todoId, spec, req, ac, title };
	if (sessionId !== null && sessionId !== undefined) data.sessionId = sessionId;
	return { type: "task/done", seq, time, data };
}
