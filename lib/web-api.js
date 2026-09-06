/**
 * Narrow same-origin HTTP API for the DSH Web Blueprint view.
 *
 * @module @dsh-plugins/design-blueprint/web-api
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { loadConfig } from "./config.js";
import { FEATURE_ID_PATTERN, hashFeatureContent, loadFeatureCatalog, serializeFeature } from "./features.js";
import { loadArchitectureCatalog } from "./architecture.js";
import { analyzeReconciliation } from "./reconciliation.js";
import { resolveBlueprintRoot } from "./project-root.js";
import { bindSessionBlueprintRoot, clearSessionBlueprintRoot, resolveBlueprintEntryPath, resolveEffectiveBlueprintRoot } from "./project-binding.js";
import { discoverBlueprintProjects, isSameProjectPath } from "./project-discovery.js";
import { initBlueprint } from "./init.js";
import { scan } from "./scan.js";
import { workingTreeSnapshot } from "./snapshot.js";
import { loadSpecs } from "./specs.js";
import { approveFeatureProposal, loadFeatureWorkflow, publicWorkflowStage } from "./workflow.js";
import { PLUGIN_VERSION } from "./version.js";
import { applyFeatureIdentityMigration, applyArchitectureChange, applyArchitectureInitialization, deriveFeatureId, prepareFeatureArtifacts, previewFeatureIdentityMigration, previewArchitectureChange, previewArchitectureInitialization, resolveFeatureArtifacts } from "./artifacts.js";
import { applyAssistantSpecPatch, previewAssistantSpecPatch } from "./assistant-actions.js";
import { abandonFeatureVerification, beginFeatureImplementation, completeVerifiedFeature, failFeatureVerificationOrchestration, loadVerificationCatalog, prepareFeatureVerification, publicRecord as publicVerificationRecord, requestFeatureVerification, requestLegacyFeatureVerification, startFeatureVerification, submitFeatureVerificationResult } from "./verification.js";
import { normalizeRelativePath } from "./path-utils.js";

export const BLUEPRINT_API_PATH = "/design-blueprint/api";
const MAX_REQUEST_BYTES = 256 * 1024;

export class BlueprintApiError extends Error {
	constructor(status, code, message) {
		super(message);
		this.name = "BlueprintApiError";
		this.status = status;
		this.code = code;
	}
}

function publicFeature(feature, workflow, artifacts, architecture) {
	const brief = {
		en: artifacts.brief.en.exists ? { file: artifacts.brief.en.file, content: artifacts.brief.en.content } : null,
		zh: artifacts.brief.zh.exists ? { file: artifacts.brief.zh.file, content: artifacts.brief.zh.content } : null,
	};
	const verification = publicVerificationRecord(workflow?.verification ?? null);
	const workflowStatus = verification?.status ?? (() => {
		const stage = workflow?.stage ?? "draft";
		if (stage === "review") return { publicState: "ready", reasonCode: "approval-required", owner: "authority", evidence: "The current bilingual Spec hash has no matching developer approval.", nextAction: "Review and approve the exact current Spec hash." };
		if (stage === "approved") return { publicState: "ready", reasonCode: "implementation-ready", owner: "implementation", evidence: "The exact current Spec hash is approved.", nextAction: "Begin implementation in the current DSH Chat." };
		if (stage === "verification_required") return { publicState: "blocked", reasonCode: "verification-required", owner: "verification", evidence: "Historical implementation has no completed verification record.", nextAction: "Request verification for the current repository snapshot." };
		if (stage === "rejected") return { publicState: "blocked", reasonCode: "spec-rejected", owner: "spec", evidence: "The active change was rejected.", nextAction: "Create a revised proposed Spec if the requirement is still needed." };
		return { publicState: publicWorkflowStage(stage), reasonCode: "refinement-required", owner: "spec", evidence: "The Feature has no approved implementation package.", nextAction: "Refine one Feature-linked proposed Spec." };
	})();
	const changePackage = workflow?.spec?.changePackage ? structuredClone(workflow.spec.changePackage) : null;
	if (changePackage) {
		changePackage.lifecycle.approval = workflow?.approval ? { approvedAt: workflow.approval.approvedAt, specHash: workflow.approval.specHash } : null;
		changePackage.lifecycle.snapshot = verification?.snapshot ?? null;
		changePackage.lifecycle.publicState = workflowStatus.publicState;
		changePackage.lifecycle.reasonCode = workflowStatus.reasonCode;
		changePackage.lifecycle.nextAction = workflowStatus.nextAction;
	}
	return {
		id: feature.id,
		title: feature.title,
		status: feature.status,
		parentId: feature.parentId,
		summary: feature.summary,
		scope: feature.scope,
		documents: feature.documents,
		acceptance: feature.acceptance,
		notes: feature.notes,
		components: architecture?.componentIds ?? [],
		declaredComponents: architecture?.declaredComponentIds ?? feature.components ?? [],
		architecture: architecture ?? { ready: false, state: "pending", componentIds: [], validComponentIds: [], declaredComponentIds: [], allocationDrift: false },
		hash: feature.hash,
		satisfaction: feature.satisfaction,
		file: feature.file,
		brief,
		artifacts,
		workflow: {
			stage: publicWorkflowStage(workflow?.stage ?? "draft"),
			internalStage: workflow?.stage ?? "draft",
			spec: workflow?.spec ? {
				file: workflow.spec.file,
				title: workflow.spec.title,
				status: workflow.spec.status,
				hash: workflow.spec.reviewHash ?? workflow.spec.contentHash,
				content: workflow.spec.content,
				languages: workflow.spec.languages,
				changePackage,
			} : null,
			approvedAt: workflow?.approval?.approvedAt ?? null,
			verification,
			status: workflowStatus,
		},
	};
}

function publicComponent(component) {
	return {
		id: component.id,
		title: component.title,
		kind: component.kind,
		containerId: component.containerId,
		deployment: component.deployment,
		status: component.status,
		summary: component.summary,
		ownedPaths: component.ownedPaths,
		contracts: component.contracts,
		dependencies: component.dependencies,
		supportedFeatures: component.supportedFeatures,
		documents: component.documents,
		hash: component.hash,
		satisfaction: component.satisfaction,
		file: component.file,
	};
}

const RECONCILIATION_ACTIONS = {
	"feature-unallocated": ["architecture", "review-placement"],
	"allocation-drift": ["architecture", "reconcile-legacy-mirror"],
	"lifecycle-status-drift": ["governance", "review-lifecycle"],
	"active-undocumented": ["spec", "document-existing-behavior"],
	"component-unallocated": ["architecture", "review-responsibility"],
	"component-unknown-feature": ["architecture", "repair-feature-reference"],
	"unowned-files": ["architecture", "review-path-ownership"],
	"ambiguous-files": ["architecture", "resolve-path-overlap"],
};

function routeReconciliation(reconciliation) {
	return {
		...reconciliation,
		items: reconciliation.items.map((entry) => {
			const [owner = "governance", actionKind = "explain-only"] = RECONCILIATION_ACTIONS[entry.code] ?? [];
			return { ...entry, owner, actionKind };
		}),
	};
}

/** Return the complete read model used by the visual dashboard. */
export async function getBlueprintDashboard(cwd, context = {}) {
	const effective = await resolveEffectiveBlueprintRoot({ cwd, sessionId: context.sessionId, dshWorkspacePath: context.dshWorkspacePath, dshWorkspaceTitle: context.dshWorkspaceTitle });
	const root = effective.root;
	const snapshot = await workingTreeSnapshot(root);
	const configResult = await loadConfig(snapshot);
	const catalog = await loadFeatureCatalog(snapshot, configResult.config);
	const architectureResult = await loadArchitectureCatalog(snapshot, configResult.config);
	const specsResult = await loadSpecs(snapshot, configResult.config);
	const verificationResult = await loadVerificationCatalog(snapshot, configResult.config, catalog.features);
	const workflow = await loadFeatureWorkflow(snapshot, configResult.config, specsResult.specs, catalog.features, architectureResult.components, verificationResult.records);
	const audit = await scan({ cwd: root, all: true });
	const issues = [...catalog.issues, ...architectureResult.issues, ...audit.issues];
	const reconciliation = routeReconciliation(analyzeReconciliation({ files: snapshot.files, features: catalog.features, components: architectureResult.components, workflowStates: workflow.states, architectureIssues: architectureResult.issues }));
	const reconciliationByFeature = new Map(reconciliation.features.map((entry) => [entry.id, entry]));
	const publicFeatures = await Promise.all(catalog.features.map(async (feature) => {
		const state = workflow.states.get(feature.id);
		const artifacts = await resolveFeatureArtifacts({ snapshot, config: configResult.config, feature, spec: state?.spec ?? null });
		const architecture = reconciliationByFeature.get(feature.id);
		return publicFeature(feature, state, artifacts, architecture ? { ...architecture, items: reconciliation.items.filter((entry) => entry.subjectType === "feature" && entry.subjectId === feature.id) } : null);
	}));
	const publicComponents = architectureResult.components.map(publicComponent);
	return {
		plugin: { hostVersion: PLUGIN_VERSION },
		project: { root, name: basename(root), source: effective.source, entryPath: effective.entryPath, workspace: effective.workspace, sessionCwd: effective.sessionCwd ?? cwd ?? null, binding: effective.binding, bound: effective.bound },
		audit: {
			source: audit.source,
			required: issues.filter((entry) => entry.severity === "required").length,
			recommended: issues.filter((entry) => entry.severity === "recommended").length,
			issues,
			specs: audit.specs,
			documentation: audit.documentation,
			architecture: architectureResult.summary,
		},
		catalog: {
			root: catalog.root,
			summary: catalog.summary,
			features: publicFeatures,
		},
		architecture: {
			root: architectureResult.root,
			componentsDir: architectureResult.componentsDir,
			summary: architectureResult.summary,
			components: publicComponents,
			issues: architectureResult.issues,
		},
		verification: { root: verificationResult.root, summary: verificationResult.summary, issues: verificationResult.issues },
		reconciliation,
	};
}

