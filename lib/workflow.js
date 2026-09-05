//#region lib/types/workflow.js
/**
 * Direct-developer approval state for feature-linked lifecycle specifications.
 *
 * @module @dsh-plugins/design-blueprint/workflow
 */
import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FEATURE_ID_PATTERN, loadFeatureCatalog } from "./features.js";
import { loadArchitectureCatalog } from "./architecture.js";
import { loadConfig } from "./config.js";
import { featureArchitectureReadiness } from "./reconciliation.js";
import { resolveBlueprintRoot } from "./project-root.js";
import { loadSpecs } from "./specs.js";
import { workingTreeSnapshot } from "./snapshot.js";

function issue(file, message, fix, severity = "required") {
	return { file, check: "feature-approval", severity, message, fix };
}

function approvalPath(config, featureId) {
	return `${config.features.approvalsRoot}/${featureId}.json`;
}

function parseApproval(file, text, issues) {
	let value;
	try { value = JSON.parse(text); } catch (error) {
		issues.push(issue(file, `approval record is invalid JSON: ${error.message}`, "Approve the proposal again from Blueprint Web"));
		return null;
	}
	if (value === null || typeof value !== "object" || Array.isArray(value)
		|| value.version !== 1
		|| typeof value.featureId !== "string" || !FEATURE_ID_PATTERN.test(value.featureId)
		|| typeof value.spec !== "string"
		|| typeof value.specHash !== "string" || !/^[a-f0-9]{64}$/.test(value.specHash)
		|| typeof value.approvedAt !== "string") {
		issues.push(issue(file, "approval record has an invalid shape", "Approve the proposal again from Blueprint Web"));
		return null;
	}
	return value;
}

function chooseSpec(featureId, specs, issues) {
	const linked = specs.filter((spec) => spec.featureId === featureId);
	const proposed = linked.filter((spec) => spec.status === "proposed");
	if (proposed.length > 1) {
		issues.push(issue(proposed[0].file, `feature '${featureId}' has multiple proposed specifications`, "Keep one current proposed specification per feature"));
	}
	return proposed[0]
		?? linked.find((spec) => spec.status === "implemented")
		?? linked.find((spec) => spec.status === "rejected")
		?? null;
}

/** Collapse internal repository phases into the six states shown to developers. */
export function publicWorkflowStage(stage) {
	if (["draft", "prepared"].includes(stage)) return "refining";
	if (["review", "approved"].includes(stage)) return "ready";
	if (stage === "implementing") return "implementing";
	if (["verification_ready", "verifying", "verified"].includes(stage)) return "verifying";
	if (["needs_changes", "verification_required", "rejected"].includes(stage)) return "blocked";
	if (["completed", "completed_legacy"].includes(stage)) return "completed";
	return "blocked";
}

