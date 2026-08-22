//#region lib/types/snapshot.js
/**
 * Working-tree and Git-index snapshots used by every blueprint check.
 *
 * @module @dsh-plugins/design-blueprint/snapshot
 */
import { execFile as execFileCallback } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { promisify } from "node:util";
import { normalizeRelativePath } from "./path-utils.js";

const execFile = promisify(execFileCallback);
const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", "coverage"]);
const MAX_WORKING_TREE_FILES = 200_000;

async function walk(root) {
	const files = [];
	const stack = [root];
	while (stack.length > 0) {
		const directory = stack.pop();
		let entries;
		try {
			entries = await readdir(directory, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const absolute = join(directory, entry.name);
			if (entry.isDirectory()) {
				if (!IGNORED_DIRECTORIES.has(entry.name)) stack.push(absolute);
			} else if (entry.isFile()) {
				files.push(relative(root, absolute).split(sep).join("/"));
				if (files.length > MAX_WORKING_TREE_FILES) {
					throw new Error(`Blueprint stopped after ${MAX_WORKING_TREE_FILES.toLocaleString("en-US")} files; check that the selected project root is correct`);
				}
			}
		}
	}
	return files.sort();
}

/** Return the containing Git worktree root, or `null`. */
export async function gitRoot(cwd) {
	try {
		const { stdout } = await execFile("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { windowsHide: true });
		return stdout.trim();
	} catch {
		return null;
	}
}

/** Read the staged change list using Git's NUL-delimited machine format. */
export async function stagedChanges(root) {
	const { stdout } = await execFile(
		"git",
		["-C", root, "diff", "--cached", "--name-status", "-z", "--find-renames", "--find-copies"],
		{ windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
	);
	const tokens = stdout.split("\0");
	if (tokens.at(-1) === "") tokens.pop();
	const changes = [];
	for (let index = 0; index < tokens.length;) {
		const status = tokens[index++];
		if (!status) break;
		if (status.startsWith("R") || status.startsWith("C")) {
			const oldPath = normalizeRelativePath(tokens[index++]);
			const path = normalizeRelativePath(tokens[index++]);
			changes.push({ status, path, oldPath });
		} else {
			changes.push({ status, path: normalizeRelativePath(tokens[index++]) });
		}
	}
	return changes;
}

/** Create a read-only snapshot of the current filesystem. */
export async function workingTreeSnapshot(root) {
	const files = await walk(root);
	const fileSet = new Set(files);
	return {
		kind: "working-tree",
		root,
		files,
		exists(path) {
			return fileSet.has(normalizeRelativePath(path));
		},
		async readText(path) {
			const normalized = normalizeRelativePath(path);
			if (!fileSet.has(normalized)) return null;
			try {
				const info = await stat(join(root, ...normalized.split("/")));
				if (!info.isFile()) return null;
				return await readFile(join(root, ...normalized.split("/")), "utf8");
			} catch {
				return null;
			}
		},
	};
}

/** Create a read-only snapshot of the exact Git index that will be committed. */
export async function gitIndexSnapshot(root) {
	const { stdout } = await execFile("git", ["-C", root, "ls-files", "-z", "--cached"], {
		windowsHide: true,
		maxBuffer: 16 * 1024 * 1024,
	});
	const files = stdout.split("\0").filter(Boolean).map(normalizeRelativePath).sort();
	const fileSet = new Set(files);
	return {
		kind: "git-index",
		root,
		files,
		exists(path) {
			return fileSet.has(normalizeRelativePath(path));
		},
		async readText(path) {
			const normalized = normalizeRelativePath(path);
			if (!fileSet.has(normalized)) return null;
			try {
				const { stdout: content } = await execFile("git", ["-C", root, "show", `:${normalized}`], {
					windowsHide: true,
					maxBuffer: 16 * 1024 * 1024,
				});
				return content;
			} catch {
				return null;
			}
		},
	};
}
//#endregion