/** Read one document already registered to a Feature; arbitrary paths are forbidden. */
export async function getBlueprintDocument({ cwd, featureId, file }) {
	if (!FEATURE_ID_PATTERN.test(featureId ?? "")) throw new BlueprintApiError(400, "INVALID_FEATURE_ID", "featureId is invalid");
	let normalized;
	try { normalized = normalizeRelativePath(file); }
	catch { throw new BlueprintApiError(400, "INVALID_DOCUMENT", "file must be a repository-relative document path"); }
	const root = await resolveBlueprintRoot(cwd);
	const snapshot = await workingTreeSnapshot(root);
	const { config } = await loadConfig(snapshot);
	const catalog = await loadFeatureCatalog(snapshot, config);
	const feature = catalog.features.find((entry) => entry.id === featureId);
	if (!feature) throw new BlueprintApiError(404, "FEATURE_NOT_FOUND", `Feature '${featureId}' does not exist`);
	const specs = await loadSpecs(snapshot, config);
	const state = await loadFeatureWorkflow(snapshot, config, specs.specs, catalog.features);
	const artifacts = await resolveFeatureArtifacts({ snapshot, config, feature, spec: state.states.get(featureId)?.spec ?? null });
	const allowed = new Set([feature.file, ...feature.documents.map((entry) => entry.path)]);
	for (const group of Object.values(artifacts)) for (const artifact of Object.values(group)) if (artifact?.file) allowed.add(artifact.file);
	if (!allowed.has(normalized)) throw new BlueprintApiError(403, "DOCUMENT_NOT_REGISTERED", "The requested file is not registered to this Feature");
	const content = await snapshot.readText(normalized);
	if (content === null) throw new BlueprintApiError(404, "DOCUMENT_NOT_FOUND", "The registered document does not exist");
	return { featureId, file: normalized, content };
}

