/**
 * Render one audit report as a Markdown document suitable for pasting into
 * a Spec discussion or a Pull Request description.
 *
 * @module @dsh-plugins/design-blueprint-diagnostics/report
 */

const VERDICT_EMOJI = { green: "🟢", yellow: "🟡", red: "🔴" };

/**
 * Render one audit report as Markdown.
 *
 * @param {import("./audit.js").AuditReport} report
 * @param {{ label?: string }} [options]
 * @returns {string}
 */
export function renderMarkdown(report, options = {}) {
	const label = options.label ?? "session";
	const lines = [];
	lines.push(`# Blueprint diagnostics — ${label}`);
	lines.push("");
	lines.push(`Source: \`${report.sourcePath}\``);
	if (report.version !== null) lines.push(`Session version: \`${report.version}\``);
	lines.push(`Parsed events: ${report.summary.parsed} · skipped: ${report.summary.skipped}`);
	if (report.duration.durationMs !== null) {
		lines.push(`Duration: ${formatDuration(report.duration.durationMs)}`);
	}
	const color = report.verdict?.color ?? "green";
	const dominant = report.verdict?.dominant ?? null;
	lines.push("");
	lines.push(`Verdict: ${VERDICT_EMOJI[color] ?? color}${dominant ? ` (dominant: ${dominant})` : ""}`);
	lines.push("");
	lines.push("## Counts");
	lines.push("");
	lines.push("| dimension | count | bytes |");
	lines.push("| --- | ---: | ---: |");
	for (const kind of Object.keys(report.perKind).sort()) {
		const entry = report.perKind[kind];
		lines.push(`| \`${kind}\` | ${entry.count} | ${formatBytes(entry.bytes)} |`);
	}
	lines.push("");
	lines.push("## Retries");
	lines.push("");
	lines.push(`- retry events: ${report.retries.retryEvents}`);
	lines.push(`- affected turns: ${report.retries.retryTurns}`);
	lines.push(`- dominant policy key: \`${report.retries.dominantPolicyKey ?? "(none)"}\``);
	if (report.retries.perTurn.length > 0) {
		lines.push("");
		lines.push("| turn | retries |");
		lines.push("| ---: | ---: |");
		for (const { turn, count } of report.retries.perTurn.slice(0, 8)) {
			lines.push(`| ${turn} | ${count} |`);
		}
	}
	lines.push("");
	lines.push("## Compactions");
	lines.push("");
	lines.push(`- starts: ${report.compactions.starts}`);
	lines.push(`- ends: ${report.compactions.ends}`);
	lines.push(`- interrupted: ${report.compactions.interrupted}`);
	lines.push("");
	lines.push("## Tool names");
	lines.push("");
	if (Object.keys(report.toolNames).length === 0) {
		lines.push("(none recorded)");
	} else {
		lines.push("| name | calls |");
		lines.push("| --- | ---: |");
		const entries = Object.entries(report.toolNames).sort((a, b) => b[1] - a[1]).slice(0, 10);
		for (const [name, calls] of entries) lines.push(`| \`${name}\` | ${calls} |`);
	}
	lines.push("");
	lines.push("## Turn durations");
	lines.push("");
	if (report.turnDurationsMs.length === 0) {
		lines.push("(none recorded)");
	} else {
		const stats = percentileStats(report.turnDurationsMs);
		lines.push(`- turns: ${stats.count}`);
		lines.push(`- max: ${formatDuration(stats.max)}`);
		lines.push(`- p99: ${formatDuration(stats.p99)}`);
		lines.push(`- p90: ${formatDuration(stats.p90)}`);
		lines.push(`- p50: ${formatDuration(stats.p50)}`);
	}
	lines.push("");
	lines.push("## Compact boundaries");
	lines.push("");
	const cb = report.compactBoundaries ?? { boundaries: [], totalBoundaries: 0, totalMissedSavingsBytes: 0, verdict: "green" };
	if (cb.boundaries.length === 0) {
		lines.push("(no task/done events in this session; nothing to bound)");
	} else {
		lines.push(`- task/done events: ${cb.totalBoundaries}`);
		lines.push(`- missed compact savings: ${formatBytes(cb.totalMissedSavingsBytes)}`);
		lines.push(`- verdict: ${verdictEmoji(cb.verdict)} (${cb.verdict})`);
		lines.push("");
		lines.push("| boundary | todoId | spec | segment bytes | duration |");
		lines.push("| --- | --- | --- | ---: | ---: |");
		for (const b of cb.boundaries) {
			const seg = b.segmentBytes;
			const total = (seg.assistant ?? 0) + (seg.toolResult ?? 0) + (seg.reasoning ?? 0) + (seg.user ?? 0);
			lines.push(`| ${formatBoundaryTime(b.time)} | ${b.todoId} | ${b.spec || "(none)"} | ${formatBytes(total)} | ${formatDuration(b.segmentDurationMs)} |`);
		}
	}
	lines.push("");
	lines.push("## Top largest events");
	lines.push("");
	lines.push("### Assistant messages");
	lines.push(renderTopTable(report.topAssistantMessages));
	lines.push("");
	lines.push("### Tool results");
	lines.push(renderTopTable(report.topToolResults));
	lines.push("");
	lines.push("### Reasoning chunks");
	lines.push(renderTopTable(report.topReasoningChunks));
	lines.push("");
	lines.push("### User messages");
	lines.push(renderTopTable(report.topUserMessages));
	lines.push("");
	return lines.join("\n");
}

function verdictEmoji(verdict) {
	if (verdict === "red") return "🔴";
	if (verdict === "yellow") return "🟡";
	return "🟢";
}

function formatBoundaryTime(time) {
	if (typeof time !== "number" || !Number.isFinite(time)) return "?";
	const d = new Date(time);
	if (Number.isNaN(d.valueOf())) return "?";
	const hh = String(d.getUTCHours()).padStart(2, "0");
	const mm = String(d.getUTCMinutes()).padStart(2, "0");
	const ss = String(d.getUTCSeconds()).padStart(2, "0");
	return `${hh}:${mm}:${ss}`;
}

function renderTopTable(list) {
	if (!list || list.length === 0) return "(none recorded)";
	const lines = ["| seq | time | size |", "| ---: | ---: | ---: |"];
	for (const entry of list) {
		lines.push(`| ${entry.seq ?? "?"} | ${entry.time ?? "?"} | ${formatBytes(entry.size)} |`);
	}
	return lines.join("\n");
}

function percentileStats(values) {
	const sorted = [...values].sort((a, b) => a - b);
	const at = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];
	return {
		count: sorted.length,
		max: sorted[sorted.length - 1],
		p50: at(0.5),
		p90: at(0.9),
		p99: at(0.99),
	};
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
