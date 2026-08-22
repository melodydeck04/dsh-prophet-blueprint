import test from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { initBlueprint } from "../lib/init.js";
import { scan } from "../lib/scan.js";
import { serializeComponent } from "../lib/architecture.js";

const execFile = promisify(execFileCallback);

async function git(root, ...args) {
	return execFile("git", ["-C", root, ...args], { windowsHide: true });
}

const PROPOSED = `# Spec: Staged scope

Status: proposed

## Problem
One feature is absent.

## Scope
- allow: \`lib/**\`

## Proposal
Add the feature inside lib.

## Alternatives considered
**Change package metadata.** Rejected because it does not implement the feature.

## Acceptance criteria
- AC-1: The feature module exists.

## Verification
- AC-1: test: \`tests/feature.test.js\`

## Risks
The new module may need later integration.
`;

test("the scanner evaluates the exact staged snapshot and enforces one spec owner", async () => {
	const root = await mkdtemp(join(tmpdir(), "design-blueprint-git-"));
	await git(root, "init");
	await git(root, "config", "user.email", "test@example.com");
	await git(root, "config", "user.name", "Blueprint Test");
	await initBlueprint(root);
	await git(root, "add", ".");
	await git(root, "commit", "-m", "initial");

	await mkdir(join(root, ".specs", "proposed"), { recursive: true });
	await mkdir(join(root, "lib"), { recursive: true });
	await writeFile(join(root, ".specs", "proposed", "feature.md"), PROPOSED, "utf8");
	await writeFile(join(root, "lib", "feature.js"), "export const feature = true;\n", "utf8");
	await git(root, "add", ".specs/proposed/feature.md", "lib/feature.js");

	const covered = await scan({ cwd: root });
	assert.equal(covered.source, "git-index");
	assert.equal(covered.issues.filter((issue) => issue.severity === "required").length, 0);

	await writeFile(join(root, "package.json"), "{}\n", "utf8");
	await git(root, "add", "package.json");
	const expanded = await scan({ cwd: root });
	assert.ok(expanded.issues.some((issue) => issue.check === "spec-scope-coverage" && issue.file === "package.json"));
});

test("architecture-only planning is permitted because .blueprint/architecture is excluded from requireSpecFor", async () => {
	const root = await mkdtemp(join(tmpdir(), "design-blueprint-git-arch-"));
	await git(root, "init");
	await git(root, "config", "user.email", "test@example.com");
	await git(root, "config", "user.name", "Blueprint Test");
	await initBlueprint(root);
	await git(root, "add", ".");
	await git(root, "commit", "-m", "initial");
	await mkdir(join(root, ".blueprint", "architecture", "components"), { recursive: true });
	await writeFile(join(root, ".blueprint", "architecture", "components", "backend.md"), serializeComponent({
		id: "backend",
		title: "Backend",
		kind: "service",
		containerId: null,
		deployment: "primary",
		status: "planned",
		summary: "Hosts the JSON API.",
		ownedPaths: ["lib/api/**"],
		contracts: ["/api/v1/users"],
		dependencies: [],
		supportedFeatures: [],
		documents: [{ level: "required", path: "DESIGN.md" }],
	}), "utf8");
	await writeFile(join(root, "README.md"), "# Project\n", "utf8");
	await writeFile(join(root, "DESIGN.md"), "# Design\n", "utf8");
	await git(root, "add", ".blueprint/architecture/components/backend.md", "README.md", "DESIGN.md");
	const audit = await scan({ cwd: root });
	assert.equal(audit.source, "git-index");
	assert.equal(audit.issues.filter((issue) => issue.severity === "required" && issue.check === "spec-scope-coverage" && issue.file.endsWith("backend.md")).length, 0);
	assert.ok(audit.architecture.total >= 1);
});
