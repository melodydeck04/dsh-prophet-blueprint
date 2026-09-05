//#region lib/skills.js
/**
 * DSH Cordis plugin that registers one Skills provider on `ctx.skills`.
 *
 * `apply(ctx)` is synchronous: Cordis invokes it inside the plugin's
 * active fiber, and any later access to `ctx.skills` (or any other
 * injected service) must already have happened by then. The provider's
 * `list()` and `get()` are async because they read SKILL.md files from
 * disk; the SkillRegistry contract accepts Promise-returning providers.
 *
 * When `ctx.skills` is unavailable (older DSH release), `apply` returns
 * early without registering anything; the rest of the plugin's services
 * continue to work.
 *
 * @module @dsh-plugins/design-blueprint/lib/skills
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadBundledSkills, toCandidate } from "./skills/loader.js";

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROVIDER_NAME = "design-blueprint";
const BUNDLED_SKILL_RANK = 250;

const name = "skills-layer";
/** Service required to register the bundled Skills provider. */
const inject = ["skills"];

let cachedSkills = null;
let cachedPromise = null;

/** Load the bundled Skills once and memoize the result. */
function loadCachedSkills() {
	if (cachedSkills) return Promise.resolve(cachedSkills);
	if (!cachedPromise) {
		cachedPromise = loadBundledSkills({ pluginRoot: PLUGIN_ROOT }).then((skills) => {
			cachedSkills = skills;
			return skills;
		}, (error) => {
			cachedPromise = null;
			throw error;
		});
	}
	return cachedPromise;
}

/** Build the provider object passed to `ctx.skills.registerProvider`. */
function buildProvider() {
	return {
		name: PROVIDER_NAME,
		list() {
			return loadCachedSkills().then((skills) =>
				skills.map((skill) => toCandidate(skill, { rank: BUNDLED_SKILL_RANK })),
			);
		},
		async get(candidate) {
			const skills = await loadCachedSkills();
			const skill = skills.find((entry) => entry.name === candidate.name);
			if (!skill) return null;
			return {
				...toCandidate(skill, { rank: BUNDLED_SKILL_RANK }),
				content: skill.body,
			};
		},
	};
}

function apply(ctx) {
	if (typeof ctx?.skills?.registerProvider !== "function") return undefined;
	return ctx.skills.registerProvider(() => buildProvider());
}

export { apply, inject, name, PROVIDER_NAME, BUNDLED_SKILL_RANK };
//#endregion