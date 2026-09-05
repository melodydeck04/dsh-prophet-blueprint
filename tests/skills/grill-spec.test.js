/**
 * Tests for the `grill-spec` Skill bundle. Verifies frontmatter, file
 * presence, and that the body references the documented backing module.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const SKILL_PATH = join(ROOT, "skills", "grill-spec", "SKILL.md");

test("grill-spec SKILL.md exists", async () => {
	const info = await stat(SKILL_PATH);
	assert.ok(info.isFile(), `expected ${SKILL_PATH} to be a file`);
});

test("grill-spec frontmatter is user-invocable and kebab-case named", async () => {
	const text = await readFile(SKILL_PATH, "utf8");
	assert.match(text, /^---\nname: grill-spec\b/);
	assert.match(text, /^user-invocable: true\b/m);
	assert.match(text, /^description: [^\n]+\n/m);
	assert.doesNotMatch(text, /^disable-model-invocation: true\b/m);
});

test("grill-spec description contains auto-fire phrase and the four-gate interview keywords", async () => {
	const text = await readFile(SKILL_PATH, "utf8");
	assert.match(text, /^description:[^\n]*auto-fire[^\n]*\n/m);
	assert.match(text, /\bdefaults\b/);
	assert.match(text, /\bpersistence\b/);
	assert.match(text, /\bsurface\b/);
	assert.match(text, /\bscope\b/);
	assert.match(text, /\brisks\b/);
});

test("grill-spec body references its backing module", async () => {
	const text = await readFile(SKILL_PATH, "utf8");
	assert.match(text, /lib\/skills\/backing-modules\.js#grillSpecInterview/);
});