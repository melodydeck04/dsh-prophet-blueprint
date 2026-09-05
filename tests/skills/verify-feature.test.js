/**
 * Tests for the `verify-feature` Skill bundle. Verifies frontmatter, file
 * presence, and that the body references the documented backing module.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const SKILL_PATH = join(ROOT, "skills", "verify-feature", "SKILL.md");

test("verify-feature SKILL.md exists", async () => {
	const info = await stat(SKILL_PATH);
	assert.ok(info.isFile(), `expected ${SKILL_PATH} to be a file`);
});

test("verify-feature frontmatter is user-invocable and kebab-case named", async () => {
	const text = await readFile(SKILL_PATH, "utf8");
	assert.match(text, /^---\nname: verify-feature\b/);
	assert.match(text, /^user-invocable: true\b/m);
	assert.match(text, /^description: [^\n]+\n/m);
});

test("verify-feature body references its backing module", async () => {
	const text = await readFile(SKILL_PATH, "utf8");
	assert.match(text, /lib\/skills\/backing-modules\.js#verifyFeature/);
});