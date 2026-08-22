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
import { loadConfig } from "./config.js";
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

/** Derive repository-backed workflow state for every feature. */
export async function loadFeatureWorkflow(snapshot, config, specs, features, components = []) {
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
		if (spec === null) {
			states.set(feature.id, { stage: "draft", spec: null, approval: null });
			continue;
		}
		if (spec.status === "implemented") {
			states.set(feature.id, { stage: "implemented", spec, approval: null });
			continue;
		}
		if (spec.status === "rejected") {
			states.set(feature.id, { stage: "rejected", spec, approval: null });
			continue;
		}
		if (spec.prepared) {
			states.set(feature.id, { stage: "prepared", spec, approval: null });
			continue;
		}
		const file = approvalPath(config, feature.id);
		const text = await snapshot.readText(file);
		if (text === null) {
			states.set(feature.id, { stage: "review", spec, approval: null });
			continue;
		}
		const approval = parseApproval(file, text, issues);
		const current = approval !== null
			&& approval.featureId === feature.id
			&& approval.spec === spec.file
			&& approval.specHash === (spec.reviewHash ?? spec.contentHash);
		if (!current) {
			issues.push(issue(file, `approval no longer matches the current proposed spec for '${feature.id}'`, "Review the changed proposal and approve it again from Blueprint Web"));
			states.set(feature.id, { stage: "review", spec, approval });
			continue;
		}
		approvedSpecFiles.add(spec.file);
		states.set(feature.id, { stage: "approved", spec, approval });
	}
	const counts = { draft: 0, prepared: 0, review: 0, approved: 0, implemented: 0, rejected: 0 };
	for (const state of states.values()) counts[state.stage] += 1;
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
	if (!catalog.features.some((feature) => feature.id === featureId)) throw new Error(`feature '${featureId}' does not exist`);
	const proposed = specsResult.specs.filter((spec) => spec.featureId === featureId && spec.status === "proposed");
	if (proposed.length !== 1) throw new Error(`feature '${featureId}' must have exactly one proposed specification`);
	const spec = proposed[0];
	const reviewHash = spec.reviewHash ?? spec.contentHash;
	if (reviewHash !== expectedSpecHash) throw new Error("the proposed specification or its Chinese counterpart changed after the page loaded; refresh and review it again");
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
