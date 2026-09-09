import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initBlueprint } from "../lib/init.js";
import {
	beginFeatureImplementation,
	requestFeatureVerification,
	prepareFeatureVerification,
	startFeatureVerification,
	submitFeatureVerificationResult,
	loadVerificationCatalog,
} from "../lib/verification.js";
import { loadFeatureCatalog } from "../lib/features.js";
import { loadConfig } from "../lib/config.js";
import { workingTreeSnapshot } from "../lib/snapshot.js";

async function makeProject() {
	const root = await mkdtemp(join(tmpdir(), "blueprint-vsr2-"));
	await initBlueprint(root);
	return root;
}

async function writeApprovedProposal(root, specFile, specHash) {
	await writeFile(
		join(root, ".blueprint", "approvals", "verify-me.json"),
		JSON.stringify({ version: 1, featureId: "verify-me", spec: specFile, specHash, approvedAt: new Date().toISOString() }),
		"utf8",
	);
}

async function setupVerifyingRecord(root, ownerSessionId) {
	await writeFile(join(root, ".blueprint", "features", "verify-me.md"), [
		"# Feature: Verify me",
		"Id: verify-me",
		"Parent: none",
		"Status: active",
		"",
		"## Summary",
		"",
		"stub",
		"",
		"## Scope",
		"",
		"- lib/verify-me.js",
		"",
		"## Documents",
		"",
		"- required: .specs/proposed/verify-me.md",
		"",
		"## Acceptance",
		"",
		"- stub",
		"",
	].join("\n"), "utf8");
	const specContent = [
		"# Spec: Verify me",
		"",
		"Status: proposed",
		"Feature: verify-me",
		"",
		"## Problem",
		"",
		"stub",
		"",
		"## Scope",
		"",
		"- allow: `lib/verify-me.js`",
		"",
		"## Proposal",
		"",
		"stub",
		"",
		"## Alternatives considered",
		"",
		"Nothing.",
		"",
		"## Acceptance criteria",
		"",
		"- AC-X-1: stub",
		"",
		"## Verification",
		"",
		"- AC-X-1: stub",
		"",
		"## Risks",
		"",
		"None.",
		"",
	].join("\n");
	const specPath = join(root, ".specs", "proposed", "verify-me.md");
	await writeFile(specPath, specContent, "utf8");
	await mkdir(join(root, "lib"), { recursive: true });
	await writeFile(join(root, "lib", "verify-me.js"), "module.exports = {};\n", "utf8");
	const { createHash } = await import("node:crypto");
	const specHash = createHash("sha256").update(specContent).digest("hex");
	await writeApprovedProposal(root, ".specs/proposed/verify-me.md", specHash);
	await beginFeatureImplementation({ cwd: root, featureId: "verify-me", expectedSpecHash: specHash });
	await requestFeatureVerification({ cwd: root, featureId: "verify-me", expectedSpecHash: specHash });

	const ws = await workingTreeSnapshot(root);
	const configResult = await loadConfig(ws);
	const features = await loadFeatureCatalog(ws, configResult.config);
	const catalog = await loadVerificationCatalog(ws, configResult.config, features.features);
	const recordHash = catalog.records.get("verify-me").hash;

	const prepared = await prepareFeatureVerification({ cwd: root, featureId: "verify-me", expectedRecordHash: recordHash });
	const started = await startFeatureVerification({
		cwd: root,
		featureId: "verify-me",
		expectedRecordHash: recordHash,
		sessionId: ownerSessionId,
		workspacePath: prepared.workspacePath,
		preparationCapability: prepared.preparationCapability,
	});
	return {
		root,
		attemptId: started.attempt.id,
		resultCapability: started.resultCapability,
		originalSessionId: ownerSessionId,
	};
}

async function currentRecordHash(root) {
	const ws = await workingTreeSnapshot(root);
	const configResult = await loadConfig(ws);
	const features = await loadFeatureCatalog(ws, configResult.config);
	const catalog = await loadVerificationCatalog(ws, configResult.config, features.features);
	return catalog.records.get("verify-me").hash;
}

function failingPayload() {
	return {
		conclusion: "failed",
		summary: "stub driver failure",
		acResults: [],
		checks: [],
		findings: [{ id: "f1", domain: "development", severity: "required", message: "stub" }],
	};
}

test("submitFeatureVerificationResult: accepts mismatched submittedBySessionId and tags the attempt summary (AC-RELAX-001)", async () => {
	const root = await makeProject();
	try {
		const ctx = await setupVerifyingRecord(root, "session-attempt-owner");
		const recordHash = await currentRecordHash(root);
		const result = await submitFeatureVerificationResult({
			cwd: root,
			featureId: "verify-me",
			expectedRecordHash: recordHash,
			attemptId: ctx.attemptId,
			resultCapability: ctx.resultCapability,
			result: failingPayload(),
			submittedBySessionId: "session-non-chat-driver",
		});
		// No throw means the mismatched session was accepted; verify the tag is recorded.
		const recordText = await readFile(join(root, ".blueprint", "verifications", "verify-me.json"), "utf8");
		const record = JSON.parse(recordText);
		const last = record.attempts[record.attempts.length - 1];
		assert.match(last.summary, /\[submittedBySessionId=session-non-chat-driver\]/);
		assert.equal(last.summary.includes("stub driver failure"), true);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("submitFeatureVerificationResult: rejects when resultCapability does not match capabilityHash (AC-RELAX-002)", async () => {
	const root = await makeProject();
	try {
		const ctx = await setupVerifyingRecord(root, "session-attempt-owner");
		const recordHash = await currentRecordHash(root);
		await assert.rejects(
			submitFeatureVerificationResult({
				cwd: root,
				featureId: "verify-me",
				expectedRecordHash: recordHash,
				attemptId: ctx.attemptId,
				resultCapability: "a".repeat(64), // wrong capability
				result: failingPayload(),
				submittedBySessionId: "session-x",
			}),
			/verification result capability is missing or forged/,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});