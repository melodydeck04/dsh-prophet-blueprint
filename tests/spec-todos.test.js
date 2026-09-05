import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveTodoPath, loadTodosForSpec, featureIdForSpecPath } from "../lib/spec-todos.js";

const SAMPLE = `version: 1
spec: .specs/proposed/foo.md
createdAt: 2026-09-02T15:00:00Z
createdBy: session-abc
todos:
  - id: T1
    status: pending
    req: REQ-X-1
    ac: AC-X-001
    title: first
`;

async function tempRoot() {
	const root = await mkdtemp(join(tmpdir(), "blueprint-spec-todos-"));
	return root;
}

test("resolveTodoPath returns null when no sibling .todos.yaml exists", async () => {
	const root = await tempRoot();
	try {
		const result = resolveTodoPath(join(root, "foo.md"));
		assert.equal(result, null);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("resolveTodoPath returns the sibling path when the YAML exists", async () => {
	const root = await tempRoot();
	try {
		await writeFile(join(root, "foo.todos.yaml"), SAMPLE, "utf8");
		const result = resolveTodoPath(join(root, "foo.md"));
		assert.equal(result, join(root, "foo.todos.yaml"));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("resolveTodoPath treats .zh.md as the same Spec", async () => {
	const root = await tempRoot();
	try {
		await writeFile(join(root, "foo.todos.yaml"), SAMPLE, "utf8");
		const result = resolveTodoPath(join(root, "foo.zh.md"));
		assert.equal(result, join(root, "foo.todos.yaml"));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("loadTodosForSpec returns null when the YAML is missing", async () => {
	const root = await tempRoot();
	try {
		const list = await loadTodosForSpec(join(root, "absent.md"));
		assert.equal(list, null);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("loadTodosForSpec loads the sibling list when present", async () => {
	const root = await tempRoot();
	try {
		await writeFile(join(root, "foo.todos.yaml"), SAMPLE, "utf8");
		const list = await loadTodosForSpec(join(root, "foo.md"));
		assert.ok(list !== null);
		assert.equal(list.todos.length, 1);
		assert.equal(list.todos[0].id, "T1");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("featureIdForSpecPath returns the owning Feature id (AC-ACTIVE-001)", async () => {
	const root = await tempRoot();
	try {
		await mkdir(join(root, ".blueprint", "features"), { recursive: true });
		await writeFile(join(root, ".blueprint", "features", "foo.md"),
			"# Feature: Foo\n\nId: foo\nStatus: active\n\n## Summary\n\nFoo.\n\n## Scope\n\n- `tests/fixtures/**`\n\n## Documents\n\n- required: `.specs/proposed/foo.md`\n\n## Acceptance\n\n- Foo exists.\n\n## Notes\n\nNone.\n",
			"utf8");
		const id = featureIdForSpecPath(".specs/proposed/foo.md", root);
		assert.equal(id, "foo");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("featureIdForSpecPath returns null for an unknown Spec (AC-ACTIVE-002)", async () => {
	const root = await tempRoot();
	try {
		await mkdir(join(root, ".blueprint", "features"), { recursive: true });
		const id = featureIdForSpecPath("does-not-exist.md", root);
		assert.equal(id, null);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("featureIdForSpecPath returns null when no Feature tree exists", async () => {
	const root = await tempRoot();
	try {
		const id = featureIdForSpecPath("any.md", root);
		assert.equal(id, null);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
