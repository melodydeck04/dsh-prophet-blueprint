//#region lib/types/reconciliation.js
/**
 * Read-only brownfield coverage and assistant-handoff facts.
 *
 * @module @dsh-plugins/design-blueprint/reconciliation
 */
import { matchesAny } from "./path-utils.js";

const SAMPLE_LIMIT = 24;

function sorted(values) {
	return [...new Set(values)].sort();
}

function sameValues(left, right) {
	const a = sorted(left);
	const b = sorted(right);
	return a.length === b.length && a.every((value, index) => value === b[index]);
}

function item(code, subjectType, subjectId, severity, message, action) {
	return { code, subjectType, subjectId, severity, message, action };
}

/** Derive one Feature's executable Component owners from canonical Component records. */
export function featureArchitectureReadiness(feature, components, architectureIssues = []) {
	const invalidFiles = new Set(architectureIssues.filter((entry) => entry.severity === "required").map((entry) => entry.file));
	const owners = components.filter((component) => component.supportedFeatures.includes(feature.id));
	const validOwners = owners.filter((component) => component.status !== "deprecated" && !invalidFiles.has(component.file));
	const componentIds = sorted(owners.map((component) => component.id));
	const validComponentIds = sorted(validOwners.map((component) => component.id));
	const declaredComponentIds = sorted(feature.components ?? []);
	return {
		ready: validComponentIds.length > 0,
		state: validComponentIds.length > 0 ? "ready" : "pending",
		componentIds,
		validComponentIds,
		declaredComponentIds,
		allocationDrift: !sameValues(componentIds, declaredComponentIds),
	};
}

/**
 * Describe current Feature, Component, lifecycle, and path-ownership coverage.
 * The result is advisory and never mutates or infers repository boundaries.
 */
export function analyzeReconciliation({ files, features, components, workflowStates, architectureIssues = [] }) {
	const items = [];
	const featureIds = new Set(features.map((feature) => feature.id));
	const featureRows = features.map((feature) => {
		const architecture = featureArchitectureReadiness(feature, components, architectureIssues);
		const workflow = workflowStates.get(feature.id) ?? { stage: "draft" };
		if (!architecture.ready) {
			items.push(item("feature-unallocated", "feature", feature.id, "attention", `Feature '${feature.id}' has no valid non-deprecated Component owner`, "Review its as-is placement in Architecture design"));
		}
		if (architecture.allocationDrift && architecture.declaredComponentIds.length > 0) {
			items.push(item("allocation-drift", "feature", feature.id, "attention", `Feature '${feature.id}' declares Components that differ from canonical Component Supported features`, "Use the Component catalog as executable allocation and reconcile the legacy Feature mirror"));
		}
		if (feature.status === "planned" && workflow.stage === "implemented") {
			items.push(item("lifecycle-status-drift", "feature", feature.id, "attention", `Feature '${feature.id}' is planned while its linked Spec is implemented`, "Confirm shipped reality and update the Feature lifecycle"));
		} else if (feature.status === "active" && workflow.stage === "draft") {
			items.push(item("active-undocumented", "feature", feature.id, "advisory", `Active Feature '${feature.id}' has no Feature-linked lifecycle Spec`, "Document current behavior before proposing changes"));
		}
		return { id: feature.id, status: feature.status, workflowStage: workflow.stage, ...architecture };
	});

	const componentRows = components.map((component) => {
		const knownFeatureIds = sorted(component.supportedFeatures.filter((featureId) => featureIds.has(featureId)));
		const unknownFeatureIds = sorted(component.supportedFeatures.filter((featureId) => !featureIds.has(featureId)));
		if (knownFeatureIds.length === 0) {
			items.push(item("component-unallocated", "component", component.id, "attention", `Component '${component.id}' supports no known Feature`, "Confirm its current product responsibility or mark the boundary as infrastructure"));
		}
		for (const featureId of unknownFeatureIds) {
			items.push(item("component-unknown-feature", "component", component.id, "attention", `Component '${component.id}' references unknown Feature '${featureId}'`, "Repair the Supported features declaration"));
		}
		return { id: component.id, status: component.status, featureIds: knownFeatureIds, unknownFeatureIds };
	});

	const unownedFiles = [];
	const ambiguousFiles = [];
	for (const file of files) {
		const owners = components.filter((component) => matchesAny(file, component.ownedPaths)).map((component) => component.id);
		if (owners.length === 0) unownedFiles.push(file);
		else if (owners.length > 1) ambiguousFiles.push({ file, owners: sorted(owners) });
	}
	if (unownedFiles.length > 0) {
		items.push(item("unowned-files", "repository", "files", "advisory", `${unownedFiles.length} repository file(s) match no Component owned-path pattern`, "Review the bounded sample and refine truthful Component ownership"));
	}
	if (ambiguousFiles.length > 0) {
		items.push(item("ambiguous-files", "repository", "files", "attention", `${ambiguousFiles.length} repository file(s) match multiple Component owned-path patterns`, "Narrow overlapping owned paths"));
	}

	return {
		summary: {
			features: featureRows.length,
			architectureReadyFeatures: featureRows.filter((entry) => entry.ready).length,
			components: componentRows.length,
			componentsWithFeatures: componentRows.filter((entry) => entry.featureIds.length > 0).length,
			totalFiles: files.length,
			ownedFiles: files.length - unownedFiles.length - ambiguousFiles.length,
			unownedFiles: unownedFiles.length,
			ambiguousFiles: ambiguousFiles.length,
			attention: items.filter((entry) => entry.severity === "attention").length,
			advisory: items.filter((entry) => entry.severity === "advisory").length,
		},
		features: featureRows,
		components: componentRows,
		pathCoverage: {
			unowned: unownedFiles.slice(0, SAMPLE_LIMIT),
			ambiguous: ambiguousFiles.slice(0, SAMPLE_LIMIT),
			truncated: unownedFiles.length > SAMPLE_LIMIT || ambiguousFiles.length > SAMPLE_LIMIT,
		},
		items,
	};
}
//#endregion
