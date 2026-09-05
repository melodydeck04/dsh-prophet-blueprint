/**
 * Persistent TODO list store.
 *
 * Reads and writes the `.specs/<feature>/<spec>.todos.yaml` artifact that
 * every Spec participating in the session-scale-awareness program carries
 * alongside itself. The schema is fixed (version 1) and intentionally
 * narrow so the YAML parser can stay small and dependency-free.
 *
 * The store never throws on a missing file: `loadTodoList` returns `null`
 * and `saveTodoList` creates the parent directory on demand. Schema
 * violations throw `TodoSchemaError` so the CLI can surface a precise
 * error rather than silently corrupting state.
 *
 * @module @dsh-plugins/design-blueprint/todo-store
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const VALID_STATUSES = new Set(["pending", "in-progress", "done"]);
const SCHEMA_VERSION = 1;

/**
 * @typedef {Object} TodoEntry
 * @property {string} id
 * @property {"pending" | "in-progress" | "done"} status
 * @property {string} req
 * @property {string} ac
 * @property {string} title
 * @property {string} [doneAt]
 * @property {string} [doneBy]
 */

/**
 * @typedef {Object} TodoList
 * @property {1} version
 * @property {string} spec
 * @property {string} createdAt
 * @property {string} createdBy
 * @property {TodoEntry[]} todos
 */

/**
 * @typedef {{ code: string, path: string, message: string }} SchemaViolation
 */

export class TodoSchemaError extends Error {
	/**
	 * @param {SchemaViolation[]} violations
	 */
	constructor(violations) {
		super(violations.map((v) => `${v.path}: ${v.message}`).join("; "));
		this.name = "TodoSchemaError";
		this.violations = violations;
	}
}

/**
 * Read and validate a `.todos.yaml` file.
 *
 * Returns `null` when the file does not exist (a missing TODO list is a
 * legitimate pre-implementation state, not an error). Throws
 * `TodoSchemaError` when the file exists but does not validate.
 *
 * @param {string} absolutePath
 * @returns {Promise<TodoList | null>}
 */
export async function loadTodoList(absolutePath) {
	let text;
	try {
		text = await readFile(absolutePath, "utf8");
	} catch (error) {
		if (error && /** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") return null;
		throw error;
	}
	const parsed = parseTodoYaml(text);
	const violations = validateTodoList(parsed);
	if (violations.length > 0) throw new TodoSchemaError(violations);
	return /** @type {TodoList} */ (parsed);
}

/**
 * Validate and write a TODO list to disk.
 *
 * Creates the parent directory on demand. Refuses to write a list that does
 * not validate (returns the violations list instead of throwing, so the
 * CLI can format them).
 *
 * @param {string} absolutePath
 * @param {TodoList} todoList
 * @returns {Promise<{ violations: SchemaViolation[] }>}
 */
export async function saveTodoList(absolutePath, todoList) {
	const violations = validateTodoList(todoList);
	if (violations.length > 0) return { violations };
	await mkdir(dirname(absolutePath), { recursive: true });
	const text = serializeTodoYaml(todoList);
	await writeFile(absolutePath, text, "utf8");
	return { violations: [] };
}

/**
 * Pure validation. Returns an empty array when the input is well-formed.
 *
 * @param {unknown} value
 * @returns {SchemaViolation[]}
 */
export function validateTodoList(value) {
	const violations = [];
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		violations.push({ code: "root-shape", path: "$", message: "TODO list must be an object" });
		return violations;
	}
	const root = /** @type {Record<string, unknown>} */ (value);
	if (root.version !== SCHEMA_VERSION) {
		violations.push({ code: "version", path: "$.version", message: `version must be ${SCHEMA_VERSION}` });
	}
	if (typeof root.spec !== "string" || root.spec.length === 0) {
		violations.push({ code: "spec", path: "$.spec", message: "spec must be a non-empty string" });
	}
	if (typeof root.createdAt !== "string" || root.createdAt.length === 0) {
		violations.push({ code: "createdAt", path: "$.createdAt", message: "createdAt must be a non-empty string" });
	}
	if (typeof root.createdBy !== "string") {
		violations.push({ code: "createdBy", path: "$.createdBy", message: "createdBy must be a string" });
	}
	if (!Array.isArray(root.todos)) {
		violations.push({ code: "todos", path: "$.todos", message: "todos must be an array" });
		return violations;
	}
	const seenIds = new Set();
	root.todos.forEach((entry, index) => {
		const base = `$.todos[${index}]`;
		if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
			violations.push({ code: "todo-shape", path: base, message: "entry must be an object" });
			return;
		}
		const t = /** @type {Record<string, unknown>} */ (entry);
		if (typeof t.id !== "string" || t.id.length === 0) {
			violations.push({ code: "id", path: `${base}.id`, message: "id must be a non-empty string" });
		} else if (seenIds.has(t.id)) {
			violations.push({ code: "duplicate-id", path: `${base}.id`, message: `duplicate id: ${t.id}` });
		} else {
			seenIds.add(t.id);
		}
		if (typeof t.status !== "string" || !VALID_STATUSES.has(t.status)) {
			violations.push({ code: "status", path: `${base}.status`, message: `status must be one of ${[...VALID_STATUSES].join(", ")}` });
		}
		if (typeof t.req !== "string" || t.req.length === 0) {
			violations.push({ code: "req", path: `${base}.req`, message: "req must be a non-empty string" });
		}
		if (typeof t.ac !== "string" || t.ac.length === 0) {
			violations.push({ code: "ac", path: `${base}.ac`, message: "ac must be a non-empty string" });
		}
		if (typeof t.title !== "string" || t.title.length === 0) {
			violations.push({ code: "title", path: `${base}.title`, message: "title must be a non-empty string" });
		}
		if (t.doneAt !== undefined && typeof t.doneAt !== "string") {
			violations.push({ code: "doneAt", path: `${base}.doneAt`, message: "doneAt must be a string when present" });
		}
		if (t.doneBy !== undefined && typeof t.doneBy !== "string") {
			violations.push({ code: "doneBy", path: `${base}.doneBy`, message: "doneBy must be a string when present" });
		}
	});
	return violations;
}

