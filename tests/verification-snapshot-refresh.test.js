import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, appendFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initBlueprint } from "../lib/init.js";
import { refreshVerificationSnapshot, requestFeatureVerification, prepareFeatureVerification, loadVerificationCatalog, beginFeatureImplementation } from "../lib/verification.js";

async function makeProject() {
	const root = await mkdtemp(join(tmpdir(), "blueprint-vsr-"));
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

async function setupRequestVerification(root) {
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
	const ws = await (await import("../lib/snapshot.js")).workingTreeSnapshot(root);
	const configResult = await (await import("../lib/config.js")).loadConfig(ws);
	const features = await (await import("../lib/features.js")).loadFeatureCatalog(ws, configResult.config);
	const catalog = await loadVerificationCatalog(ws, configResult.config, features.features);
	const record = catalog.records.get("verify-me");
	return { recordHash: record.hash, record };
}

test("refreshVerificationSnapshot: succeeds in verification_ready stage (AC-VREFRESH-001)", async () => {
	const root = await makeProject();
	try {
		const { recordHash } = await setupRequestVerification(root);
		await appendFile(join(root, "session.jsonl"), "{}\n", "utf8");
		const result = await refreshVerificationSnapshot({ cwd: root, featureId: "verify-me", expectedRecordHash: recordHash });
		assert.ok(result.record.snapshot);
		assert.ok(result.record.snapshot.digest);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("refreshVerificationSnapshot: rejects stale expectedRecordHash (AC-VREFRESH-002)", async () => {
	const root = await makeProject();
	try {
		const { record } = await setupRequestVerification(root);
		await assert.rejects(
			refreshVerificationSnapshot({ cwd: root, featureId: "verify-me", expectedRecordHash: "0".repeat(64) }),
			/hash does not match/,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("refreshVerificationSnapshot: throws when stage is not verification_ready (AC-VREFRESH-003)", async () => {
	const root = await makeProject();
	try {
		await setupRequestVerification(root);
		// Force the stage back to a stage other than verification_ready by editing the record.
		// Use "implementing" — it survives parseVerificationRecord and triggers the stage-guard in refreshVerificationSnapshot.
		const file = join(root, ".blueprint", "verifications", "verify-me.json");
		const text = await import("node:fs/promises").then((m) => m.readFile(file, "utf8"));
		const rec = JSON.parse(text);
		rec.stage = "implementing";
		rec.snapshot = null;
		rec.requestedAt = null;
		await import("node:fs/promises").then((m) => m.writeFile(file, JSON.stringify(rec, null, 2), "utf8"));
		const { createHash } = await import("node:crypto");
		const editedHash = createHash("sha256").update(await import("node:fs/promises").then((m) => m.readFile(file, "utf8"))).digest("hex");
		await assert.rejects(
			refreshVerificationSnapshot({ cwd: root, featureId: "verify-me", expectedRecordHash: editedHash }),
			/snapshot refresh is only valid from stage 'verification_ready'/,
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("refreshVerificationSnapshot: prepareVerification succeeds after refresh (AC-VREFRESH-004)", async () => {
	const root = await makeProject();
	try {
		const { recordHash } = await setupRequestVerification(root);
		await appendFile(join(root, "session.jsonl"), "{}\n", "utf8");
		await refreshVerificationSnapshot({ cwd: root, featureId: "verify-me", expectedRecordHash: recordHash });
		// Re-load the catalog to capture the refreshed record hash.
		const ws = await (await import("../lib/snapshot.js")).workingTreeSnapshot(root);
		const configResult = await (await import("../lib/config.js")).loadConfig(ws);
		const features = await (await import("../lib/features.js")).loadFeatureCatalog(ws, configResult.config);
		const refreshedCatalog = await loadVerificationCatalog(ws, configResult.config, features.features);
		const refreshedHash = refreshedCatalog.records.get("verify-me").hash;
		// Should not throw; pass the new record hash so prepareFeatureVerification sees the refreshed state.
		await prepareFeatureVerification({ cwd: root, featureId: "verify-me", expectedRecordHash: refreshedHash });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
