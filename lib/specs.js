//#region lib/types/specs.js
/**
 * Parser and validator for lifecycle-managed Markdown specifications.
 *
 * @module @dsh-plugins/design-blueprint/specs
 */
import { normalizeRelativePath } from "./path-utils.js";
import { createHash } from "node:crypto";

const LIFECYCLES = new Set(["proposed", "implemented", "rejected"]);
const FEATURE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const REQUIRED_SECTIONS = {
	proposed: ["Problem", "Scope", "Proposal", "Alternatives considered", "Acceptance criteria", "Verification", "Risks"],
	implemented: ["Problem", "Scope", "Decision", "Alternatives considered", "Verification", "Consequences"],
	rejected: ["Problem", "Proposal", "Alternatives considered"],
};

function specIssue(file, check, message, fix, severity = "required") {
	return { file, check, severity, message, fix };
}

function sectionMap(lines) {
	const sections = new Map();
	let current = null;
	for (const line of lines) {
		const match = line.match(/^##\s+(.+?)\s*$/);
		if (match) {
			current = match[1];
			if (!sections.has(current)) sections.set(current, []);
			continue;
		}
		if (current !== null) sections.get(current).push(line);
	}
	return sections;
}

function nonEmpty(lines) {
	return (lines ?? []).some((line) => line.trim().length > 0);
}

function stripCode(value) {
	const trimmed = value.trim();
	return trimmed.startsWith("`") && trimmed.endsWith("`") ? trimmed.slice(1, -1) : trimmed;
}

function parseScope(file, lines, issues) {
	const allow = [];
	const deny = [];
	for (const line of lines ?? []) {
		const match = line.match(/^\s*-\s+(allow|deny):\s+(.+?)\s*$/i);
		if (!match) continue;
		try {
			const pattern = normalizeRelativePath(stripCode(match[2]));
			(match[1].toLowerCase() === "allow" ? allow : deny).push(pattern);
		} catch (error) {
			issues.push(specIssue(file, "spec-scope", `invalid scope pattern '${match[2]}': ${error.message}`, "Use '- allow: relative/glob/**' or '- deny: relative/glob/**'"));
		}
	}
	if (allow.length === 0) {
		issues.push(specIssue(file, "spec-scope", "Scope has no machine-readable allow entry", "Add at least one '- allow: path/**' entry"));
	}
	return { allow, deny };
}

function parseIdEntries(lines) {
	const entries = new Map();
	for (const line of lines ?? []) {
		const match = line.match(/^\s*-\s+(AC-[A-Za-z0-9-]+):\s+(.+?)\s*$/);
		if (match) entries.set(match[1], match[2]);
	}
	return entries;
}

/** Parse and validate one specification document. */
export function parseSpec(file, text, specsRoot) {
	const issues = [];
	const normalized = normalizeRelativePath(file);
	const relative = normalized.slice(specsRoot.length + 1);
	const lifecycle = relative.split("/")[0];
	if (!LIFECYCLES.has(lifecycle)) {
		issues.push(specIssue(file, "spec-lifecycle", `spec is outside a recognized lifecycle directory: ${lifecycle}`, `Move it under ${specsRoot}/{proposed|implemented|rejected}/`));
	}
	const lines = text.split(/\r?\n/);
	const title = lines.find((line) => line.trim().length > 0) ?? "";
	if (!/^# Spec:\s+\S/.test(title)) {
		issues.push(specIssue(file, "spec-format", "first content line must be '# Spec: <title>'", "Add the canonical specification title"));
	}
	const statusLine = lines.find((line) => /^Status:/.test(line)) ?? "";
	const statusMatch = statusLine.match(/^Status:\s*(proposed|implemented|rejected)(?:\s+—\s+(.+))?\s*$/);
	const status = statusMatch?.[1] ?? null;
	if (status === null) {
		issues.push(specIssue(file, "spec-format", "missing or invalid Status line", "Use 'Status: proposed', 'Status: implemented', or 'Status: rejected — <reason>'"));
	} else if (status !== lifecycle) {
		issues.push(specIssue(file, "spec-lifecycle", `Status '${status}' does not match directory '${lifecycle}'`, "Move the file or update its Status in the same change"));
	}
	if (status === "rejected" && !statusMatch?.[2]) {
		issues.push(specIssue(file, "spec-format", "a rejected spec must record its rejection reason on the Status line", "Use 'Status: rejected — <reason>'"));
	}
	const featureLine = lines.find((line) => /^Feature:/.test(line)) ?? "";
	const featureMatch = featureLine.match(/^Feature:\s*([a-z0-9-]+)\s*$/);
	const featureId = featureMatch?.[1] ?? null;
	if (featureLine !== "" && (featureId === null || !FEATURE_ID_PATTERN.test(featureId))) {
		issues.push(specIssue(file, "spec-feature", "invalid Feature metadata", "Use 'Feature: <feature-id>' with the catalog's lowercase feature id"));
	}
	const sections = sectionMap(lines);
	for (const heading of REQUIRED_SECTIONS[status ?? lifecycle] ?? []) {
		if (!sections.has(heading) || !nonEmpty(sections.get(heading))) {
			issues.push(specIssue(file, "spec-sections", `missing or empty section '## ${heading}'`, `Add a non-empty '## ${heading}' section`));
		}
	}
	const scope = status === "rejected" ? { allow: [], deny: [] } : parseScope(file, sections.get("Scope"), issues);
	const acceptance = parseIdEntries(sections.get("Acceptance criteria"));
	const verification = parseIdEntries(sections.get("Verification"));
	if (status === "proposed") {
		if (acceptance.size === 0) {
			issues.push(specIssue(file, "spec-acceptance", "Acceptance criteria has no stable AC-* entries", "Add entries such as '- AC-1: observable outcome'"));
		}
		for (const id of acceptance.keys()) {
			if (!verification.has(id)) {
				issues.push(specIssue(file, "spec-verification", `${id} has no verification declaration`, `Add '- ${id}: test: path/to/test' under ## Verification`));
			}
		}
	}
	if (status === "implemented" && !nonEmpty(sections.get("Verification"))) {
		issues.push(specIssue(file, "spec-verification", "implemented spec has no shipped verification evidence", "Record the tests or commands that pin the decision"));
	}
	const contentHash = createHash("sha256").update(text).digest("hex");
	return {
		spec: {
			file: normalized,
			lifecycle,
			status,
			featureId,
			title: title.replace(/^# Spec:\s*/, ""),
			scope,
			acceptance,
			verification,
			content: text,
			contentHash,
			reviewHash: contentHash,
			prepared: text.includes("<!-- BLUEPRINT_PREPARED_SKELETON -->"),
			languages: {
				en: { file: normalized, content: text },
				zh: null,
			},
		},
		issues,
	};
}

/** Load every lifecycle-managed spec from a snapshot. */
export async function loadSpecs(snapshot, config) {
	const root = config.authority.specsRoot;
	const prefix = root + "/";
	const files = snapshot.files.filter((file) => file.startsWith(prefix) && file.endsWith(".md") && !file.endsWith(".zh.md") && !file.endsWith("/README.md"));
	const specs = [];
	const issues = [];
	for (const file of files) {
		const text = await snapshot.readText(file);
		if (text === null) continue;
		const parsed = parseSpec(file, text, root);
		const zhFile = file.replace(/\.md$/, ".zh.md");
		const zhContent = await snapshot.readText(zhFile);
		if (zhContent !== null) {
			parsed.spec.languages.zh = { file: zhFile, content: zhContent };
			parsed.spec.reviewHash = createHash("sha256").update(text).update("\0").update(zhContent).digest("hex");
			parsed.spec.prepared = parsed.spec.prepared || zhContent.includes("<!-- BLUEPRINT_PREPARED_SKELETON -->");
		}
		specs.push(parsed.spec);
		issues.push(...parsed.issues);
	}
	if (files.length === 0) {
		issues.push(specIssue(root, "spec-lifecycle", "no lifecycle-managed specifications were found", `Add a spec under ${root}/proposed/ before a non-trivial implementation`));
	}
	return { specs, issues };
}
//#endregion
