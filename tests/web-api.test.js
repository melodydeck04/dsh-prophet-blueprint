import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initBlueprint } from "../lib/init.js";
import { getBlueprintDashboard, handleBlueprintAction, saveBlueprintFeature } from "../lib/web-api.js";
import { applyArchitectureChange, previewArchitectureChange } from "../lib/artifacts.js";
import { serializeComponent } from "../lib/architecture.js";
import { PLUGIN_VERSION } from "../lib/version.js";
import { resetSessionBlueprintBindingsForTest, setDshWorkspaceStoreForTest, setSessionBlueprintBindingStoreForTest } from "../lib/project-binding.js";

function feature(overrides = {}) {
	return {
		id: "search",
		localKey: "search",
		title: "Search",
		status: "planned",
		parentId: null,
		summary: "Finds project content by a literal query.",
		scope: ["src/search/**"],
		documents: [{ level: "required", path: "README.md" }],
		acceptance: ["A matching result is visible."],
		notes: "",
		...overrides,
	};
}

async function writeWorkspaceStore(path, workspaces) {
	await writeFile(path, JSON.stringify({ unit: { name: "workspace", version: 2 }, global: { initialized: true, workspaceIds: Object.keys(workspaces), archivedSessionIds: [] }, tables: { workspaces } }, null, 2) + "\n", "utf8");
}
const FEATURE_SPEC = `# Spec: Search

Status: proposed
Feature: search

## Problem

Search is absent.

## Scope

- allow: \`src/search/**\`

## Proposal

Add search.

## Alternatives considered

**No search.** Rejected because the feature would remain absent.

## Acceptance criteria

- AC-1: Search returns a result.

## Verification

- AC-1: test: \`tests/search.test.js\`

## Risks

Indexing may require later work.
`;

test("Web save is confined to a feature id and rejects stale updates", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-web-"));
	await initBlueprint(root);
	await writeFile(join(root, "README.md"), "# Fixture\n", "utf8");
	await writeFile(join(root, "DESIGN.md"), "# Design\n", "utf8");
	const created = await saveBlueprintFeature({ cwd: root, feature: feature(), expectedHash: null });
	assert.equal(created.saved, true);
	const dashboard = await getBlueprintDashboard(root);
	assert.equal(dashboard.plugin.hostVersion, PLUGIN_VERSION);
	assert.equal(dashboard.catalog.features[0].id, "search");
	assert.equal(dashboard.catalog.features[0].satisfaction, 100);
	assert.ok(dashboard.reconciliation.items.every((entry) => entry.owner && entry.actionKind));
	await assert.rejects(saveBlueprintFeature({ cwd: root, feature: feature({ title: "Changed" }), expectedHash: "0".repeat(64) }), /changed after the page loaded/);
	await assert.rejects(saveBlueprintFeature({ cwd: root, feature: feature({ id: "../outside" }), expectedHash: null }), /Host-derived canonical id/);
});

test("Web initialization accepts only the freshly discovered project root", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-web-init-"));
	await writeFile(join(root, "package.json"), "{}\n", "utf8");
	await assert.rejects(handleBlueprintAction({ action: "initialize", cwd: root, target: join(root, "nested") }), (error) => {
		assert.equal(error.code, "UNSAFE_INITIALIZATION_TARGET");
		return true;
	});
	const result = await handleBlueprintAction({ action: "initialize", cwd: root, target: root });
	assert.equal(result.dashboard.project.root, root);
	assert.equal(result.dashboard.audit.required, 0);
});

