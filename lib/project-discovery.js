/**
 * Bounded discovery of safe first-run Blueprint targets.
 *
 * @module @dsh-plugins/design-blueprint/project-discovery
 */
import { readdir, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { CONFIG_FILE } from "./config.js";
import { gitRoot } from "./snapshot.js";

const PROJECT_MARKERS = [
	"package.json",
	"pyproject.toml",
	"requirements.txt",
	"Cargo.toml",
	"go.mod",
	"composer.json",
	"Gemfile",
];

async function kind(path) {
	try {
		const info = await stat(path);
		return info.isDirectory() ? "directory" : info.isFile() ? "file" : null;
	} catch {
		return null;
	}
}

async function hasProjectMarker(root) {
	for (const marker of PROJECT_MARKERS) {
		if (await kind(join(root, marker)) === "file") return marker;
	}
	return null;
}

function samePath(left, right) {
	return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

async function directProjectHints(root) {
	let entries;
	try {
		entries = await readdir(root, { withFileTypes: true });
	} catch {
		return [];
	}
	const hints = [];
	for (const entry of entries.filter((value) => value.isDirectory()).slice(0, 100)) {
		const path = join(root, entry.name);
		const configured = await kind(join(path, CONFIG_FILE)) === "file";
		const git = await kind(join(path, ".git")) === "directory" || await kind(join(path, ".git")) === "file";
		const marker = await hasProjectMarker(path);
		if (configured || git || marker !== null) hints.push({ name: entry.name, path, configured, reason: configured ? "blueprint" : git ? "git" : marker });
	}
	return hints;
}

/**
 * Discover exactly one safe current-workspace initialization target and
 * non-actionable direct-child hints. No recursive project selection occurs.
 */
export async function discoverBlueprintProjects(cwd) {
	if (typeof cwd !== "string" || cwd.trim().length === 0) throw new Error("The current DSH session has no workspace directory");
	const current = resolve(cwd);
	if (await kind(current) !== "directory") throw new Error(`The current workspace directory does not exist: ${current}`);
	const repository = await gitRoot(current);
	let candidate = null;
	if (repository !== null) {
		candidate = { name: basename(repository), path: resolve(repository), reason: "git" };
	} else {
		const marker = await hasProjectMarker(current);
		if (marker !== null) candidate = { name: basename(current), path: current, reason: marker };
	}
	const hints = await directProjectHints(current);
	const manualCandidate = candidate === null && dirname(current) !== current
		? { name: basename(current), path: current, reason: "developer-confirmation" }
		: null;
	return {
		cwd: current,
		candidate,
		manualCandidate,
		projectMarkers: [...PROJECT_MARKERS],
		hints: hints.filter((entry) => candidate === null || !samePath(entry.path, candidate.path)),
	};
}

export function isSameProjectPath(left, right) {
	return typeof left === "string" && typeof right === "string" && samePath(left, right);
}
