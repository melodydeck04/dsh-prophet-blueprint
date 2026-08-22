//#region lib/types/scan.js
/**
 * Spec-driven scan orchestration over the working tree or exact Git index.
 *
 * @module @dsh-plugins/design-blueprint/scan
 */
import { loadConfig } from "./config.js";
import { resolve } from "node:path";
import { evaluatePolicy } from "./policy.js";
import { inspectDocumentation } from "./docs.js";
import { loadFeatureCatalog } from "./features.js";
import { loadArchitectureCatalog } from "./architecture.js";
import { resolveBlueprintRoot } from "./project-root.js";
import { gitIndexSnapshot, gitRoot, stagedChanges, workingTreeSnapshot } from "./snapshot.js";
import { loadSpecs } from "./specs.js";
import { loadFeatureWorkflow } from "./workflow.js";

/** Run one complete blueprint audit. */
export async function scan(options = {}) {
	const requestedRoot = options.cwd ?? process.cwd();
	const cwd = await resolveBlueprintRoot(requestedRoot);
	const repositoryRoot = await gitRoot(cwd);
	const useIndex = !options.all && repositoryRoot !== null && resolve(repositoryRoot).toLowerCase() === resolve(cwd).toLowerCase();
	const snapshot = useIndex ? await gitIndexSnapshot(cwd) : await workingTreeSnapshot(cwd);
	const changes = useIndex ? await stagedChanges(cwd) : [];
	const configResult = await loadConfig(snapshot);
	const specsResult = await loadSpecs(snapshot, configResult.config);
	const docsResult = await inspectDocumentation(snapshot, configResult.config);
	const catalog = await loadFeatureCatalog(snapshot, configResult.config);
	const architectureResult = await loadArchitectureCatalog(snapshot, configResult.config);
	const workflowResult = await loadFeatureWorkflow(snapshot, configResult.config, specsResult.specs, catalog.features, architectureResult.components);
	const policyIssues = evaluatePolicy({
		snapshot,
		config: configResult.config,
		specs: specsResult.specs,
		changes,
		approvedSpecFiles: workflowResult.approvedSpecFiles,
	});
	const allocationIssues = evaluateArchitectureAllocations(catalog.features, architectureResult.components);
	const issues = [...configResult.issues, ...specsResult.issues, ...docsResult.issues, ...architectureResult.issues, ...allocationIssues, ...workflowResult.issues, ...policyIssues];
	return {
		cwd,
		source: useIndex ? "git-index" : "working-tree",
		files: useIndex ? changes.map((change) => change.path) : snapshot.files,
		changes,
		specs: specsResult.specs.map(({ file, status, title }) => ({ file, status, title })),
		documentation: docsResult.summary,
		workflow: workflowResult.summary,
		architecture: architectureResult.summary,
		issues,
	};
}

/** Render a compact status report for the CLI and DSH `/blueprint` command. */
export function formatScanSummary(result, issues = result.issues) {
	const required = issues.filter((entry) => entry.severity === "required").length;
	const recommended = issues.filter((entry) => entry.severity === "recommended").length;
	const lines = [
		`Blueprint ${required === 0 ? "ready" : "blocked"}: ${required} required, ${recommended} recommended.`,
		`Snapshot: ${result.source}; ${result.files.length} file(s); ${result.specs.length} spec(s).`,
	];
	if (result.architecture) {
		lines.push(`Architecture: ${result.architecture.complete}/${result.architecture.total} component(s) complete; ${result.architecture.missingRequiredDocuments} missing required document(s).`);
	}
	if (result.documentation?.enabled) {
		lines.push(`Documentation: ${result.documentation.ok}/${result.documentation.total} bilingual pair(s) confirmed; ${result.documentation.missing} missing; ${result.documentation.outOfSync} out-of-sync.`);
	}
	for (const entry of issues) {
		lines.push(`- [${entry.severity}] ${entry.file}: ${entry.message}`);
		if (entry.fix) lines.push(`  fix: ${entry.fix}`);
	}
	return lines.join("\n") + "\n";
}

function evaluateArchitectureAllocations(features, components) {
	const componentIds = new Set(components.map((component) => component.id));
	const issues = [];
	const referenced = new Map();
	for (const component of components) {
		for (const featureId of component.supportedFeatures) {
			const list = referenced.get(featureId) ?? [];
			list.push(component.id);
			referenced.set(featureId, list);
		}
	}
	for (const feature of features) {
		for (const componentId of feature.components ?? []) {
			if (!componentIds.has(componentId)) {
				issues.push({
					file: feature.file,
					check: "feature-component",
					severity: "required",
					message: `Feature '${feature.id}' references unknown component '${componentId}'`,
					fix: "Create the component or remove the reference",
				});
			}
		}
	}
	for (const feature of features) {
		const supported = referenced.get(feature.id) ?? [];
		if (supported.length === 0) continue;
		const declared = new Set(feature.components ?? []);
		for (const componentId of supported) {
			if (!declared.has(componentId)) {
				issues.push({
					file: components.find((component) => component.id === componentId)?.file ?? "(unknown)",
					check: "feature-component",
					severity: "recommended",
					message: `Component '${componentId}' supports Feature '${feature.id}' but the Feature does not declare the component`,
					fix: `Add '- ${componentId}' to the Feature's Components section, or remove it from the Component's Supported features`,
				});
			}
		}
	}
	return issues;
}
//#endregion