/** Derive repository-backed workflow state for every feature. */
export async function loadFeatureWorkflow(snapshot, config, specs, features, components = [], verificationRecords = new Map()) {
	const issues = [];
	const approvedSpecFiles = new Set();
	const states = new Map();
	const knownFeatures = new Set(features.map((feature) => feature.id));
	for (const spec of specs) {
		if (spec.featureId !== null && !knownFeatures.has(spec.featureId)) {
			issues.push(issue(spec.file, `spec references unknown feature '${spec.featureId}'`, "Create the feature or repair the Feature metadata"));
		}
	}
	for (const feature of features) {
		const spec = chooseSpec(feature.id, specs, issues);
		const verification = verificationRecords.get(feature.id) ?? null;
		if (spec === null) {
			states.set(feature.id, { stage: "draft", spec: null, approval: null, verification });
			continue;
		}
		if (spec.status === "implemented") {
			if (verification?.stage === "completed" && verification.spec?.implementedFile === spec.file) {
				states.set(feature.id, { stage: "completed", spec, approval: null, verification });
				continue;
			}
			if (verification
				&& verification.spec?.sourceFile === spec.file
				&& verification.spec?.approvedHash === (spec.reviewHash ?? spec.contentHash)
				&& verification.stage !== "completed") {
				states.set(feature.id, { stage: verification.stage, spec, approval: null, verification });
				continue;
			}
			const owners = components.filter((component) => component.supportedFeatures.includes(feature.id) && component.status !== "deprecated");
			const readiness = featureArchitectureReadiness(feature, components);
			const consistentLegacy = feature.status === "active"
				&& feature.satisfaction === 100
				&& readiness.ready
				&& ((feature.components?.length ?? 0) === 0 || !readiness.allocationDrift)
				&& owners.every((component) => component.status === "active" && component.satisfaction === 100);
			if (consistentLegacy) {
				states.set(feature.id, { stage: "completed_legacy", spec, approval: null, verification });
			} else {
				issues.push(issue(spec.file, `implemented Spec for '${feature.id}' has no completed verification and its Feature or Component lifecycle is not active`, "Run independent verification; do not treat the implemented filename alone as completion"));
				states.set(feature.id, { stage: "verification_required", spec, approval: null, verification });
			}
			continue;
		}
		if (spec.status === "rejected") {
			states.set(feature.id, { stage: "rejected", spec, approval: null, verification });
			continue;
		}
		if (spec.prepared) {
			states.set(feature.id, { stage: "prepared", spec, approval: null, verification });
			continue;
		}
		const file = approvalPath(config, feature.id);
		const text = await snapshot.readText(file);
		if (text === null) {
			states.set(feature.id, { stage: "review", spec, approval: null, verification });
			continue;
		}
		const approval = parseApproval(file, text, issues);
		const current = approval !== null
			&& approval.featureId === feature.id
			&& approval.spec === spec.file
			&& approval.specHash === (spec.reviewHash ?? spec.contentHash);
		if (!current) {
			issues.push(issue(file, `approval no longer matches the current proposed spec for '${feature.id}'`, "Review the changed proposal and approve it again from Blueprint Web"));
			states.set(feature.id, { stage: "review", spec, approval, verification });
			continue;
		}
		approvedSpecFiles.add(spec.file);
		if (verification && verification.spec?.approvedHash === (spec.reviewHash ?? spec.contentHash) && verification.stage !== "completed") {
			states.set(feature.id, { stage: verification.stage, spec, approval, verification });
		} else {
			states.set(feature.id, { stage: "approved", spec, approval, verification });
		}
	}
	const counts = { draft: 0, prepared: 0, review: 0, approved: 0, implementing: 0, verification_ready: 0, verifying: 0, needs_changes: 0, verified: 0, completed: 0, completed_legacy: 0, verification_required: 0, rejected: 0 };
	for (const state of states.values()) counts[state.stage] = (counts[state.stage] ?? 0) + 1;
	return { states, approvedSpecFiles, issues, summary: counts };
}

async function atomicJsonWrite(path, value) {
	const temporary = `${path}.${randomUUID()}.tmp`;
	await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
	try { await rename(temporary, path); } catch (error) {
		await unlink(temporary).catch(() => {});
		throw error;
	}
}

/** Bind one exact proposed-spec hash to a direct Web approval action. */
export async function approveFeatureProposal({ cwd, featureId, expectedSpecHash }) {
	if (!FEATURE_ID_PATTERN.test(featureId)) throw new Error("featureId is invalid");
	if (!/^[a-f0-9]{64}$/.test(expectedSpecHash)) throw new Error("expectedSpecHash must be one SHA-256 value");
	const root = await resolveBlueprintRoot(cwd);
	const snapshot = await workingTreeSnapshot(root);
	const configResult = await loadConfig(snapshot);
	const specsResult = await loadSpecs(snapshot, configResult.config);
	const catalog = await loadFeatureCatalog(snapshot, configResult.config);
	const feature = catalog.features.find((entry) => entry.id === featureId);
	if (!feature) throw new Error(`feature '${featureId}' does not exist`);
	const proposed = specsResult.specs.filter((spec) => spec.featureId === featureId && spec.status === "proposed");
	if (proposed.length !== 1) throw new Error(`feature '${featureId}' must have exactly one proposed specification`);
	const spec = proposed[0];
	const reviewHash = spec.reviewHash ?? spec.contentHash;
	if (reviewHash !== expectedSpecHash) throw new Error("the proposed specification or its Chinese counterpart changed after the page loaded; refresh and review it again");
	const architecture = await loadArchitectureCatalog(snapshot, configResult.config);
	const readiness = featureArchitectureReadiness(feature, architecture.components, architecture.issues);
	if (!readiness.ready) throw new Error(`feature '${featureId}' requires at least one valid non-deprecated Component owner before approval`);
	const directory = join(root, ...configResult.config.features.approvalsRoot.split("/"));
	await mkdir(directory, { recursive: true });
	const relative = approvalPath(configResult.config, featureId);
	const record = {
		version: 1,
		featureId,
		spec: spec.file,
		specHash: reviewHash,
		approvedAt: new Date().toISOString(),
	};
	await atomicJsonWrite(join(root, ...relative.split("/")), record);
	return { root, file: relative, record };
}
//#endregion
