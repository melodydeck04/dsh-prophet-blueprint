//#region lib/types/policy.js
/**
 * Pure correspondence policy between a Git change set and lifecycle specs.
 *
 * @module @dsh-plugins/design-blueprint/policy
 */
import { matchesAny, normalizeRelativePath } from "./path-utils.js";

function issue(file, check, message, fix, severity = "required") {
	return { file, check, severity, message, fix };
}

function coveredBy(spec, file) {
	if (spec.scope.allow.length === 0 || !matchesAny(file, spec.scope.allow)) return false;
	return spec.scope.deny.length === 0 || !matchesAny(file, spec.scope.deny);
}

/** Validate authority files and spec-to-change coverage. */
export function evaluatePolicy({ snapshot, config, specs, changes = [], approvedSpecFiles = new Set() }) {
	const issues = [];
	for (const [kind, files] of Object.entries({
		instructions: config.authority.instructions,
		architecture: config.authority.architecture,
		publicContracts: config.authority.publicContracts,
	})) {
		for (const file of files) {
			if (!snapshot.exists(file)) {
				issues.push(issue(file, "authority-file", `${kind} authority file is missing from the checked snapshot`, `Restore '${file}' or remove it from design-blueprint.json`));
			}
		}
	}
	const stagedPaths = new Set(changes.flatMap((change) => [change.path, change.oldPath].filter(Boolean)));
	const eligibleSpecs = specs.filter((spec) => (
		(spec.status === "proposed" && (spec.featureId === null || approvedSpecFiles.has(spec.file)))
		|| (spec.status === "implemented" && stagedPaths.has(spec.file))
	));
	for (const change of changes) {
		const file = normalizeRelativePath(change.path);
		if (!matchesAny(file, config.changePolicy.requireSpecFor)) continue;
		if (matchesAny(file, config.changePolicy.allowWithoutSpec)) continue;
		const owners = eligibleSpecs.filter((spec) => coveredBy(spec, file));
		if (owners.length === 0) {
			const waiting = specs.filter((spec) => spec.status === "proposed" && spec.featureId !== null && !approvedSpecFiles.has(spec.file) && coveredBy(spec, file));
			if (waiting.length > 0) {
				issues.push(issue(file, "feature-approval", `staged ${change.status} change is covered only by an unapproved feature proposal: ${waiting.map((spec) => spec.file).join(", ")}`, "Review and approve the exact proposal in Blueprint Web before implementation"));
			} else {
				issues.push(issue(file, "spec-scope-coverage", `staged ${change.status} change is not covered by an approved proposed spec or a staged implemented spec`, `Add '${file}' to one eligible spec's '- allow:' scope, or revert the out-of-scope change`));
			}
		} else if (owners.length > 1) {
			issues.push(issue(file, "spec-scope-ambiguity", `change is covered by multiple specs: ${owners.map((spec) => spec.file).join(", ")}`, "Narrow the scopes until one spec owns this change"));
		}
	}
	return issues;
}
//#endregion
