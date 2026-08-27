//#region lib/types/scan.js
/**
 * Spec-driven scan orchestration over the working tree or exact Git index.
 *
 * @module @dsh-plugins/design-blueprint/scan
 */
import { loadConfig } from "./config.js";
import { posix, resolve } from "node:path";
import { evaluatePolicy } from "./policy.js";
import { inspectDocumentation } from "./docs.js";
import { loadFeatureCatalog } from "./features.js";
import { loadArchitectureCatalog } from "./architecture.js";
import { resolveBlueprintRoot } from "./project-root.js";
import { gitIndexSnapshot, gitRoot, stagedChanges, workingTreeSnapshot } from "./snapshot.js";
import { loadSpecs } from "./specs.js";
import { loadFeatureWorkflow } from "./workflow.js";
import { loadVerificationCatalog } from "./verification.js";

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
	const verificationResult = await loadVerificationCatalog(snapshot, configResult.config, catalog.features);
	const workflowResult = await loadFeatureWorkflow(snapshot, configResult.config, specsResult.specs, catalog.features, architectureResult.components, verificationResult.records);
	const stagedPaths = new Set(changes.flatMap((change) => [change.path, change.oldPath].filter(Boolean)));
	const completingFeatures = new Set([...verificationResult.records.values()]
		.filter((record) => record.stage === "completed" && stagedPaths.has(record.file))
		.map((record) => record.featureId));
	const hostFinalizedFeatureFiles = new Set(catalog.features.filter((feature) => completingFeatures.has(feature.id)).map((feature) => feature.file));
	const policyIssues = evaluatePolicy({
		snapshot,
		config: configResult.config,
		specs: specsResult.specs,
		changes,
		approvedSpecFiles: workflowResult.approvedSpecFiles,
	}).filter((entry) => !(entry.check === "spec-scope-coverage" && hostFinalizedFeatureFiles.has(entry.file)));
	const allocationIssues = evaluateArchitectureAllocations(catalog.features, architectureResult.components);
	const lifecycleIssues = evaluateLifecycleRegressions(changes, configResult.config.authority.specsRoot);
	const issues = [...configResult.issues, ...specsResult.issues, ...docsResult.issues, ...architectureResult.issues, ...verificationResult.issues, ...allocationIssues, ...lifecycleIssues, ...workflowResult.issues, ...policyIssues];
	return {
		cwd,
		source: useIndex ? "git-index" : "working-tree",
		files: useIndex ? changes.map((change) => change.path) : snapshot.files,
		changes,
		specs: specsResult.specs.map(({ file, status, title }) => ({ file, status, title })),
		documentation: docsResult.summary,
		workflow: workflowResult.summary,
		verification: verificationResult.summary,
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
	return issues;
}

function englishSpec(path, prefix) {
	return typeof path === "string" && path.startsWith(prefix) && path.endsWith(".md") && !path.endsWith(".zh.md");
}

/** Reject staged evidence that reclassifies one implemented decision as a rejected proposal. */
export function evaluateLifecycleRegressions(changes, specsRoot) {
	if (!Array.isArray(changes) || changes.length === 0) return [];
	const implemented = `${specsRoot}/implemented/`;
	const rejected = `${specsRoot}/rejected/`;
	const regressions = new Map();
	for (const change of changes) {
		if (change.status?.startsWith("R")
			&& englishSpec(change.oldPath, implemented)
			&& englishSpec(change.path, rejected)
			&& posix.basename(change.oldPath) === posix.basename(change.path)) {
			regressions.set(change.path, change.oldPath);
		}
	}
	const deleted = new Map(changes
		.filter((change) => change.status === "D" && englishSpec(change.path, implemented))
		.map((change) => [posix.basename(change.path), change.path]));
	for (const change of changes) {
		if (change.status === "A" && englishSpec(change.path, rejected)) {
			const source = deleted.get(posix.basename(change.path));
			if (source) regressions.set(change.path, source);
		}
	}
	return [...regressions].map(([target, source]) => ({
		file: target,
		check: "spec-lifecycle-regression",
		severity: "required",
		message: `implemented Spec '${source}' cannot regress to rejected; rejected means the proposal was never adopted`,
		fix: "Keep the implemented decision as historical authority and create a new proposed Spec for its replacement or extension",
	}));
}
//#endregion
