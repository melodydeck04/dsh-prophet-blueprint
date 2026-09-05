/**
 * Verdict thresholds for the Blueprint session diagnostics package.
 *
 * Each entry maps a diagnostic dimension to a list of break-points. The
 * audit logic reads these to derive one green / yellow / red verdict per
 * dimension. The numbers are heuristics tuned against the first real
 * session the package was authored against; tune them in this file, not in
 * the audit logic.
 *
 * @module @dsh-plugins/design-blueprint-diagnostics/thresholds
 */

export const THRESHOLDS = Object.freeze({
	"retry-rate-per-turn": Object.freeze({
		// retries / turns; turns with more than 100% retry rate are red,
		// turns above 50% are yellow, others are green.
		yellowAt: 0.5,
		redAt: 1.0,
	}),
	"compaction-completeness": Object.freeze({
		// start / end ratio. If end count is less than start count, the
		// session has interrupted compactions; the missing count drives the
		// verdict.
		yellowAt: 1,
		redAt: 1,
	}),
	"reasoning-chunk-bytes": Object.freeze({
		// single reasoning chunk size in bytes.
		yellowAt: 32 * 1024,
		redAt: 96 * 1024,
	}),
	"assistant-message-bytes": Object.freeze({
		// single assistant message size in bytes.
		yellowAt: 96 * 1024,
		redAt: 256 * 1024,
	}),
	"tool-result-bytes": Object.freeze({
		// single tool/result size in bytes.
		yellowAt: 256 * 1024,
		redAt: 1024 * 1024,
	}),
	"compact-boundaries-missed": Object.freeze({
		// total bytes of segments between successive task/done events (i.e., how
		// much the developer let accumulate without typing /compact).
		yellowAt: 1 * 1024 * 1024,
		redAt: 4 * 1024 * 1024,
	}),
});

const VERDICT_ORDER = ["green", "yellow", "red"];

/**
 * Compare one observed number against one threshold block. Returns the
 * worst verdict whose break-point the value meets.
 *
 * @param {number} value observed value
 * @param {{ yellowAt: number, redAt: number }} block threshold block
 * @returns {"green" | "yellow" | "red"}
 */
export function classify(value, block) {
	if (typeof value !== "number" || Number.isNaN(value)) return "green";
	if (value >= block.redAt) return "red";
	if (value >= block.yellowAt) return "yellow";
	return "green";
}

/**
 * Reduce one record of verdicts to the single worst color. Missing keys
 * count as green so the caller can build the verdict incrementally.
 *
 * @param {Record<string, "green" | "yellow" | "red">} verdicts
 * @returns {"green" | "yellow" | "red"}
 */
export function worstOf(verdicts) {
	let worst = "green";
	for (const verdict of Object.values(verdicts)) {
		if (VERDICT_ORDER.indexOf(verdict) > VERDICT_ORDER.indexOf(worst)) {
			worst = verdict;
		}
	}
	return worst;
}
