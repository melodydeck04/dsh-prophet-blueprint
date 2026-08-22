/**
 * Human-owned feature catalog parsing, hierarchy, and document satisfaction.
 *
 * @module @dsh-plugins/design-blueprint/features
 */
import { createHash } from "node:crypto";
import { normalizeRelativePath } from "./path-utils.js";

export const FEATURE_STATUSES = new Set(["planned", "active", "deprecated"]);
export const FEATURE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const ARCHITECTURE_RELATION_PATTERN = /^[a-z0-9](?:[a-z0-9._/-]{0,62}[a-z0-9])?$/;

function issue(file, check, message, fix, severity = "required") {
	return { file, check, severity, message, fix };
}

function sectionsOf(lines) {
	const sections = new Map();
	let current = null;
	for (const line of lines) {
		const heading = line.match(/^##\s+(.+?)\s*$/);
		if (heading) {
			current = heading[1];
			if (!sections.has(current)) sections.set(current, []);
		} else if (current !== null) {
			sections.get(current).push(line);
		}
	}
	return sections;
}

function sectionText(sections, name) {
	return (sections.get(name) ?? []).join("\n").trim();
}

function bulletValues(lines) {
	return (lines ?? []).flatMap((line) => {
		const match = line.match(/^\s*-\s+(.+?)\s*$/);
		if (!match) return [];
		const value = match[1].trim();
		return [value.startsWith("`") && value.endsWith("`") ? value.slice(1, -1) : value];
	});
}

function metadata(lines, key) {
	const match = lines.find((line) => line.startsWith(`${key}:`))?.match(new RegExp(`^${key}:\\s*(.*?)\\s*$`));
	return match?.[1] ?? "";
}

function normalizedList(values, file, field, issues) {
	const output = [];
	for (const value of values) {
		try {
			output.push(normalizeRelativePath(value));
		} catch (error) {
			issues.push(issue(file, "feature-path", `${field} contains invalid path '${value}': ${error.message}`, "Use project-relative paths only"));
		}
	}
	return output;
}

export function hashFeatureContent(content) {
	return createHash("sha256").update(content).digest("hex");
}

/** Parse one feature Markdown file without consulting other features. */
export function parseFeature(file, content) {
	const lines = content.replace(/\r\n/g, "\n").split("\n");
	const issues = [];
	const titleMatch = lines.find((line) => line.trim().length > 0)?.match(/^# Feature:\s+(.+?)\s*$/);
	const id = metadata(lines, "Id");
	const status = metadata(lines, "Status");
	const parentValue = metadata(lines, "Parent");
	const parentId = parentValue === "" || parentValue === "none" ? null : parentValue;
	if (!titleMatch) issues.push(issue(file, "feature-format", "first content line must be '# Feature: <title>'", "Add a feature title"));
	if (!FEATURE_ID_PATTERN.test(id)) issues.push(issue(file, "feature-id", `invalid feature Id '${id}'`, "Use 1-64 lowercase letters, numbers, and hyphens"));
	if (!FEATURE_STATUSES.has(status)) issues.push(issue(file, "feature-status", `invalid feature Status '${status}'`, "Use planned, active, or deprecated"));
	if (parentId !== null && !FEATURE_ID_PATTERN.test(parentId)) issues.push(issue(file, "feature-parent", `invalid Parent '${parentId}'`, "Use another feature Id or none"));
	const sections = sectionsOf(lines);
	const summary = sectionText(sections, "Summary");
	const scope = normalizedList(bulletValues(sections.get("Scope")), file, "Scope", issues);
	const acceptance = bulletValues(sections.get("Acceptance"));
	const notes = sectionText(sections, "Notes");
	const documents = [];
	for (const line of sections.get("Documents") ?? []) {
		const match = line.match(/^\s*-\s+(required|recommended):\s+(.+?)\s*$/i);
		if (!match) continue;
		const raw = match[2].trim();
		const value = raw.startsWith("`") && raw.endsWith("`") ? raw.slice(1, -1) : raw;
		try {
			documents.push({ level: match[1].toLowerCase(), path: normalizeRelativePath(value) });
		} catch (error) {
			issues.push(issue(file, "feature-document", `invalid document path '${value}': ${error.message}`, "Use a project-relative document path"));
		}
	}
	if (summary.length === 0) issues.push(issue(file, "feature-summary", "Summary is empty", "Describe the user-visible responsibility of this feature"));
	if (scope.length === 0) issues.push(issue(file, "feature-scope", "Scope has no file or directory entry", "Add at least one project-relative Scope item"));
	if (documents.filter((entry) => entry.level === "required").length === 0) {
		issues.push(issue(file, "feature-documents", "no required document is declared", "Declare at least one '- required: path' entry"));
	}
	const components = bulletValues(sections.get("Components"));
	const componentsList = [];
	for (const value of components) {
		if (!ARCHITECTURE_RELATION_PATTERN.test(value)) {
			issues.push(issue(file, "feature-component", `invalid component reference '${value}'`, "Use the canonical ASCII component id"));
			continue;
		}
		componentsList.push(value);
	}
	return {
		feature: {
			file,
			id,
			title: titleMatch?.[1] ?? (id || "Untitled feature"),
			status,
			parentId,
			summary,
			scope,
			documents,
			acceptance,
			notes,
			components: componentsList,
			hash: hashFeatureContent(content),
		},
		issues,
	};
}

function cleanText(value, field) {
	if (typeof value !== "string") throw new Error(`${field} must be text`);
	return value.replace(/\r\n/g, "\n").trim();
}

function cleanLines(value, field, pathValues = false) {
	if (!Array.isArray(value)) throw new Error(`${field} must be a list`);
	return value.map((entry) => {
		const text = cleanText(entry, field);
		if (text.length === 0) throw new Error(`${field} cannot contain an empty item`);
		return pathValues ? normalizeRelativePath(text) : text;
	});
}

/** Validate browser input and return the canonical Markdown representation. */
export function serializeFeature(input) {
	if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error("feature must be an object");
	const id = cleanText(input.id, "id");
	if (!FEATURE_ID_PATTERN.test(id)) throw new Error("id must use 1-64 lowercase letters, numbers, and hyphens");
	const title = cleanText(input.title, "title");
	if (title.length === 0 || title.length > 120 || title.includes("\n")) throw new Error("title must be 1-120 characters on one line");
	const status = cleanText(input.status, "status");
	if (!FEATURE_STATUSES.has(status)) throw new Error("status must be planned, active, or deprecated");
	const parentId = input.parentId === null || input.parentId === undefined || input.parentId === "" ? null : cleanText(input.parentId, "parentId");
	if (parentId !== null && !FEATURE_ID_PATTERN.test(parentId)) throw new Error("parentId must be another feature id or empty");
	if (parentId === id) throw new Error("a feature cannot be its own parent");
	const summary = cleanText(input.summary, "summary");
	if (summary.length === 0 || summary.length > 4_000) throw new Error("summary must contain 1-4,000 characters");
	const scope = cleanLines(input.scope, "scope", true);
	if (scope.length === 0 || scope.length > 100) throw new Error("scope must contain 1-100 project-relative entries");
	if (!Array.isArray(input.documents) || input.documents.length === 0 || input.documents.length > 100) throw new Error("documents must contain 1-100 entries");
	const documents = input.documents.map((entry) => {
		if (entry === null || typeof entry !== "object") throw new Error("each document must be an object");
		if (entry.level !== "required" && entry.level !== "recommended") throw new Error("document level must be required or recommended");
		return { level: entry.level, path: normalizeRelativePath(cleanText(entry.path, "document path")) };
	});
	if (!documents.some((entry) => entry.level === "required")) throw new Error("at least one required document must be declared");
	const acceptance = cleanLines(input.acceptance ?? [], "acceptance");
	const notes = cleanText(input.notes ?? "", "notes");
	if (notes.length > 8_000) throw new Error("notes must contain at most 8,000 characters");
	const bullets = (values) => values.map((value) => `- \`${value}\``).join("\n");
	const components = Array.isArray(input.components) ? input.components : [];
	const normalizedComponents = components.map((entry) => {
		const text = cleanText(entry, "components");
		if (!ARCHITECTURE_RELATION_PATTERN.test(text)) throw new Error("components must reference canonical ASCII component ids");
		return text;
	});
	const componentsSection = normalizedComponents.length > 0
		? `\n\n## Components\n\n${normalizedComponents.map((value) => `- \`${value}\``).join("\n")}`
		: "";
	return `# Feature: ${title}\n\nId: ${id}\nParent: ${parentId ?? "none"}\nStatus: ${status}\n\n## Summary\n\n${summary}\n\n## Scope\n\n${bullets(scope)}\n\n## Documents\n\n${documents.map((entry) => `- ${entry.level}: \`${entry.path}\``).join("\n")}\n\n## Acceptance\n\n${acceptance.length > 0 ? acceptance.map((value) => `- ${value}`).join("\n") : "No additional acceptance notes."}\n\n## Notes\n\n${notes || "No additional notes."}${componentsSection}\n`;
}

