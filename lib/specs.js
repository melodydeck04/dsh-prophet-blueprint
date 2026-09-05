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
export const DELIVERY_SURFACES = Object.freeze(["repository", "cli", "api", "service-background", "data-persistence", "web-ui", "external-integration"]);
export const OBSERVATION_MOMENTS = Object.freeze(["static", "terminal", "progressive", "persistent"]);
export const EVIDENCE_LEVELS = Object.freeze(["static-unit", "contract-integration", "live-runtime", "user-visible", "completion-hygiene"]);
const STRUCTURAL_TRIGGERS = Object.freeze({
	"module-ownership": /module ownership|responsibilit(?:y|ies)|component|模块归属|职责边界|组件/i,
	"public-contract": /public contract|api|interface|契约|接口/i,
	persistence: /persistence|database|schema|storage|持久化|数据库|数据结构|存储/i,
	deployment: /deployment|rollout|runtime profile|部署|发布/i,
	permissions: /permission|authorization|security|权限|授权|安全/i,
	migration: /migration|compatibility|breaking change|迁移|兼容|破坏性变更/i,
	concurrency: /concurrency|queue|stream|asynchronous|并发|队列|流式|异步/i,
});

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

function stableEntries(lines, prefix) {
	const entries = new Map();
	const pattern = new RegExp(`^\\s*-\\s+(${prefix}-[A-Za-z0-9-]+):\\s+(.+?)\\s*$`);
	for (const line of lines ?? []) {
		const match = line.match(pattern);
		if (match) entries.set(match[1], match[2]);
	}
	return entries;
}

function allSectionLines(sections) {
	return [...sections.values()].flat();
}

function firstSectionText(sections, names) {
	for (const name of names) {
		const value = (sections.get(name) ?? []).map((line) => line.trim()).filter(Boolean).join("\n");
		if (value) return value;
	}
	return null;
}

function taggedSectionValues(sections, names, labels) {
	const lines = names.flatMap((name) => sections.get(name) ?? []);
	return lines.flatMap((line) => {
		const trimmed = line.replace(/^\s*-\s*/, "").trim();
		const label = labels.find((entry) => trimmed.toLowerCase().startsWith(entry.toLowerCase()));
		return label ? [trimmed.slice(label.length).replace(/^\s*[:：]\s*/, "").trim()] : [];
	}).filter(Boolean);
}

function verificationMetadata(value) {
	const match = String(value ?? "").match(/\[\s*surface\s*=\s*([a-z-]+)\s*;\s*moment\s*=\s*([a-z-]+)\s*;\s*evidence\s*=\s*([a-z-]+)\s*\]/i);
	if (!match) return null;
	const [, surface, moment, evidence] = match.map((entry) => entry?.toLowerCase());
	if (!DELIVERY_SURFACES.includes(surface) || !OBSERVATION_MOMENTS.includes(moment) || !EVIDENCE_LEVELS.includes(evidence)) return null;
	return { surface, moment, minimumEvidence: evidence, declared: true };
}

function inferVerificationMetadata(acceptance, verification) {
	const text = `${acceptance} ${verification}`.toLowerCase();
	let surface = "repository";
	if (/web ui|browser|dom|client|页面|浏览器|用户可见/.test(text)) surface = "web-ui";
	else if (/external|third[- ]party|外部集成|第三方/.test(text)) surface = "external-integration";
	else if (/service|background|worker|job|后台|服务/.test(text)) surface = "service-background";
	else if (/persistence|database|schema|data|持久化|数据库|数据/.test(text)) surface = "data-persistence";
	else if (/\bapi\b|http|sse|endpoint|接口/.test(text)) surface = "api";
	else if (/\bcli\b|command|shell|命令/.test(text)) surface = "cli";
	let moment = "terminal";
	if (/progressive|stream|incremental|intermediate|before (?:the )?terminal|渐进|流式|增量|中间可见|终态之前/.test(text)) moment = "progressive";
	else if (/persistent|restart|durable|migration|持久|重启|迁移/.test(text)) moment = "persistent";
	else if (/static|source|schema|scope|document|静态|源码|文档/.test(text)) moment = "static";
	let minimumEvidence = "contract-integration";
	if (/completion hygiene|secret-like|temporary\/debug|完成卫生|疑似 secret|临时.*调试/.test(text)) minimumEvidence = "completion-hygiene";
	else if (surface === "web-ui") minimumEvidence = "user-visible";
	else if (["service-background", "data-persistence", "external-integration"].includes(surface) || moment === "progressive" || moment === "persistent") minimumEvidence = "live-runtime";
	else if (surface === "repository" && moment === "static") minimumEvidence = "static-unit";
	return { surface, moment, minimumEvidence, declared: false };
}

