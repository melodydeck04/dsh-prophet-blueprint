import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, loadConfig } from "../lib/config.js";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { workingTreeSnapshot } from "../lib/snapshot.js";

test("default config exposes architecture and Host verification roots outside implementation coverage", () => {
	assert.equal(DEFAULT_CONFIG.architecture.root, ".blueprint/architecture");
	assert.equal(DEFAULT_CONFIG.features.verificationsRoot, ".blueprint/verifications");
	assert.ok(DEFAULT_CONFIG.changePolicy.allowWithoutSpec.includes(".blueprint/architecture/**"));
	assert.ok(DEFAULT_CONFIG.changePolicy.allowWithoutSpec.includes(".blueprint/verifications/**"));
});

test("loadConfig fills the architecture root when omitted and reports invalid paths", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-config-arch-"));
	await writeFile(join(root, "design-blueprint.json"), JSON.stringify({
		version: 1,
		authority: {
			instructions: ["AGENTS.md"],
			architecture: ["DESIGN.md"],
			publicContracts: ["README.md"],
		},
		features: {},
		documentation: { standards: ["docs/AGENTS.md"], roles: { tutorials: "docs/cookbook/**", references: "docs/reference/**", productGuides: "docs/user/**", decisions: ".specs/**" }, i18n: { enabled: true, include: ["README.md", "docs/**/*.md"], exclude: [], migrationSeverity: "recommended" } },
		architecture: { root: "/abs/architecture" },
	}) + "\n", "utf8");
	const snapshot = await workingTreeSnapshot(root);
	const result = await loadConfig(snapshot);
	assert.ok(result.issues.some((issue) => issue.check === "blueprint-config" && issue.message.includes("architecture.root")));
});

test("loadConfig accepts a custom architecture root and lists it under allowWithoutSpec", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-config-custom-"));
	await writeFile(join(root, "design-blueprint.json"), JSON.stringify({
		version: 1,
		authority: {
			instructions: ["AGENTS.md"],
			architecture: ["DESIGN.md"],
			publicContracts: ["README.md"],
		},
		features: {},
		architecture: { root: "tools/architecture" },
		documentation: { standards: ["docs/AGENTS.md"], roles: { tutorials: "docs/cookbook/**", references: "docs/reference/**", productGuides: "docs/user/**", decisions: ".specs/**" }, i18n: { enabled: true, include: ["README.md", "docs/**/*.md"], exclude: [], migrationSeverity: "recommended" } },
		changePolicy: {
			requireSpecFor: ["**"],
			allowWithoutSpec: ["tools/architecture/**"],
		},
	}) + "\n", "utf8");
	const snapshot = await workingTreeSnapshot(root);
	const result = await loadConfig(snapshot);
	assert.equal(result.config.architecture.root, "tools/architecture");
	assert.deepEqual(result.issues, []);
});
