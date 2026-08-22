import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initBlueprint } from "../lib/init.js";
import { scan } from "../lib/scan.js";

test("initialization creates a structurally ready governance baseline", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-init-ready-"));
	const result = await initBlueprint(root);
	assert.ok(result.created.includes("README.md"));
	assert.ok(result.created.includes("README.zh.md"));
	assert.ok(result.created.includes("DESIGN.md"));
	assert.ok(result.created.includes("docs/AGENTS.md"));
	assert.ok(result.created.includes(".specs/implemented/blueprint-adoption.md"));
	const audit = await scan({ cwd: root, all: true });
	assert.equal(audit.issues.filter((entry) => entry.severity === "required").length, 0);
});

test("initialization never overwrites an existing public contract", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-init-preserve-"));
	await writeFile(join(root, "README.md"), "# Existing product\n", "utf8");
	await initBlueprint(root);
	assert.equal(await readFile(join(root, "README.md"), "utf8"), "# Existing product\n");
});
