/**
 * Tests for the `design-blueprint skills <list|show|info>` subcommand and
 * the related `package.json` surface.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { runSkillsCommand } from "../lib/skills/cli.js";
import { backingModuleFor } from "../lib/skills/backing-modules.js";

const exec = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const CLI = join(ROOT, "lib", "cli.js");

test("package.json declares skills in files, exports, and lint:js", async () => {
	const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
	assert.ok(Array.isArray(pkg.files), "package.json#files must be an array");
	assert.ok(pkg.files.includes("skills/**"), "package.json#files must include 'skills/**'");
	const exports = pkg.exports ?? {};
	assert.ok("./skills/*" in exports, "package.json#exports must declare './skills/*'");
	const lint = pkg.scripts?.lint ?? pkg.scripts?.["lint:js"] ?? "";
	assert.match(lint, /lib\/skills\/backing-modules\.js/);
	assert.match(lint, /lib\/skills\/cli\.js/);
});

test("backingModuleFor returns the right module for each Skill", () => {
	assert.equal(backingModuleFor("decompose-spec"), "lib/skills/backing-modules.js#decomposeSpec");
	assert.equal(backingModuleFor("todo-status"), "lib/skills/backing-modules.js#todoStatus");
	assert.equal(backingModuleFor("verify-feature"), "lib/skills/backing-modules.js#verifyFeature");
	assert.equal(backingModuleFor("grill-spec"), "lib/skills/backing-modules.js#grillSpecInterview");
	assert.equal(backingModuleFor("handoff-spec"), "lib/skills/backing-modules.js#writeHandoffDoc");
	assert.equal(backingModuleFor("nonexistent"), null);
});

test("runSkillsCommand rejects unknown actions", async () => {
	await assert.rejects(() => runSkillsCommand({ positional: ["bogus"], flags: {} }, ROOT), /unknown skills action/);
});

test("runSkillsCommand requires a name for show and info", async () => {
	await assert.rejects(() => runSkillsCommand({ positional: ["show"], flags: {} }, ROOT), /show requires a Skill name/);
	await assert.rejects(() => runSkillsCommand({ positional: ["info"], flags: {} }, ROOT), /info requires a Skill name/);
});

test("design-blueprint skills list exits 0 and prints a Markdown table", async () => {
	const result = await exec("node", [CLI, "skills", "list"], { cwd: ROOT });
	assert.equal(result.stderr, "", `stderr should be empty: ${result.stderr}`);
	assert.equal(result.stdout.includes("| name |"), true, "list output should include the table header");
	assert.equal(result.stdout.includes("decompose-spec"), true, "list output should include 'decompose-spec'");
	assert.equal(result.stdout.includes("todo-status"), true, "list output should include 'todo-status'");
	assert.equal(result.stdout.includes("verify-feature"), true);
	assert.equal(result.stdout.includes("grill-spec"), true);
	assert.equal(result.stdout.includes("handoff-spec"), true);
});

test("design-blueprint skills list --json prints JSON", async () => {
	const result = await exec("node", [CLI, "skills", "list", "--json"], { cwd: ROOT });
	const parsed = JSON.parse(result.stdout);
	assert.ok(Array.isArray(parsed.skills));
	assert.ok(parsed.skills.length >= 5, `expected at least 5 skills, got ${parsed.skills.length}`);
	const names = parsed.skills.map((entry) => entry.name);
	assert.ok(names.includes("decompose-spec"));
	assert.ok(names.includes("todo-status"));
	assert.ok(names.includes("verify-feature"));
	assert.ok(names.includes("grill-spec"));
	assert.ok(names.includes("handoff-spec"));
});

test("design-blueprint skills show <name> prints the Skill body with line numbers", async () => {
	const result = await exec("node", [CLI, "skills", "show", "decompose-spec"], { cwd: ROOT });
	assert.equal(result.stderr, "");
	assert.equal(result.stdout.includes("decompose-spec"), true);
	assert.equal(result.stdout.includes("backing-modules.js#decomposeSpec"), true);
	assert.match(result.stdout, /^\s*1\s+/m, "show output should include line numbers");
});

test("design-blueprint skills info <name> prints invocation policy and backing module", async () => {
	const result = await exec("node", [CLI, "skills", "info", "decompose-spec"], { cwd: ROOT });
	assert.equal(result.stderr, "");
	assert.match(result.stdout, /^name: decompose-spec/m);
	assert.match(result.stdout, /^modelInvocable: true/m);
	assert.match(result.stdout, /^userInvocable: true/m);
	assert.match(result.stdout, /^backingModule: lib\/skills\/backing-modules\.js#decomposeSpec/m);
});

test("design-blueprint skills info verify-feature reports user-invocable", async () => {
	const result = await exec("node", [CLI, "skills", "info", "verify-feature"], { cwd: ROOT });
	assert.equal(result.stderr, "");
	assert.match(result.stdout, /^userInvocable: true/m);
});

test("design-blueprint skills show on a missing Skill exits 1", async () => {
	await assert.rejects(() => exec("node", [CLI, "skills", "show", "definitely-not-a-skill"], { cwd: ROOT }));
});