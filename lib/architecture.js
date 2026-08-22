/**
 * Developer-owned architecture component catalog: stable identity, typed edges,
 * deployment units, source ownership, contracts, supported Features, and
 * document requirements. Validates references, relation types, Feature mappings,
 * deployment identifiers, owned paths, acyclic containment, and reports every
 * inconsistency through one issue channel.
 *
 * @module @dsh-plugins/design-blueprint/architecture
 */
import { createHash } from "node:crypto";
import { normalizeRelativePath } from "./path-utils.js";

export const COMPONENT_STATUSES = new Set(["planned", "active", "deprecated"]);
export const COMPONENT_KINDS = new Set(["service", "library", "plugin", "internal", "frontend", "data", "infra"]);
export const COMPONENT_RELATION_TYPES = new Set(["depends_on", "calls", "publishes", "consumes", "exposes", "extends"]);
export const COMPONENT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const DEPLOYMENT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
export const CONTRACT_ID_PATTERN = /^\/?[a-z0-9](?:[a-z0-9._/-]{0,62}[a-z0-9])?$/;

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

function normalizedPathList(values, file, field, issues) {
	const output = [];
	for (const value of values) {
		try {
			output.push(normalizeRelativePath(value));
		} catch (error) {
			issues.push(issue(file, "component-path", `${field} contains invalid path '${value}': ${error.message}`, "Use project-relative paths or globs only"));
		}
	}
	return output;
}

function normalizedIdList(values, file, field, issues, pattern) {
	const output = [];
	for (const value of values) {
		const trimmed = value.trim();
		if (!pattern.test(trimmed)) {
			issues.push(issue(file, "component-id", `${field} contains invalid identifier '${value}'`, "Use the canonical ASCII identifier"));
			continue;
		}
		output.push(trimmed);
	}
	return output;
}

export function hashComponentContent(content) {
	return createHash("sha256").update(content).digest("hex");
}