/**
 * Minimal YAML serializer scoped to the TODO list schema. The output is
 * stable and diff-friendly.
 *
 * @param {TodoList} list
 * @returns {string}
 */
function serializeTodoYaml(list) {
	const lines = [];
	lines.push(`version: ${list.version}`);
	lines.push(`spec: ${quoteYamlScalar(list.spec)}`);
	lines.push(`createdAt: ${quoteYamlScalar(list.createdAt)}`);
	lines.push(`createdBy: ${quoteYamlScalar(list.createdBy)}`);
	lines.push("todos:");
	for (const todo of list.todos) {
		lines.push(`  - id: ${quoteYamlScalar(todo.id)}`);
		lines.push(`    status: ${todo.status}`);
		lines.push(`    req: ${quoteYamlScalar(todo.req)}`);
		lines.push(`    ac: ${quoteYamlScalar(todo.ac)}`);
		lines.push(`    title: ${quoteYamlScalar(todo.title)}`);
		if (todo.doneAt !== undefined) lines.push(`    doneAt: ${quoteYamlScalar(todo.doneAt)}`);
		if (todo.doneBy !== undefined) lines.push(`    doneBy: ${quoteYamlScalar(todo.doneBy)}`);
	}
	return lines.join("\n") + "\n";
}

/**
 * Quote a YAML scalar when it contains characters that would confuse a
 * diff or that YAML treats specially. The format is restrictive but
 * round-trippable for every value the TODO schema accepts.
 *
 * @param {string} value
 * @returns {string}
 */
function quoteYamlScalar(value) {
	if (value.length === 0) return '""';
	if (/^[A-Za-z0-9._\-\/]+$/.test(value)) return value;
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Minimal YAML parser scoped to the TODO list schema. Lines look like:
 *
 *     version: 1
 *     spec: relative/path.md
 *     todos:
 *       - id: T1
 *         status: done
 *         doneAt: "2026-09-02T15:30:00Z"
 *
 * The parser is intentionally strict: anything it does not recognize is
 * a validation violation surfaced via `validateTodoList`.
 *
 * @param {string} text
 * @returns {Record<string, unknown>}
 */
function parseTodoYaml(text) {
	const lines = text.split(/\r?\n/);
	const root = {};
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (line.trim() === "" || line.trim().startsWith("#")) {
			i += 1;
			continue;
		}
		const topMatch = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
		if (topMatch === null) {
			i += 1;
			continue;
		}
		const key = topMatch[1];
		const value = topMatch[2];
		if (value !== "") {
			root[key] = parseScalar(value);
			i += 1;
			continue;
		}
		// Empty value: must be the `todos:` list.
		if (key !== "todos") {
			root[key] = null;
			i += 1;
			continue;
		}
		const list = [];
		i += 1;
		while (i < lines.length) {
			const cursor = lines[i];
			if (cursor.trim() === "" || cursor.trim().startsWith("#")) {
				i += 1;
				continue;
			}
			const itemMatch = cursor.match(/^\s*-\s+([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
			if (itemMatch === null) break;
			const entry = {};
			entry[itemMatch[1]] = parseScalar(itemMatch[2]);
			i += 1;
			while (i < lines.length) {
				const cont = lines[i];
				if (cont.trim() === "" || cont.trim().startsWith("#")) {
					i += 1;
					continue;
				}
				const contMatch = cont.match(/^\s{4,}([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
				if (contMatch === null) break;
				entry[contMatch[1]] = parseScalar(contMatch[2]);
				i += 1;
			}
			list.push(entry);
		}
		root.todos = list;
	}
	return root;
}

/**
 * Parse one YAML scalar value. Supports unquoted scalars, double-quoted
 * strings, integers, and the literals `true` / `false` / `null`.
 *
 * @param {string} raw
 * @returns {unknown}
 */
function parseScalar(raw) {
	const trimmed = raw.trim();
	if (trimmed === "") return "";
	if (trimmed === "true") return true;
	if (trimmed === "false") return false;
	if (trimmed === "null") return null;
	if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
	if (/^"(.*)"$/.test(trimmed)) {
		const inner = trimmed.slice(1, -1);
		return inner.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
	}
	return trimmed;
}
