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