async function currentText(path) {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") return null;
		throw error;
	}
}

function validateParent(feature, catalog) {
	if (feature.parentId === null || feature.parentId === undefined || feature.parentId === "") return;
	const byId = new Map(catalog.features.map((entry) => [entry.id, entry]));
	if (!byId.has(feature.parentId)) throw new BlueprintApiError(400, "INVALID_PARENT", `Parent feature '${feature.parentId}' does not exist`);
	const seen = new Set([feature.id]);
	let parentId = feature.parentId;
	while (parentId !== null) {
		if (seen.has(parentId)) throw new BlueprintApiError(400, "FEATURE_CYCLE", "This Parent selection would create a feature cycle");
		seen.add(parentId);
		parentId = byId.get(parentId)?.parentId ?? null;
	}
}

/** Create or update one validated feature file below the configured feature root. */
export async function saveBlueprintFeature({ cwd, feature, expectedHash = null }) {
	if (!feature || typeof feature !== "object" || Array.isArray(feature)) throw new BlueprintApiError(400, "INVALID_FEATURE", "Feature must be an object");
	if (expectedHash !== null && (typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedHash))) {
		throw new BlueprintApiError(400, "INVALID_HASH", "expectedHash must be null or one SHA-256 value");
	}
	const root = await resolveBlueprintRoot(cwd);
	const snapshot = await workingTreeSnapshot(root);
	const configResult = await loadConfig(snapshot);
	if (configResult.issues.length > 0) throw new BlueprintApiError(409, "INVALID_CONFIG", "Repair design-blueprint.json before editing features");
	const catalog = await loadFeatureCatalog(snapshot, configResult.config);
	let canonicalFeature = feature;
	if (expectedHash === null) {
		if (typeof feature.localKey !== "string") throw new BlueprintApiError(400, "INVALID_LOCAL_KEY", "New features require a developer-confirmed ASCII local key");
		let id;
		try { id = deriveFeatureId(feature.parentId ?? null, feature.localKey); }
		catch (error) { throw new BlueprintApiError(400, "INVALID_LOCAL_KEY", error instanceof Error ? error.message : String(error)); }
		if (feature.id !== undefined && feature.id !== null && feature.id !== "" && feature.id !== id) throw new BlueprintApiError(400, "FEATURE_ID_MISMATCH", "Feature id must equal the Host-derived canonical id");
		canonicalFeature = { ...feature, id };
	} else {
		if (typeof feature.id !== "string" || !FEATURE_ID_PATTERN.test(feature.id)) throw new BlueprintApiError(400, "INVALID_FEATURE_ID", "Feature id is invalid");
		const previousFeature = catalog.features.find((entry) => entry.id === feature.id);
		if (!previousFeature) throw new BlueprintApiError(409, "STALE_FEATURE", "The feature was removed after the page loaded; refresh before saving");
		if ((previousFeature.parentId ?? null) !== (feature.parentId ?? null)) throw new BlueprintApiError(409, "IDENTITY_MIGRATION_REQUIRED", "Changing a feature parent requires the explicit identity migration workflow");
	}
	validateParent(canonicalFeature, catalog);
	let content;
	try {
		content = serializeFeature(canonicalFeature);
	} catch (error) {
		throw new BlueprintApiError(400, "INVALID_FEATURE", error instanceof Error ? error.message : String(error));
	}
	if (Buffer.byteLength(content, "utf8") > 128 * 1024) throw new BlueprintApiError(413, "FEATURE_TOO_LARGE", "Feature content exceeds 128 KiB");
	const relative = `${configResult.config.features.root}/${canonicalFeature.id}.md`;
	const directory = join(root, ...configResult.config.features.root.split("/"));
	const target = join(root, ...relative.split("/"));
	const previous = await currentText(target);
	if (previous === null && expectedHash !== null) throw new BlueprintApiError(409, "STALE_FEATURE", "The feature was removed after the page loaded; refresh before saving");
	if (previous !== null && expectedHash === null) throw new BlueprintApiError(409, "FEATURE_EXISTS", "A feature with this id already exists; refresh before saving");
	if (previous !== null && hashFeatureContent(previous) !== expectedHash) throw new BlueprintApiError(409, "STALE_FEATURE", "The feature changed after the page loaded; refresh before saving");
	await mkdir(directory, { recursive: true });
	await writeFile(target, content, { encoding: "utf8", flag: previous === null ? "wx" : "w" });
	return { saved: true, featureId: canonicalFeature.id, hash: hashFeatureContent(content) };
}

