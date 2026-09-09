import test from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { serializeComponent } from "../lib/architecture.js";
import { loadConfig } from "../lib/config.js";
import { serializePairRecord } from "../lib/docs.js";
import { serializeFeature } from "../lib/features.js";
import { initBlueprint } from "../lib/init.js";
import { scan } from "../lib/scan.js";
import { gitIndexSnapshot, workingTreeSnapshot } from "../lib/snapshot.js";
import { loadSpecs, parseSpec } from "../lib/specs.js";
import {
	beginFeatureImplementation,
	bindFeatureCycleRole,
	completionHygieneFindings,
	completeVerifiedFeature,
	failFeatureVerificationOrchestration,
	loadVerificationCatalog,
	mergeCurrentBrief,
	normalizeVerificationResult,
	parseVerificationRecord,
	prepareFeatureVerification,
	requestFeatureVerification,
	requestLegacyFeatureVerification,
	sectionList,
	startFeatureVerification,
	submitFeatureVerificationResult,
	validateVerificationEvidence,
	verificationRepairPrompt,
} from "../lib/verification.js";
import { approveFeatureProposal, loadFeatureWorkflow } from "../lib/workflow.js";
import { getBlueprintDashboard } from "../lib/web-api.js";
import { verifyFeature } from "../lib/skills/backing-modules.js";
import { loadFeatureCatalog } from "../lib/features.js";
import { loadArchitectureCatalog } from "../lib/architecture.js";

const execFile = promisify(execFileCallback);

const FEATURE = {
	id: "accounts",
	title: "Accounts",
	status: "planned",
	parentId: null,
	summary: "Owns account behavior.",
	scope: ["lib/accounts/**"],
	documents: [{ level: "required", path: "README.md" }],
	acceptance: ["Account behavior is observable."],
	notes: "",
	components: ["accounts-service"],
};

