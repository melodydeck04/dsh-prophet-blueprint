import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { loadSpecs, parseSpec } from "../lib/specs.js";
import { loadConfig } from "../lib/config.js";
import { initBlueprint } from "../lib/init.js";
import { workingTreeSnapshot } from "../lib/snapshot.js";
import { resolveTargetSha } from "../lib/stamps.js";

const VALID_PROPOSED = `# Spec: Add a feature

Status: proposed

## Problem
One observable problem exists.

## Scope
- allow: \`lib/**\`
- deny: \`lib/generated/**\`

## Proposal
Implement the bounded change.

## Alternatives considered
**Do nothing.** Rejected because the problem remains.

## Acceptance criteria
- AC-1: The behavior is observable.

## Verification
- AC-1: test: \`tests/feature.test.js\`

## Risks
The implementation may expose a compatibility issue.
`;

test("proposed specs expose scope and paired acceptance evidence", () => {
	const result = parseSpec(".specs/proposed/feature.md", VALID_PROPOSED, ".specs");
	assert.deepEqual(result.issues, []);
	assert.deepEqual(result.spec.scope, { allow: ["lib/**"], deny: ["lib/generated/**"] });
	assert.equal(result.spec.acceptance.get("AC-1"), "The behavior is observable.");
	assert.equal(result.spec.verification.get("AC-1"), "test: `tests/feature.test.js`");
	assert.equal(result.spec.changePackage.version, 1);
	assert.equal(result.spec.changePackage.verification.targets[0].surface, "repository");
	assert.equal(result.spec.changePackage.verification.targets[0].declared, false);
});

test("canonical Change Package parses structural design, traceability, and declared progressive Web evidence", () => {
	const text = VALID_PROPOSED
		.replace("Implement the bounded change.", [
			"- REQ-STREAM-1: Stream results into the real Web UI.",
			"- Given a delayed response When the first chunk arrives Then the page updates before completion.",
			"- TASK-STREAM-1: Implement the API stream and browser adapter for REQ-STREAM-1.",
			"",
			"## Technical design",
			"",
			"The asynchronous API contract crosses a component boundary and owns retry behavior.",
		].join("\n"))
		.replace("- AC-1: The behavior is observable.", "- AC-1: REQ-STREAM-1 updates the Web UI before the final result.")
		.replace("- AC-1: test: `tests/feature.test.js`", "- AC-1: [surface=web-ui; moment=progressive; evidence=user-visible] real browser scenario");
	const { spec, issues } = parseSpec(".specs/proposed/stream.md", text, ".specs");
	assert.deepEqual(issues, []);
	assert.equal(spec.changePackage.design.required, true);
	assert.equal(spec.changePackage.design.present, true);
	assert.ok(spec.changePackage.impact.structuralRisk.includes("public-contract"));
	assert.deepEqual(spec.changePackage.intent.requirements.map((entry) => entry.id), ["REQ-STREAM-1"]);
	assert.deepEqual(spec.changePackage.execution.tasks[0].requirementIds, ["REQ-STREAM-1"]);
	assert.deepEqual(spec.changePackage.traceability.rows[0].requirementIds, ["REQ-STREAM-1"]);
	assert.deepEqual(spec.changePackage.verification.targets[0], {
		id: "AC-1",
		requirementIds: ["REQ-STREAM-1"],
		surface: "web-ui",
		moment: "progressive",
		minimumEvidence: "user-visible",
		declared: true,
		entryPoint: null,
		trigger: null,
		oracle: "REQ-STREAM-1 updates the Web UI before the final result.",
		procedure: "[surface=web-ui; moment=progressive; evidence=user-visible] real browser scenario",
	});
});

test("lifecycle directory and Status must agree", () => {
	const result = parseSpec(".specs/implemented/feature.md", VALID_PROPOSED, ".specs");
	assert.ok(result.issues.some((issue) => issue.check === "spec-lifecycle"));
});

test("a Chinese counterpart is attached instead of parsed as a second Spec", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-bilingual-spec-"));
	await initBlueprint(root);
	await writeFile(join(root, ".specs", "proposed", "feature.md"), VALID_PROPOSED, "utf8");
	await writeFile(join(root, ".specs", "proposed", "feature.zh.md"), "# 规格：新增功能\n\n## 问题\n\n需要新增功能。\n", "utf8");
	const snapshot = await workingTreeSnapshot(root);
	const { config } = await loadConfig(snapshot);
	const loaded = await loadSpecs(snapshot, config);
	const spec = loaded.specs.find((entry) => entry.file === ".specs/proposed/feature.md");
	assert.ok(spec);
	assert.equal(loaded.specs.some((entry) => entry.file.endsWith(".zh.md")), false);
	assert.equal(spec.languages.zh.file, ".specs/proposed/feature.zh.md");
	assert.match(spec.languages.zh.content, /需要新增功能/);
	assert.notEqual(spec.reviewHash, spec.contentHash);
});

test("the Web dashboard Feature-linked Spec is a visible single-language pair", async () => {
	const root = fileURLToPath(new URL("..", import.meta.url));
	const snapshot = await workingTreeSnapshot(root);
	const { config } = await loadConfig(snapshot);
	const loaded = await loadSpecs(snapshot, config);
	const spec = loaded.specs.find((entry) => entry.file === ".specs/implemented/feature-approval-workflow-and-diagram.md");
	assert.ok(spec);
	assert.equal(spec.featureId, "web-dashboard");
	assert.equal(spec.languages.zh?.file, ".specs/implemented/feature-approval-workflow-and-diagram.zh.md");
	assert.doesNotMatch(spec.languages.en.content, /[\u4e00-\u9fff]/);
	assert.match(spec.languages.zh.content, /开发者直接审批闸门/);
});

test("stamp targets cannot escape their repository root", async () => {
	const parent = await mkdtemp(join(tmpdir(), "design-blueprint-stamp-"));
	const root = join(parent, "repo");
	await mkdir(root);
	await writeFile(join(parent, "outside.txt"), "secret", "utf8");
	const result = resolveTargetSha("../outside.txt", root);
	assert.equal(result.exists, false);
	assert.match(result.error, /escapes the repository root/);
});
