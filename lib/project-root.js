/**
 * Explicit Blueprint project-root discovery.
 *
 * @module @dsh-plugins/design-blueprint/project-root
 */
import { stat } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";
import { CONFIG_FILE } from "./config.js";

export class BlueprintProjectError extends Error {
	constructor(message, cwd) {
		super(message);
		this.name = "BlueprintProjectError";
		this.cwd = cwd;
		this.code = "BLUEPRINT_PROJECT_NOT_FOUND";
	}
}

async function isFile(path) {
	try {
		return (await stat(path)).isFile();
	} catch {
		return false;
	}
}

/** Search upward for the configuration anchor; never scan an unrelated fallback directory. */
export async function resolveBlueprintRoot(cwd = process.cwd()) {
	if (typeof cwd !== "string" || cwd.trim().length === 0) {
		throw new BlueprintProjectError("The current DSH session has no project directory. Open a project workspace first.", cwd);
	}
	let current = resolve(cwd);
	try {
		if (!(await stat(current)).isDirectory()) current = dirname(current);
	} catch {
		throw new BlueprintProjectError(`The current project directory does not exist: ${current}`, current);
	}
	const volumeRoot = parse(current).root;
	while (true) {
		if (await isFile(join(current, CONFIG_FILE))) return current;
		if (current === volumeRoot) break;
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	throw new BlueprintProjectError(
		`No ${CONFIG_FILE} was found above ${resolve(cwd)}. Open the DSH session from a Blueprint project, or run 'design-blueprint init --cwd <project>'.`,
		resolve(cwd),
	);
}
