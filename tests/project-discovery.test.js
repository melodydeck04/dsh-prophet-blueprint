import test from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join, parse } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { discoverBlueprintProjects } from "../lib/project-discovery.js";

const execFile = promisify(execFileCallback);

test("an unconfigured Git worktree is an eligible one-click target", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-discovery-git-"));
	await execFile("git", ["-C", root, "init"], { windowsHide: true });
	const discovery = await discoverBlueprintProjects(root);
	assert.equal(discovery.candidate.path, root);
	assert.equal(discovery.candidate.reason, "git");
});

test("an outer container is not eligible and only reports direct project hints", async () => {
	const outer = await mkdtemp(join(tmpdir(), "blueprint-discovery-outer-"));
	const project = join(outer, "application");
	const backup = join(outer, "backup");
	await mkdir(project);
	await mkdir(backup);
	await execFile("git", ["-C", project, "init"], { windowsHide: true });
	await writeFile(join(backup, "README.md"), "not a strong project marker\n", "utf8");
	const discovery = await discoverBlueprintProjects(outer);
	assert.equal(discovery.candidate, null);
	assert.equal(discovery.manualCandidate.path, outer);
	assert.deepEqual(discovery.hints.map((entry) => entry.name), ["application"]);
});

test("an empty or generic starter workspace is available only as a confirmation target", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-discovery-starter-"));
	let discovery = await discoverBlueprintProjects(root);
	assert.equal(discovery.candidate, null);
	assert.equal(discovery.manualCandidate.path, root);
	assert.equal(discovery.manualCandidate.reason, "developer-confirmation");
	await writeFile(join(root, "README.md"), "# Starter\n", "utf8");
	await writeFile(join(root, ".gitignore"), "node_modules/\n", "utf8");
	discovery = await discoverBlueprintProjects(root);
	assert.equal(discovery.candidate, null);
	assert.equal(discovery.manualCandidate.path, root);
	assert.ok(discovery.projectMarkers.includes("package.json"));
});

test("a filesystem root is never available as a manual initialization target", async () => {
	const temporary = await mkdtemp(join(tmpdir(), "blueprint-discovery-root-"));
	const discovery = await discoverBlueprintProjects(parse(temporary).root);
	assert.equal(discovery.manualCandidate, null);
});
