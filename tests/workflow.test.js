import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../lib/config.js";
import { loadFeatureCatalog, serializeFeature } from "../lib/features.js";
import { serializeComponent, loadArchitectureCatalog } from "../lib/architecture.js";
import { initBlueprint } from "../lib/init.js";
import { evaluatePolicy } from "../lib/policy.js";
import { loadSpecs } from "../lib/specs.js";
import { workingTreeSnapshot } from "../lib/snapshot.js";
import { approveFeatureProposal, loadFeatureWorkflow } from "../lib/workflow.js";

const FEATURE = {
	id: "accounts",
	title: "Accounts",
	status: "planned",
	parentId: null,
	summary: "Owns account behavior.",
	scope: ["lib/accounts/**"],
	documents: [{ level: "required", path: "README.md" }],
	acceptance: ["An account is visible."],
	notes: "",
	components: ["accounts-service"],
};

const SPEC = `# Spec: Accounts

Status: proposed
Feature: accounts

## Problem

Account behavior is absent.

## Scope

- allow: \`lib/accounts/**\`

## Proposal

Add the account module.

## Alternatives considered

**No module.** Rejected because the feature would remain absent.

## Acceptance criteria

- AC-1: Account behavior is available.

## Verification

- AC-1: test: \`tests/accounts.test.js\`

## Risks

The API may need later extension.
`;

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "blueprint-workflow-"));
	await initBlueprint(root);
	await writeFile(join(root, ".blueprint", "features", "accounts.md"), serializeFeature(FEATURE), "utf8");
	await mkdir(join(root, ".blueprint", "architecture", "components"), { recursive: true });
	await writeFile(join(root, ".blueprint", "architecture", "components", "accounts-service.md"), serializeComponent({
		id: "accounts-service",
		title: "Accounts service",
		kind: "service",
		containerId: null,
		deployment: null,
		status: "active",
		summary: "Owns account behavior.",
		ownedPaths: ["lib/accounts/**"],
		contracts: [],
		dependencies: [],
		supportedFeatures: ["accounts"],
		documents: [{ level: "required", path: "DESIGN.md" }],
	}), "utf8");
	await writeFile(join(root, ".specs", "proposed", "accounts.md"), SPEC, "utf8");
	await writeFile(join(root, ".specs", "proposed", "accounts.zh.md"), "# 规格：账户\n\n账户功能开发方案。\n", "utf8");
	return root;
}

async function state(root) {
	const snapshot = await workingTreeSnapshot(root);
	const { config } = await loadConfig(snapshot);
	const specs = await loadSpecs(snapshot, config);
	const catalog = await loadFeatureCatalog(snapshot, config);
	const architecture = await loadArchitectureCatalog(snapshot, config);
	const workflow = await loadFeatureWorkflow(snapshot, config, specs.specs, catalog.features, architecture.components);
	return { snapshot, config, specs, catalog, architecture, workflow };
}

async function makeImplemented(root, feature = { ...FEATURE, status: "active" }) {
	const implemented = SPEC
		.replace("Status: proposed", "Status: implemented")
		.replace("## Proposal", "## Decision")
		.replace("## Risks\n\nThe API may need later extension.", "## Consequences\n\nThe behavior is present in the repository.\n\n## Risks\n\nThe API may need later extension.");
	await writeFile(join(root, ".blueprint", "features", "accounts.md"), serializeFeature(feature), "utf8");
	await writeFile(join(root, ".specs", "implemented", "accounts.md"), implemented, "utf8");
	await writeFile(join(root, ".specs", "implemented", "accounts.zh.md"), "# 规格：账户\n\n已实现的账户功能。\n", "utf8");
	await unlink(join(root, ".specs", "proposed", "accounts.md"));
	await unlink(join(root, ".specs", "proposed", "accounts.zh.md"));
}

test("feature-linked proposals require an exact direct-developer approval", async () => {
	const root = await fixture();
	let current = await state(root);
	assert.equal(current.workflow.states.get("accounts").stage, "review");
	const policyBefore = evaluatePolicy({
		snapshot: current.snapshot,
		config: current.config,
		specs: current.specs.specs,
		changes: [{ status: "A", path: "lib/accounts/index.js" }],
		approvedSpecFiles: current.workflow.approvedSpecFiles,
	});
	assert.ok(policyBefore.some((entry) => entry.check === "feature-approval"));
	const spec = current.workflow.states.get("accounts").spec;
	await approveFeatureProposal({ cwd: root, featureId: "accounts", expectedSpecHash: spec.reviewHash });
	current = await state(root);
	assert.equal(current.workflow.states.get("accounts").stage, "approved");
	const policyAfter = evaluatePolicy({
		snapshot: current.snapshot,
		config: current.config,
		specs: current.specs.specs,
		changes: [{ status: "A", path: "lib/accounts/index.js" }],
		approvedSpecFiles: current.workflow.approvedSpecFiles,
	});
	assert.equal(policyAfter.length, 0);
});

