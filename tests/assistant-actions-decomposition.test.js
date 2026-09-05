import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initBlueprint } from "../lib/init.js";
import { serializeFeature } from "../lib/features.js";
import { previewAssistantSpecPatch, applyAssistantSpecPatch } from "../lib/assistant-actions.js";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "cli.js");

function buildSpecBody({ id, reqCount = 0, scopeLength = 1, lines = 30 }) {
	const reqs = Array.from({ length: reqCount }, (_, i) => `- REQ-${i + 1}: requirement number ${i + 1}`).join("\n");
	const scopes = Array.from({ length: scopeLength }, (_, i) => `- allow: \`lib/foo-${i}.js\``).join("\n");
	const filler = Array.from({ length: Math.max(0, lines - 80) }, () => "# filler heading").join("\n");
	return [
		`# Spec: ${id}`,
		"",
		"Status: proposed",
		`Feature: ${id}`,
		"",
		"## Problem",
		"",
		"P.",
		"",
		"## Scope",
		"",
		"### Allowed paths",
		"",
		scopes,
		"",
		"### Denied paths",
		"",
		"- deny: `lib/blocked.js`",
		"",
		"## Proposal",
		"",
		"P.",
		"",
		"## Alternatives considered",
		"",
		"A.",
		"",
		"## Acceptance criteria",
		"",
		"- AC-1: works.",
		"",
		"## Verification",
		"",
		"- AC-1: manual.",
		"",
		"## Risks",
		"",
		"R.",
		"",
		"## Requirements",
		"",
		reqs,
		"",
		filler,
	].join("\n");
}

