//#region lib/skills/frontmatter.js
/**
 * Minimal frontmatter parser for bundled DSH Skill files.
 *
 * Scope: the four documented keys (`name`, `description`,
 * `disable-model-invocation`, `user-invocable`). Hand-rolled to avoid a YAML
 * dependency; if a future Skill needs richer frontmatter, replace this module
 * through a separate Spec.
 *
 * @module @dsh-plugins/design-blueprint/lib/skills/frontmatter
 */

export class FrontmatterError extends Error {
	constructor(message, { source } = {}) {
		super(message);
		this.name = "FrontmatterError";
		this.source = source ?? null;
	}
}

/**
 * Map the raw frontmatter flag pair to the runtime invocation policy that
 * DSH's `ctx.skills` consumer expects. When both flags resolve to `false`,
 * the caller drops the Skill with a warning that names the Skill and the
 * predicate.
 */
export function mapFlagsToInvocation(disableModelInvocation, userInvocable) {
	const bothFalse = disableModelInvocation === true && userInvocable === false;
	if (bothFalse) return { modelInvocable: false, userInvocable: false, dropped: true };
	return {
		modelInvocable: disableModelInvocation !== true,
		userInvocable: userInvocable !== false,
		dropped: false,
	};
}

function coerceBoolean(value) {
	if (value === true || value === false) return value;
	if (value === null || value === undefined) return null;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (normalized === "true") return true;
		if (normalized === "false") return false;
	}
	return Symbol.for("FrontmatterError:invalid-boolean");
}

/**
 * Parse a SKILL.md frontmatter block. Returns `{ name, description,
 * invocation, raw, errors }`. The parser never throws; an invalid flag value
 * produces an entry in `errors` and the caller decides whether to drop the
 * Skill.
 */
export function parseFrontmatter(text) {
	const errors = [];
	const raw = {};
	if (typeof text !== "string") {
		errors.push({ code: "type", message: "frontmatter text must be a string" });
		return { name: null, description: null, invocation: null, raw, errors };
	}
	const lines = text.split(/\r?\n/);
	for (const line of lines) {
		const match = /^([a-z0-9-]+)\s*:\s*(.*)$/i.exec(line.trim());
		if (!match) continue;
		const key = match[1].toLowerCase();
		const value = match[2].trim();
		raw[key] = value;
		if (key === "name") {
			raw.name = value;
		} else if (key === "description") {
			raw.description = value;
		} else if (key === "disable-model-invocation") {
			raw.disabled = value;
		} else if (key === "user-invocable") {
			raw.userInvocable = value;
		}
	}

	const name = typeof raw.name === "string" && /^[a-z0-9][a-z0-9-]*$/.test(raw.name.trim()) ? raw.name.trim() : null;
	if (raw.name !== undefined && name === null) {
		errors.push({ code: "name-format", message: `name must be kebab-case, got ${JSON.stringify(raw.name)}` });
	}
	const description = typeof raw.description === "string" && raw.description.trim().length > 0 ? raw.description.trim() : null;
	if (raw.description !== undefined && description === null) {
		errors.push({ code: "description-empty", message: "description must be a non-empty string" });
	}

	const disableModelInvocation = raw.disabled === undefined ? false : coerceBoolean(raw.disabled);
	if (raw.disabled !== undefined && typeof disableModelInvocation === "symbol") {
		errors.push({ code: "disable-model-invocation-bool", message: `disable-model-invocation must be a boolean, got ${JSON.stringify(raw.disabled)}` });
	}
	const userInvocable = raw.userInvocable === undefined ? true : coerceBoolean(raw.userInvocable);
	if (raw.userInvocable !== undefined && typeof userInvocable === "symbol") {
		errors.push({ code: "user-invocable-bool", message: `user-invocable must be a boolean, got ${JSON.stringify(raw.userInvocable)}` });
	}

	const invocation = (errors.some((entry) => entry.code === "disable-model-invocation-bool" || entry.code === "user-invocable-bool"))
		? null
		: mapFlagsToInvocation(disableModelInvocation, userInvocable);

	return {
		name,
		description,
		invocation,
		raw,
		errors,
	};
}

/**
 * Split a SKILL.md file into frontmatter and body. Returns
 * `{ frontmatter, body }` where `frontmatter` is the raw `---\n...\n---\n`
 * block (without the delimiters) and `body` is everything after the closing
 * `---`. Returns `{ frontmatter: "", body: text }` when the file has no
 * frontmatter.
 */
export function splitFrontmatter(text) {
	if (typeof text !== "string" || !text.startsWith("---")) return { frontmatter: "", body: text ?? "" };
	const lines = text.split(/\r?\n/);
	if (lines[0].trim() !== "---") return { frontmatter: "", body: text };
	const closing = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
	if (closing < 0) return { frontmatter: "", body: text };
	const frontmatter = lines.slice(1, closing).join("\n");
	const body = lines.slice(closing + 1).join("\n");
	return { frontmatter, body };
}
//#endregion