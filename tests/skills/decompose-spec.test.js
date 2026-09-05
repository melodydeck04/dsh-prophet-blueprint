/**
 * Tests for the `decompose-spec` Skill bundle. Verifies frontmatter, file
 * presence, and that the body references the documented backing module.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const SKILL_PATH = join(ROOT, "skills", "decompose-spec", "SKILL.md");

test("decompose-spec SKILL.md exists", async () => {
	const info = await stat(SKILL_PATH);
	assert.ok(info.isFile(), `expected ${SKILL_PATH} to be a file`);
});

test("decompose-spec frontmatter is model-invocable and kebab-case named", async () => {
	const text = await readFile(SKILL_PATH, "utf8");
	assert.match(text, /^---\nname: decompose-spec\b/);
	assert.doesNotMatch(text, /^disable-model-invocation:\s*true\b/m, "decompose-spec must be model-invocable (no disable-model-invocation flag)");
	assert.doesNotMatch(text, /^user-invocable:\s*false\b/m, "decompose-spec must remain user-invocable");
	assert.match(text, /^description: [^\n]+\n/m);
});

test("decompose-spec body references its backing module", async () => {
	const text = await readFile(SKILL_PATH, "utf8");
	assert.match(text, /lib\/skills\/backing-modules\.js#decomposeSpec/);
});