function requestContext(input) {
	if (input === null || typeof input !== "object" || Array.isArray(input)) throw new BlueprintApiError(400, "INVALID_REQUEST", "Request body must be an object");
	const cwd = typeof input.cwd === "string" && input.cwd.length > 0 ? input.cwd : null;
	const dshWorkspacePath = typeof input.dshWorkspacePath === "string" && input.dshWorkspacePath.length > 0 ? input.dshWorkspacePath : null;
	const sessionId = typeof input.sessionId === "string" && input.sessionId.length > 0 ? input.sessionId : null;
	if (typeof input.cwd === "string" && input.cwd.length > 4_096) throw new BlueprintApiError(400, "INVALID_CWD", "cwd must be at most 4096 characters");
	if (typeof input.dshWorkspacePath === "string" && input.dshWorkspacePath.length > 4_096) throw new BlueprintApiError(400, "INVALID_WORKSPACE", "dshWorkspacePath must be at most 4096 characters");
	if (!cwd && !dshWorkspacePath && !sessionId) throw new BlueprintApiError(400, "INVALID_CWD", "cwd, sessionId, or dshWorkspacePath is required");
	return { cwd, sessionId, dshWorkspacePath, dshWorkspaceTitle: typeof input.dshWorkspaceTitle === "string" ? input.dshWorkspaceTitle : null };
}

