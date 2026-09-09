import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile, mkdir, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { initBlueprint } from "../lib/init.js";
import {
	beginFeatureImplementation,
	requestFeatureVerification,
	loadVerificationCatalog,
} from "../lib/verification.js";
import { loadFeatureCatalog } from "../lib/features.js";
import { loadConfig } from "../lib/config.js";
import { workingTreeSnapshot } from "../lib/snapshot.js";

const execute = promisify(execFile);
const cli = fileURLToPath(new URL("../lib/cli.js", import.meta.url));

async function makeProject() {
	const root = await mkdtemp(join(tmpdir(), "blueprint-vbf-status-"));
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

async function setupVerifiedRecord(root) {
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

test("verification status --json prints the public record with featureId, stage, cycle, spec, snapshot, attempts, history (AC-VSTATUS-001)", async () => {
	const root = await makeProject();
	try {
		await setupVerifiedRecord(root);
		const r = await runCli(["verification", "status", "verify-me", "--cwd", root, "--json"]);
		assert.equal(r.code, 0, `stderr: ${r.stderr}`);
		const parsed = JSON.parse(r.stdout);
		assert.equal(parsed.featureId, "verify-me");
		assert.equal(parsed.stage, "verification_ready");
		assert.ok(parsed.cycle);
		assert.ok(parsed.spec);
		assert.ok(parsed.snapshot);
		assert.ok(Array.isArray(parsed.attempts));
		assert.ok(Array.isArray(parsed.history));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("verification status does not write to the record file (AC-VSTATUS-002)", async () => {
	const root = await makeProject();
	try {
		await setupVerifiedRecord(root);
		const recordPath = join(root, ".blueprint", "verifications", "verify-me.json");
		const before = await stat(recordPath);
		await new Promise((resolve) => setTimeout(resolve, 1100)); // ensure mtime would tick
		const r = await runCli(["verification", "status", "verify-me", "--cwd", root]);
		assert.equal(r.code, 0, `stderr: ${r.stderr}`);
		const after = await stat(recordPath);
		assert.equal(after.mtimeMs, before.mtimeMs, `mtime changed: ${before.mtimeMs} -> ${after.mtimeMs}`);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("verification status exits 1 when the feature has no record (AC-VSTATUS-003)", async () => {
	const root = await makeProject();
	try {
		const r = await runCli(["verification", "status", "ghost-feature", "--cwd", root]);
		assert.notEqual(r.code, 0);
		assert.match(r.stderr, /verification record not found for feature 'ghost-feature'/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});