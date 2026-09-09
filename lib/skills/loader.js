//#region lib/skills/loader.js
/**
 * Load bundled DSH Skills from `<pluginRoot>/skills/<name>/SKILL.md`.
 *
 * Returns one entry per parsed Skill. Files that fail to read, miss the
 * `---` delimiters, or carry an invalid frontmatter are skipped with a
 * warning recorded through the supplied logger; the loader never throws on
 * individual file failures.
 *
 * @module @dsh-plugins/design-blueprint/lib/skills/loader
 */

import { readdir, readFile, mkdir } from "node:fs/promises";
import { join, isAbsolute, dirname } from "node:path";
import { parseFrontmatter, splitFrontmatter } from "./frontmatter.js";

const PROVIDER_NAME = "design-blueprint";

/**
 * Convert a value to an absolute file path under `pluginRoot` when it is
 * relative; return absolute paths unchanged. Throws when `pluginRoot` is
 * not absolute and `value` is also not absolute.
 */
function resolveUnderRoot(pluginRoot, value) {
	if (isAbsolute(value)) return value;
	if (!isAbsolute(pluginRoot)) throw new Error(`pluginRoot must be absolute when value is relative: ${pluginRoot} / ${value}`);
	return join(pluginRoot, value);
}

/**
 * Read a single SKILL.md file, split it into frontmatter and body, parse the
 * frontmatter, and return a Skill record. Returns `null` when the file is
 * malformed; the caller is responsible for logging the warning.
 */
async function readSkillFile({ pluginRoot, entry }) {
	const skillDir = join(pluginRoot, "skills", entry);
	const filePath = join(skillDir, "SKILL.md");
	let text;
	try {
		text = await readFile(filePath, "utf8");
	} catch (error) {
		return { skill: null, warning: `failed to read ${filePath}: ${error?.message ?? error}` };
	}
	const { frontmatter, body } = splitFrontmatter(text);
	if (frontmatter === "") {
		return { skill: null, warning: `${filePath}: missing frontmatter delimiters` };
	}
	const parsed = parseFrontmatter(frontmatter);
	const issues = [...parsed.errors];
	if (parsed.name === null) {
		if (!issues.some((entry) => entry.code === "name-format")) issues.push({ code: "name-missing", message: "name key missing" });
	}
	if (parsed.description === null) {
		if (!issues.some((entry) => entry.code === "description-empty")) issues.push({ code: "description-missing", message: "description key missing or empty" });
	}
	if (issues.length > 0) {
		const summary = issues.map((entry) => `${entry.code}: ${entry.message}`).join("; ");
		return { skill: null, warning: `${filePath}: ${summary}` };
	}
	const invocation = parsed.invocation ?? { modelInvocable: true, userInvocable: true, dropped: false };
	if (invocation.dropped) {
		return { skill: null, warning: `${filePath}: both disable-model-invocation and user-invocable are false (dropped)` };
	}
	return {
		skill: {
			name: parsed.name,
			description: parsed.description,
			invocation: { modelInvocable: invocation.modelInvocable, userInvocable: invocation.userInvocable },
			body,
			filePath,
			frontmatter: parsed.raw,
		},
		warning: null,
	};
}

/**
 * Walk `<pluginRoot>/skills/` one level deep, return one Skill per valid
 * `SKILL.md`. Missing `skills/` directory returns `[]`. Files that error are
 * skipped with a warning recorded through `logger.warn` when supplied.
 */
export async function loadBundledSkills({ pluginRoot, logger } = {}) {
	if (typeof pluginRoot !== "string" || pluginRoot.length === 0) {
		throw new Error("loadBundledSkills requires a non-empty pluginRoot");
	}
	const root = isAbsolute(pluginRoot) ? pluginRoot : resolveUnderRoot(process.cwd(), pluginRoot);
	const skillsRoot = join(root, "skills");
	let entries;
	try {
		entries = await readdir(skillsRoot, { withFileTypes: true });
	} catch (error) {
		if (error?.code === "ENOENT") return [];
		throw error;
	}
	const warn = typeof logger?.warn === "function" ? logger.warn.bind(logger) : (message) => console.warn(message);
	const skills = [];
	for (const entry of entries) {
		if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
		const { skill, warning } = await readSkillFile({ pluginRoot: root, entry: entry.name });
		if (warning) {
			warn(`[skills-loader] ${warning}`);
			continue;
		}
		skills.push(skill);
	}
	skills.sort((a, b) => a.name.localeCompare(b.name));
	return skills;
}

/**
 * Convert one parsed Skill into the DSH candidate shape. Exported for tests
 * and for `lib/skills.js` to wrap `provider.list()` and `provider.get()`.
 */
export function toCandidate(skill, { rank } = {}) {
	const locator = { kind: "file", path: skill.filePath };
	return {
		name: skill.name,
		description: skill.description,
		invocation: { ...skill.invocation },
		provider: PROVIDER_NAME,
		source: "bundled",
		locator,
		resourceBase: { kind: "directory", path: dirname(skill.filePath) },
		rank: typeof rank === "number" ? rank : undefined,
	};
}

/**
 * Ensure `<pluginRoot>/skills/<name>/` exists. Convenience used by tests
 * that need to plant a SKILL.md fixture; the production loader does not
 * require the directory to exist.
 */
export async function ensureSkillDir({ pluginRoot, name }) {
	if (typeof name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
		throw new Error(`invalid skill name: ${name}`);
	}
	const skillsDir = join(pluginRoot, "skills", name);
	await mkdir(skillsDir, { recursive: true });
	return skillsDir;
}
//#endregion