async function effectiveProject(input) {
	return resolveEffectiveBlueprintRoot(requestContext(input));
}

async function effectiveCwd(input) {
	return (await effectiveProject(input)).root;
}

async function entryPath(input) {
	return (await resolveBlueprintEntryPath(requestContext(input))).path;
}

async function dashboardForInput(input) {
	const context = requestContext(input);
	return getBlueprintDashboard(context.cwd, context);
}

/** Dispatch one JSON action independently of the HTTP carrier for deterministic tests. */
export async function handleBlueprintAction(input) {
	const context = requestContext(input);
	if (input.action === "bind") {
		if (typeof input.target !== "string" || input.target.length === 0 || input.target.length > 4_096) throw new BlueprintApiError(400, "INVALID_TARGET", "target must be a non-empty project path");
		try { await bindSessionBlueprintRoot({ cwd: context.cwd ?? process.cwd(), target: input.target }); }
		catch (error) { throw new BlueprintApiError(error?.code === "BLUEPRINT_PROJECT_NOT_FOUND" ? 404 : 400, error?.code ?? "BINDING_FAILED", error instanceof Error ? error.message : String(error)); }
		return dashboardForInput(input);
	}
	if (input.action === "unbind") {
		try { return { binding: await clearSessionBlueprintRoot({ cwd: context.cwd ?? process.cwd() }) }; }
		catch (error) { throw new BlueprintApiError(400, "INVALID_SESSION", error instanceof Error ? error.message : String(error)); }
	}
	if (input.action === "dashboard") return dashboardForInput(input);
	if (input.action === "document") {
		if (typeof input.featureId !== "string" || typeof input.file !== "string") throw new BlueprintApiError(400, "INVALID_DOCUMENT", "featureId and file are required");
		return getBlueprintDocument({ cwd: await effectiveCwd(input), featureId: input.featureId, file: input.file });
	}
	if (input.action === "discover") {
		try {
			return await discoverBlueprintProjects(await entryPath(input));
		} catch (err) {
			// The workspace directory may not exist (DSH session started in
			// a missing cwd, or the user has not yet created the project
			// root). The Blueprint Web "initialize here" flow needs a usable
			// manualCandidate so the developer can click the button without
			// having to first create a marker file. Fall back to the raw
			// input.cwd and let the UI render the setup panel.
			const fallbackCwd = (typeof input.cwd === "string" && input.cwd.length > 0) ? input.cwd : null;
			if (fallbackCwd === null) throw err;
			const { basename } = await import("node:path");
			return {
				cwd: fallbackCwd,
				candidate: null,
				manualCandidate: { name: basename(fallbackCwd) || fallbackCwd, path: fallbackCwd, reason: "fallback" },
				projectMarkers: ["package.json", "pyproject.toml", "requirements.txt", "Cargo.toml", "go.mod", "composer.json", "Gemfile"],
				hints: [],
			};
		}
	}
	if (input.action === "initialize") {
		if (typeof input.target !== "string") throw new BlueprintApiError(400, "INVALID_TARGET", "target must be a project path");
		let target = input.target;
		try {
			const discovery = await discoverBlueprintProjects(await entryPath(input));
			const recognized = discovery.candidate !== null && isSameProjectPath(input.target, discovery.candidate.path);
			const confirmedCurrentWorkspace = input.confirmCurrentWorkspace === true
				&& discovery.manualCandidate !== null
				&& isSameProjectPath(input.target, discovery.manualCandidate.path);
			if (!recognized && !confirmedCurrentWorkspace) {
				throw new BlueprintApiError(403, "UNSAFE_INITIALIZATION_TARGET", "The requested directory is not the current discovered project root");
			}
			target = recognized ? discovery.candidate.path : discovery.manualCandidate.path;
		} catch (err) {
			// entryPath / discover may fail because the workspace path is
			// not resolvable from the DSH session (e.g. cwd is a fresh,
			// not-yet-existing directory). When that happens, trust the
			// developer's explicit confirmCurrentWorkspace flag and use the
			// raw target as the init cwd. The confirmation is the same
			// gate the success path uses; we are only skipping the
			// secondary discovery check.
			if (!(input.confirmCurrentWorkspace === true && err?.code !== "UNSAFE_INITIALIZATION_TARGET")) throw err;
		}
		const initialized = await initBlueprint(target);
		return { initialized, dashboard: await dashboardForInput(input) };
	}
	if (input.action === "upgrade") {
		const root = await effectiveCwd(input);
		const initialized = await initBlueprint(root);
		return { initialized, dashboard: await dashboardForInput(input) };
	}
	if (input.action === "approve") {
		if (typeof input.featureId !== "string" || typeof input.expectedSpecHash !== "string") {
			throw new BlueprintApiError(400, "INVALID_APPROVAL", "featureId and expectedSpecHash are required");
		}
		try {
			await approveFeatureProposal({ cwd: await effectiveCwd(input), featureId: input.featureId, expectedSpecHash: input.expectedSpecHash });
		} catch (error) {
			throw new BlueprintApiError(409, "APPROVAL_FAILED", error instanceof Error ? error.message : String(error));
		}
		return dashboardForInput(input);
	}
	if (input.action === "prepare") {
		if (typeof input.featureId !== "string" || typeof input.expectedFeatureHash !== "string") throw new BlueprintApiError(400, "INVALID_PREPARATION", "featureId and expectedFeatureHash are required");
		try { await prepareFeatureArtifacts({ cwd: await effectiveCwd(input), featureId: input.featureId, expectedFeatureHash: input.expectedFeatureHash }); }
		catch (error) { throw new BlueprintApiError(409, "PREPARATION_FAILED", error instanceof Error ? error.message : String(error)); }
		return dashboardForInput(input);
	}
	if (input.action === "migration-preview") {
		try { return await previewFeatureIdentityMigration({ cwd: await effectiveCwd(input), featureId: input.featureId, parentId: input.parentId ?? null, localKey: input.localKey }); }
		catch (error) { throw new BlueprintApiError(409, "MIGRATION_PREVIEW_FAILED", error instanceof Error ? error.message : String(error)); }
	}
	if (input.action === "migration-apply") {
		try { await applyFeatureIdentityMigration({ cwd: await effectiveCwd(input), featureId: input.featureId, parentId: input.parentId ?? null, localKey: input.localKey, expectedPreviewHash: input.expectedPreviewHash }); }
		catch (error) { throw new BlueprintApiError(409, "MIGRATION_FAILED", error instanceof Error ? error.message : String(error)); }
		return dashboardForInput(input);
	}
	if (input.action === "save") {
		await saveBlueprintFeature({ cwd: await effectiveCwd(input), feature: input.feature, expectedHash: input.expectedHash ?? null });
		return dashboardForInput(input);
	}
	if (input.action === "architecture-preview") {
		try { return await previewArchitectureChange({ cwd: await effectiveCwd(input), change: input.change }); }
		catch (error) { throw new BlueprintApiError(409, "ARCHITECTURE_PREVIEW_FAILED", error instanceof Error ? error.message : String(error)); }
	}
	if (input.action === "architecture-initialize-preview") {
		try { return await previewArchitectureInitialization({ cwd: await effectiveCwd(input) }); }
		catch (error) { throw new BlueprintApiError(409, "ARCHITECTURE_INITIALIZATION_PREVIEW_FAILED", error instanceof Error ? error.message : String(error)); }
	}
	if (input.action === "architecture-initialize-apply") {
		if (typeof input.expectedPreviewHash !== "string") throw new BlueprintApiError(400, "INVALID_PREVIEW_HASH", "expectedPreviewHash is required");
		try {
			const result = await applyArchitectureInitialization({ cwd: await effectiveCwd(input), expectedPreviewHash: input.expectedPreviewHash });
			return { applied: result, dashboard: await dashboardForInput(input) };
		} catch (error) {
			throw new BlueprintApiError(409, "ARCHITECTURE_INITIALIZATION_FAILED", error instanceof Error ? error.message : String(error));
		}
	}
	if (input.action === "architecture-apply") {
		if (typeof input.expectedPreviewHash !== "string") {
			throw new BlueprintApiError(400, "INVALID_PREVIEW_HASH", "expectedPreviewHash is required");
		}
		try {
			const result = await applyArchitectureChange({ cwd: await effectiveCwd(input), change: input.change, expectedPreviewHash: input.expectedPreviewHash });
			return { applied: result, dashboard: await dashboardForInput(input) };
		} catch (error) {
			throw new BlueprintApiError(409, "ARCHITECTURE_APPLY_FAILED", error instanceof Error ? error.message : String(error));
		}
	}
	if (input.action === "assistant-spec-preview") {
		try { return await previewAssistantSpecPatch({ cwd: await effectiveCwd(input), patch: input.patch }); }
		catch (error) { throw new BlueprintApiError(409, "ASSISTANT_SPEC_PREVIEW_FAILED", error instanceof Error ? error.message : String(error)); }
	}
	if (input.action === "assistant-spec-apply") {
		if (typeof input.expectedPreviewHash !== "string") throw new BlueprintApiError(400, "INVALID_PREVIEW_HASH", "expectedPreviewHash is required");
		if (input.confirmBilingual !== true) throw new BlueprintApiError(400, "BILINGUAL_CONFIRMATION_REQUIRED", "confirmBilingual must be true after developer review");
		try {
			const result = await applyAssistantSpecPatch({ cwd: await effectiveCwd(input), patch: input.patch, expectedPreviewHash: input.expectedPreviewHash, confirmBilingual: input.confirmBilingual });
			return { applied: result, dashboard: await dashboardForInput(input) };
		} catch (error) {
			throw new BlueprintApiError(409, "ASSISTANT_SPEC_APPLY_FAILED", error instanceof Error ? error.message : String(error));
		}
	}
	if (input.action === "implementation-begin") {
		try {
			await beginFeatureImplementation({ cwd: await effectiveCwd(input), featureId: input.featureId, expectedSpecHash: input.expectedSpecHash });
			return dashboardForInput(input);
		} catch (error) {
			throw new BlueprintApiError(409, "IMPLEMENTATION_BEGIN_FAILED", error instanceof Error ? error.message : String(error));
		}
	}
	if (input.action === "verification-request") {
		try {
			await requestFeatureVerification({ cwd: await effectiveCwd(input), featureId: input.featureId, expectedSpecHash: input.expectedSpecHash });
			return dashboardForInput(input);
		} catch (error) {
			throw new BlueprintApiError(409, "VERIFICATION_REQUEST_FAILED", error instanceof Error ? error.message : String(error));
		}
	}
	if (input.action === "verification-legacy-request") {
		try {
			await requestLegacyFeatureVerification({ cwd: await effectiveCwd(input), featureId: input.featureId });
			return dashboardForInput(input);
		} catch (error) {
			throw new BlueprintApiError(409, "VERIFICATION_LEGACY_REQUEST_FAILED", error instanceof Error ? error.message : String(error));
		}
	}
	if (input.action === "verification-start") {
		try {
			const started = await startFeatureVerification({ cwd: await effectiveCwd(input), featureId: input.featureId, expectedRecordHash: input.expectedRecordHash, sessionId: input.sessionId, workspacePath: input.workspacePath, preparationCapability: input.preparationCapability });
			return { started: { attempt: started.attempt, resultCapability: started.resultCapability }, dashboard: await dashboardForInput(input) };
		} catch (error) {
			throw new BlueprintApiError(409, "VERIFICATION_START_FAILED", error instanceof Error ? error.message : String(error));
		}
	}
	if (input.action === "verification-prepare") {
		try {
			return await prepareFeatureVerification({ cwd: await effectiveCwd(input), featureId: input.featureId, expectedRecordHash: input.expectedRecordHash });
		} catch (error) {
			throw new BlueprintApiError(409, "VERIFICATION_PREPARE_FAILED", error instanceof Error ? error.message : String(error));
		}
	}
	if (input.action === "verification-result") {
		try {
			const accepted = await submitFeatureVerificationResult({ cwd: await effectiveCwd(input), featureId: input.featureId, expectedRecordHash: input.expectedRecordHash, attemptId: input.attemptId, resultCapability: input.resultCapability, result: input.result });
			return { accepted: { completed: accepted.completed, verified: accepted.verified === true, hostFailure: accepted.hostFailure === true }, dashboard: await dashboardForInput(input) };
		} catch (error) {
			throw new BlueprintApiError(409, "VERIFICATION_RESULT_FAILED", error instanceof Error ? error.message : String(error));
		}
	}
	if (input.action === "verification-finalize") {
		try {
			const accepted = await completeVerifiedFeature({ cwd: await effectiveCwd(input), featureId: input.featureId, expectedRecordHash: input.expectedRecordHash });
			return { accepted: { completed: accepted.completed, hostFailure: accepted.hostFailure === true }, dashboard: await dashboardForInput(input) };
		} catch (error) {
			throw new BlueprintApiError(409, "VERIFICATION_FINALIZE_FAILED", error instanceof Error ? error.message : String(error));
		}
	}
	if (input.action === "verification-abandon") {
		try {
			await abandonFeatureVerification({ cwd: await effectiveCwd(input), featureId: input.featureId, expectedRecordHash: input.expectedRecordHash, attemptId: input.attemptId, sessionId: input.sessionId });
			return dashboardForInput(input);
		} catch (error) {
			throw new BlueprintApiError(409, "VERIFICATION_ABANDON_FAILED", error instanceof Error ? error.message : String(error));
		}
	}
	if (input.action === "verification-fail") {
		try {
			const failed = await failFeatureVerificationOrchestration({ cwd: await effectiveCwd(input), featureId: input.featureId, expectedRecordHash: input.expectedRecordHash, phase: input.phase, message: input.message, attemptId: input.attemptId, sessionId: input.sessionId });
			return { failed: { hostFailure: failed.hostFailure === true }, dashboard: await dashboardForInput(input) };
		} catch (error) {
			throw new BlueprintApiError(409, "VERIFICATION_ORCHESTRATION_FAILED", error instanceof Error ? error.message : String(error));
		}
	}
	throw new BlueprintApiError(400, "UNKNOWN_ACTION", "action must be bind, unbind, dashboard, document, discover, initialize, upgrade, approve, prepare, migration-preview, migration-apply, architecture-initialize-preview, architecture-initialize-apply, architecture-preview, architecture-apply, assistant-spec-preview, assistant-spec-apply, implementation-begin, verification-request, verification-legacy-request, verification-prepare, verification-start, verification-result, verification-finalize, verification-abandon, verification-fail, or save");
}