/** Parse one component Markdown file without consulting other components. */
export function parseComponent(file, content) {
	const lines = content.replace(/\r\n/g, "\n").split("\n");
	const issues = [];
	const titleMatch = lines.find((line) => line.trim().length > 0)?.match(/^# Component:\s+(.+?)\s*$/);
	const id = metadata(lines, "Id");
	const kind = metadata(lines, "Kind").toLowerCase();
	const container = metadata(lines, "Container");
	const deployment = metadata(lines, "Deployment");
	const status = metadata(lines, "Status").toLowerCase();
	const containerId = container === "" || container === "none" ? null : container;

	if (!titleMatch) issues.push(issue(file, "component-format", "first content line must be '# Component: <title>'", "Add a component title"));
	if (!COMPONENT_ID_PATTERN.test(id)) issues.push(issue(file, "component-id", `invalid component Id '${id}'`, "Use 1-64 lowercase letters, numbers, and hyphens"));
	if (!COMPONENT_KINDS.has(kind)) issues.push(issue(file, "component-kind", `invalid component Kind '${kind}'`, "Use service, library, plugin, internal, frontend, data, or infra"));
	if (containerId !== null && !COMPONENT_ID_PATTERN.test(containerId)) issues.push(issue(file, "component-container", `invalid Container '${containerId}'`, "Use another component Id or none"));
	if (deployment !== "" && !DEPLOYMENT_ID_PATTERN.test(deployment)) issues.push(issue(file, "component-deployment", `invalid Deployment identifier '${deployment}'`, "Use 1-64 lowercase letters, numbers, periods, underscores, and hyphens"));
	if (!COMPONENT_STATUSES.has(status)) issues.push(issue(file, "component-status", `invalid component Status '${status}'`, "Use planned, active, or deprecated"));
	if (containerId !== null && containerId === id) issues.push(issue(file, "component-container", "a component cannot contain itself", "Use a different Container or none"));

	const sections = sectionsOf(lines);
	const summary = sectionText(sections, "Summary");
	const ownedPaths = normalizedPathList(bulletValues(sections.get("Owned paths")), file, "Owned paths", issues);
	const contracts = normalizedIdList(bulletValues(sections.get("Provided contracts")), file, "Provided contracts", issues, CONTRACT_ID_PATTERN);
	const dependencies = [];
	for (const line of sections.get("Dependencies") ?? []) {
		const match = line.match(/^\s*-\s+([a-z_]+):\s+(.+?)\s*$/);
		if (!match) continue;
		const relation = match[1].toLowerCase();
		const target = match[2].trim().replace(/^`|`$/g, "");
		if (!COMPONENT_RELATION_TYPES.has(relation)) {
			issues.push(issue(file, "component-relation", `unsupported relation type '${relation}'`, `Use one of: ${[...COMPONENT_RELATION_TYPES].join(", ")}`));
			continue;
		}
		if (!COMPONENT_ID_PATTERN.test(target)) {
			issues.push(issue(file, "component-relation", `relation target '${target}' is not a valid component id`, "Reference another component id"));
			continue;
		}
		dependencies.push({ relation, target });
	}
	const supportedFeatures = normalizedIdList(bulletValues(sections.get("Supported features")), file, "Supported features", issues, /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/);
	const documents = [];
	for (const line of sections.get("Documents") ?? []) {
		const match = line.match(/^\s*-\s+(required|recommended):\s+(.+?)\s*$/i);
		if (!match) continue;
		const raw = match[2].trim();
		const value = raw.startsWith("`") && raw.endsWith("`" ) ? raw.slice(1, -1) : raw;
		try {
			documents.push({ level: match[1].toLowerCase(), path: normalizeRelativePath(value) });
		} catch (error) {
			issues.push(issue(file, "component-document", `invalid document path '${value}': ${error.message}`, "Use a project-relative document path"));
		}
	}

	if (summary.length === 0) issues.push(issue(file, "component-summary", "Summary is empty", "Describe the user-visible responsibility of this component"));
	if (ownedPaths.length === 0) issues.push(issue(file, "component-owned-paths", "Owned paths is empty", "Declare at least one project-relative path or glob"));
	if (documents.filter((entry) => entry.level === "required").length === 0) {
		issues.push(issue(file, "component-documents", "no required document is declared", "Declare at least one '- required: path' entry"));
	}

	return {
		component: {
			file,
			id,
			title: titleMatch?.[1] ?? (id || "Untitled component"),
			kind,
			containerId,
			deployment: deployment === "" ? null : deployment,
			status,
			summary,
			ownedPaths,
			contracts,
			dependencies,
			supportedFeatures,
			documents,
			hash: hashComponentContent(content),
		},
		issues,
	};
}

function detectContainerCycles(components, issues) {
	const byId = new Map(components.map((component) => [component.id, component]));
	for (const component of components) {
		if (component.containerId === null) continue;
		if (!byId.has(component.containerId)) {
			issues.push(issue(component.file, "component-container", `Container '${component.containerId}' does not exist`, "Choose an existing component or none"));
			continue;
		}
		if (component.containerId === component.id) continue;
		const seen = new Set([component.id]);
		let cursor = component;
		while (cursor.containerId !== null) {
			if (seen.has(cursor.containerId)) {
				issues.push(issue(component.file, "component-cycle", "component containment contains a cycle", "Remove one Container relationship from the cycle"));
				break;
			}
			seen.add(cursor.containerId);
			cursor = byId.get(cursor.containerId);
			if (!cursor) break;
		}
	}
}

function detectAmbiguousOwnedPaths(components, issues) {
	const owners = new Map();
	for (const component of components) {
		for (const pattern of component.ownedPaths) {
			const list = owners.get(pattern) ?? [];
			list.push(component.id);
			owners.set(pattern, list);
		}
	}
	for (const [pattern, ids] of owners) {
		if (ids.length <= 1) continue;
		const sorted = [...ids].sort();
		const file = components.find((component) => component.ownedPaths.includes(pattern))?.file ?? "(unknown)";
		issues.push(issue(file, "component-path-ambiguity", `owned path '${pattern}' is claimed by multiple components: ${sorted.join(", ")}`, "Narrow owned paths so each pattern has exactly one component"));
	}
}

/** Load, validate, and enrich the configured architecture component catalog from one snapshot. */
export async function loadArchitectureCatalog(snapshot, config) {
	const root = config.architecture?.root ?? ".blueprint/architecture";
	const componentsDir = `${root}/components`;
	const prefix = `${componentsDir}/`;
	const files = snapshot.files.filter((file) => file.startsWith(prefix) && file.endsWith(".md"));
	const components = [];
	const issues = [];
	const ids = new Set();
	const deployments = new Set();
	const contracts = new Map();
	for (const file of files) {
		const content = await snapshot.readText(file);
		if (content === null) continue;
		const parsed = parseComponent(file, content);
		components.push(parsed.component);
		issues.push(...parsed.issues);
		const expectedId = file.slice(prefix.length, -3);
		if (expectedId.includes("/")) issues.push(issue(file, "component-location", "component files must be directly inside the architecture components directory", `Move the file to ${componentsDir}/${parsed.component.id}.md`));
		if (parsed.component.id !== expectedId) issues.push(issue(file, "component-id", `Id '${parsed.component.id}' does not match filename '${expectedId}.md'`, "Rename the file or update Id"));
		if (ids.has(parsed.component.id)) issues.push(issue(file, "component-id", `duplicate component Id '${parsed.component.id}'`, "Use a unique Id"));
		ids.add(parsed.component.id);
		if (parsed.component.deployment !== null) {
			if (deployments.has(parsed.component.deployment)) {
				issues.push(issue(file, "component-deployment", `deployment identifier '${parsed.component.deployment}' is reused across components`, "Use a unique deployment identifier per component"));
			}
			deployments.add(parsed.component.deployment);
		}
		for (const contract of parsed.component.contracts) {
			const list = contracts.get(contract) ?? [];
			list.push(parsed.component.id);
			contracts.set(contract, list);
		}
	}
	detectContainerCycles(components, issues);
	detectAmbiguousOwnedPaths(components, issues);

	const byId = new Map(components.map((component) => [component.id, component]));
	const contractOwners = new Map();
	for (const component of components) {
		for (const contract of component.contracts) {
			const list = contractOwners.get(contract) ?? [];
			list.push(component.id);
			contractOwners.set(contract, list);
		}
	}
	const contractConflicts = [...contractOwners.entries()].filter(([, list]) => list.length > 1);
	for (const [contract, list] of contractConflicts) {
		const file = components.find((component) => component.contracts.includes(contract))?.file ?? "(unknown)";
		issues.push(issue(file, "component-contract", `provided contract '${contract}' is exposed by multiple components: ${list.sort().join(", ")}`, "Each provided contract identifier must have exactly one component owner"));
	}

	for (const component of components) {
		for (const dep of component.dependencies) {
			if (!byId.has(dep.target)) {
				issues.push(issue(component.file, "component-relation", `relation ${dep.relation} references unknown component '${dep.target}'`, "Reference an existing component id or remove the relation"));
			}
		}
	}

	const featureIds = new Set();
	for (const component of components) {
		component.documents = component.documents.map((document) => ({ ...document, exists: snapshot.exists(document.path) }));
		const checks = [component.summary.length > 0, component.ownedPaths.length > 0, ...component.documents.filter((entry) => entry.level === "required").map((entry) => entry.exists)];
		component.satisfaction = checks.length === 0 ? 0 : Math.round((checks.filter(Boolean).length / checks.length) * 100);
		for (const featureId of component.supportedFeatures) featureIds.add(featureId);
	}
	components.sort((left, right) => left.title.localeCompare(right.title));
	return {
		root,
		componentsDir,
		components,
		issues,
		referencedFeatureIds: [...featureIds],
		summary: {
			total: components.length,
			complete: components.filter((component) => component.satisfaction === 100).length,
			requiredDocuments: components.reduce((count, component) => count + component.documents.filter((entry) => entry.level === "required").length, 0),
			missingRequiredDocuments: components.reduce((count, component) => count + component.documents.filter((entry) => entry.level === "required" && !entry.exists).length, 0),
		},
	};
}

export function architecturePathFor(config, componentId, kind) {
	const componentsDir = `${config.architecture?.root ?? ".blueprint/architecture"}/components`;
	if (kind === "components") return componentsDir;
	if (kind === "file") return `${componentsDir}/${componentId}.md`;
	throw new Error(`unknown architecture artifact kind: ${kind}`);
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
export function serializeComponent(input) {
	if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error("component must be an object");
	const id = cleanText(input.id, "id");
	if (!COMPONENT_ID_PATTERN.test(id)) throw new Error("id must use 1-64 lowercase letters, numbers, and hyphens");
	const title = cleanText(input.title, "title");
	if (title.length === 0 || title.length > 120 || title.includes("\n")) throw new Error("title must be 1-120 characters on one line");
	const kind = cleanText(input.kind, "kind").toLowerCase();
	if (!COMPONENT_KINDS.has(kind)) throw new Error("kind must be one of service, library, plugin, internal, frontend, data, or infra");
	const containerId = input.containerId === null || input.containerId === undefined || input.containerId === "" ? null : cleanText(input.containerId, "containerId");
	if (containerId !== null && !COMPONENT_ID_PATTERN.test(containerId)) throw new Error("containerId must be another component id or empty");
	if (containerId === id) throw new Error("a component cannot contain itself");
	const deployment = input.deployment === null || input.deployment === undefined || input.deployment === "" ? null : cleanText(input.deployment, "deployment");
	if (deployment !== null && !DEPLOYMENT_ID_PATTERN.test(deployment)) throw new Error("deployment must be 1-64 lowercase letters, numbers, periods, underscores, and hyphens");
	const status = cleanText(input.status, "status");
	if (!COMPONENT_STATUSES.has(status)) throw new Error("status must be planned, active, or deprecated");
	const summary = cleanText(input.summary, "summary");
	if (summary.length === 0 || summary.length > 4_000) throw new Error("summary must contain 1-4,000 characters");
	const ownedPaths = cleanLines(input.ownedPaths ?? [], "ownedPaths", true);
	if (ownedPaths.length === 0 || ownedPaths.length > 100) throw new Error("ownedPaths must contain 1-100 project-relative entries");
	const contracts = cleanLines(input.contracts ?? [], "contracts");
	if (contracts.length > 100) throw new Error("contracts must contain at most 100 entries");
	for (const contract of contracts) {
		if (!CONTRACT_ID_PATTERN.test(contract)) throw new Error(`contract '${contract}' is not a valid identifier`);
	}
	const dependencies = Array.isArray(input.dependencies) ? input.dependencies : [];
	if (dependencies.length > 200) throw new Error("dependencies must contain at most 200 entries");
	const normalizedDeps = [];
	for (const dep of dependencies) {
		if (dep === null || typeof dep !== "object") throw new Error("each dependency must be an object");
		const relation = cleanText(dep.relation, "dependency relation").toLowerCase();
		if (!COMPONENT_RELATION_TYPES.has(relation)) throw new Error(`dependency relation '${relation}' is not supported`);
		const target = cleanText(dep.target, "dependency target");
		if (!COMPONENT_ID_PATTERN.test(target)) throw new Error(`dependency target '${target}' is not a valid component id`);
		if (target === id) throw new Error("a component cannot depend on itself");
		normalizedDeps.push({ relation, target });
	}
	const supportedFeatures = cleanLines(input.supportedFeatures ?? [], "supportedFeatures");
	for (const featureId of supportedFeatures) {
		if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(featureId)) throw new Error(`supportedFeatures entry '${featureId}' is not a valid feature id`);
	}
	if (!Array.isArray(input.documents) || input.documents.length === 0 || input.documents.length > 100) throw new Error("documents must contain 1-100 entries");
	const documents = input.documents.map((entry) => {
		if (entry === null || typeof entry !== "object") throw new Error("each document must be an object");
		if (entry.level !== "required" && entry.level !== "recommended") throw new Error("document level must be required or recommended");
		return { level: entry.level, path: normalizeRelativePath(cleanText(entry.path, "document path")) };
	});
	if (!documents.some((entry) => entry.level === "required")) throw new Error("at least one required document must be declared");
	const bullets = (values) => values.map((value) => `- \`${value}\``).join("\n");
	return `# Component: ${title}\n\nId: ${id}\nKind: ${kind}\nContainer: ${containerId ?? "none"}\nDeployment: ${deployment ?? ""}\nStatus: ${status}\n\n## Summary\n\n${summary}\n\n## Owned paths\n\n${bullets(ownedPaths)}\n\n## Provided contracts\n\n${contracts.length > 0 ? bullets(contracts) : "No provided contracts declared."}\n\n## Dependencies\n\n${normalizedDeps.length > 0 ? normalizedDeps.map((dep) => `- ${dep.relation}: \`${dep.target}\``).join("\n") : "No typed dependencies declared."}\n\n## Supported features\n\n${supportedFeatures.length > 0 ? bullets(supportedFeatures) : "No supported features declared."}\n\n## Documents\n\n${documents.map((entry) => `- ${entry.level}: \`${entry.path}\``).join("\n")}\n`;
}

/** A friendly initial record for the Web create flow. */
export function newComponentInput() {
	return {
		id: "",
		title: "",
		kind: "internal",
		containerId: null,
		deployment: "",
		status: "planned",
		summary: "Describe what this component is responsible for.",
		ownedPaths: ["src/**"],
		contracts: [],
		dependencies: [],
		supportedFeatures: [],
		documents: [{ level: "required", path: "DESIGN.md" }],
		hash: null,
	};
}