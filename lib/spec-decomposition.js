/**
 * Spec decomposition detector and template builder.
 *
 * Pure functions: take a Spec (file + content) and a config, return a
 * structured `{ ok, violations, suggestion }`. No filesystem side effects.
 *
 * The detector is consulted by `lib/scan.js` and by the `spec decompose`
 * CLI subcommand. The template builder helps the user break an oversized
 * Spec into a parent + N bounded sub-Specs.
 *
 * @module @dsh-plugins/design-blueprint/spec-decomposition
 */

const DEFAULT_THRESHOLDS = Object.freeze({
	maxReq: 8,
	maxScopePaths: 5,
	maxLines: 1500,
});

const REQ_PATTERN = /\bREQ-[A-Za-z0-9_-]+\b/g;
const SCOPE_ALLOW_PATTERN = /^\s*-\s+allow:\s+(.+?)\s*$/;
const SUBSPEC_PATTERN = /^\s*-\s+[A-Za-z_][A-Za-z0-9_-]*:\s*(.*)$/;

/**
 * @typedef {Object} DecompositionIssue
 * @property {string} check
 * @property {string} message
 * @property {string} fix
 */

/**
 * @typedef {Object} DecompositionSuggestion
 * @property {number} subSpecCount
 * @property {Array<{ index: number, reqStart: number, reqEnd: number, reqCount: number }>} allocations
 */

/**
 * @typedef {Object} DecompositionResult
 * @property {boolean} ok
 * @property {DecompositionIssue[]} violations
 * @property {DecompositionSuggestion | null} suggestion
 * @property {{ reqCount: number, scopePathCount: number, lineCount: number }} observed
 */

/**
 * @param {{ maxReq?: number, maxScopePaths?: number, maxLines?: number } | null | undefined } config
 * @returns {{ maxReq: number, maxScopePaths: number, maxLines: number }}
 */
export function loadThresholds(config) {
	if (config === null || config === undefined || typeof config !== "object") {
		return { ...DEFAULT_THRESHOLDS };
	}
	return {
		maxReq: typeof config.maxReq === "number" ? config.maxReq : DEFAULT_THRESHOLDS.maxReq,
		maxScopePaths: typeof config.maxScopePaths === "number" ? config.maxScopePaths : DEFAULT_THRESHOLDS.maxScopePaths,
		maxLines: typeof config.maxLines === "number" ? config.maxLines : DEFAULT_THRESHOLDS.maxLines,
	};
}

/**
 * Inspect one Spec and decide whether it is too coarse for one session.
 *
 * @param {{ file: string, content: string, config?: object | null }} input
 * @returns {DecompositionResult}
 */
export function evaluateSpec({ file, content, config = null }) {
	if (typeof file !== "string" || file.length === 0) throw new Error("evaluateSpec: file must be a non-empty string");
	if (typeof content !== "string") throw new Error("evaluateSpec: content must be a string");

	const thresholds = loadThresholds(config);
	const reqCount = (content.match(REQ_PATTERN) ?? []).length;
	const scopePathCount = countScopeAllowPaths(content);
	const lineCount = content.split(/\r?\n/).length;
	const observed = { reqCount, scopePathCount, lineCount };

	const violations = [];
	if (reqCount > thresholds.maxReq) {
		violations.push({
			check: "spec-decomposition.req-count",
			message: `Spec has ${reqCount} REQ-* entries; threshold is ${thresholds.maxReq}`,
			fix: `Decompose the Spec into ${suggestSubSpecCount(reqCount, thresholds.maxReq)} sub-Specs using 'design-blueprint spec decompose <spec.md>'`,
		});
	}
	if (scopePathCount > thresholds.maxScopePaths) {
		violations.push({
			check: "spec-decomposition.scope-paths",
			message: `Spec has ${scopePathCount} allowed paths; threshold is ${thresholds.maxScopePaths}`,
			fix: `Narrow the Scope to at most ${thresholds.maxScopePaths} globs, or split the Spec by ownership boundary`,
		});
	}
	if (lineCount > thresholds.maxLines) {
		violations.push({
			check: "spec-decomposition.line-count",
			message: `Spec has ${lineCount} lines; threshold is ${thresholds.maxLines}`,
			fix: `Decompose the Spec into sub-Specs by REQ group, or extract a Technical design document`,
		});
	}

	const suggestion = violations.length === 0 ? null : buildSuggestion(reqCount, thresholds.maxReq);
	return { ok: violations.length === 0, violations, suggestion, observed };
}