async function fixture({ reqCount = 4, scopeLength = 1, lines = 30, thresholds = null } = {}) {
	const root = await mkdtemp(join(tmpdir(), "blueprint-assistant-decomp-"));
	await initBlueprint(root);
	await mkdir(join(root, ".blueprint/architecture/components"), { recursive: true });
	const componentContent = [
		"# Component: foo-plugin",
		"",
		"Id: foo-plugin",
		"Kind: plugin",
		"Container: none",
		"Deployment:",
		"Status: active",
		"",
		"## Summary",
		"",
		"Foo plugin.",
		"",
		"## Owned paths",
		"",
		"- `*`",
		"- `lib/foo/**`",
		"",
		"## Supported features",
		"",
		"- foo",
		"",
		"## Documents",
		"",
		"- required: `lib/foo.js`",
		"",
	].join("\n");
	await writeFile(join(root, ".blueprint/architecture/components/foo-plugin.md"), componentContent, "utf8");
	await writeFile(join(root, ".blueprint/features", "foo.md"), serializeFeature({
		id: "foo",
		title: "Foo",
		status: "active",
		parentId: null,
		summary: "Foo feature",
		scope: ["lib/foo/**"],
		documents: [{ level: "required", path: "lib/foo.js" }],
		acceptance: [],
		components: ["foo-plugin"],
	}), "utf8");
	if (thresholds !== null) {
		const configPath = join(root, "design-blueprint.json");
		const cfg = JSON.parse(await readFile(configPath, "utf8"));
		cfg.decomposition = thresholds;
		await writeFile(configPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");
	}
	const en = buildSpecBody({ id: "foo", reqCount, scopeLength, lines });
	const zh = en
		.replace(/^# Spec: foo$/m, "# 规格：foo")
		.replace(/^Status: proposed$/m, "状态：拟议")
		.replace(/^Feature: foo$/m, "功能：foo");
	await mkdir(join(root, ".specs/proposed"), { recursive: true });
	await writeFile(join(root, ".specs/proposed/foo.md"), en, "utf8");
	await writeFile(join(root, ".specs/proposed/foo.zh.md"), zh, "utf8");
	await mkdir(join(root, "docs/user/features"), { recursive: true });
	const briefEn = [
		"# Foo",
		"",
		"English | [中文](foo.zh.md)",
		"",
		"## What it does",
		"",
		"Foo.",
		"",
	].join("\n");
	const briefZh = [
		"# Foo",
		"",
		"[English](foo.md) | 中文",
		"",
		"## 实现什么",
		"",
		"Foo.",
		"",
	].join("\n");
	await writeFile(join(root, "docs/user/features/foo.md"), briefEn, "utf8");
	await writeFile(join(root, "docs/user/features/foo.zh.md"), briefZh, "utf8");
	await writeFile(join(root, "docs/user/features/foo.i18n.yaml"), "pair:\n  owner: docs/user/features/foo.md\n  counterpart: docs/user/features/foo.zh.md\n", "utf8");
	const execute = promisify(execFile);
	const enPath = join(root, ".specs/proposed/foo.md");
	const zhPath = join(root, ".specs/proposed/foo.zh.md");
	const enReal = await readFile(enPath, "utf8");
	const zhReal = await readFile(zhPath, "utf8");
	const { createHash } = await import("node:crypto");
	const realHash = createHash("sha256").update(enReal).update("\0").update(zhReal).digest("hex");
	await execute(process.execPath, [cli, "approve", "foo", "--spec-hash", realHash, "--yes"], { cwd: root });
	const enFile = ".specs/proposed/foo.md";
	const zhFile = ".specs/proposed/foo.zh.md";
	return { root, enFile, zhFile, en: enReal, zh: zhReal, originalEn: enReal, briefEn, briefZh };
}

async function overwritePatchWith(root, newEn, briefEn, briefZh) {
	const { createHash } = await import("node:crypto");
	const sha256 = (text) => createHash("sha256").update(text).digest("hex");
	const newZh = newEn
		.replace(/^# Spec: foo$/m, "# 规格：foo")
		.replace(/^Status: proposed$/m, "状态：拟议")
		.replace(/^Feature: foo$/m, "功能：foo");
	const currentSpecEn = await readFile(join(root, ".specs/proposed/foo.md"), "utf8");
	const currentSpecZh = await readFile(join(root, ".specs/proposed/foo.zh.md"), "utf8");
	return {
		featureId: "foo",
		files: [
			{ file: "docs/user/features/foo.md", expectedHash: sha256(briefEn), content: briefEn },
			{ file: "docs/user/features/foo.zh.md", expectedHash: sha256(briefZh), content: briefZh },
			{ file: ".specs/proposed/foo.md", expectedHash: sha256(currentSpecEn), content: newEn },
			{ file: ".specs/proposed/foo.zh.md", expectedHash: sha256(currentSpecZh), content: newZh },
		],
	};
}

test("applyAssistantSpecPatch rejects a Spec whose REQ count exceeds the threshold", async () => {
	const { root, briefEn, briefZh } = await fixture({ reqCount: 4 });
	const en = buildSpecBody({ id: "foo", reqCount: 9, scopeLength: 1, lines: 30 });
	const newPatch = await overwritePatchWith(root, en, briefEn, briefZh);
	let thrown = null;
	try {
		await applyAssistantSpecPatch({ cwd: root, patch: newPatch, expectedPreviewHash: "0".repeat(64), confirmBilingual: true });
	} catch (e) {
		thrown = e;
	}
	assert.equal(thrown?.code, "SPEC_TOO_BIG_FOR_REFINEMENT");
	assert.ok(thrown.message.includes("Spec has 9 REQ-* entries"));
	assert.equal(thrown.thresholds.maxReq, 8);
	assert.equal(thrown.observed.reqCount, 9);
	assert.ok(thrown.suggestion);
	assert.equal(thrown.suggestion.subSpecCount, 2);
	// Original file on disk is unchanged
	const onDisk = await readFile(join(root, ".specs/proposed/foo.md"), "utf8");
	assert.match(onDisk, /REQ-1: requirement number 1/);
	await rm(root, { recursive: true, force: true });
});

test("previewAssistantSpecPatch rejects the same Spec without writing any file", async () => {
	const { root, briefEn, briefZh } = await fixture({ reqCount: 4 });
	const en = buildSpecBody({ id: "foo", reqCount: 9, scopeLength: 1, lines: 30 });
	const newPatch = await overwritePatchWith(root, en, briefEn, briefZh);
	let thrown = null;
	let preview = null;
	try {
		preview = await previewAssistantSpecPatch({ cwd: root, patch: newPatch });
	} catch (e) {
		thrown = e;
	}
	assert.equal(thrown?.code, "SPEC_TOO_BIG_FOR_REFINEMENT");
	assert.equal(preview, null);
	const onDisk = await readFile(join(root, ".specs/proposed/foo.md"), "utf8");
	assert.match(onDisk, /REQ-1: requirement number 1/);
	await rm(root, { recursive: true, force: true });
});

test("A Spec whose REQ count equals maxReq passes the gate", async () => {
	const { root, briefEn, briefZh } = await fixture({ reqCount: 4 });
	const en = buildSpecBody({ id: "foo", reqCount: 8, scopeLength: 1, lines: 30 });
	const newPatch = await overwritePatchWith(root, en, briefEn, briefZh);
	const preview = await previewAssistantSpecPatch({ cwd: root, patch: newPatch });
	assert.ok(preview?.preview?.previewHash, `previewHash missing`);
	await rm(root, { recursive: true, force: true });
});

test("A Spec that only violates maxLines is rejected and reports lineCount", async () => {
	const { root, briefEn, briefZh } = await fixture({ reqCount: 2, scopeLength: 1 });
	const en = buildSpecBody({ id: "foo", reqCount: 2, scopeLength: 1, lines: 1600 });
	const newPatch = await overwritePatchWith(root, en, briefEn, briefZh);
	let thrown = null;
	try {
		await previewAssistantSpecPatch({ cwd: root, patch: newPatch });
	} catch (e) {
		thrown = e;
	}
	assert.equal(thrown?.code, "SPEC_TOO_BIG_FOR_REFINEMENT");
	assert.ok(thrown.violations.some((v) => v.check === "spec-decomposition.line-count"));
	assert.ok(thrown.observed.lineCount > thresholds_default());
	await rm(root, { recursive: true, force: true });
});

function thresholds_default() { return 1500; }

test("Threshold overrides from design-blueprint.json are honored", async () => {
	const { root, briefEn, briefZh } = await fixture({ reqCount: 4, thresholds: { maxReq: 5, maxScopePaths: 1, maxLines: 100 } });
	const en = buildSpecBody({ id: "foo", reqCount: 6, scopeLength: 1, lines: 30 });
	const newPatch = await overwritePatchWith(root, en, briefEn, briefZh);
	let thrown = null;
	try {
		await previewAssistantSpecPatch({ cwd: root, patch: newPatch });
	} catch (e) {
		thrown = e;
	}
	assert.equal(thrown?.code, "SPEC_TOO_BIG_FOR_REFINEMENT");
	assert.equal(thrown.thresholds.maxReq, 5);
	assert.equal(thrown.thresholds.maxScopePaths, 1);
	assert.equal(thrown.thresholds.maxLines, 100);
	await rm(root, { recursive: true, force: true });
});

test("A Spec within all thresholds passes the gate end-to-end", async () => {
	const { root, briefEn, briefZh } = await fixture({ reqCount: 2 });
	const en = buildSpecBody({ id: "foo", reqCount: 2, scopeLength: 1, lines: 30 });
	const newPatch = await overwritePatchWith(root, en, briefEn, briefZh);
	const preview = await previewAssistantSpecPatch({ cwd: root, patch: newPatch });
	assert.ok(preview?.preview?.previewHash, `previewHash missing`);
	const result = await applyAssistantSpecPatch({ cwd: root, patch: newPatch, expectedPreviewHash: preview.preview.previewHash, confirmBilingual: true });
	assert.ok(result.files.length >= 2);
	await rm(root, { recursive: true, force: true });
});