test("editing a proposed spec invalidates its approval", async () => {
	const root = await fixture();
	let current = await state(root);
	const spec = current.workflow.states.get("accounts").spec;
	await approveFeatureProposal({ cwd: root, featureId: "accounts", expectedSpecHash: spec.reviewHash });
	await writeFile(join(root, ".specs", "proposed", "accounts.md"), `${SPEC}\nProposal changed.\n`, "utf8");
	current = await state(root);
	assert.equal(current.workflow.states.get("accounts").stage, "review");
	assert.ok(current.workflow.issues.some((entry) => entry.message.includes("no longer matches")));
	const record = JSON.parse(await readFile(join(root, ".blueprint", "approvals", "accounts.json"), "utf8"));
	assert.equal(record.featureId, "accounts");
});

test("editing only the Chinese Spec counterpart invalidates approval", async () => {
	const root = await fixture();
	let current = await state(root);
	const spec = current.workflow.states.get("accounts").spec;
	await approveFeatureProposal({ cwd: root, featureId: "accounts", expectedSpecHash: spec.reviewHash });
	await writeFile(join(root, ".specs", "proposed", "accounts.zh.md"), "# 规格：账户\n\n中文方案已修改。\n", "utf8");
	current = await state(root);
	assert.equal(current.workflow.states.get("accounts").stage, "review");
	assert.ok(current.workflow.issues.some((entry) => entry.message.includes("no longer matches")));
});

test("architecture component identities are not changed by Container or parent changes", async () => {
	const root = await fixture();
	await mkdir(join(root, ".blueprint", "architecture", "components"), { recursive: true });
	await writeFile(join(root, ".blueprint", "architecture", "components", "backend-api.md"), serializeComponent({
		id: "backend-api",
		title: "Backend API",
		kind: "service",
		containerId: "shell",
		deployment: "primary",
		status: "active",
		summary: "Hosts the JSON API.",
		ownedPaths: ["lib/api/**"],
		contracts: ["/api/v1/users"],
		dependencies: [],
		supportedFeatures: ["accounts"],
		documents: [{ level: "required", path: "DESIGN.md" }],
	}), "utf8");
	const initial = await state(root);
	assert.equal(initial.architecture.components.find((component) => component.id === "backend-api").containerId, "shell");
	await writeFile(join(root, ".blueprint", "architecture", "components", "backend-api.md"), serializeComponent({
		id: "backend-api",
		title: "Backend API",
		kind: "service",
		containerId: null,
		deployment: "primary",
		status: "active",
		summary: "Hosts the JSON API.",
		ownedPaths: ["lib/api/**"],
		contracts: ["/api/v1/users"],
		dependencies: [],
		supportedFeatures: ["accounts"],
		documents: [{ level: "required", path: "DESIGN.md" }],
	}), "utf8");
	const reparented = await state(root);
	const persisted = reparented.architecture.components.find((component) => component.id === "backend-api");
	assert.equal(persisted.id, "backend-api");
	assert.equal(persisted.containerId, null);
	assert.equal(reparented.architecture.issues.filter((issue) => issue.severity === "required").length, 0);
});

test("consistent historical implementations are completed_legacy without fabricated verifier evidence", async () => {
	const root = await fixture();
	await makeImplemented(root);
	const current = await state(root);
	assert.equal(current.workflow.states.get("accounts").stage, "completed_legacy");
	assert.equal(current.workflow.states.get("accounts").verification, null);
});

test("historical implementations with required-document drift require independent verification", async () => {
	const root = await fixture();
	await makeImplemented(root, { ...FEATURE, status: "active", documents: [{ level: "required", path: "docs/missing-account-contract.md" }] });
	const current = await state(root);
	assert.equal(current.workflow.states.get("accounts").stage, "verification_required");
	assert.ok(current.workflow.issues.some((entry) => entry.message.includes("has no completed verification")));
});