function countScopeAllowPaths(content) {
	const lines = content.split(/\r?\n/);
	let inScopeSection = false;
	let inAllowedSubsection = false;
	let count = 0;
	for (const line of lines) {
		if (/^##\s+Scope\s*$/.test(line)) { inScopeSection = true; inAllowedSubsection = false; continue; }
		if (!inScopeSection) continue;
		if (/^###\s/.test(line)) {
			inAllowedSubsection = /^###\s+Allowed paths/i.test(line);
			continue;
		}
		if (!inAllowedSubsection) continue;
		if (SCOPE_ALLOW_PATTERN.test(line)) count += 1;
	}
	return count;
}

function suggestSubSpecCount(reqCount, maxReq) {
	const minSubs = Math.max(2, Math.ceil(reqCount / Math.max(1, maxReq)));
	return Math.min(4, minSubs);
}

function buildSuggestion(reqCount, maxReq) {
	const subSpecCount = suggestSubSpecCount(reqCount, maxReq);
	const baseSize = Math.floor(reqCount / subSpecCount);
	const remainder = reqCount - baseSize * subSpecCount;
	const allocations = [];
	let cursor = 1;
	for (let index = 0; index < subSpecCount; index += 1) {
		const size = baseSize + (index < remainder ? 1 : 0);
		allocations.push({ index, reqStart: cursor, reqEnd: cursor + size - 1, reqCount: size });
		cursor += size;
	}
	return { subSpecCount, allocations };
}

/**
 * Build a structural patch object describing how to split the Spec.
 *
 * The caller writes the patches to disk; this function never touches the
 * filesystem. Each patch carries a `kind` (parent | subSpec) and a full
 * Markdown body so the writer is straightforward.
 *
 * @param {{ file: string, content: string, suggestion: DecompositionSuggestion, parentFeature?: string | null }} input
 * @returns {{ parent: { file: string, kind: 'parent', body: string }, subSpecs: Array<{ file: string, kind: 'subSpec', index: number, body: string }> }}
 */
export function buildDecompositionTemplate({ file, content, suggestion, parentFeature = null }) {
	if (typeof file !== "string" || file.length === 0) throw new Error("buildDecompositionTemplate: file is required");
	if (typeof content !== "string") throw new Error("buildDecompositionTemplate: content is required");
	if (suggestion === null || typeof suggestion !== "object") throw new Error("buildDecompositionTemplate: suggestion is required");

	const reqIds = (content.match(REQ_PATTERN) ?? []);
	const titles = collectH2Titles(content);
	const scopeLines = extractScopeSection(content);
	const verificationLines = extractVerificationSection(content);

	const baseName = file.replace(/\.md$/, "");
	const parentLines = [
		`# ${baseName} (parent Spec)`,
		``,
		`Status: proposed`,
		`Feature: ${parentFeature ?? "spec-governance"}`,
		``,
		`> Decomposition parent. See Sub-specs below.`,
		``,
		`## Problem`,
		``,
		extractSection(content, "Problem") ?? "(describe the problem this set of sub-Specs addresses)",
		``,
		`## Scope`,
		``,
		scopeLines.length > 0 ? scopeLines.join("\n") : "### Allowed paths\n\n- allow: (unchanged from original Spec)",
		``,
		`## Sub-specs`,
		``,
		...suggestion.allocations.map((allocation) => `- ${baseName}--sub-${allocation.index + 1}.md — REQ-${allocation.reqStart}..${allocation.reqEnd} (${allocation.reqCount} requirement${allocation.reqCount === 1 ? "" : "s"})`),
		``,
		`## Decision`,
		``,
		`This Spec is split into ${suggestion.subSpecCount} bounded sub-Specs. Each sub-Spec owns its own Scope, REQs, ACs, Verification, and Risks. The parent remains the authoritative reference for cross-cutting Concerns (architecture, contract evolution, integration sequencing).`,
		``,
		`## Alternatives considered`,
		``,
		extractSection(content, "Alternatives considered") ?? "(move alternatives from the original Spec; cite the source line range if you have it)",
		``,
		`## Verification`,
		``,
		verificationLines.length > 0 ? verificationLines.join("\n") : "(verification entry-point: this parent Spec has no ACs of its own; each sub-Spec carries its own)",
		``,
		`## Consequences`,
		``,
		`(Trade-offs and consequences of splitting. Pull from the original Spec's Risks section.)`,
	];

	const subSpecs = suggestion.allocations.map((allocation) => {
		const reqRange = `REQ-${allocation.reqStart}..${allocation.reqEnd}`;
		const subFile = `${baseName}--sub-${allocation.index + 1}.md`;
		const titleForIndex = titles[allocation.index] ?? titles.at(-1) ?? `Sub-spec ${allocation.index + 1}`;
		const bodyLines = [
			`# ${titleForIndex} (sub-Spec of ${baseName})`,
			``,
			`Status: proposed`,
			`Feature: ${parentFeature ?? "spec-governance"}`,
			`Parent: ${baseName}.md`,
			``,
			`> Sub-spec ${allocation.index + 1} of ${suggestion.subSpecCount}. Owns ${reqRange}.`,
			``,
			`## Problem`,
			``,
			`(Describe the problem this sub-Spec solves. Pull the slice from the original Spec's Problem section that pertains to ${reqRange}.)`,
			``,
			`## Scope`,
			``,
			`### Allowed paths`,
			``,
			`(Subset the parent's allow list to the paths this sub-Spec actually modifies. The parent keeps the union.)`,
			``,
			`## Proposal`,
			``,
			`(Pull the implementation paragraph(s) from the original Spec that pertain to ${reqRange}.)`,
			``,
			`## Acceptance criteria`,
			``,
			`(Pull the ACs for ${reqRange} from the original Spec.)`,
			``,
			`## Verification`,
			``,
			`(Each sub-Spec keeps its own verification entry-point and minimum evidence level.)`,
			``,
			`## Alternatives considered`,
			``,
			`(Sub-spec-specific alternatives, or 'Same as parent; see ' + parent + '.md'.)`,
			``,
			`## Risks`,
			``,
			`(Sub-spec-specific risks, or 'Same as parent; see ' + parent + '.md'.)`,
		];
		return { file: subFile, kind: "subSpec", index: allocation.index, body: bodyLines.join("\n") + "\n" };
	});

	return {
		parent: { file: baseName + ".md", kind: "parent", body: parentLines.join("\n") + "\n", range: reqIds.length > 0 ? `${reqIds[0]}..${reqIds.at(-1)}` : "(no REQ ids)" },
		subSpecs,
	};
}

function collectH2Titles(content) {
	const titles = [];
	for (const line of content.split(/\r?\n/)) {
		const match = /^##\s+(?!#)(.+?)\s*$/.exec(line);
		if (match) titles.push(match[1].trim());
	}
	return titles;
}

function extractSection(content, name) {
	const lines = content.split(/\r?\n/);
	let capturing = false;
	const captured = [];
	const heading = new RegExp(`^##\\s+${escapeRegex(name)}\\s*$`);
	for (const line of lines) {
		if (heading.test(line)) { capturing = true; continue; }
		if (capturing && /^##\s+/.test(line)) break;
		if (capturing) captured.push(line);
	}
	return captured.length === 0 ? null : captured.join("\n").trim();
}

function extractScopeSection(content) {
	const lines = content.split(/\r?\n/);
	let capturing = false;
	const captured = [];
	for (const line of lines) {
		if (/^##\s+Scope\s*$/.test(line)) { capturing = true; captured.push(line); continue; }
		if (capturing && /^##\s+/.test(line)) break;
		if (capturing) captured.push(line);
	}
	return captured;
}

function extractVerificationSection(content) {
	const lines = content.split(/\r?\n/);
	let capturing = false;
	const captured = [];
	for (const line of lines) {
		if (/^##\s+Verification\s*$/.test(line)) { capturing = true; captured.push(line); continue; }
		if (capturing && /^##\s+/.test(line)) break;
		if (capturing) captured.push(line);
	}
	return captured;
}

function escapeRegex(value) {
	return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}
