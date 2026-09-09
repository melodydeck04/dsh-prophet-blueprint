import test from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { initBlueprint } from "../lib/init.js";
import { loadConfig } from "../lib/config.js";
import { loadSpecs } from "../lib/specs.js";
import { loadFeatureCatalog } from "../lib/features.js";
import { loadArchitectureCatalog, serializeComponent } from "../lib/architecture.js";
import { loadVerificationCatalog } from "../lib/verification.js";
import {
	beginFeatureImplementation,
	bindFeatureCycleRole,
	completeVerifiedFeature,
	prepareFeatureVerification,
	requestFeatureVerification,
	startFeatureVerification,
	submitFeatureVerificationResult,
} from "../lib/verification.js";
import { approveFeatureProposal } from "../lib/workflow.js";
import { serializePairRecord } from "../lib/docs.js";
import { workingTreeSnapshot } from "../lib/snapshot.js";
import { scan } from "../lib/scan.js";

const execFile = promisify(execFileCallback);

async function git(root, ...args) {
	return execFile("git", ["-c", `safe.directory=${root}`, "-C", root, ...args], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
}

async function commitAll(root, message) {
	await git(root, "add", "-A");
	await git(root, "commit", "-m", message);
}

function componentFile(status = "active") {
	return serializeComponent({
		id: "accounts-service",
		title: "Accounts service",
		kind: "service",
		containerId: null,
		deployment: null,
		status,
		summary: "Owns account behavior.",
		ownedPaths: ["lib/accounts/**"],
		contracts: [],
		dependencies: [],
		supportedFeatures: ["accounts"],
		documents: [{ level: "required", path: "DESIGN.md" }],
	});
}

function specFile() {
	return [
		"# Spec: Accounts",
		"",
		"Status: proposed",
		"Feature: accounts",
		"",
		"## Problem",
		"",
		"Account behavior needs governed delivery.",
		"",
		"## Scope",
		"",
		"- allow: `lib/accounts/**`",
		"- allow: `.blueprint/features/accounts.md`",
		"- allow: `.blueprint/architecture/components/accounts-service.md`",
		"- allow: `.specs/**`",
		"- allow: `.blueprint/verifications/**`",
		"- allow: `docs/user/features/**`",
		"- allow: `.blueprint/approvals/**`",
		"",
		"## Proposal",
		"",
		"Deliver and verify account behavior.",
		"",
		"## Alternatives considered",
		"",
		"**Self-certification.** Rejected because implementation and verification responsibilities must remain separate.",
		"",
		"## Acceptance criteria",
		"",
		"- AC-1: Account behavior is observable.",
		"",
		"## Verification",
		"",
		"- AC-1: command: `node --test`",
		"",
		"## Risks",
		"",
		"The test environment may be unavailable.",
	].join("\n");
}

function specZhFile({ heading = "## 验收条件" } = {}) {
	return [
		"# 规格：账户",
		"",
		"Status: proposed",
		"Feature: accounts",
		"",
		"## 问题",
		"",
		"账户行为需要受治理的交付。",
		"",
		"## 范围",
		"",
		"- 允许：`lib/accounts/**`",
		"- 允许：`.blueprint/features/accounts.md`",
		"- 允许：`.blueprint/architecture/components/accounts-service.md`",
		"- 允许：`.specs/**`",
		"- 允许：`.blueprint/verifications/**`",
		"- 允许：`docs/user/features/**`",
		"- 允许：`.blueprint/approvals/**`",
		"",
		"## 方案",
		"",
		"交付并验证账户行为。",
		"",
		"## 其他方案",
		"",
		"拒绝自我认证。",
		"",
		heading,
		"",
		"- AC-1：账户行为可以被观察。",
		"",
		"## 验证",
		"",
		"- AC-1：命令：`node --test`",
		"",
		"## 风险",
		"",
		"测试环境可能不可用。",
	].join("\n");
}

const BRIEF_EN = "# Accounts\n\nEnglish | [中文](accounts.zh.md)\n\n## What it does\n\nManages account behavior.\n";
const BRIEF_ZH = "# 账户\n\n[English](accounts.md) | 中文\n\n## 实现什么\n\n管理账户行为。\n";

async function createFixture({ zhHeading = "## 验收条件" } = {}) {
	const root = await mkdtemp(join(tmpdir(), "blueprint-finalize-coherence-"));
	await initBlueprint(root);
	await mkdir(join(root, ".blueprint", "architecture", "components"), { recursive: true });
	await mkdir(join(root, "lib", "accounts"), { recursive: true });
	await writeFile(join(root, ".blueprint", "features", "accounts.md"), [
		`# Feature: Test feature`,
		``,
		`Id: accounts`,
		`Parent: none`,
		`Status: active`,
		``,
		`## Summary`,
		``,
		`Test feature`,
		``,
		`## Documents`,
		``,
		`- required: \`.blueprint/features/accounts.md\` (self)`,
		`- required: \`docs/user/features/accounts.md\``,
		`- required: \`docs/user/features/accounts.zh.md\``,
		`- required: \`docs/user/features/accounts.i18n.yaml\``,
		`- required: \`.specs/proposed/accounts.md\``,
		`- required: \`.specs/proposed/accounts.zh.md\``,
	].join("\n"), "utf8");
	await writeFile(join(root, ".blueprint", "architecture", "components", "accounts-service.md"), componentFile("active"), "utf8");
	await writeFile(join(root, ".specs", "proposed", "accounts.md"), specFile(), "utf8");
	await writeFile(join(root, ".specs", "proposed", "accounts.zh.md"), specZhFile({ heading: zhHeading }), "utf8");
	await mkdir(join(root, "docs", "user", "features"), { recursive: true });
	await writeFile(join(root, "docs", "user", "features", "accounts.md"), BRIEF_EN, "utf8");
	await writeFile(join(root, "docs", "user", "features", "accounts.zh.md"), BRIEF_ZH, "utf8");
	await writeFile(join(root, "docs", "user", "features", "accounts.i18n.yaml"), serializePairRecord("docs/user/features/accounts.md", BRIEF_EN, "docs/user/features/accounts.zh.md", BRIEF_ZH), "utf8");
	await writeFile(join(root, "lib", "accounts", "index.js"), "export const account = true;\n", "utf8");
	await git(root, "init");
	await git(root, "config", "user.email", "blueprint@example.test");
	await git(root, "config", "user.name", "Blueprint Test");
	await commitAll(root, "fixture");
	return root;
}

function passedResult() {
	return {
		conclusion: "passed",
		summary: "Every acceptance criterion and required check passed.",
		acResults: [{ id: "AC-1", status: "passed", evidence: ["The account module returns the expected observable result."] }],
		checks: [{ id: "node-test", kind: "command", status: "passed", summary: "Node test command exited with status 0." }],
		findings: [],
	};
}

async function runFullCycle(root) {
	const ws = await workingTreeSnapshot(root);
	const { config } = await loadConfig(ws);
	const specsResult = await loadSpecs(ws, config);
	const hash = specsResult.specs.find((s) => s.featureId === "accounts").reviewHash;
	await approveFeatureProposal({ cwd: root, featureId: "accounts", expectedSpecHash: hash });
	await commitAll(root, "approve proposal");
	const begun = await beginFeatureImplementation({ cwd: root, featureId: "accounts", expectedSpecHash: hash, intent: "change", requestSessionId: "coord" });
	await bindFeatureCycleRole({ cwd: root, featureId: "accounts", cycleId: begun.record.cycle.id, expectedSpecHash: hash, role: "implementer", sessionId: "impl-1" });
	await writeFile(join(root, "lib", "accounts", "index.js"), "export const account = false;\n", "utf8");
	await git(root, "add", "lib/accounts/index.js");
	await requestFeatureVerification({ cwd: root, featureId: "accounts", expectedSpecHash: hash });
	const ws2 = await workingTreeSnapshot(root);
	const { config: cfg2 } = await loadConfig(ws2);
	const features2 = await loadFeatureCatalog(ws2, cfg2);
	const verification2 = await loadVerificationCatalog(ws2, cfg2, features2.features);
	const record = verification2.records.get("accounts");
	const prepared = await prepareFeatureVerification({ cwd: root, featureId: "accounts", expectedRecordHash: record.hash });
	const start = await startFeatureVerification({
		cwd: root, featureId: "accounts", expectedRecordHash: record.hash,
		sessionId: "verifier", workspacePath: prepared.workspacePath, preparationCapability: prepared.preparationCapability,
	});
	const ws3 = await workingTreeSnapshot(root);
	const { config: cfg3 } = await loadConfig(ws3);
	const features3 = await loadFeatureCatalog(ws3, cfg3);
	const verification3 = await loadVerificationCatalog(ws3, cfg3, features3.features);
	const running = verification3.records.get("accounts");
	await submitFeatureVerificationResult({
		cwd: root, featureId: "accounts", expectedRecordHash: running.hash,
		attemptId: start.attempt.id, resultCapability: start.resultCapability, result: passedResult(), submittedBySessionId: "verifier",
	});
	const ws4 = await workingTreeSnapshot(root);
	const { config: cfg4 } = await loadConfig(ws4);
	const features4 = await loadFeatureCatalog(ws4, cfg4);
	const verification4 = await loadVerificationCatalog(ws4, cfg4, features4.features);
	const verified = verification4.records.get("accounts");
	const completed = await completeVerifiedFeature({ cwd: root, featureId: "accounts", expectedRecordHash: verified.hash });
	return completed;
}

test("after finalize the approval record points to the new implemented path and not the old proposed path (AC-FIN-1)", async () => {
	const root = await createFixture();
	const completed = await runFullCycle(root);
	assert.equal(completed.completed, true);
	const approval = JSON.parse(await readFile(join(root, ".blueprint", "approvals", "accounts.json"), "utf8"));
	assert.equal(approval.spec, ".specs/implemented/accounts.md");
	const ws = await workingTreeSnapshot(root);
	const { config } = await loadConfig(ws);
	const specs = await loadSpecs(ws, config);
	const implSpec = specs.specs.find((s) => s.file === ".specs/implemented/accounts.md");
	assert.ok(implSpec, "implemented Spec must exist in snapshot after finalize");
	const expectedHash = createHash("sha256").update(await readFile(join(root, ".specs", "implemented", "accounts.md"), "utf8")).update("\0").update(await readFile(join(root, ".specs", "implemented", "accounts.zh.md"), "utf8")).digest("hex");
	assert.equal(approval.specHash, expectedHash, "approval.specHash must equal the new review hash of the implemented Spec pair");
});

test("a broad-scope Spec completes its full verification cycle without manual-finalize intervention (AC-FIN-2)", async () => {
	const root = await createFixture();
	const completed = await runFullCycle(root);
	assert.equal(completed.completed, true, "completeVerifiedFeature must return completed=true (no manual-finalize)");
	assert.equal(completed.record.stage, "completed");
	const ws = await workingTreeSnapshot(root);
	const { config } = await loadConfig(ws);
	const features = await loadFeatureCatalog(ws, config);
	const verification = await loadVerificationCatalog(ws, config, features.features);
	assert.equal(verification.records.get("accounts").stage, "completed");
	const audit = await scan({ cwd: root });
	assert.equal(audit.issues.filter((entry) => entry.severity === "required").length, 0, "scan must report 0 required issues");
});

test("a Spec whose zh.md uses the bilingual merged heading completes its full cycle without manual-finalize intervention (AC-FIN-3)", async () => {
	const root = await createFixture({ zhHeading: "## Acceptance criteria / 验收条件" });
	const completed = await runFullCycle(root);
	assert.equal(completed.completed, true, "completeVerifiedFeature must return completed=true on a spec with bilingual merged heading");
	assert.equal(completed.record.stage, "completed");
	const ws = await workingTreeSnapshot(root);
	const { config } = await loadConfig(ws);
	const features = await loadFeatureCatalog(ws, config);
	const verification = await loadVerificationCatalog(ws, config, features.features);
	assert.equal(verification.records.get("accounts").stage, "completed");
});

test("a rolled-back transaction restores the original approval record (AC-FIN-4)", async () => {
	const root = await createFixture();
	const ws0 = await workingTreeSnapshot(root);
	const { config: cfg0 } = await loadConfig(ws0);
	const specs0 = await loadSpecs(ws0, cfg0);
	const hash = specs0.specs.find((s) => s.featureId === "accounts").reviewHash;
	await approveFeatureProposal({ cwd: root, featureId: "accounts", expectedSpecHash: hash });
	await commitAll(root, "approve proposal");
	const approvalBefore = await readFile(join(root, ".blueprint", "approvals", "accounts.json"), "utf8");
	const begun = await beginFeatureImplementation({ cwd: root, featureId: "accounts", expectedSpecHash: hash, intent: "change", requestSessionId: "coord" });
	await bindFeatureCycleRole({ cwd: root, featureId: "accounts", cycleId: begun.record.cycle.id, expectedSpecHash: hash, role: "implementer", sessionId: "impl-1" });
	await writeFile(join(root, "lib", "accounts", "index.js"), "export const account = false;\n", "utf8");
	await git(root, "add", "lib/accounts/index.js");
	await requestFeatureVerification({ cwd: root, featureId: "accounts", expectedSpecHash: hash });
	const ws1 = await workingTreeSnapshot(root);
	const { config: cfg1 } = await loadConfig(ws1);
	const features1 = await loadFeatureCatalog(ws1, cfg1);
	const verification1 = await loadVerificationCatalog(ws1, cfg1, features1.features);
	const record1 = verification1.records.get("accounts");
	const prepared1 = await prepareFeatureVerification({ cwd: root, featureId: "accounts", expectedRecordHash: record1.hash });
	const start = await startFeatureVerification({
		cwd: root, featureId: "accounts", expectedRecordHash: record1.hash,
		sessionId: "verifier", workspacePath: prepared1.workspacePath, preparationCapability: prepared1.preparationCapability,
	});
	const ws2 = await workingTreeSnapshot(root);
	const { config: cfg2 } = await loadConfig(ws2);
	const features2 = await loadFeatureCatalog(ws2, cfg2);
	const verification2 = await loadVerificationCatalog(ws2, cfg2, features2.features);
	const record2 = verification2.records.get("accounts");
	await submitFeatureVerificationResult({
		cwd: root, featureId: "accounts", expectedRecordHash: record2.hash,
		attemptId: start.attempt.id, resultCapability: start.resultCapability, result: passedResult(), submittedBySessionId: "verifier",
	});
	const ws3 = await workingTreeSnapshot(root);
	const { config: cfg3 } = await loadConfig(ws3);
	const features3 = await loadFeatureCatalog(ws3, cfg3);
	const verification3 = await loadVerificationCatalog(ws3, cfg3, features3.features);
	const verified = verification3.records.get("accounts");
	await assert.rejects(
		completeVerifiedFeature({ cwd: root, featureId: "accounts", expectedRecordHash: verified.hash, transactionOptions: { failAt: "after-stage", recordFailure: false } }),
		/after-stage/,
	);
	const approvalAfter = await readFile(join(root, ".blueprint", "approvals", "accounts.json"), "utf8");
	assert.equal(approvalAfter, approvalBefore, "approval record must be restored verbatim after a rolled-back transaction");
});