/**
 * Two-session compare: read two reports and emit a Markdown table that
 * diffs the dimensions a developer actually asks about.
 *
 * @module @dsh-plugins/design-blueprint-diagnostics/compare
 */

/**
 * @typedef {Object} CompareRow
 * @property {string} dimension
 * @property {number | string} left
 * @property {number | string} right
 * @property {string} delta
 * @property {boolean} significant
 */

/**
 * Build the comparison table.
 *
 * @param {import("./audit.js").AuditReport} leftReport
 * @param {import("./audit.js").AuditReport} rightReport
 * @param {{ labelLeft?: string, labelRight?: string, threshold?: number }} [options]
 * @returns {CompareRow[]}
 */
export function compare(leftReport, rightReport, options = {}) {
	const labelLeft = options.labelLeft ?? "left";
	const labelRight = options.labelRight ?? "right";
	const threshold = options.threshold ?? 0.1;

	const rows = [];
	push(rows, labelLeft, labelRight, "events", leftReport.summary.parsed + leftReport.summary.skipped, rightReport.summary.parsed + rightReport.summary.skipped, threshold);
	push(rows, labelLeft, labelRight, "parsed events", leftReport.summary.parsed, rightReport.summary.parsed, threshold);
	push(rows, labelLeft, labelRight, "skipped events", leftReport.summary.skipped, rightReport.summary.skipped, threshold);
	push(rows, labelLeft, labelRight, "turns", countTurns(leftReport), countTurns(rightReport), threshold);
	push(rows, labelLeft, labelRight, "retry events", leftReport.retries.retryEvents, rightReport.retries.retryEvents, threshold);
	push(rows, labelLeft, labelRight, "affected turns (retries)", leftReport.retries.retryTurns, rightReport.retries.retryTurns, threshold);
	push(rows, labelLeft, labelRight, "compaction starts", leftReport.compactions.starts, rightReport.compactions.starts, threshold);
	push(rows, labelLeft, labelRight, "compaction ends", leftReport.compactions.ends, rightReport.compactions.ends, threshold);
	push(rows, labelLeft, labelRight, "interrupted compactions", leftReport.compactions.interrupted, rightReport.compactions.interrupted, threshold);
	pushBytes(rows, labelLeft, labelRight, "assistant bytes", leftReport, rightReport, "assistant/message", threshold);
	pushBytes(rows, labelLeft, labelRight, "tool/result bytes", leftReport, rightReport, "tool/result", threshold);
	pushBytes(rows, labelLeft, labelRight, "reasoning bytes", leftReport, rightReport, "reasoning-chunks", threshold);
	pushBytes(rows, labelLeft, labelRight, "user/message bytes", leftReport, rightReport, "user/message", threshold);
	pushTop(rows, labelLeft, labelRight, "largest assistant", leftReport.topAssistantMessages, rightReport.topAssistantMessages);
	pushTop(rows, labelLeft, labelRight, "largest tool result", leftReport.topToolResults, rightReport.topToolResults);
	pushTop(rows, labelLeft, labelRight, "largest reasoning", leftReport.topReasoningChunks, rightReport.topReasoningChunks);
	pushMaxDuration(rows, labelLeft, labelRight, "longest turn", leftReport.turnDurationsMs, rightReport.turnDurationsMs);
	const leftBoundary = leftReport.compactBoundaries?.totalMissedSavingsBytes ?? 0;
	const rightBoundary = rightReport.compactBoundaries?.totalMissedSavingsBytes ?? 0;
	push(rows, labelLeft, labelRight, "compact boundaries missed", leftBoundary, rightBoundary, threshold);
	return rows;
}

/**
 * Render the comparison table as Markdown.
 *
 * @param {CompareRow[]} rows
 * @param {string} labelLeft
 * @param {string} labelRight
 * @returns {string}
 */
export function renderCompareMarkdown(rows, labelLeft = "left", labelRight = "right") {
	const lines = [`# Blueprint diagnostics — compare`, "", `| dimension | ${labelLeft} | ${labelRight} | delta |`, `| --- | ---: | ---: | --- |`];
	for (const row of rows) {
		lines.push(`| ${row.dimension} | ${row.left} | ${row.right} | ${row.delta}${row.significant ? " ⚠" : ""} |`);
	}
	return lines.join("\n") + "\n";
}

function push(rows, labelLeft, labelRight, dimension, left, right, threshold) {
	const significant = isSignificantNumber(left, right, threshold);
	const delta = numericDelta(left, right);
	rows.push({ dimension, left, right, delta, significant });
}

function pushBytes(rows, labelLeft, labelRight, dimension, left, right, kind, threshold) {
	const leftBytes = left.perKind[kind]?.bytes ?? 0;
	const rightBytes = right.perKind[kind]?.bytes ?? 0;
	push(rows, labelLeft, labelRight, dimension, formatBytes(leftBytes), formatBytes(rightBytes));
	const last = rows[rows.length - 1];
	last.significant = isSignificantNumber(leftBytes, rightBytes, threshold);
}

function pushTop(rows, labelLeft, labelRight, dimension, leftList, rightList) {
	const l = leftList[0]?.size ?? 0;
	const r = rightList[0]?.size ?? 0;
	push(rows, labelLeft, labelRight, dimension, formatBytes(l), formatBytes(r));
	const last = rows[rows.length - 1];
	last.significant = isSignificantNumber(l, r, 0.25);
}

function pushMaxDuration(rows, labelLeft, labelRight, dimension, leftList, rightList) {
	const l = leftList.length === 0 ? 0 : Math.max(...leftList);
	const r = rightList.length === 0 ? 0 : Math.max(...rightList);
	push(rows, labelLeft, labelRight, dimension, formatDuration(l), formatDuration(r));
	const last = rows[rows.length - 1];
	last.significant = isSignificantNumber(l, r, 0.25);
}

function countTurns(report) {
	return report.turnDurationsMs.length;
}

function isSignificantNumber(a, b, threshold) {
	if (typeof a !== "number" || typeof b !== "number") return false;
	if (a === 0 && b === 0) return false;
	const max = Math.max(Math.abs(a), Math.abs(b));
	if (max === 0) return false;
	return Math.abs(a - b) / max >= threshold;
}

function numericDelta(a, b) {
	if (typeof a !== "number" || typeof b !== "number") return "—";
	if (a === 0 && b === 0) return "0";
	const sign = b > a ? "+" : b < a ? "−" : "±";
	return `${sign}${formatBytes(Math.abs(b - a))}`;
}

function formatBytes(n) {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
	return `${(n / 1024 / 1024).toFixed(2)} MiB`;
}

function formatDuration(ms) {
	if (ms < 1000) return `${ms} ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
	if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)} min`;
	return `${(ms / 3_600_000).toFixed(1)} h`;
}