function requirementReferences(value) {
	return [...new Set(String(value ?? "").match(/REQ-[A-Za-z0-9-]+/g) ?? [])];
}

function buildVerificationTargets(file, acceptance, verification) {
	return [...acceptance.entries()].map(([id, oracle]) => {
		const procedure = verification.get(id) ?? "";
		const metadata = verificationMetadata(procedure) ?? inferVerificationMetadata(oracle, procedure);
		return {
			id,
			requirementIds: [...new Set([...requirementReferences(oracle), ...requirementReferences(procedure)])],
			...metadata,
			entryPoint: null,
			trigger: null,
			oracle,
			procedure,
		};
	});
}

/** Build the schema-validated package shared by refinement, verification, and Web projection. */
export function buildChangePackage({ file, featureId, title, status, scope, acceptance, verification, sections, contentHash }) {
	const lines = allSectionLines(sections);
	const requirements = stableEntries(lines, "REQ");
	const tasks = stableEntries(lines, "TASK");
	const scenarios = lines.filter((line) => /\bGiven\b.+\bWhen\b.+\bThen\b|给定.+当.+那么/.test(line)).map((line) => line.replace(/^\s*-\s*/, "").trim());
	const text = lines.join("\n");
	const structuralRisk = Object.entries(STRUCTURAL_TRIGGERS).filter(([, pattern]) => pattern.test(text)).map(([id]) => id);
	const verificationTargets = buildVerificationTargets(file, acceptance, verification);
	const acIds = [...acceptance.keys()];
	const requirementIds = [...requirements.keys()];
	return {
		version: 1,
		identity: { changeId: file.replace(/^.*\//, "").replace(/\.md$/, ""), originalRequest: firstSectionText(sections, ["Original request", "原始需求"]), owningFeature: featureId, affectedFeatures: [] },
		intent: {
			requirements: [...requirements].map(([id, value]) => ({ id, value })),
			scenarios,
			assumptions: taggedSectionValues(sections, ["Assumptions and non-goals", "假设与非目标"], ["Assumption", "假设"]),
			decisions: taggedSectionValues(sections, ["Impact and design", "影响与设计"], ["Decision", "决策"]),
			nonGoals: taggedSectionValues(sections, ["Assumptions and non-goals", "假设与非目标"], ["Non-goal", "非目标"]),
		},
		impact: { paths: [...scope.allow], deniedPaths: [...scope.deny], components: [], contracts: [], data: [], dependencies: [], structuralRisk },
		design: { required: structuralRisk.length > 0, present: sections.has("Technical design") || sections.has("Architecture boundaries and canonical change package"), companionDocument: null },
		execution: { tasks: [...tasks].map(([id, value]) => ({ id, value, requirementIds: requirementReferences(value) })), scope },
		verification: { targets: verificationTargets, evidenceLevels: EVIDENCE_LEVELS },
		lifecycle: { status, specHash: contentHash, approval: null, snapshot: null, publicState: status === "implemented" ? "completed" : status === "rejected" ? "blocked" : "refining", reasonCode: null, nextAction: null },
		truthDelta: { featureId, acceptance: acIds.map((id) => ({ id, value: acceptance.get(id) })) },
		traceability: {
			requirementIds,
			acceptanceIds: acIds,
			rows: acIds.map((id) => ({ acceptanceId: id, requirementIds: verificationTargets.find((entry) => entry.id === id)?.requirementIds ?? [] })),
		},
		title,
	};
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
	const changePackage = buildChangePackage({ file: normalized, featureId, title: title.replace(/^# Spec:\s*/, ""), status, scope, acceptance, verification, sections, contentHash });
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
			changePackage,
			changePackage,
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
			parsed.spec.changePackage.lifecycle.specHash = parsed.spec.reviewHash;
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