test("Web initialization requires an explicit bit for an unrecognized current workspace", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-web-init-manual-"));
	await writeFile(join(root, "README.md"), "# Starter\n", "utf8");
	await assert.rejects(handleBlueprintAction({ action: "initialize", cwd: root, target: root }), (error) => {
		assert.equal(error.code, "UNSAFE_INITIALIZATION_TARGET");
		return true;
	});
	await assert.rejects(handleBlueprintAction({ action: "initialize", cwd: root, target: join(root, "nested"), confirmCurrentWorkspace: true }), (error) => {
		assert.equal(error.code, "UNSAFE_INITIALIZATION_TARGET");
		return true;
	});
	const result = await handleBlueprintAction({ action: "initialize", cwd: root, target: root, confirmCurrentWorkspace: true });
	assert.equal(result.dashboard.project.root, root);
});



test("Web project resolution follows the current DSH workspace session", async () => {
	resetSessionBlueprintBindingsForTest();
	const workspaceA = await mkdtemp(join(tmpdir(), "blueprint-web-workspace-a-"));
	const workspaceB = await mkdtemp(join(tmpdir(), "blueprint-web-workspace-b-"));
	const home = await mkdtemp(join(tmpdir(), "blueprint-web-workspace-home-"));
	const store = join(await mkdtemp(join(tmpdir(), "blueprint-web-workspace-store-")), "workspace.json");
	await initBlueprint(workspaceA);
	await initBlueprint(workspaceB);
	await writeFile(join(workspaceA, "README.md"), "# Workspace A\n", "utf8");
	await writeFile(join(workspaceB, "README.md"), "# Workspace B\n", "utf8");
	await saveBlueprintFeature({ cwd: workspaceA, feature: feature({ title: "Workspace A Search" }), expectedHash: null });
	await saveBlueprintFeature({ cwd: workspaceB, feature: feature({ title: "Workspace B Search" }), expectedHash: null });
	await writeWorkspaceStore(store, {
		"workspace-a": { path: workspaceA, title: "Workspace A", sessionIds: ["session-a"] },
		"workspace-b": { path: workspaceB, title: "Workspace B", sessionIds: ["session-b"] },
	});
	setDshWorkspaceStoreForTest(store);
	const first = await handleBlueprintAction({ action: "dashboard", cwd: home, sessionId: "session-a" });
	const second = await handleBlueprintAction({ action: "dashboard", cwd: home, sessionId: "session-b" });
	assert.equal(first.project.root, workspaceA);
	assert.equal(first.project.source, "dsh-workspace-store");
	assert.equal(first.project.workspace.title, "Workspace A");
	assert.equal(first.catalog.features[0].title, "Workspace A Search");
	assert.equal(second.project.root, workspaceB);
	assert.equal(second.project.workspace.title, "Workspace B");
	assert.equal(second.catalog.features[0].title, "Workspace B Search");
});

test("Web project resolution lets DSH workspace outrank manual fallback", async () => {
	resetSessionBlueprintBindingsForTest();
	const current = await mkdtemp(join(tmpdir(), "blueprint-web-workspace-current-"));
	const fallback = await mkdtemp(join(tmpdir(), "blueprint-web-workspace-fallback-"));
	const home = await mkdtemp(join(tmpdir(), "blueprint-web-workspace-fallback-home-"));
	await initBlueprint(current);
	await initBlueprint(fallback);
	await writeFile(join(current, "README.md"), "# Current\n", "utf8");
	await writeFile(join(fallback, "README.md"), "# Fallback\n", "utf8");
	await saveBlueprintFeature({ cwd: current, feature: feature({ title: "Current Workspace" }), expectedHash: null });
	await saveBlueprintFeature({ cwd: fallback, feature: feature({ title: "Manual Fallback" }), expectedHash: null });
	await handleBlueprintAction({ action: "bind", cwd: home, sessionId: "session-workspace", target: fallback });
	const dashboard = await handleBlueprintAction({ action: "dashboard", cwd: home, sessionId: "session-workspace", dshWorkspacePath: current, dshWorkspaceTitle: "Current" });
	assert.equal(dashboard.project.root, current);
	assert.equal(dashboard.project.source, "dsh-workspace-context");
	assert.equal(dashboard.project.bound, false);
	assert.equal(dashboard.project.workspace.title, "Current");
	assert.equal(dashboard.catalog.features[0].title, "Current Workspace");
});
test("Web project binding lets a home-started Session use an existing Blueprint project", async () => {
	resetSessionBlueprintBindingsForTest();
	const root = await mkdtemp(join(tmpdir(), "blueprint-web-bind-root-"));
	const home = await mkdtemp(join(tmpdir(), "blueprint-web-bind-home-"));
	await initBlueprint(root);
	await writeFile(join(root, "README.md"), "# Bound\n", "utf8");
	await saveBlueprintFeature({ cwd: root, feature: feature(), expectedHash: null });
	const bound = await handleBlueprintAction({ action: "bind", cwd: home, sessionId: "session-bind-1", target: root });
	assert.equal(bound.project.root, root);
	assert.equal(bound.project.bound, true);
	assert.equal(bound.catalog.features[0].id, "search");
	const dashboard = await handleBlueprintAction({ action: "dashboard", cwd: home, sessionId: "session-bind-1" });
	assert.equal(dashboard.project.root, root);
	assert.equal(dashboard.project.binding.root, root);
	assert.equal(dashboard.project.binding.cwd, home);
});