function findCycles(features, issues) {
	const byId = new Map(features.map((feature) => [feature.id, feature]));
	for (const feature of features) {
		if (feature.parentId !== null && !byId.has(feature.parentId)) {
			issues.push(issue(feature.file, "feature-parent", `Parent '${feature.parentId}' does not exist`, "Choose an existing feature or none"));
			continue;
		}
		const seen = new Set([feature.id]);
		let current = feature;
		while (current.parentId !== null) {
			if (seen.has(current.parentId)) {
				issues.push(issue(feature.file, "feature-cycle", "feature hierarchy contains a cycle", "Remove one Parent relationship from the cycle"));
				break;
			}
			seen.add(current.parentId);
			current = byId.get(current.parentId);
			if (!current) break;
		}
	}
}

/** Load, validate, and enrich the configured feature catalog from one snapshot. */
export async function loadFeatureCatalog(snapshot, config) {
	const root = config.features?.root ?? ".blueprint/features";
	const prefix = root + "/";
	const files = snapshot.files.filter((file) => file.startsWith(prefix) && file.endsWith(".md"));
	const features = [];
	const issues = [];
	const ids = new Set();
	for (const file of files) {
		const content = await snapshot.readText(file);
		if (content === null) continue;
		const parsed = parseFeature(file, content);
		features.push(parsed.feature);
		issues.push(...parsed.issues);
		const expectedId = file.slice(prefix.length, -3);
		if (expectedId.includes("/")) issues.push(issue(file, "feature-location", "feature files must be directly inside the feature root", `Move the file to ${root}/${parsed.feature.id}.md`));
		if (parsed.feature.id !== expectedId) issues.push(issue(file, "feature-id", `Id '${parsed.feature.id}' does not match filename '${expectedId}.md'`, "Rename the file or update Id"));
		if (ids.has(parsed.feature.id)) issues.push(issue(file, "feature-id", `duplicate feature Id '${parsed.feature.id}'`, "Use a unique Id"));
		ids.add(parsed.feature.id);
	}
	findCycles(features, issues);
	for (const feature of features) {
		feature.documents = feature.documents.map((document) => ({ ...document, exists: snapshot.exists(document.path) }));
		const checks = [feature.summary.length > 0, feature.scope.length > 0, ...feature.documents.filter((entry) => entry.level === "required").map((entry) => entry.exists)];
		feature.satisfaction = checks.length === 0 ? 0 : Math.round((checks.filter(Boolean).length / checks.length) * 100);
	}
	features.sort((left, right) => left.title.localeCompare(right.title));
	return {
		root,
		features,
		issues,
		summary: {
			total: features.length,
			complete: features.filter((feature) => feature.satisfaction === 100).length,
			requiredDocuments: features.reduce((count, feature) => count + feature.documents.filter((entry) => entry.level === "required").length, 0),
			missingRequiredDocuments: features.reduce((count, feature) => count + feature.documents.filter((entry) => entry.level === "required" && !entry.exists).length, 0),
		},
	};
}

/** A friendly initial record for the Web create flow. */
export function newFeatureInput(id) {
	return {
		id,
		title: id.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "),
		status: "planned",
		parentId: null,
		summary: "Describe what this feature is responsible for.",
		scope: ["src/**"],
		documents: [{ level: "required", path: "README.md" }],
		acceptance: [],
		notes: "",
		components: [],
	};
}
