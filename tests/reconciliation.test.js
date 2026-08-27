import test from "node:test";
import assert from "node:assert/strict";
import { analyzeReconciliation, featureArchitectureReadiness } from "../lib/reconciliation.js";

function feature(id, overrides = {}) {
	return { id, status: "active", components: [], ...overrides };
}

function component(id, overrides = {}) {
	return { id, status: "active", file: `.blueprint/architecture/components/${id}.md`, ownedPaths: [`src/${id}/**`], supportedFeatures: [], ...overrides };
}

test("reconciliation derives canonical Feature owners and bounded brownfield gaps without mutation", () => {
	const features = [
		feature("search", { status: "planned", components: ["legacy-search"] }),
		feature("accounts"),
	];
	const components = [component("search-service", { ownedPaths: ["src/search/**"], supportedFeatures: ["search"] })];
	const workflowStates = new Map([["search", { stage: "implemented" }], ["accounts", { stage: "draft" }]]);
	const result = analyzeReconciliation({ files: ["README.md", "src/search/index.js", "src/accounts/index.js"], features, components, workflowStates });
	const search = result.features.find((entry) => entry.id === "search");
	const accounts = result.features.find((entry) => entry.id === "accounts");
	assert.equal(search.ready, true);
	assert.deepEqual(search.componentIds, ["search-service"]);
	assert.equal(search.allocationDrift, true);
	assert.equal(accounts.ready, false);
	assert.equal(result.summary.architectureReadyFeatures, 1);
	assert.equal(result.summary.unownedFiles, 2);
	assert.deepEqual(result.pathCoverage.unowned, ["README.md", "src/accounts/index.js"]);
	assert.ok(result.items.some((entry) => entry.code === "lifecycle-status-drift" && entry.subjectId === "search"));
	assert.ok(result.items.some((entry) => entry.code === "feature-unallocated" && entry.subjectId === "accounts"));
	assert.deepEqual(features[0].components, ["legacy-search"], "analysis must not rewrite legacy allocation input");
});

test("deprecated or invalid Component records do not make a Feature architecture-ready", () => {
	const selected = feature("search");
	const deprecated = component("old-search", { status: "deprecated", supportedFeatures: ["search"] });
	const invalid = component("broken-search", { supportedFeatures: ["search"] });
	const readiness = featureArchitectureReadiness(selected, [deprecated, invalid], [{ file: invalid.file, severity: "required" }]);
	assert.equal(readiness.ready, false);
	assert.deepEqual(readiness.componentIds, ["broken-search", "old-search"]);
	assert.deepEqual(readiness.validComponentIds, []);
});