function component(status = "planned") {
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

function spec(status = "proposed") {
	const decision = status === "implemented" ? "Decision" : "Proposal";
	return `# Spec: Accounts

Status: ${status}
Feature: accounts

## Problem

Account behavior needs governed delivery.

## Scope

- allow: \`lib/accounts/**\`
- allow: \`.blueprint/features/accounts.md\`
- allow: \`.blueprint/architecture/components/accounts-service.md\`
- allow: \`.specs/**\`
- allow: \`.blueprint/verifications/**\`
- allow: \`docs/user/features/**\`

## ${decision}

Deliver and verify account behavior.

## Alternatives considered

**Self-certification.** Rejected because implementation and verification responsibilities must remain separate.

## Acceptance criteria

- AC-1: Account behavior is observable.

## Verification

- AC-1: command: \`node --test\`

${status === "implemented" ? "## Consequences\n\nThe historical implementation is present and awaits lifecycle verification.\n\n" : ""}## Risks

The test environment may be unavailable.
`;
}

const ZH_SPEC = `# 规格：账户

状态：拟议
功能：accounts

## 问题

账户行为需要受治理的交付。

## 范围

- 允许：\`lib/accounts/**\`

## 方案

交付并验证账户行为。

## 其他方案

拒绝自我认证。

## 验收条件

- AC-1：账户行为可以被观察。

## 验证

- AC-1：命令：\`node --test\`

## 风险

测试环境可能不可用。
`;

const BRIEF_EN = "# Accounts\n\nEnglish | [中文](accounts.zh.md)\n\n## What it does\n\nManages account behavior.\n";
const BRIEF_ZH = "# 账户\n\n[English](accounts.md) | 中文\n\n## 实现什么\n\n管理账户行为。\n";

async function git(root, ...args) {
	return execFile("git", ["-c", `safe.directory=${root}`, "-C", root, ...args], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
}

async function commitAll(root, message) {
	await git(root, "add", "-A");
	await git(root, "commit", "-m", message);
}

async function createGitFixture({ implemented = false } = {}) {
	const root = await mkdtemp(join(tmpdir(), "blueprint-verification-"));
	await initBlueprint(root);
	await mkdir(join(root, ".blueprint", "architecture", "components"), { recursive: true });
	await mkdir(join(root, "lib", "accounts"), { recursive: true });
	await writeFile(join(root, ".blueprint", "features", "accounts.md"), serializeFeature(FEATURE), "utf8");
	await writeFile(join(root, ".blueprint", "architecture", "components", "accounts-service.md"), component(), "utf8");
	const lifecycle = implemented ? "implemented" : "proposed";
	await writeFile(join(root, ".specs", lifecycle, "accounts.md"), spec(implemented ? "implemented" : "proposed"), "utf8");
	await writeFile(join(root, ".specs", lifecycle, "accounts.zh.md"), ZH_SPEC, "utf8");
	await mkdir(join(root, "docs", "user", "features"), { recursive: true });
	await writeFile(join(root, "docs", "user", "features", "accounts.md"), BRIEF_EN, "utf8");
	await writeFile(join(root, "docs", "user", "features", "accounts.zh.md"), BRIEF_ZH, "utf8");
	await writeFile(join(root, "docs", "user", "features", "accounts.i18n.yaml"), serializePairRecord("docs/user/features/accounts.md", BRIEF_EN, "docs/user/features/accounts.zh.md", BRIEF_ZH), "utf8");
	if (implemented) await writeFile(join(root, "lib", "accounts", "index.js"), "export const account = true;\n", "utf8");
	await git(root, "init");
	await git(root, "config", "user.email", "blueprint@example.test");
	await git(root, "config", "user.name", "Blueprint Test");
	await commitAll(root, "fixture");
	return root;
}

async function facts(root) {
	const snapshot = await workingTreeSnapshot(root);
	const { config } = await loadConfig(snapshot);
	const specs = await loadSpecs(snapshot, config);
	const features = await loadFeatureCatalog(snapshot, config);
	const architecture = await loadArchitectureCatalog(snapshot, config);
	const verification = await loadVerificationCatalog(snapshot, config, features.features);
	const workflow = await loadFeatureWorkflow(snapshot, config, specs.specs, features.features, architecture.components, verification.records);
	return { snapshot, config, specs, features, architecture, verification, workflow };
}

function failedResult(domain = "development") {
	return {
		conclusion: "failed",
		summary: "One required check failed.",
		acResults: [{ id: "AC-1", status: "failed", evidence: ["Observed the missing account result."] }],
		checks: [{ id: "node-test", kind: "command", status: "failed", summary: "Test command exited with status 1." }],
		findings: [{ id: "account-result", domain, severity: "required", message: "Return the observable account result." }],
	};
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

async function startPreparedVerification(root, record, sessionId) {
	const prepared = await prepareFeatureVerification({ cwd: root, featureId: "accounts", expectedRecordHash: record.hash });
	return startFeatureVerification({
		cwd: root,
		featureId: "accounts",
		expectedRecordHash: record.hash,
		sessionId,
		workspacePath: prepared.workspacePath,
		preparationCapability: prepared.preparationCapability,
	});
}

test("verification Skill executes snapshot checks and retains failure before completing a passing retry", async () => {
	const root = await createGitFixture();
	const hash = (await facts(root)).workflow.states.get("accounts").spec.reviewHash;
	await approveFeatureProposal({ cwd: root, featureId: "accounts", expectedSpecHash: hash });
	await commitAll(root, "approve proposal");
	await beginFeatureImplementation({ cwd: root, featureId: "accounts", expectedSpecHash: hash, intent: "change", requestSessionId: "coordinator" });
	for (const pass of [false, true]) {
		await writeFile(join(root, "lib/accounts/index.js"), `export const account = ${pass};\n`, "utf8");
		await git(root, "add", "lib/accounts/index.js");
		await requestFeatureVerification({ cwd: root, featureId: "accounts", expectedSpecHash: hash });
		const outcome = await verifyFeature({ cwd: root, featureId: "accounts", sessionId: `verifier-${pass}`, runChecks: async ({ workspacePath }) => {
			assert.notEqual(workspacePath, root);
			let passed = true;
			try {
				await execFile(process.execPath, ["--input-type=module", "-e", "import { readFileSync } from 'node:fs'; import assert from 'node:assert/strict'; assert.match(readFileSync('lib/accounts/index.js', 'utf8'), /account = true/);"], { cwd: workspacePath, windowsHide: true });
			} catch { passed = false; }
			assert.equal(passed, pass);
			return passed ? passedResult() : failedResult();
		} });
		assert.equal(pass ? outcome.completed : outcome.complete, pass);
	}
	const record = (await facts(root)).verification.records.get("accounts");
	assert.equal(record.stage, "completed");
	assert.equal(record.attempts.length, 2);
});

test("approved delivery fails once, retains evidence, and completes automatically after a fresh passing attempt", async () => {
	const root = await createGitFixture();
	let current = await facts(root);
	const hash = current.workflow.states.get("accounts").spec.reviewHash;
	await approveFeatureProposal({ cwd: root, featureId: "accounts", expectedSpecHash: hash });
	await commitAll(root, "approve proposal");
	const begun = await beginFeatureImplementation({ cwd: root, featureId: "accounts", expectedSpecHash: hash, intent: "change", requestSessionId: "coordinator-session" });
	assert.match(begun.record.cycle.id, /^cycle-/);
	assert.equal(begun.record.cycle.roles.coordinator.sessionId, "coordinator-session");
	await bindFeatureCycleRole({ cwd: root, featureId: "accounts", cycleId: begun.record.cycle.id, role: "implementer", sessionId: "implementer-session-1", expectedSpecHash: hash });
	const rebound = await bindFeatureCycleRole({ cwd: root, featureId: "accounts", cycleId: begun.record.cycle.id, role: "implementer", sessionId: "implementer-session-2", expectedSpecHash: hash });
	assert.equal(rebound.record.cycle.roles.implementer.sessionId, "implementer-session-2");
	assert.equal(rebound.record.cycle.superseded.at(-1).sessionId, "implementer-session-1");
	await writeFile(join(root, "lib", "accounts", "index.js"), "export const account = false;\n", "utf8");
	await git(root, "add", "lib/accounts/index.js");

	await requestFeatureVerification({ cwd: root, featureId: "accounts", expectedSpecHash: hash });
	current = await facts(root);
	assert.equal(current.workflow.states.get("accounts").stage, "verification_ready");
	const ready = current.verification.records.get("accounts");
	const first = await startPreparedVerification(root, ready, "fresh-verifier-1");
	current = await facts(root);
	const running = current.verification.records.get("accounts");
	const publicDashboard = await getBlueprintDashboard(root);
	assert.equal(Object.hasOwn(publicDashboard.catalog.features.find((entry) => entry.id === "accounts").workflow.verification.attempts.at(-1), "capabilityHash"), false);
	const failed = await submitFeatureVerificationResult({ cwd: root, featureId: "accounts", expectedRecordHash: running.hash, attemptId: first.attempt.id, resultCapability: first.resultCapability, result: failedResult("development") });
	assert.equal(failed.record.stage, "needs_changes");
	assert.equal(failed.record.attempts.length, 1);
	assert.equal(failed.record.attempts[0].findings[0].domain, "development");
	assert.equal(failed.record.status.publicState, "blocked");
	assert.equal(failed.record.status.reasonCode, "account-result");
	assert.equal(failed.record.status.owner, "implementation");
	assert.match(failed.record.status.nextAction, /Repair/);

	await writeFile(join(root, "lib", "accounts", "index.js"), "export const account = true;\n", "utf8");
	await git(root, "add", "lib/accounts/index.js");
	await requestFeatureVerification({ cwd: root, featureId: "accounts", expectedSpecHash: hash });
	current = await facts(root);
	const repaired = current.verification.records.get("accounts");
	const second = await startPreparedVerification(root, repaired, "fresh-verifier-2");
	current = await facts(root);
	const rerun = current.verification.records.get("accounts");
	const result = passedResult();
	const verifiedResult = await submitFeatureVerificationResult({ cwd: root, featureId: "accounts", expectedRecordHash: rerun.hash, attemptId: second.attempt.id, resultCapability: second.resultCapability, result });
	assert.equal(verifiedResult.verified, true);
	assert.equal(verifiedResult.record.stage, "verified");
	assert.equal(Object.hasOwn(verifiedResult.record.attempts.at(-1), "capabilityHash"), false);
	current = await facts(root);
	const verified = current.verification.records.get("accounts");
	const beforeIndex = (await git(root, "diff", "--cached", "--binary")).stdout;
	const rollbackFiles = [
		".specs/proposed/accounts.md",
		".specs/proposed/accounts.zh.md",
		".blueprint/features/accounts.md",
		".blueprint/architecture/components/accounts-service.md",
		".blueprint/verifications/accounts.json",
	];
	const beforeFiles = new Map(await Promise.all(rollbackFiles.map(async (file) => [file, await readFile(join(root, ...file.split("/")), "utf8")] )));
	for (const failAt of ["after-temp-writes", "after-backups", "after-commits", "after-stage", "after-validate"]) {
		await assert.rejects(
			completeVerifiedFeature({ cwd: root, featureId: "accounts", expectedRecordHash: verified.hash, transactionOptions: { failAt, recordFailure: false } }),
			new RegExp(failAt),
		);
		assert.equal((await git(root, "diff", "--cached", "--binary")).stdout, beforeIndex);
		for (const [file, content] of beforeFiles) assert.equal(await readFile(join(root, ...file.split("/")), "utf8"), content);
		assert.equal((await facts(root)).verification.records.get("accounts").stage, "verified");
	}
	const accepted = await completeVerifiedFeature({ cwd: root, featureId: "accounts", expectedRecordHash: verified.hash });
	assert.equal(accepted.completed, true);
	assert.equal(accepted.record.stage, "completed");
	assert.equal(accepted.record.attempts.length, 2);

	current = await facts(root);
	assert.equal(current.workflow.states.get("accounts").stage, "completed");
	assert.equal(current.features.features.find((entry) => entry.id === "accounts").status, "active");
	assert.equal(current.architecture.components.find((entry) => entry.id === "accounts-service").status, "active");
	assert.equal(current.snapshot.exists(".specs/proposed/accounts.md"), false);
	assert.equal(current.snapshot.exists(".specs/implemented/accounts.md"), true);
	assert.match(await readFile(join(root, "docs", "user", "features", "accounts.md"), "utf8"), /## Verified current behavior[\s\S]*AC-1: Account behavior is observable/);
	assert.match(await readFile(join(root, "docs", "user", "features", "accounts.zh.md"), "utf8"), /## 已验证的当前行为[\s\S]*AC-1：账户行为可以被观察/);
	const audit = await scan({ cwd: root });
	assert.equal(audit.issues.filter((entry) => entry.severity === "required").length, 0);

	const duplicate = await submitFeatureVerificationResult({ cwd: root, featureId: "accounts", expectedRecordHash: rerun.hash, attemptId: second.attempt.id, result });
	assert.equal(duplicate.idempotent, true);
});

test("lifecycle-drifted historical implementation uses the same verifier without rewriting its Spec", async () => {
	const root = await createGitFixture({ implemented: true });
	const original = await readFile(join(root, ".specs", "implemented", "accounts.md"), "utf8");
	let current = await facts(root);
	assert.equal(current.workflow.states.get("accounts").stage, "verification_required");
	const queued = await requestLegacyFeatureVerification({ cwd: root, featureId: "accounts" });
	assert.equal(queued.record.stage, "verification_ready");
	current = await facts(root);
	assert.equal(current.workflow.states.get("accounts").stage, "verification_ready");
	const ready = current.verification.records.get("accounts");
	const started = await startPreparedVerification(root, ready, "legacy-verifier-1");
	current = await facts(root);
	const running = current.verification.records.get("accounts");
	const verifiedResult = await submitFeatureVerificationResult({ cwd: root, featureId: "accounts", expectedRecordHash: running.hash, attemptId: started.attempt.id, resultCapability: started.resultCapability, result: passedResult() });
	assert.equal(verifiedResult.record.stage, "verified");
	current = await facts(root);
	await completeVerifiedFeature({ cwd: root, featureId: "accounts", expectedRecordHash: current.verification.records.get("accounts").hash });
	assert.equal(await readFile(join(root, ".specs", "implemented", "accounts.md"), "utf8"), original);
	current = await facts(root);
	assert.equal(current.workflow.states.get("accounts").stage, "completed");
	assert.equal(current.features.features.find((entry) => entry.id === "accounts").status, "active");
	assert.equal(current.architecture.components.find((entry) => entry.id === "accounts-service").status, "active");
	const audit = await scan({ cwd: root });
	assert.equal(audit.issues.filter((entry) => entry.severity === "required").length, 0);
});

test("forged result capabilities fail closed and snapshot drift becomes needs_changes", async () => {
	const root = await createGitFixture();
	let current = await facts(root);
	const hash = current.workflow.states.get("accounts").spec.reviewHash;
	await approveFeatureProposal({ cwd: root, featureId: "accounts", expectedSpecHash: hash });
	await commitAll(root, "approve proposal");
	const begun = await beginFeatureImplementation({ cwd: root, featureId: "accounts", expectedSpecHash: hash, intent: "change", requestSessionId: "coordinator-session" });
	assert.match(begun.record.cycle.id, /^cycle-/);
	assert.equal(begun.record.cycle.roles.coordinator.sessionId, "coordinator-session");
	await bindFeatureCycleRole({ cwd: root, featureId: "accounts", cycleId: begun.record.cycle.id, role: "implementer", sessionId: "implementer-session-1", expectedSpecHash: hash });
	const rebound = await bindFeatureCycleRole({ cwd: root, featureId: "accounts", cycleId: begun.record.cycle.id, role: "implementer", sessionId: "implementer-session-2", expectedSpecHash: hash });
	assert.equal(rebound.record.cycle.roles.implementer.sessionId, "implementer-session-2");
	assert.equal(rebound.record.cycle.superseded.at(-1).sessionId, "implementer-session-1");
	await writeFile(join(root, "lib", "accounts", "index.js"), "export const account = true;\n", "utf8");
	await git(root, "add", "lib/accounts/index.js");
	await requestFeatureVerification({ cwd: root, featureId: "accounts", expectedSpecHash: hash });
	current = await facts(root);
	const started = await startPreparedVerification(root, current.verification.records.get("accounts"), "capability-verifier");
	current = await facts(root);
	const running = current.verification.records.get("accounts");
	await assert.rejects(
		submitFeatureVerificationResult({ cwd: root, featureId: "accounts", expectedRecordHash: running.hash, attemptId: started.attempt.id, resultCapability: "forged", result: passedResult() }),
		/forged/,
	);
	assert.equal((await facts(root)).verification.records.get("accounts").stage, "verifying");
	await writeFile(join(root, "lib", "accounts", "index.js"), "export const account = 'changed';\n", "utf8");
	await git(root, "add", "lib/accounts/index.js");
	const stale = await submitFeatureVerificationResult({ cwd: root, featureId: "accounts", expectedRecordHash: running.hash, attemptId: started.attempt.id, resultCapability: started.resultCapability, result: passedResult() });
	assert.equal(stale.hostFailure, true);
	assert.equal(stale.record.stage, "needs_changes");
	assert.equal(stale.record.attempts.at(-1).findings.at(-1).id, "host-verification-gate");
});

test("pre-result orchestration failures become durable needs_changes evidence", async () => {
	const root = await createGitFixture();
	let current = await facts(root);
	const hash = current.workflow.states.get("accounts").spec.reviewHash;
	await approveFeatureProposal({ cwd: root, featureId: "accounts", expectedSpecHash: hash });
	await commitAll(root, "approve proposal");
	const begun = await beginFeatureImplementation({ cwd: root, featureId: "accounts", expectedSpecHash: hash, intent: "change", requestSessionId: "coordinator-session" });
	assert.match(begun.record.cycle.id, /^cycle-/);
	assert.equal(begun.record.cycle.roles.coordinator.sessionId, "coordinator-session");
	await bindFeatureCycleRole({ cwd: root, featureId: "accounts", cycleId: begun.record.cycle.id, role: "implementer", sessionId: "implementer-session-1", expectedSpecHash: hash });
	const rebound = await bindFeatureCycleRole({ cwd: root, featureId: "accounts", cycleId: begun.record.cycle.id, role: "implementer", sessionId: "implementer-session-2", expectedSpecHash: hash });
	assert.equal(rebound.record.cycle.roles.implementer.sessionId, "implementer-session-2");
	assert.equal(rebound.record.cycle.superseded.at(-1).sessionId, "implementer-session-1");
	await writeFile(join(root, "lib", "accounts", "index.js"), "export const account = true;\n", "utf8");
	await git(root, "add", "lib/accounts/index.js");
	await requestFeatureVerification({ cwd: root, featureId: "accounts", expectedSpecHash: hash });
	current = await facts(root);
	const ready = current.verification.records.get("accounts");
	const failedSetup = await failFeatureVerificationOrchestration({
		cwd: root,
		featureId: "accounts",
		expectedRecordHash: ready.hash,
		phase: "session-setup",
		message: "The independent Session could not be archived.",
	});
	assert.equal(failedSetup.record.stage, "needs_changes");
	assert.equal(failedSetup.record.attempts.at(-1).conclusion, "failed");
	assert.equal(failedSetup.record.attempts.at(-1).findings[0].id, "host-verification-orchestration");
	assert.match(verificationRepairPrompt({ id: "accounts" }, failedSetup.record), /session-setup/);

	await requestFeatureVerification({ cwd: root, featureId: "accounts", expectedSpecHash: hash });
	current = await facts(root);
	const started = await startPreparedVerification(root, current.verification.records.get("accounts"), "orchestration-verifier");
	current = await facts(root);
	const running = current.verification.records.get("accounts");
	const failedPrompt = await failFeatureVerificationOrchestration({
		cwd: root,
		featureId: "accounts",
		expectedRecordHash: running.hash,
		phase: "prompt-send",
		message: "The verifier prompt was not accepted.",
		attemptId: started.attempt.id,
		sessionId: started.attempt.sessionId,
	});
	assert.equal(failedPrompt.record.stage, "needs_changes");
	assert.equal(failedPrompt.record.attempts.at(-1).checks.at(-1).id, "host-verification-gate");
	await assert.rejects(
		failFeatureVerificationOrchestration({ cwd: root, featureId: "accounts", expectedRecordHash: running.hash, phase: "unknown", message: "no" }),
		/phase is invalid/,
	);
});

test("verification schemas reject unknown, duplicate, unsafe, and incomplete evidence", () => {
	assert.throws(() => normalizeVerificationResult({ ...passedResult(), surprise: true }), /unknown fields/);
	assert.throws(() => normalizeVerificationResult({ ...passedResult(), checks: [passedResult().checks[0], passedResult().checks[0]] }), /duplicate ids/);
	const unsafe = {
		version: 1,
		featureId: "accounts",
		stage: "verification_ready",
		spec: { sourceFile: "../outside.md", approvedHash: "a".repeat(64), implementedFile: null },
		snapshot: { kind: "git-index", digest: "b".repeat(64) },
		requestedAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		completedAt: null,
		attempts: [],
		history: [],
	};
	assert.throws(() => parseVerificationRecord(".blueprint/verifications/accounts.json", JSON.stringify(unsafe)), /relative path|outside|\.\./i);
});

test("progressive Web acceptance requires linked real-browser intermediate and terminal observations", () => {
	const progressive = spec().replace("- AC-1: Account behavior is observable.", "- AC-1: REQ-STREAM-1 updates the Web UI before completion.")
		.replace("- AC-1: command: `node --test`", "- AC-1: [surface=web-ui; moment=progressive; evidence=user-visible] real browser scenario");
	const parsed = parseSpec(".specs/proposed/accounts.md", progressive, ".specs").spec;
	const command = { id: "node-test", kind: "command", status: "passed", summary: "Tests passed.", acIds: [] };
	const browser = {
		id: "browser-stream",
		kind: "browser",
		status: "passed",
		summary: "The real page updated before completion.",
		acIds: ["AC-1"],
		surface: "web-ui",
		moment: "progressive",
		evidenceLevel: "user-visible",
		environment: "Chromium",
		entryPoint: "http://127.0.0.1/judgment",
		action: "Submit one delayed judgment.",
		oracle: "Visible output changes before the terminal result.",
		actual: "One intermediate update and the final result were visible.",
		observations: [
			{ phase: "intermediate", order: 1, observedAt: null, value: "answer length became greater than zero" },
			{ phase: "terminal", order: 2, observedAt: null, value: "final status became complete" },
		],
		artifacts: ["browser-trace.zip"],
	};
	const result = { conclusion: "passed", summary: "Progressive behavior passed.", acResults: [{ id: "AC-1", status: "passed", evidence: ["browser-stream"] }], checks: [command, browser], findings: [] };
	assert.equal(validateVerificationEvidence(parsed, result).checks[1].moment, "progressive");
	assert.throws(() => validateVerificationEvidence(parsed, { ...result, checks: [command, { ...browser, kind: "inspection" }] }), /web-ui\/progressive\/user-visible/);
	assert.throws(() => validateVerificationEvidence(parsed, { ...result, checks: [command, { ...browser, observations: browser.observations.slice(1) }] }), /web-ui\/progressive\/user-visible/);
});

test("completion hygiene identifies exact staged secret-like and temporary paths", async () => {
	const root = await createGitFixture();
	const secretPath = join(root, "lib", "accounts", "credential.js");
	const temporaryPath = join(root, "_diag.out");
	const fakeSecret = "api_" + "key = \"" + "A".repeat(24) + "\";\n";
	await writeFile(secretPath, fakeSecret, "utf8");
	await writeFile(temporaryPath, "diagnostic output\n", "utf8");
	await git(root, "add", "lib/accounts/credential.js", "_diag.out");
	const snapshot = await gitIndexSnapshot(root);
	const { config } = await loadConfig(snapshot);
	const findings = await completionHygieneFindings({ root, snapshot, config });
	assert.deepEqual(findings.map((entry) => entry.id).sort(), ["completion-secret-like-material", "completion-temporary-artifact"]);
	assert.ok(findings.some((entry) => entry.path === "lib/accounts/credential.js"));
	assert.ok(findings.some((entry) => entry.path === "_diag.out"));
});

test("failed findings produce deterministic development, Spec, architecture, and mixed repair routes", () => {
	for (const domain of ["development", "spec", "architecture"]) {
		const prompt = verificationRepairPrompt({ id: "accounts" }, { attempts: [{ findings: [{ id: `finding-${domain}`, domain, severity: "required", message: `${domain} repair` }] }] });
		assert.match(prompt, new RegExp(`路线：${domain}`));
	}
	const mixed = verificationRepairPrompt({ id: "accounts" }, { attempts: [{ findings: [
		{ id: "finding-development", domain: "development", severity: "required", message: "implementation repair" },
		{ id: "finding-architecture", domain: "architecture", severity: "required", message: "ownership repair" },
	] }] });
	assert.match(mixed, /路线：mixed/);
});

test("sectionList — single-language heading returns rows (AC-SECT-1)", () => {
	const content = "## 验收条件\n\n- AC-1: x\n- AC-2: y\n";
	assert.deepEqual(sectionList(content, "验收条件"), ["- AC-1: x", "- AC-2: y"]);
});

test("sectionList — slash-merged heading returns rows (AC-SECT-2)", () => {
	const content = "## Acceptance criteria / 验收条件\n\n- AC-1: x\n- AC-2: y\n";
	assert.deepEqual(sectionList(content, "验收条件"), ["- AC-1: x", "- AC-2: y"]);
});

test("sectionList — parenthetical-merged heading returns rows (AC-SECT-3)", () => {
	const content = "## 验收条件（Acceptance criteria）\n\n- AC-1: x\n- AC-2: y\n";
	assert.deepEqual(sectionList(content, "验收条件"), ["- AC-1: x", "- AC-2: y"]);
});

test("sectionList — em-dash-merged heading returns rows (AC-SECT-4)", () => {
	const content = "## 验收条件 — Acceptance criteria\n\n- AC-1: x\n- AC-2: y\n";
	assert.deepEqual(sectionList(content, "验收条件"), ["- AC-1: x", "- AC-2: y"]);
});

test("sectionList — heading-with-target-as-prefix is rejected (AC-SECT-5)", () => {
	const content = "## 验收条件总览\n\n- AC-1: x\n";
	assert.deepEqual(sectionList(content, "验收条件"), []);
});

test("sectionList — non-## line is rejected (AC-SECT-6)", () => {
	const content = "not a heading\n- AC-1: x\n";
	assert.deepEqual(sectionList(content, "验收条件"), []);
});

test("mergeCurrentBrief — accepts bilingual merged heading in ZH Spec (AC-SECT-7)", () => {
	// AC-SECT-7 contract: mergeCurrentBrief must run to completion on a .zh.md
	// whose AC heading is a bilingual merge. The marker is absent from the
	// fixture, so the function appends a marker line. Verifying the marker
	// appears in the output proves the function did not early-return.
	const zh = "## Acceptance criteria / 验收条件\n\n- AC-1: first\n- AC-2: second\n\n## Verification\n\n- AC-1: t\n";
	const marker = "blueprint-current:verify-bilingual.md";
	const out = mergeCurrentBrief(zh, {
		marker,
		heading: "已验证的当前行为",
		title: "Test Feature",
		acceptance: ["- AC-1: first", "- AC-2: second"],
	});
	assert.ok(out.includes(`<!-- ${marker} -->`), "mergeCurrentBrief must append the marker (proves no early-return on a ZH spec with bilingual merged heading)");
	assert.ok(out.includes("## 已验证的当前行为"), "mergeCurrentBrief must append the verified-behavior heading");
	assert.ok(out.includes("### Test Feature"), "mergeCurrentBrief must append the feature title");
	assert.ok(out.includes("- AC-1: first"), "mergeCurrentBrief must keep the AC bullet from the input");
});
