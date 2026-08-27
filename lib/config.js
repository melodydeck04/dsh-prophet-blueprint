//#region lib/types/config.js
/**
 * Blueprint configuration loading and validation.
 *
 * @module @dsh-plugins/design-blueprint/config
 */
import { normalizeRelativePath } from "./path-utils.js";

export const CONFIG_FILE = "design-blueprint.json";
export const DEFAULT_CONFIG = Object.freeze({
	version: 1,
	authority: {
		instructions: ["AGENTS.md"],
		architecture: ["DESIGN.md"],
		publicContracts: ["README.md"],
		specsRoot: ".specs",
	},
	changePolicy: {
		requireSpecFor: ["**"],
		allowWithoutSpec: [".specs/**", ".blueprint/approvals/**", ".blueprint/verifications/**", ".blueprint/architecture/**", "design-blueprint.json"],
	},
	features: {
		root: ".blueprint/features",
		approvalsRoot: ".blueprint/approvals",
		verificationsRoot: ".blueprint/verifications",
	},
	architecture: {
		root: ".blueprint/architecture",
	},
	documentation: {
		standards: ["docs/AGENTS.md"],
		roles: {
			tutorials: "docs/cookbook/**",
			references: "docs/reference/**",
			productGuides: "docs/user/**",
			decisions: ".specs/**",
		},
		i18n: {
			enabled: true,
			include: ["README.md", "docs/**/*.md"],
			exclude: ["docs/AGENTS.md", "docs/i18n/terminology.md", "docs/i18n/style-samples.md"],
			migrationSeverity: "recommended",
		},
	},
});

function issue(message, fix) {
	return { file: CONFIG_FILE, check: "blueprint-config", severity: "required", message, fix };
}

function stringArray(value, field, issues) {
	if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
		issues.push(issue(`${field} must be a non-empty string array`, `Fix ${field} in ${CONFIG_FILE}`));
		return [];
	}
	const output = [];
	for (const entry of value) {
		try {
			output.push(normalizeRelativePath(entry));
		} catch (error) {
			issues.push(issue(`${field} contains an invalid path '${entry}': ${error.message}`, "Use repository-relative paths and globs"));
		}
	}
	return output;
}

/** Load and validate `design-blueprint.json` from a snapshot. */
export async function loadConfig(snapshot) {
	const text = await snapshot.readText(CONFIG_FILE);
	if (text === null) {
		return {
			config: structuredClone(DEFAULT_CONFIG),
			issues: [issue(`${CONFIG_FILE} is missing from the checked snapshot`, "Run 'design-blueprint init' and commit the generated configuration")],
		};
	}
	let raw;
	try {
		raw = JSON.parse(text);
	} catch (error) {
		return { config: structuredClone(DEFAULT_CONFIG), issues: [issue(`${CONFIG_FILE} is invalid JSON: ${error.message}`, "Repair the JSON document")] };
	}
	const issues = [];
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
		return { config: structuredClone(DEFAULT_CONFIG), issues: [issue(`${CONFIG_FILE} must contain one JSON object`, "Replace the root value with an object")] };
	}
	if (raw.version !== 1) issues.push(issue(`unsupported blueprint config version '${raw.version}'`, "Set version to 1"));
	const authority = raw.authority ?? {};
	const changePolicy = raw.changePolicy ?? {};
	const features = raw.features ?? {};
	const documentation = raw.documentation;
	let specsRoot = ".specs";
	try {
		specsRoot = normalizeRelativePath(authority.specsRoot ?? ".specs");
	} catch (error) {
		issues.push(issue(`authority.specsRoot is invalid: ${error.message}`, "Use a repository-relative directory"));
	}
	const config = {
		version: 1,
		authority: {
			instructions: stringArray(authority.instructions, "authority.instructions", issues),
			architecture: stringArray(authority.architecture, "authority.architecture", issues),
			publicContracts: stringArray(authority.publicContracts, "authority.publicContracts", issues),
			specsRoot,
		},
		changePolicy: {
			requireSpecFor: stringArray(changePolicy.requireSpecFor, "changePolicy.requireSpecFor", issues),
			allowWithoutSpec: stringArray(changePolicy.allowWithoutSpec, "changePolicy.allowWithoutSpec", issues),
		},
		features: {
			root: ".blueprint/features",
			approvalsRoot: ".blueprint/approvals",
			verificationsRoot: ".blueprint/verifications",
		},
		architecture: {
			root: ".blueprint/architecture",
		},
		documentation: structuredClone(DEFAULT_CONFIG.documentation),
	};
	try {
		config.features.root = normalizeRelativePath(features.root ?? ".blueprint/features");
	} catch (error) {
		issues.push(issue(`features.root is invalid: ${error.message}`, "Use a repository-relative directory"));
	}
	try {
		config.features.approvalsRoot = normalizeRelativePath(features.approvalsRoot ?? ".blueprint/approvals");
	} catch (error) {
		issues.push(issue(`features.approvalsRoot is invalid: ${error.message}`, "Use a repository-relative directory"));
	}
	try {
		config.features.verificationsRoot = normalizeRelativePath(features.verificationsRoot ?? ".blueprint/verifications");
	} catch (error) {
		issues.push(issue(`features.verificationsRoot is invalid: ${error.message}`, "Use a repository-relative directory"));
	}
	const architecture = raw.architecture ?? {};
	try {
		config.architecture.root = normalizeRelativePath(architecture.root ?? ".blueprint/architecture");
	} catch (error) {
		issues.push(issue(`architecture.root is invalid: ${error.message}`, "Use a repository-relative directory"));
	}
	if (documentation === undefined) {
		config.documentation = null;
		issues.push({
			file: CONFIG_FILE,
			check: "blueprint-config",
			severity: "recommended",
			message: "documentation governance is not configured",
			fix: "Run 'design-blueprint init' again to add the DSH-aligned documentation baseline",
		});
	} else if (documentation === null || typeof documentation !== "object" || Array.isArray(documentation)) {
		config.documentation = null;
		issues.push(issue("documentation must be an object", `Fix documentation in ${CONFIG_FILE}`));
	} else {
		const roles = documentation.roles ?? {};
		const i18n = documentation.i18n ?? {};
		config.documentation = {
			standards: stringArray(documentation.standards, "documentation.standards", issues),
			roles: {},
			i18n: {
				enabled: i18n.enabled !== false,
				include: stringArray(i18n.include, "documentation.i18n.include", issues),
				exclude: Array.isArray(i18n.exclude) ? i18n.exclude.flatMap((entry) => {
					try { return [normalizeRelativePath(entry)]; } catch (error) {
						issues.push(issue(`documentation.i18n.exclude contains an invalid path '${entry}': ${error.message}`, "Use repository-relative paths and globs"));
						return [];
					}
				}) : [],
				migrationSeverity: i18n.migrationSeverity === "required" ? "required" : "recommended",
			},
		};
		for (const [role, fallback] of Object.entries(DEFAULT_CONFIG.documentation.roles)) {
			try {
				config.documentation.roles[role] = normalizeRelativePath(roles[role] ?? fallback);
			} catch (error) {
				issues.push(issue(`documentation.roles.${role} is invalid: ${error.message}`, "Use a repository-relative path or glob"));
				config.documentation.roles[role] = fallback;
			}
		}
	}
	return { config, issues };
}
//#endregion
