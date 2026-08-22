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
import { serializeFeature } from "../lib/features.js";

const execFile = promisify(execFileCallback);

async function git(root, ...args) {
	return execFile("git", ["-C", root, ...args], { windowsHide: true });
}

test("scan reports malformed architecture records and broken feature allocations", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-scan-arch-"));
	await initBlueprint(root);
	await mkdir(join(root, ".blueprint", "architecture", "components"), { recursive: true });
	await writeFile(join(root, ".blueprint", "architecture", "components", "broken.md"), "# Component: Broken\n\nKind: service\nStatus: active\n\n## Summary\n\nBroken.\n\n## Owned paths\n\n- lib/**\n\n## Documents\n\n- required: DESIGN.md\n", "utf8");
	await mkdir(join(root, ".blueprint", "features"), { recursive: true });
	await writeFile(join(root, ".blueprint", "features", "accounts.md"), serializeFeature({
		id: "accounts",
		title: "Accounts",
		status: "active",
		parentId: null,
		summary: "Account lifecycle.",
		scope: ["src/accounts/**"],
		documents: [{ level: "required", path: "README.md" }],
		acceptance: [],
		notes: "",
		components: ["missing-component"],
	}), "utf8");
	await writeFile(join(root, "README.md"), "# Project\n", "utf8");
	await writeFile(join(root, "DESIGN.md"), "# Design\n", "utf8");
	const audit = await scan({ cwd: root, all: true });
	const checks = audit.issues.map((issue) => `${issue.check}:${issue.file}`);
	assert.ok(checks.some((entry) => entry.startsWith("component-id:")), "scan must report a malformed component id");
	assert.ok(checks.some((entry) => entry.startsWith("feature-component:")), "scan must report broken feature allocations");
});

test("architecture-only planning remains possible because .blueprint/architecture is excluded from requireSpecFor", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-scan-arch-only-"));
	await initBlueprint(root);
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
	const audit = await scan({ cwd: root, all: true });
	assert.ok(audit.architecture.total >= 1);
	assert.equal(audit.issues.filter((issue) => issue.severity === "required" && issue.check === "spec-scope-coverage" && issue.file.endsWith("backend.md")).length, 0);
});