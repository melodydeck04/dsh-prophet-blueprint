/**
 * Resolve a Spec path to its sibling TODO list.
 *
 * The TODO list lives in plain YAML next to the Spec file:
 * `.specs/<feature>/<spec>.todos.yaml` for an English Spec, or
 * `.specs/<feature>/<spec>.todos.yaml` (same path) when the input is the
 * `.zh.md` counterpart. The resolver returns `null` when no YAML exists
 * yet and never throws on absence.
 *
 * @module @dsh-plugins/design-blueprint/spec-todos
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadTodoList } from "./todo-store.js";

/**
 * @param {string} specPath  absolute or CWD-relative path to a Spec file
 * @returns {string | null}  absolute path of the sibling `.todos.yaml`, or `null`
 */
export function resolveTodoPath(specPath) {
	if (typeof specPath !== "string" || specPath.length === 0) return null;
	const absolute = resolve(specPath);
	let base;
	if (absolute.endsWith(".zh.md")) {
		base = absolute.slice(0, -".zh.md".length);
	} else if (absolute.endsWith(".md")) {
		base = absolute.slice(0, -".md".length);
	} else {
		return null;
	}
	const candidate = `${base}.todos.yaml`;
	if (!existsSync(candidate)) return null;
	return candidate;
}

/**
 * Convenience wrapper around `resolveTodoPath` + `loadTodoList`.
 *
 * @param {string} specPath
 * @returns {Promise<import("./todo-store.js").TodoList | null>}
 */
export async function loadTodosForSpec(specPath) {
	const todoPath = resolveTodoPath(specPath);
	if (todoPath === null) return null;
	return loadTodoList(todoPath);
}