test("Web project fallback survives a plugin cache reset", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-web-persist-root-"));
	const home = await mkdtemp(join(tmpdir(), "blueprint-web-persist-home-"));
	const store = join(await mkdtemp(join(tmpdir(), "blueprint-web-persist-store-")), "bindings.json");
	setSessionBlueprintBindingStoreForTest(store);
	await initBlueprint(root);
	await writeFile(join(root, "README.md"), "# Persisted\n", "utf8");
	await saveBlueprintFeature({ cwd: root, feature: feature({ title: "Persisted Search" }), expectedHash: null });
	await handleBlueprintAction({ action: "bind", cwd: home, sessionId: "first-session", target: root });
	setSessionBlueprintBindingStoreForTest(store);
	const dashboard = await handleBlueprintAction({ action: "dashboard", cwd: home, sessionId: "second-session" });
	assert.equal(dashboard.project.root, root);
	assert.equal(dashboard.project.bound, true);
	assert.equal(dashboard.catalog.features[0].title, "Persisted Search");
});

test("Web project binding does not override a Blueprint Session cwd", async () => {
	resetSessionBlueprintBindingsForTest();
	const current = await mkdtemp(join(tmpdir(), "blueprint-web-bind-current-"));
	const other = await mkdtemp(join(tmpdir(), "blueprint-web-bind-other-"));
	await initBlueprint(current);
	await initBlueprint(other);
	await writeFile(join(current, "README.md"), "# Current\n", "utf8");
	await writeFile(join(other, "README.md"), "# Other\n", "utf8");
	await saveBlueprintFeature({ cwd: current, feature: feature({ title: "Current Search" }), expectedHash: null });
	await saveBlueprintFeature({ cwd: other, feature: feature({ title: "Other Search" }), expectedHash: null });
	await handleBlueprintAction({ action: "bind", cwd: current, sessionId: "session-bind-cwd", target: other });
	const dashboard = await handleBlueprintAction({ action: "dashboard", cwd: current, sessionId: "session-bind-cwd" });
	assert.equal(dashboard.project.root, current);
	assert.equal(dashboard.project.bound, false);
	assert.equal(dashboard.catalog.features[0].title, "Current Search");
});

test("Web project binding rejects unsafe binding requests", async () => {
	resetSessionBlueprintBindingsForTest();
	const home = await mkdtemp(join(tmpdir(), "blueprint-web-bind-bad-"));
	await assert.rejects(handleBlueprintAction({ action: "bind", cwd: home, sessionId: "session-bind-bad", target: "" }), (error) => {
		assert.equal(error.code, "INVALID_TARGET");
		return true;
	});
	await assert.rejects(handleBlueprintAction({ action: "bind", cwd: home, sessionId: "session-bind-bad", target: home }), (error) => {
		assert.equal(error.code, "BLUEPRINT_PROJECT_NOT_FOUND");
		return true;
	});
});

