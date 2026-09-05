//#region lib/skills/cli.js
/**
 * Read-only CLI surface for the bundled Skills (`design-blueprint skills
 * <list|show|info>`). Reuses the same loader the Cordis plugin uses at
 * boot. The subcommand never writes; the existing CLI commands remain the
 * authoritative surface for any state mutation.
 *
 * @module @dsh-plugins/design-blueprint/lib/skills/cli
 */

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

import { loadBundledSkills } from "./loader.js";
import { backingModuleFor } from "./backing-modules.js";

const PLUGIN_ROOT = dirname(fileURLToPath(import.meta.url))
	.replace(/[\\/]+lib[\\/]+skills$/, "");

function resolveSpecRoot(cwd) {
	return join(cwd, "skills");
}

function renderWithLineNumbers(text, { allowEscape, lineNumbers } = {}) {
	let stripped = text.replace(/\r\n?/g, "\n");
	if (!allowEscape && stripped.includes("\u001b")) {
		throw new Error("Skill content contains ESC bytes (\\u001b); refusing to print unless --json is set");
	}
	const lines = stripped.split("\n");
	const lastIsEmpty = lines.length > 0 && lines[lines.length - 1] === "";
	if (lastIsEmpty) lines.pop();
	const trailingNewline = text.endsWith("\n");
	if (lineNumbers === false) {
		return { content: stripped, lineCount: lines.length, byteCount: Buffer.byteLength(stripped, "utf8") };
	}
	const body = lines.map((line, index) => `${String(index + 1).padStart(4)}  ${line}`).join("\n") + (trailingNewline ? "\n" : "");
	return { content: body, lineCount: lines.length, byteCount: Buffer.byteLength(stripped, "utf8") };
}

/**
 * Dispatch one `design-blueprint skills <action>` invocation.
 *
 * @param {{ command: "skills", positional: string[], flags: Record<string, any> }} args
 * @param {string} cwd
 * @returns {Promise<number>} process exit code
 */
export async function runSkillsCommand(args, cwd) {
	const positional = args.positional ?? [];
	const flags = args.flags ?? {};
	const action = positional[0];
	if (typeof action !== "string") {
		throw new Error("skills requires an action: list, show <name>, or info <name>");
	}
	if (action === "list") return runList(cwd, flags);
	if (action === "show") return runShow(cwd, positional[1], flags);
	if (action === "info") return runInfo(cwd, positional[1], flags);
	throw new Error(`unknown skills action: ${action}; expected list, show <name>, or info <name>`);
}

async function runList(cwd, flags) {
	const skills = await loadBundledSkills({ pluginRoot: PLUGIN_ROOT, skillsRoot: resolveSpecRoot(cwd) }).catch(async () => loadBundledSkills({ pluginRoot: PLUGIN_ROOT }));
	if (flags.json === true) {
		process.stdout.write(JSON.stringify({
			pluginRoot: PLUGIN_ROOT,
			skills: skills.map((skill) => ({
				name: skill.name,
				description: skill.description,
				modelInvocable: skill.invocation.modelInvocable,
				userInvocable: skill.invocation.userInvocable,
				backingModule: backingModuleFor(skill.name),
			})),
		}, null, 2) + "\n");
		return 0;
	}
	process.stdout.write(formatSkillsTable(skills) + "\n");
	return 0;
}

function formatSkillsTable(skills) {
	const header = "| name | description | model-invocable | user-invocable | module |";
	const sep = "| --- | --- | --- | --- | --- |";
	const rows = skills.map((skill) => [
		skill.name,
		skill.description,
		String(skill.invocation.modelInvocable),
		String(skill.invocation.userInvocable),
		backingModuleFor(skill.name) ?? "-",
	].map((cell) => ` ${String(cell).replace(/\|/g, "\\|")} `).join("|"));
	return [header, sep, ...rows].join("\n");
}

async function runShow(cwd, name, flags) {
	if (typeof name !== "string" || name.length === 0) throw new Error("skills show requires a Skill name");
	const filePath = join(resolveSpecRoot(cwd), name, "SKILL.md");
	if (!existsSync(filePath)) {
		process.stderr.write(`Skill not found: ${name}\n`);
		return 1;
	}
	const text = await readFile(filePath, "utf8");
	const rendered = renderWithLineNumbers(text, { allowEscape: flags.json === true, lineNumbers: flags["no-line-numbers"] !== true });
	if (flags.json === true) {
		process.stdout.write(JSON.stringify({ name, file: `skills/${name}/SKILL.md`, lineCount: rendered.lineCount, byteCount: rendered.byteCount, content: rendered.content }, null, 2) + "\n");
		return 0;
	}
	process.stdout.write(rendered.content);
	return 0;
}

async function runInfo(cwd, name, flags) {
	if (typeof name !== "string" || name.length === 0) throw new Error("skills info requires a Skill name");
	const skills = await loadBundledSkills({ pluginRoot: PLUGIN_ROOT, skillsRoot: resolveSpecRoot(cwd) }).catch(async () => loadBundledSkills({ pluginRoot: PLUGIN_ROOT }));
	const skill = skills.find((entry) => entry.name === name);
	if (skill === undefined) {
		process.stderr.write(`Skill not found: ${name}\n`);
		return 1;
	}
	const result = {
		name: skill.name,
		description: skill.description,
		modelInvocable: skill.invocation.modelInvocable,
		userInvocable: skill.invocation.userInvocable,
		file: `skills/${name}/SKILL.md`,
		backingModule: backingModuleFor(skill.name),
	};
	if (flags.json === true) {
		process.stdout.write(JSON.stringify(result, null, 2) + "\n");
		return 0;
	}
	process.stdout.write([
		`name: ${result.name}`,
		`description: ${result.description}`,
		`modelInvocable: ${result.modelInvocable}`,
		`userInvocable: ${result.userInvocable}`,
		`file: ${result.file}`,
		`backingModule: ${result.backingModule ?? "(none)"}`,
	].join("\n") + "\n");
	return 0;
}
//#endregion