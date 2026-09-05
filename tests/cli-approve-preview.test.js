import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initBlueprint } from "../lib/init.js";
import { serializeFeature } from "../lib/features.js";
import { approveFeatureProposal } from "../lib/workflow.js";

const execute = promisify(execFile);
const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "cli.js");

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "blueprint-cli-approve-preview-"));
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
		"## Provided contracts",
		"",
		"No provided contracts declared.",
		"",
		"## Dependencies",
		"",
		"No typed dependencies declared.",
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
	const specDir = join(root, ".specs/proposed");
	await mkdir(specDir, { recursive: true });
	const specPath = join(specDir, "foo.md");
	const content = [
		"# Spec: Foo",
		"",
		"Status: proposed",
		"Feature: foo",
		"",
		"## Problem",
		"",
		"F.",
		"",
		"## Scope",
		"",
		"- allow: `lib/foo.js`",
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
		"- AC-1: F.",
		"",
		"## Verification",
		"",
		"- AC-1: manual.",
		"",
		"## Risks",
		"",
		"R.",
		"",
	].join("\n");
	await writeFile(specPath, content, "utf8");
	const en = content;
	const zh = content
		.replace(/^# Spec: Foo$/m, "# 规格：Foo")
		.replace(/^Status: proposed$/m, "状态：拟议")
		.replace(/^Feature: foo$/m, "功能：foo");
	await writeFile(join(specDir, "foo.zh.md"), zh, "utf8");
	const approvedHash = await approveFeatureProposal({
		cwd: root,
		featureId: "foo",
		expectedSpecHash: await specHashOf(en, zh),
	});
	return { root, specPath, approvedHash: approvedHash.record.specHash, content: en };
}

async function specHashOf(en, zh) {
	const { createHash } = await import("node:crypto");
	return createHash("sha256").update(en).update("\0").update(zh).digest("hex");
}

async function runCli(args, cwd) {
	let result = null;
	let thrown = null;
	try {
		result = await execute(process.execPath, [cli, ...args], { cwd });
	} catch (e) {
		thrown = e;
	}
	return {
		code: thrown?.code ?? result?.code ?? 0,
		stdout: result?.stdout ?? thrown?.stdout ?? "",
		stderr: thrown?.stderr ?? result?.stderr ?? "",
		thrown,
	};
}

test("approve --show without --yes prints the Spec but does not write a new approval", async () => {
	const { root, specPath, approvedHash } = await fixture();
	try {
		const r = await runCli(["approve", "foo", "--spec-hash", approvedHash, "--show"], root);
		assert.equal(r.code, 0);
		assert.match(r.stdout, /# Blueprint approve — foo/);
		assert.match(r.stdout, /Spec source: \.specs\/proposed\/foo\.md/);
		assert.match(r.stdout, /Hash: [a-f0-9]{64}/);
		assert.match(r.stdout, /Lines: \d+/);
		assert.match(r.stdout, /# Spec: Foo/);
		const recordAfter = JSON.parse(await readFile(join(root, ".blueprint/approvals/foo.json"), "utf8"));
		assert.equal(recordAfter.specHash, approvedHash);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("approve --show --yes rewrites the approval record", async () => {
	const { root, specPath, approvedHash } = await fixture();
	try {
		const r = await runCli(["approve", "foo", "--spec-hash", approvedHash, "--show", "--yes"], root);
		assert.equal(r.code, 0);
		assert.match(r.stdout, /# Blueprint approve — foo/);
		assert.match(r.stdout, /# Spec: Foo/);
		assert.match(r.stdout, /Approved foo/);
		const recordAfter = JSON.parse(await readFile(join(root, ".blueprint/approvals/foo.json"), "utf8"));
		assert.equal(recordAfter.specHash, approvedHash);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("approve --show --json emits a single JSON object that includes content", async () => {
	const { root, specPath, approvedHash } = await fixture();
	try {
		const r = await runCli(["approve", "foo", "--spec-hash", approvedHash, "--show", "--json"], root);
		assert.equal(r.code, 0);
		const parsed = JSON.parse(r.stdout);
		assert.equal(parsed.featureId, "foo");
		assert.equal(parsed.spec, ".specs/proposed/foo.md");
		assert.equal(parsed.specHash, approvedHash);
		assert.ok(parsed.lineCount > 5);
		assert.ok(parsed.byteCount > 100);
		assert.match(parsed.content, /# Spec: Foo/);
		const recordAfter = JSON.parse(await readFile(join(root, ".blueprint/approvals/foo.json"), "utf8"));
		assert.equal(recordAfter.specHash, approvedHash);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("approve --show fails when there is no prior approval record to read the source from", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-cli-approve-no-record-"));
	try {
		await initBlueprint(root);
		const r = await runCli(["approve", "spec-governance", "--spec-hash", "a".repeat(64), "--show"], root);
		assert.notEqual(r.code, 0);
		assert.match(r.stderr, /existing approval record/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("approve without --show does not print the Spec body", async () => {
	const { root, specPath, approvedHash } = await fixture();
	try {
		const r = await runCli(["approve", "foo", "--spec-hash", approvedHash, "--yes"], root);
		assert.equal(r.code, 0);
		assert.doesNotMatch(r.stdout, /# Blueprint approve/);
		assert.match(r.stdout, /Approved foo/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});