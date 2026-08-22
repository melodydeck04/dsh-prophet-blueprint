import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { initBlueprint } from "../lib/init.js";
import { serializeFeature } from "../lib/features.js";
import { getBlueprintDashboard } from "../lib/web-api.js";

const execute = promisify(execFile);
const cli = fileURLToPath(new URL("../lib/cli.js", import.meta.url));

const SPEC = `# Spec: Accounts

Status: proposed
Feature: accounts

## Problem

Accounts are absent.

## Scope

- allow: \`lib/accounts/**\`

## Proposal

Add accounts.

## Alternatives considered

**No accounts.** Rejected because the feature would remain absent.

## Acceptance criteria

- AC-1: Accounts are available.

## Verification

- AC-1: test: \`tests/accounts.test.js\`

## Risks

The API may evolve.
`;

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "blueprint-cli-approval-"));
	await initBlueprint(root);
	await writeFile(join(root, ".blueprint", "features", "accounts.md"), serializeFeature({
		id: "accounts",
		title: "Accounts",
		status: "planned",
		parentId: null,
		summary: "Owns accounts.",
		scope: ["lib/accounts/**"],
		documents: [{ level: "required", path: "README.md" }],
		acceptance: ["Accounts are visible."],
		notes: "",
	}), "utf8");
	await writeFile(join(root, ".specs", "proposed", "accounts.md"), SPEC, "utf8");
	await writeFile(join(root, ".specs", "proposed", "accounts.zh.md"), "# Spec: Accounts (Chinese)\n\nEquivalent proposal.\n", "utf8");
	return root;
}

test("CLI approval requires explicit confirmation and the exact bilingual hash", async () => {
	const root = await fixture();
	const dashboard = await getBlueprintDashboard(root);
	const hash = dashboard.catalog.features[0].workflow.spec.hash;
	await assert.rejects(
		execute(process.execPath, [cli, "approve", "accounts", "--cwd", root, "--spec-hash", hash]),
		(error) => error.stderr.includes("approve requires --yes"),
	);
	await assert.rejects(
		execute(process.execPath, [cli, "approve", "accounts", "--cwd", root, "--spec-hash", "0".repeat(64), "--yes"]),
		(error) => error.stderr.includes("changed after the page loaded"),
	);
	const result = await execute(process.execPath, [cli, "approve", "accounts", "--cwd", root, "--spec-hash", hash, "--yes", "--json"]);
	const output = JSON.parse(result.stdout);
	assert.equal(output.record.featureId, "accounts");
	assert.equal(output.record.specHash, hash);
	const record = JSON.parse(await readFile(join(root, ".blueprint", "approvals", "accounts.json"), "utf8"));
	assert.equal(record.specHash, hash);
});