test("Web upgrade adds documentation governance to an older Blueprint project", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-web-upgrade-"));
	await initBlueprint(root);
	const path = join(root, "design-blueprint.json");
	const legacy = JSON.parse(await readFile(path, "utf8"));
	delete legacy.documentation;
	delete legacy.features.approvalsRoot;
	legacy.changePolicy.allowWithoutSpec = legacy.changePolicy.allowWithoutSpec.filter((entry) => entry !== ".blueprint/approvals/**");
	await writeFile(path, JSON.stringify(legacy, null, 2) + "\n", "utf8");
	const result = await handleBlueprintAction({ action: "upgrade", cwd: root });
	assert.ok(result.initialized.updated.includes("design-blueprint.json"));
	assert.equal(result.dashboard.audit.documentation.enabled, true);
	const upgraded = JSON.parse(await readFile(path, "utf8"));
	assert.equal(upgraded.features.approvalsRoot, ".blueprint/approvals");
	assert.ok(upgraded.changePolicy.allowWithoutSpec.includes(".blueprint/approvals/**"));
});

test("Web approval binds the exact visible proposed spec", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-web-approve-"));
	await initBlueprint(root);
	await saveBlueprintFeature({ cwd: root, feature: feature(), expectedHash: null });
	await mkdir(join(root, "docs", "user", "features"), { recursive: true });
	await writeFile(join(root, ".specs", "proposed", "search.md"), FEATURE_SPEC, "utf8");
	await writeFile(join(root, ".specs", "proposed", "search.zh.md"), "# 规格：搜索\n\n搜索功能开发方案。\n", "utf8");
	await writeFile(join(root, "docs", "user", "features", "search.md"), "# Search\n\n## What it does\n\nSearches.\n", "utf8");
	await writeFile(join(root, "docs", "user", "features", "search.zh.md"), "# 搜索\n\n## 实现什么\n\n提供搜索。\n", "utf8");
	let dashboard = await getBlueprintDashboard(root);
	let search = dashboard.catalog.features.find((entry) => entry.id === "search");
	assert.equal(search.workflow.stage, "ready");
	assert.equal(search.workflow.internalStage, "review");
	assert.equal(search.brief.zh.file, "docs/user/features/search.zh.md");
	assert.equal(search.workflow.spec.languages.zh.file, ".specs/proposed/search.zh.md");
	assert.match(search.workflow.spec.hash, /^[a-f0-9]{64}$/);
	await assert.rejects(handleBlueprintAction({ action: "approve", cwd: root, featureId: "search", expectedSpecHash: search.workflow.spec.hash }), /requires at least one valid non-deprecated Component owner/);
	await mkdir(join(root, ".blueprint", "architecture", "components"), { recursive: true });
	await writeFile(join(root, ".blueprint", "architecture", "components", "search-service.md"), serializeComponent({
		id: "search-service", title: "Search service", kind: "service", containerId: null, deployment: null, status: "active",
		summary: "Owns search behavior.", ownedPaths: ["src/search/**"], contracts: [], dependencies: [], supportedFeatures: ["search"],
		documents: [{ level: "required", path: "DESIGN.md" }],
	}), "utf8");
	dashboard = await getBlueprintDashboard(root);
	search = dashboard.catalog.features.find((entry) => entry.id === "search");
	assert.equal(search.architecture.ready, true);
	assert.deepEqual(search.components, ["search-service"]);
	dashboard = await handleBlueprintAction({ action: "approve", cwd: root, featureId: "search", expectedSpecHash: search.workflow.spec.hash });
	search = dashboard.catalog.features.find((entry) => entry.id === "search");
	assert.equal(search.workflow.stage, "ready");
	assert.equal(search.workflow.internalStage, "approved");
	assert.equal(search.workflow.spec.content, FEATURE_SPEC);
});

