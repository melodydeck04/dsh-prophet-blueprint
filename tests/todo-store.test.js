import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTodoList, saveTodoList, validateTodoList, TodoSchemaError } from "../lib/todo-store.js";

async function tempRoot() {
	const root = await mkdtemp(join(tmpdir(), "blueprint-todo-store-"));
	return root;
}

test("saveTodoList round-trips a well-formed list", async () => {
	const root = await tempRoot();
	try {
		const path = join(root, "spec.todos.yaml");
		const list = {
			version: 1,
			spec: ".specs/proposed/foo.md",
			createdAt: "2026-09-02T15:00:00Z",
			createdBy: "session-abc",
			todos: [
				{ id: "T1", status: "done", req: "REQ-X-1", ac: "AC-X-001", title: "first", doneAt: "2026-09-02T15:30:00Z", doneBy: "session-abc" },
				{ id: "T2", status: "in-progress", req: "REQ-X-2", ac: "AC-X-002", title: "second" },
			],
		};
		const saveResult = await saveTodoList(path, list);
		assert.deepEqual(saveResult.violations, []);
		const loaded = await loadTodoList(path);
		assert.deepEqual(loaded, list);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("loadTodoList returns null on missing file", async () => {
	const root = await tempRoot();
	try {
		const result = await loadTodoList(join(root, "absent.todos.yaml"));
		assert.equal(result, null);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("validateTodoList reports a duplicate id", () => {
	const list = {
		version: 1,
		spec: ".specs/proposed/foo.md",
		createdAt: "2026-09-02T15:00:00Z",
		createdBy: "session-abc",
		todos: [
			{ id: "T1", status: "pending", req: "REQ-X-1", ac: "AC-X-001", title: "first" },
			{ id: "T1", status: "pending", req: "REQ-X-2", ac: "AC-X-002", title: "dup" },
		],
	};
	const violations = validateTodoList(list);
	assert.ok(violations.some((entry) => entry.code === "duplicate-id"));
});

test("validateTodoList reports an unknown status", () => {
	const list = {
		version: 1,
		spec: ".specs/proposed/foo.md",
		createdAt: "2026-09-02T15:00:00Z",
		createdBy: "session-abc",
		todos: [{ id: "T1", status: "blocked", req: "REQ-X-1", ac: "AC-X-001", title: "first" }],
	};
	const violations = validateTodoList(list);
	assert.ok(violations.some((entry) => entry.code === "status"));
});

test("saveTodoList refuses to write a list that does not validate", async () => {
	const root = await tempRoot();
	try {
		const path = join(root, "spec.todos.yaml");
		const list = {
			version: 1,
			spec: ".specs/proposed/foo.md",
			createdAt: "2026-09-02T15:00:00Z",
			createdBy: "session-abc",
			todos: [{ id: "T1", status: "pending", req: "", ac: "AC-X-001", title: "first" }],
		};
		const result = await saveTodoList(path, list);
		assert.ok(result.violations.some((entry) => entry.code === "req"));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("loadTodoList throws TodoSchemaError on a malformed YAML", async () => {
	const root = await tempRoot();
	try {
		const path = join(root, "spec.todos.yaml");
		await writeFile(path, "version: 1\nspec: x\ncreatedAt: now\ncreatedBy: me\ntodos:\n  - id: T1\n    status: bogus\n    req: r\n    ac: a\n    title: t\n", "utf8");
		await assert.rejects(loadTodoList(path), TodoSchemaError);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
