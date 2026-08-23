import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DEFAULT_CONFIG } from "../lib/config.js";
import { COMPONENT_ID_PATTERN, COMPONENT_KINDS, COMPONENT_RELATION_TYPES, COMPONENT_STATUSES, loadArchitectureCatalog, parseComponent, serializeComponent } from "../lib/architecture.js";
import { applyArchitectureChange, applyArchitectureInitialization, previewArchitectureChange, previewArchitectureInitialization } from "../lib/artifacts.js";
import { workingTreeSnapshot } from "../lib/snapshot.js";
import { initBlueprint } from "../lib/init.js";

function component(overrides = {}) {
	return {
		id: "backend-api",
		title: "Backend API",
		kind: "service",
		containerId: null,
		deployment: "prod-cluster-1",
		status: "active",
		summary: "Hosts the JSON API used by the dashboard.",
		ownedPaths: ["lib/api/**", "lib/auth/**"],
		contracts: ["/api/v1/users", "/api/v1/auth"],
		dependencies: [],
		supportedFeatures: [],
		documents: [{ level: "required", path: "DESIGN.md" }],
		...overrides,
	};
}

const COMPONENT = `# Component: Backend API

Id: backend-api
Kind: service
Container:
Deployment: prod-cluster-1
Status: active

## Summary

Hosts the JSON API.

## Owned paths

- lib/api/**

## Provided contracts

- /api/v1/users

## Dependencies

- depends_on: shared-db

## Supported features

- accounts

## Documents

- required: DESIGN.md
`;

test("parseComponent reads container, deployment, contracts, typed dependencies, supported features, and documents", () => {
	const parsed = parseComponent(".blueprint/architecture/components/backend-api.md", COMPONENT);
	assert.equal(parsed.component.id, "backend-api");
	assert.equal(parsed.component.kind, "service");
	assert.equal(parsed.component.containerId, null);
	assert.equal(parsed.component.deployment, "prod-cluster-1");
	assert.equal(parsed.component.contracts[0], "/api/v1/users");
	assert.equal(parsed.component.dependencies[0].relation, "depends_on");
	assert.equal(parsed.component.dependencies[0].target, "shared-db");
	assert.deepEqual(parsed.component.supportedFeatures, ["accounts"]);
	assert.deepEqual(parsed.component.documents, [{ level: "required", path: "DESIGN.md" }]);
	assert.equal(parsed.component.hash.length, 64);
	assert.deepEqual(parsed.issues, []);
});

test("serializeComponent round-trips through canonical Markdown", () => {
	const content = serializeComponent(component());
	const parsed = parseComponent(".blueprint/architecture/components/backend-api.md", content);
	assert.deepEqual(parsed.issues, []);
	assert.equal(parsed.component.id, component().id);
	assert.equal(parsed.component.title, component().title);
	assert.equal(parsed.component.kind, component().kind);
	assert.equal(parsed.component.deployment, component().deployment);
	assert.deepEqual(parsed.component.ownedPaths, component().ownedPaths);
	assert.deepEqual(parsed.component.contracts, component().contracts);
	assert.deepEqual(parsed.component.dependencies, component().dependencies);
	assert.deepEqual(parsed.component.supportedFeatures, component().supportedFeatures);
});

test("loadArchitectureCatalog detects container cycles, ambiguous owned paths, and invalid references", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-architecture-catalog-"));
	await mkdir(join(root, ".blueprint", "architecture", "components"), { recursive: true });
	await writeFile(join(root, "README.md"), "# Project\n", "utf8");
	await writeFile(join(root, "DESIGN.md"), "# Design\n", "utf8");
	await writeFile(join(root, ".blueprint", "architecture", "components", "frontend.md"), serializeComponent(component({ id: "frontend", title: "Frontend", containerId: "shell", ownedPaths: ["lib/web/**"], supportedFeatures: [], contracts: [], dependencies: [] })), "utf8");
	await writeFile(join(root, ".blueprint", "architecture", "components", "shell.md"), serializeComponent(component({ id: "shell", title: "Shell", containerId: "frontend", ownedPaths: ["lib/shell/**"], supportedFeatures: [], contracts: [], dependencies: [] })), "utf8");
	await writeFile(join(root, ".blueprint", "architecture", "components", "shared.md"), serializeComponent(component({ id: "shared", title: "Shared", containerId: null, ownedPaths: ["lib/shared/**", "lib/shared/**"], supportedFeatures: [], contracts: ["/api/shared"], dependencies: [{ relation: "depends_on", target: "missing-component" }] })), "utf8");
	await writeFile(join(root, ".blueprint", "architecture", "components", "duplicated.md"), serializeComponent(component({ id: "duplicated", title: "Duplicated", containerId: null, ownedPaths: ["lib/shared/**"], supportedFeatures: [], contracts: ["/api/shared"], dependencies: [] })), "utf8");
	const catalog = await loadArchitectureCatalog(await workingTreeSnapshot(root), DEFAULT_CONFIG);
	const checks = catalog.issues.map((issue) => issue.check);
	assert.ok(checks.includes("component-cycle"), "container cycles must be reported");
	assert.ok(checks.includes("component-path-ambiguity"), "ambiguous owned paths must be reported");
	assert.ok(checks.includes("component-relation"), "missing relation targets must be reported");
	assert.ok(checks.includes("component-contract"), "duplicate contracts must be reported");
});

