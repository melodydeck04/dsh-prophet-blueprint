import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { applySpecLifecycleTransition } from "../lib/assistant-actions.js";
import { initBlueprint } from "../lib/init.js";
import { evaluateLifecycleRegressions } from "../lib/scan.js";
import { getBlueprintDashboard, handleBlueprintAction, saveBlueprintFeature } from "../lib/web-api.js";

const BRIEF_EN = `# Search

English | [中文](search.zh.md)

## What it does

Searches registered project content.

## Expected result

A matching result is visible.

## How to use

Enter a literal query and submit it.

## Usage notes

An empty query is rejected.
`;

const BRIEF_ZH = `# 搜索

[English](search.md) | 中文

## 实现什么

搜索已登记的项目内容。

## 最终效果

显示匹配结果。

## 怎么使用

输入字面查询并提交。

## 注意事项

拒绝空查询。
`;

const SPEC_EN = `# Spec: Search

Status: proposed
Feature: search

## Problem

Search is absent.

## Scope

- allow: \`src/search/**\`

## Proposal

Add literal search.

## Alternatives considered

Keep browsing manually; rejected because it does not meet the user outcome.

## Acceptance criteria

- AC-SEARCH-1: A literal query returns a visible match.

## Verification

- AC-SEARCH-1: test: \`tests/search.test.js\`

## Risks

Large projects may require later indexing.
`;

const SPEC_ZH = `# 规格：搜索

状态：提议
功能：search

## 问题

目前没有搜索。

## 范围

- 允许：\`src/search/**\`

## 方案

增加字面搜索。

## 其他方案

继续手工浏览；因无法满足用户结果而不采用。

## 验收条件

- AC-SEARCH-1：字面查询返回可见匹配项。

## 验证

- AC-SEARCH-1：测试：\`tests/search.test.js\`

## 风险

大型项目以后可能需要索引。
`;

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "blueprint-assistant-actions-"));
	await initBlueprint(root);
	await writeFile(join(root, "README.md"), "# Fixture\n", "utf8");
	await writeFile(join(root, "DESIGN.md"), "# Design\n", "utf8");
	const saved = await saveBlueprintFeature({
		cwd: root,
		feature: { localKey: "search", title: "Search", status: "planned", parentId: null, summary: "Find project content.", scope: ["src/search/**"], documents: [{ level: "required", path: "README.md" }], acceptance: ["A result is visible."], notes: "" },
		expectedHash: null,
	});
	await handleBlueprintAction({ action: "prepare", cwd: root, featureId: "search", expectedFeatureHash: saved.hash });
	return root;
}

function patchFrom(feature, overrides = {}) {
	return {
		featureId: feature.id,
		files: [
			{ file: feature.artifacts.brief.en.file, expectedHash: feature.artifacts.brief.en.hash, content: BRIEF_EN },
			{ file: feature.artifacts.brief.zh.file, expectedHash: feature.artifacts.brief.zh.hash, content: BRIEF_ZH },
			{ file: feature.artifacts.spec.en.file, expectedHash: feature.artifacts.spec.en.hash, content: SPEC_EN },
			{ file: feature.artifacts.spec.zh.file, expectedHash: feature.artifacts.spec.zh.hash, content: SPEC_ZH },
		],
		...overrides,
	};
}

test("Spec assistant action previews and atomically applies only four registered bilingual artifacts", async () => {
	const root = await fixture();
	let dashboard = await getBlueprintDashboard(root);
	let search = dashboard.catalog.features[0];
	const patch = patchFrom(search);
	const preview = await handleBlueprintAction({ action: "assistant-spec-preview", cwd: root, patch });
	assert.equal(preview.preview.files.length, 4);
	assert.deepEqual(preview.preview.files.map((entry) => entry.file).sort(), patch.files.map((entry) => entry.file).sort());
	assert.match(preview.preview.previewHash, /^[a-f0-9]{64}$/);
	await assert.rejects(handleBlueprintAction({ action: "assistant-spec-apply", cwd: root, patch, expectedPreviewHash: preview.preview.previewHash }), (error) => error.code === "BILINGUAL_CONFIRMATION_REQUIRED");
	const applied = await handleBlueprintAction({ action: "assistant-spec-apply", cwd: root, patch, expectedPreviewHash: preview.preview.previewHash, confirmBilingual: true });
	assert.equal(applied.applied.featureId, "search");
	assert.equal(await readFile(join(root, "docs", "user", "features", "search.md"), "utf8"), BRIEF_EN);
	assert.equal(await readFile(join(root, ".specs", "proposed", "search.zh.md"), "utf8"), SPEC_ZH);
	dashboard = applied.dashboard;
	search = dashboard.catalog.features[0];
	assert.equal(search.workflow.stage, "ready");
	assert.equal(search.workflow.internalStage, "review");
	assert.match(await readFile(join(root, "docs", "user", "features", "search.i18n.yaml"), "utf8"), /search\.zh\.md: [a-f0-9]{40}/);
	await assert.rejects(handleBlueprintAction({ action: "assistant-spec-preview", cwd: root, patch }), /changed after the assistant read it/);
});

