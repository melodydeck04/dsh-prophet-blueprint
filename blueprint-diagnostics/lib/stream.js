/**
 * Streaming newline-delimited JSON reader for DSH session.jsonl exports.
 *
 * Yields one parsed record at a time so the audit can process multi-million
 * line exports without buffering the whole file. Malformed lines are
 * counted in `skipped` rather than thrown, so a single bad record never
 * aborts the whole audit.
 *
 * @module @dsh-plugins/design-blueprint-diagnostics/stream
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const KNOWN_VERSIONS = new Set([0, 1]);

/**
 * @typedef {Object} StreamSummary
 * @property {number} parsed
 * @property {number} skipped
 * @property {number | null} version
 */

/**
 * Stream one session.jsonl file and yield one record at a time.
 *
 * Yields objects with at least `type` and a `time` field. The function
 * keeps a running counter of parsed and skipped lines and records the
 * first observed session version it sees. A trailing invalid line emits
 * one final yield with `record: null` so the consumer sees the final
 * skipped count.
 *
 * @param {string} filePath
 * @param {{ onProgress?: (parsed: number, skipped: number) => void }} [options]
 * @returns {AsyncGenerator<{ record: object | null, summary: StreamSummary }>}
 */
export async function* streamSession(filePath, options = {}) {
	let parsed = 0;
	let skipped = 0;
	let version = null;
	const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;

	const node = createReadStream(filePath, { encoding: "utf8" });
	/** @type {Error | null} */
	let iteratorError = null;
	node.on("error", (error) => {
		iteratorError = error;
	});

	const rl = createInterface({ input: node, crlfDelay: Infinity });
	let lastYieldedSummary = { parsed: 0, skipped: 0, version: null };
	for await (const line of rl) {
		if (iteratorError) throw iteratorError;
		if (line.length === 0) {
			if (onProgress && ((parsed + skipped) & 0x3ff) === 0) onProgress(parsed, skipped);
			continue;
		}
		let record;
		try {
			record = JSON.parse(line);
		} catch {
			skipped += 1;
			lastYieldedSummary = { parsed, skipped, version };
			if (onProgress && ((parsed + skipped) & 0x3ff) === 0) onProgress(parsed, skipped);
			continue;
		}
		parsed += 1;
		if (version === null && record && typeof record === "object" && record.type === "session") {
			if (KNOWN_VERSIONS.has(record.version)) version = record.version;
			else version = record.version;
		}
		lastYieldedSummary = { parsed, skipped, version };
		yield { record, summary: lastYieldedSummary };
		if (onProgress && ((parsed + skipped) & 0x3ff) === 0) onProgress(parsed, skipped);
	}
	if (onProgress) onProgress(parsed, skipped);
	if (parsed + skipped > 0) yield { record: null, summary: lastYieldedSummary };
}

/**
 * Fully consume one session.jsonl into an in-memory array. Use this only
 * for tests and small files; production code should use streamSession
 * directly.
 *
 * @param {string} filePath
 * @returns {Promise<{ records: object[], summary: StreamSummary }>}
 */
export async function collectSession(filePath) {
	const records = [];
	let summary = { parsed: 0, skipped: 0, version: null };
	for await (const { record, summary: next } of streamSession(filePath)) {
		if (record !== null) records.push(record);
		summary = next;
	}
	return { records, summary };
}