test("loadArchitectureCatalog records a component-location issue for files outside the components directory", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-architecture-ignored-"));
	await mkdir(join(root, ".blueprint", "architecture", "components", "nested"), { recursive: true });
	await writeFile(join(root, "README.md"), "# Project\n", "utf8");
	await writeFile(join(root, "DESIGN.md"), "# Design\n", "utf8");
	await writeFile(join(root, ".blueprint", "architecture", "components", "nested", "wrong-place.md"), serializeComponent(component({ id: "wrong-place" })), "utf8");
	await writeFile(join(root, ".blueprint", "architecture", "components", "valid.md"), serializeComponent(component({ id: "valid" })), "utf8");
	const catalog = await loadArchitectureCatalog(await workingTreeSnapshot(root), DEFAULT_CONFIG);
	const validComponent = catalog.components.find((entry) => entry.id === "valid");
	assert.ok(validComponent);
	assert.ok(catalog.issues.some((issue) => issue.check === "component-location"));
});

test("preview and apply upsert a new component with stable identity", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-architecture-apply-"));
	await initBlueprint(root);
	await writeFile(join(root, "README.md"), "# Project\n", "utf8");
	await writeFile(join(root, "DESIGN.md"), "# Design\n", "utf8");
	const change = { ...component(), action: "upsert" };
	const preview = await previewArchitectureChange({ cwd: root, change });
	assert.equal(preview.preview.change.action, "upsert");
	assert.equal(preview.preview.delta.added[0], "backend-api");
	assert.equal(preview.preview.delta.deploymentEffects[0], "prod-cluster-1");
	const applied = await applyArchitectureChange({ cwd: root, change, expectedPreviewHash: preview.preview.previewHash });
	assert.equal(applied.change.id, "backend-api");
	const snapshot = await workingTreeSnapshot(root);
	const file = snapshot.files.find((entry) => entry.endsWith("backend-api.md"));
	assert.ok(file);
	const reloaded = await loadArchitectureCatalog(snapshot, DEFAULT_CONFIG);
	const persisted = reloaded.components.find((entry) => entry.id === "backend-api");
	assert.ok(persisted);
	assert.equal(persisted.deployment, "prod-cluster-1");
	assert.equal(persisted.containerId, null);
});

test("architecture initialization derives and applies one manifest-grounded starter only for an empty catalog", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-architecture-init-"));
	await initBlueprint(root);
	await writeFile(join(root, "package.json"), JSON.stringify({ name: "@fixture/sample-plugin", description: "Sample DSH plugin.", files: ["lib/**", "README.md"], dsh: { client: {} } }, null, 2) + "\n", "utf8");
	await writeFile(join(root, "README.md"), "# Project\n", "utf8");
	await writeFile(join(root, "DESIGN.md"), "# Design\n", "utf8");
	const preview = await previewArchitectureInitialization({ cwd: root });
	assert.equal(preview.proposal.id, "sample-plugin");
	assert.equal(preview.proposal.kind, "plugin");
	assert.deepEqual(preview.proposal.ownedPaths, ["lib/**", "README.md"]);
	const applied = await applyArchitectureInitialization({ cwd: root, expectedPreviewHash: preview.preview.previewHash });
	assert.equal(applied.change.id, "sample-plugin");
	await assert.rejects(previewArchitectureInitialization({ cwd: root }), /already initialized/);
});

test("apply rejects an expansion that exceeds the original preview", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-architecture-preview-"));
	await initBlueprint(root);
	await writeFile(join(root, "README.md"), "# Project\n", "utf8");
	await writeFile(join(root, "DESIGN.md"), "# Design\n", "utf8");
	const preview = await previewArchitectureChange({ cwd: root, change: { ...component(), action: "upsert" } });
	const expanded = { ...component(), action: "upsert", contracts: ["/api/v1/users", "/api/v2/users"] };
	await assert.rejects(
		applyArchitectureChange({ cwd: root, change: expanded, expectedPreviewHash: preview.preview.previewHash }),
		/changed after preview/,
	);
});

test("apply refuses a stale preview hash", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-architecture-stale-"));
	await initBlueprint(root);
	await writeFile(join(root, "README.md"), "# Project\n", "utf8");
	await writeFile(join(root, "DESIGN.md"), "# Design\n", "utf8");
	const preview = await previewArchitectureChange({ cwd: root, change: { ...component(), action: "upsert" } });
	await applyArchitectureChange({ cwd: root, change: { ...component(), action: "upsert" }, expectedPreviewHash: preview.preview.previewHash });
	await assert.rejects(
		applyArchitectureChange({ cwd: root, change: { action: "delete", id: "backend-api" }, expectedPreviewHash: "0".repeat(64) }),
		/changed after preview/,
	);
});

test("component ID pattern, kinds, statuses, and relation types are the documented sets", () => {
	assert.ok(COMPONENT_ID_PATTERN.test("backend-api"));
	assert.ok(!COMPONENT_ID_PATTERN.test("Backend_API"));
	assert.ok(COMPONENT_KINDS.has("service"));
	assert.ok(!COMPONENT_KINDS.has("super-service"));
	assert.ok(COMPONENT_STATUSES.has("active"));
	assert.ok(COMPONENT_RELATION_TYPES.has("depends_on"));
	assert.ok(!COMPONENT_RELATION_TYPES.has("replaces"));
});
