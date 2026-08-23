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
import { resolveBlueprintRoot } from "./project-root.js";
import { discoverBlueprintProjects, isSameProjectPath } from "./project-discovery.js";
import { initBlueprint } from "./init.js";
import { scan } from "./scan.js";
import { workingTreeSnapshot } from "./snapshot.js";
import { loadSpecs } from "./specs.js";
import { approveFeatureProposal, loadFeatureWorkflow } from "./workflow.js";
import { PLUGIN_VERSION } from "./version.js";
import { applyFeatureIdentityMigration, applyArchitectureChange, applyArchitectureInitialization, deriveFeatureId, prepareFeatureArtifacts, previewFeatureIdentityMigration, previewArchitectureChange, previewArchitectureInitialization, resolveFeatureArtifacts } from "./artifacts.js";

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

function publicFeature(feature, workflow, artifacts) {
	const brief = {
		en: artifacts.brief.en.exists ? { file: artifacts.brief.en.file, content: artifacts.brief.en.content } : null,
		zh: artifacts.brief.zh.exists ? { file: artifacts.brief.zh.file, content: artifacts.brief.zh.content } : null,
	};
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
		components: feature.components ?? [],
		hash: feature.hash,
		satisfaction: feature.satisfaction,
		file: feature.file,
		brief,
		artifacts,
		workflow: {
			stage: workflow?.stage ?? "draft",
			spec: workflow?.spec ? {
				file: workflow.spec.file,
				title: workflow.spec.title,
				status: workflow.spec.status,
				hash: workflow.spec.reviewHash ?? workflow.spec.contentHash,
				content: workflow.spec.content,
				languages: workflow.spec.languages,
			} : null,
			approvedAt: workflow?.stage === "approved" ? workflow.approval?.approvedAt ?? null : null,
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

/** Return the complete read model used by the visual dashboard. */
export async function getBlueprintDashboard(cwd) {
	const root = await resolveBlueprintRoot(cwd);
	const snapshot = await workingTreeSnapshot(root);
	const configResult = await loadConfig(snapshot);
	const catalog = await loadFeatureCatalog(snapshot, configResult.config);
	const architectureResult = await loadArchitectureCatalog(snapshot, configResult.config);
	const specsResult = await loadSpecs(snapshot, configResult.config);
	const workflow = await loadFeatureWorkflow(snapshot, configResult.config, specsResult.specs, catalog.features, architectureResult.components);
	const audit = await scan({ cwd: root, all: true });
	const issues = [...catalog.issues, ...architectureResult.issues, ...audit.issues];
	const publicFeatures = await Promise.all(catalog.features.map(async (feature) => {
		const state = workflow.states.get(feature.id);
		const artifacts = await resolveFeatureArtifacts({ snapshot, config: configResult.config, feature, spec: state?.spec ?? null });
		return publicFeature(feature, state, artifacts);
	}));
	const publicComponents = architectureResult.components.map(publicComponent);
	return {
		plugin: { hostVersion: PLUGIN_VERSION },
		project: { root, name: basename(root) },
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
	};
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

/** Dispatch one JSON action independently of the HTTP carrier for deterministic tests. */
export async function handleBlueprintAction(input) {
	if (input === null || typeof input !== "object" || Array.isArray(input)) throw new BlueprintApiError(400, "INVALID_REQUEST", "Request body must be an object");
	if (typeof input.cwd !== "string" || input.cwd.length === 0 || input.cwd.length > 4_096) throw new BlueprintApiError(400, "INVALID_CWD", "cwd must be a non-empty project path");
	if (input.action === "dashboard") return getBlueprintDashboard(input.cwd);
	if (input.action === "discover") return discoverBlueprintProjects(input.cwd);
	if (input.action === "initialize") {
		if (typeof input.target !== "string") throw new BlueprintApiError(400, "INVALID_TARGET", "target must be a project path");
		const discovery = await discoverBlueprintProjects(input.cwd);
		const recognized = discovery.candidate !== null && isSameProjectPath(input.target, discovery.candidate.path);
		const confirmedCurrentWorkspace = input.confirmCurrentWorkspace === true
			&& discovery.manualCandidate !== null
			&& isSameProjectPath(input.target, discovery.manualCandidate.path);
		if (!recognized && !confirmedCurrentWorkspace) {
			throw new BlueprintApiError(403, "UNSAFE_INITIALIZATION_TARGET", "The requested directory is not the current discovered project root");
		}
		const target = recognized ? discovery.candidate.path : discovery.manualCandidate.path;
		const initialized = await initBlueprint(target);
		return { initialized, dashboard: await getBlueprintDashboard(target) };
	}
	if (input.action === "upgrade") {
		const root = await resolveBlueprintRoot(input.cwd);
		const initialized = await initBlueprint(root);
		return { initialized, dashboard: await getBlueprintDashboard(root) };
	}
	if (input.action === "approve") {
		if (typeof input.featureId !== "string" || typeof input.expectedSpecHash !== "string") {
			throw new BlueprintApiError(400, "INVALID_APPROVAL", "featureId and expectedSpecHash are required");
		}
		try {
			await approveFeatureProposal({ cwd: input.cwd, featureId: input.featureId, expectedSpecHash: input.expectedSpecHash });
		} catch (error) {
			throw new BlueprintApiError(409, "APPROVAL_FAILED", error instanceof Error ? error.message : String(error));
		}
		return getBlueprintDashboard(input.cwd);
	}
	if (input.action === "prepare") {
		if (typeof input.featureId !== "string" || typeof input.expectedFeatureHash !== "string") throw new BlueprintApiError(400, "INVALID_PREPARATION", "featureId and expectedFeatureHash are required");
		try { await prepareFeatureArtifacts({ cwd: input.cwd, featureId: input.featureId, expectedFeatureHash: input.expectedFeatureHash }); }
		catch (error) { throw new BlueprintApiError(409, "PREPARATION_FAILED", error instanceof Error ? error.message : String(error)); }
		return getBlueprintDashboard(input.cwd);
	}
	if (input.action === "migration-preview") {
		try { return await previewFeatureIdentityMigration({ cwd: input.cwd, featureId: input.featureId, parentId: input.parentId ?? null, localKey: input.localKey }); }
		catch (error) { throw new BlueprintApiError(409, "MIGRATION_PREVIEW_FAILED", error instanceof Error ? error.message : String(error)); }
	}
	if (input.action === "migration-apply") {
		try { await applyFeatureIdentityMigration({ cwd: input.cwd, featureId: input.featureId, parentId: input.parentId ?? null, localKey: input.localKey, expectedPreviewHash: input.expectedPreviewHash }); }
		catch (error) { throw new BlueprintApiError(409, "MIGRATION_FAILED", error instanceof Error ? error.message : String(error)); }
		return getBlueprintDashboard(input.cwd);
	}
	if (input.action === "save") {
		await saveBlueprintFeature({ cwd: input.cwd, feature: input.feature, expectedHash: input.expectedHash ?? null });
		return getBlueprintDashboard(input.cwd);
	}
	if (input.action === "architecture-preview") {
		try { return await previewArchitectureChange({ cwd: input.cwd, change: input.change }); }
		catch (error) { throw new BlueprintApiError(409, "ARCHITECTURE_PREVIEW_FAILED", error instanceof Error ? error.message : String(error)); }
	}
	if (input.action === "architecture-initialize-preview") {
		try { return await previewArchitectureInitialization({ cwd: input.cwd }); }
		catch (error) { throw new BlueprintApiError(409, "ARCHITECTURE_INITIALIZATION_PREVIEW_FAILED", error instanceof Error ? error.message : String(error)); }
	}
	if (input.action === "architecture-initialize-apply") {
		if (typeof input.expectedPreviewHash !== "string") throw new BlueprintApiError(400, "INVALID_PREVIEW_HASH", "expectedPreviewHash is required");
		try {
			const result = await applyArchitectureInitialization({ cwd: input.cwd, expectedPreviewHash: input.expectedPreviewHash });
			return { applied: result, dashboard: await getBlueprintDashboard(input.cwd) };
		} catch (error) {
			throw new BlueprintApiError(409, "ARCHITECTURE_INITIALIZATION_FAILED", error instanceof Error ? error.message : String(error));
		}
	}
	if (input.action === "architecture-apply") {
		if (typeof input.expectedPreviewHash !== "string") {
			throw new BlueprintApiError(400, "INVALID_PREVIEW_HASH", "expectedPreviewHash is required");
		}
		try {
			const result = await applyArchitectureChange({ cwd: input.cwd, change: input.change, expectedPreviewHash: input.expectedPreviewHash });
			return { applied: result, dashboard: await getBlueprintDashboard(input.cwd) };
		} catch (error) {
			throw new BlueprintApiError(409, "ARCHITECTURE_APPLY_FAILED", error instanceof Error ? error.message : String(error));
		}
	}
	throw new BlueprintApiError(400, "UNKNOWN_ACTION", "action must be dashboard, discover, initialize, upgrade, approve, prepare, migration-preview, migration-apply, architecture-initialize-preview, architecture-initialize-apply, architecture-preview, architecture-apply, or save");
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
export async function handleBlueprintRequest(req, res) {
	try {
		if (req.method !== "POST") throw new BlueprintApiError(405, "METHOD_NOT_ALLOWED", "Use POST");
		if (!sameOrigin(req)) throw new BlueprintApiError(403, "CROSS_ORIGIN", "Cross-origin requests are not allowed");
		if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
			throw new BlueprintApiError(415, "CONTENT_TYPE", "Use application/json");
		}
		const result = await handleBlueprintAction(await readJson(req));
		sendJson(res, 200, { ok: true, value: result });
	} catch (error) {
		const status = error instanceof BlueprintApiError ? error.status : error?.code === "BLUEPRINT_PROJECT_NOT_FOUND" ? 404 : 500;
		const code = error instanceof BlueprintApiError ? error.code : error?.code === "BLUEPRINT_PROJECT_NOT_FOUND" ? error.code : "INTERNAL_ERROR";
		sendJson(res, status, { ok: false, error: { code, message: error instanceof Error ? error.message : String(error) } });
	}
}
