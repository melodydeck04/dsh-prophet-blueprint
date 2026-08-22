//#region lib/types/path-utils.js
/**
 * Repository-relative path and glob helpers shared by the policy engine.
 *
 * @module @dsh-plugins/design-blueprint/path-utils
 */
import { isAbsolute, posix, win32 } from "node:path";

/** Normalize and validate one repository-relative path. */
export function normalizeRelativePath(value) {
	if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
		throw new Error("path must be a non-empty string without NUL bytes");
	}
	const slash = value.replace(/\\/g, "/");
	if (isAbsolute(value) || win32.isAbsolute(value) || slash.startsWith("/")) {
		throw new Error(`path must be repository-relative: ${value}`);
	}
	const normalized = posix.normalize(slash).replace(/^\.\//, "");
	if (normalized === ".." || normalized.startsWith("../")) {
		throw new Error(`path escapes the repository root: ${value}`);
	}
	return normalized;
}

/** Convert the supported `*`, `**`, and `?` glob subset into a RegExp. */
export function globToRegExp(pattern) {
	const normalized = normalizeRelativePath(pattern);
	let source = "^";
	for (let index = 0; index < normalized.length; index += 1) {
		const character = normalized[index];
		if (character === "*") {
			if (normalized[index + 1] === "*") {
				index += 1;
				if (normalized[index + 1] === "/") {
					index += 1;
					source += "(?:.*/)?";
				} else {
					source += ".*";
				}
			} else {
				source += "[^/]*";
			}
		} else if (character === "?") {
			source += "[^/]";
		} else {
			source += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
		}
	}
	return new RegExp(source + "$");
}

/** Whether `file` matches any pattern from `patterns`. */
export function matchesAny(file, patterns) {
	const normalized = normalizeRelativePath(file);
	return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}
//#endregion
