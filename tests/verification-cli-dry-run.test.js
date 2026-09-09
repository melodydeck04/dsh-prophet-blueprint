import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile, mkdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { initBlueprint } from "../lib/init.js";
import {
	beginFeatureImplementation,
	requestFeatureVerification,
} from "../lib/verification.js";

const execute = promisify(execFile);
const cli = fileURLToPath(new URL("../lib/cli.js", import.meta.url));

async function makeProject() {
	const root = await mkdtemp(join(tmpdir(), "blueprint-vbf-dryrun-"));
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
		"- AC-A-1: stub",
		"- AC-B-2: stub",
		"- AC-C-3: stub",
		"",
		"## Verification",
		"",
		"- AC-A-1: stub",
		"- AC-B-2: stub",
		"- AC-C-3: stub",
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

function makeValidPayload(acIds) {
	return {
		conclusion: "passed",
		summary: "ok",
		acResults: acIds.map((id) => ({ id, status: "passed", evidence: ["stub"] })),
		checks: acIds.map((id) => ({
			id: `cmd-${id}`,
			kind: "command",
			status: "passed",
			summary: "stub",
			surface: "cli",
			moment: "terminal",
			evidenceLevel: "contract-integration",
			environment: "",
			entryPoint: "",
			action: "",
			oracle: "",
			actual: "",
			acIds: [id],
			observations: [],
			artifacts: [],
		})),
		findings: [],
	};
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

test("verification dry-run with valid payload exits 0 and prints OK (AC-VDRYRUN-001)", async () => {
	const root = await makeProject();
	try {
		await setupVerifiedRecord(root);
		const payloadPath = join(root, "payload.json");
		await writeFile(payloadPath, JSON.stringify(makeValidPayload(["AC-A-1", "AC-B-2", "AC-C-3"])), "utf8");
		const r = await runCli(["verification", "dry-run", "verify-me", "--cwd", root, "--payload-file", payloadPath]);
		assert.equal(r.code, 0, `stderr: ${r.stderr}`);
		assert.match(r.stdout, /OK: payload is valid/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("verification dry-run with 3 unsatisfied ACs exits 1 and prints 3 issue lines (AC-VDRYRUN-002)", async () => {
	const root = await makeProject();
	try {
		await setupVerifiedRecord(root);
		const payloadPath = join(root, "payload.json");
		// Empty payload — 3 missing AC pairings.
		await writeFile(payloadPath, JSON.stringify({ conclusion: "passed", summary: "", acResults: [], checks: [], findings: [] }), "utf8");
		const r = await runCli(["verification", "dry-run", "verify-me", "--cwd", root, "--payload-file", payloadPath]);
		assert.notEqual(r.code, 0);
		assert.match(r.stdout, /FAIL: 3 issue\(s\) found/);
		assert.match(r.stdout, /AC-A-1/);
		assert.match(r.stdout, /AC-B-2/);
		assert.match(r.stdout, /AC-C-3/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("verification dry-run does not write to the record file on failure (AC-VDRYRUN-003)", async () => {
	const root = await makeProject();
	try {
		await setupVerifiedRecord(root);
		const recordPath = join(root, ".blueprint", "verifications", "verify-me.json");
		const before = await stat(recordPath);
		const payloadPath = join(root, "payload.json");
		await writeFile(payloadPath, JSON.stringify({ conclusion: "passed", summary: "", acResults: [], checks: [], findings: [] }), "utf8");
		await new Promise((resolve) => setTimeout(resolve, 1100));
		const r = await runCli(["verification", "dry-run", "verify-me", "--cwd", root, "--payload-file", payloadPath]);
		assert.notEqual(r.code, 0);
		const after = await stat(recordPath);
		assert.equal(after.mtimeMs, before.mtimeMs, `mtime changed: ${before.mtimeMs} -> ${after.mtimeMs}`);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});