test("Spec assistant action rejects unregistered paths and malformed lifecycle content", async () => {
	const root = await fixture();
	const feature = (await getBlueprintDashboard(root)).catalog.features[0];
	const outside = patchFrom(feature);
	outside.files[0] = { ...outside.files[0], file: ".blueprint/features/search.md" };
	await assert.rejects(handleBlueprintAction({ action: "assistant-spec-preview", cwd: root, patch: outside }), /outside the selected Feature's registered/);
	const implemented = patchFrom(feature);
	implemented.files[2] = { ...implemented.files[2], content: SPEC_EN.replace("Status: proposed", "Status: implemented") };
	await assert.rejects(handleBlueprintAction({ action: "assistant-spec-preview", cwd: root, patch: implemented }), /required validation issue|must remain proposed/);
});

test("supported lifecycle transition validates the destination before removing the proposed source", async () => {
	const root = await fixture();
	let feature = (await getBlueprintDashboard(root)).catalog.features[0];
	const patch = patchFrom(feature);
	const preview = await handleBlueprintAction({ action: "assistant-spec-preview", cwd: root, patch });
	await handleBlueprintAction({ action: "assistant-spec-apply", cwd: root, patch, expectedPreviewHash: preview.preview.previewHash, confirmBilingual: true });
	feature = (await getBlueprintDashboard(root)).catalog.features[0];
	const implementedEn = SPEC_EN
		.replace("Status: proposed", "Status: implemented")
		.replace("## Proposal", "## Decision")
		.replace("## Acceptance criteria\n\n- AC-SEARCH-1: A literal query returns a visible match.\n\n", "")
		.replace("## Risks", "## Consequences");
	const implementedZh = SPEC_ZH.replace("状态：提议", "状态：已实现").replace("## 方案", "## 决策").replace("## 验收条件\n\n- AC-SEARCH-1：字面查询返回可见匹配项。\n\n", "").replace("## 风险", "## 后果");
	const moved = await applySpecLifecycleTransition({ cwd: root, sourceFile: feature.workflow.spec.file, targetLifecycle: "implemented", expectedSourceHash: feature.workflow.spec.hash, englishContent: implementedEn, chineseContent: implementedZh });
	assert.deepEqual(moved.destination, [".specs/implemented/search.md", ".specs/implemented/search.zh.md"]);
	await assert.rejects(readFile(join(root, ".specs", "proposed", "search.md"), "utf8"), /ENOENT/);
	assert.match(await readFile(join(root, ".specs", "implemented", "search.md"), "utf8"), /^Status: implemented$/m);
	await assert.rejects(applySpecLifecycleTransition({ cwd: root, sourceFile: ".specs/implemented/search.md", targetLifecycle: "rejected", expectedSourceHash: "0".repeat(64), englishContent: implementedEn, chineseContent: implementedZh }), /must start from one English proposed Spec/);
});

test("staged lifecycle policy detects implemented-to-rejected rename and delete/add evidence", () => {
	const root = ".specs";
	const renamed = evaluateLifecycleRegressions([{ status: "R100", oldPath: ".specs/implemented/search.md", path: ".specs/rejected/search.md" }], root);
	assert.equal(renamed.length, 1);
	assert.equal(renamed[0].check, "spec-lifecycle-regression");
	const paired = evaluateLifecycleRegressions([{ status: "D", path: ".specs/implemented/search.md" }, { status: "A", path: ".specs/rejected/search.md" }], root);
	assert.equal(paired.length, 1);
	assert.deepEqual(evaluateLifecycleRegressions([{ status: "A", path: ".specs/rejected/unrelated.md" }], root), []);
});