async function readJson(req) {
	let size = 0;
	const chunks = [];
	for await (const chunk of req) {
		size += chunk.length;
		if (size > MAX_REQUEST_BYTES) throw new BlueprintApiError(413, "REQUEST_TOO_LARGE", "Request exceeds 256 KiB");
		chunks.push(chunk);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		throw new BlueprintApiError(400, "INVALID_JSON", "Request body must be valid JSON");
	}
}

function sameOrigin(req) {
	const origin = req.headers.origin;
	if (!origin) return true;
	try {
		return new URL(origin).host === req.headers.host;
	} catch {
		return false;
	}
}

function sendJson(res, status, value) {
	const body = JSON.stringify(value);
	res.statusCode = status;
	res.setHeader("content-type", "application/json; charset=utf-8");
	res.setHeader("cache-control", "no-store");
	res.setHeader("x-content-type-options", "nosniff");
	res.end(body);
}

/** Own the exact DSH Web route response lifecycle. */
export async function handleBlueprintRequest(req, res, hooks = {}) {
	try {
		if (req.method !== "POST") throw new BlueprintApiError(405, "METHOD_NOT_ALLOWED", "Use POST");
		if (!sameOrigin(req)) throw new BlueprintApiError(403, "CROSS_ORIGIN", "Cross-origin requests are not allowed");
		if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
			throw new BlueprintApiError(415, "CONTENT_TYPE", "Use application/json");
		}
		const input = await readJson(req);
		let result = await handleBlueprintAction(input);
		if (input.action === "approve" && typeof hooks.afterApproval === "function") {
			await hooks.afterApproval(input);
			result = await dashboardForInput(input);
		}
		sendJson(res, 200, { ok: true, value: result });
	} catch (error) {
		const status = error instanceof BlueprintApiError ? error.status : error?.code === "BLUEPRINT_PROJECT_NOT_FOUND" ? 404 : 500;
		const code = error instanceof BlueprintApiError ? error.code : error?.code === "BLUEPRINT_PROJECT_NOT_FOUND" ? error.code : "INTERNAL_ERROR";
		sendJson(res, status, { ok: false, error: { code, message: error instanceof Error ? error.message : String(error) } });
	}
}





