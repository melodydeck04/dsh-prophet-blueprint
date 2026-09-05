/**
 * Tests for the `architect-feature` Skill bundle. Verifies frontmatter, file
 * presence, body content (the five implementation module families and the
 * parent-Feature read path), and that no backing module function is added.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const SKILL_PATH = join(ROOT, "skills", "architect-feature", "SKILL.md");
const BACKING_PATH = join(ROOT, "lib", "skills", "backing-modules.js");

test("architect-feature SKILL.md exists", async () => {
	const info = await stat(SKILL_PATH);
	assert.ok(info.isFile(), `expected ${SKILL_PATH} to be a file`);
});

test("architect-feature frontmatter is kebab-case, model-invocable, and user-invocable", async () => {
	const text = await readFile(SKILL_PATH, "utf8");
	assert.match(text, /^---\nname: architect-feature\b/);
	assert.match(text, /^description: [^\n]+\n/m);
	assert.match(text, /^description:[^\n]*auto-fire[^\n]*\n/m);
	assert.doesNotMatch(text, /^disable-model-invocation: true\b/m);
});

test("architect-feature body names the five implementation module families", async () => {
	const text = await readFile(SKILL_PATH, "utf8");
	assert.match(text, /artifact I\/O/);
	assert.match(text, /refinement engine/);
	assert.match(text, /truth & verification/);
	assert.match(text, /surface & plugin entry/);
	assert.match(text, /user-facing docs/);
});

test("architect-feature body names the parent-Feature read path", async () => {
	const text = await readFile(SKILL_PATH, "utf8");
	assert.match(text, /\.blueprint\/features\/<parent-id>\.md/);
	assert.match(text, /\.blueprint\/features\/\*\*/);
	assert.match(text, /\.blueprint\/features\/<parent-id>\.children\/\*\*/);
});

test("architect-feature body lists at least two auto-fire trigger contexts", async () => {
	const text = await readFile(SKILL_PATH, "utf8");
	assert.match(text, /module boundar/);
	assert.match(text, /decomposing/);
});

test("architect-feature Skill has no backing module function", async () => {
	const backing = await readFile(BACKING_PATH, "utf8");
	assert.doesNotMatch(backing, /\barchitectFeature\b/);
});