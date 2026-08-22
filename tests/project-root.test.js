import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveBlueprintRoot } from "../lib/project-root.js";
import { scan } from "../lib/scan.js";

test("Blueprint root is found upward from a nested DSH workspace", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-root-"));
	const nested = join(root, "packages", "app");
	await mkdir(nested, { recursive: true });
	await writeFile(join(root, "design-blueprint.json"), "{}\n", "utf8");
	assert.equal(await resolveBlueprintRoot(nested), root);
});

test("an unrelated startup directory is rejected before a working-tree walk", async () => {
	const unrelated = await mkdtemp(join(tmpdir(), "blueprint-unrelated-"));
	await assert.rejects(scan({ cwd: unrelated, all: true }), (error) => {
		assert.equal(error.code, "BLUEPRINT_PROJECT_NOT_FOUND");
		assert.match(error.message, /No design-blueprint\.json/);
		return true;
	});
});