test("Web document reads only files registered to the selected Feature", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-web-doc-"));
	await initBlueprint(root);
	await writeFile(join(root, "README.md"), "# Registered\n", "utf8");
	await saveBlueprintFeature({ cwd: root, feature: feature(), expectedHash: null });
	const result = await handleBlueprintAction({ action: "document", cwd: root, featureId: "search", file: "README.md" });
	assert.equal(result.content, "# Registered\n");
	await writeFile(join(root, "secret.md"), "not registered\n", "utf8");
	await assert.rejects(handleBlueprintAction({ action: "document", cwd: root, featureId: "search", file: "secret.md" }), /not registered/);
	await assert.rejects(handleBlueprintAction({ action: "document", cwd: root, featureId: "search", file: "../outside.md" }), /repository-relative/);
});

test("Web architecture-preview and architecture-apply enforce optimistic concurrency on the registered component file", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-web-arch-"));
	await initBlueprint(root);
	await writeFile(join(root, "README.md"), "# Project\n", "utf8");
	await writeFile(join(root, "DESIGN.md"), "# Design\n", "utf8");
	const change = {
		action: "upsert",
		id: "backend-api",
		title: "Backend API",
		kind: "service",
		containerId: null,
		deployment: "prod-cluster-1",
		status: "active",
		summary: "Hosts the JSON API.",
		ownedPaths: ["lib/api/**"],
		contracts: ["/api/v1/users"],
		dependencies: [],
		supportedFeatures: [],
		documents: [{ level: "required", path: "DESIGN.md" }],
	};
	const preview = await handleBlueprintAction({ action: "architecture-preview", cwd: root, change });
	assert.equal(preview.preview.delta.added[0], "backend-api");
	const applied = await handleBlueprintAction({ action: "architecture-apply", cwd: root, change, expectedPreviewHash: preview.preview.previewHash });
	assert.equal(applied.applied.change.id, "backend-api");
	assert.ok(applied.dashboard.architecture.components.some((entry) => entry.id === "backend-api"));
});

test("Web architecture initialization previews and creates the first repository component", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-web-arch-init-"));
	await initBlueprint(root);
	await writeFile(join(root, "package.json"), JSON.stringify({ name: "starter-app", description: "Starter application.", files: ["src/**"] }, null, 2) + "\n", "utf8");
	await writeFile(join(root, "README.md"), "# Project\n", "utf8");
	await writeFile(join(root, "DESIGN.md"), "# Design\n", "utf8");
	const preview = await handleBlueprintAction({ action: "architecture-initialize-preview", cwd: root });
	assert.equal(preview.proposal.id, "starter-app");
	const applied = await handleBlueprintAction({ action: "architecture-initialize-apply", cwd: root, expectedPreviewHash: preview.preview.previewHash });
	assert.equal(applied.applied.change.id, "starter-app");
	assert.equal(applied.dashboard.architecture.components[0].id, "starter-app");
	await assert.rejects(handleBlueprintAction({ action: "architecture-initialize-preview", cwd: root }), /already initialized/);
});

test("Web architecture actions refuse stale preview hashes and out-of-bound changes", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-web-arch-stale-"));
	await initBlueprint(root);
	await writeFile(join(root, "README.md"), "# Project\n", "utf8");
	await writeFile(join(root, "DESIGN.md"), "# Design\n", "utf8");
	const change = {
		action: "upsert",
		id: "ghost",
		title: "Ghost",
		kind: "internal",
		containerId: null,
		deployment: null,
		status: "planned",
		summary: "Ghost.",
		ownedPaths: ["lib/ghost/**"],
		contracts: [],
		dependencies: [],
		supportedFeatures: [],
		documents: [{ level: "required", path: "DESIGN.md" }],
	};
	await assert.rejects(
		handleBlueprintAction({ action: "architecture-apply", cwd: root, change, expectedPreviewHash: "0".repeat(64) }),
		/changed after preview/,
	);
});




