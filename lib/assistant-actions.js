/**
 * Capability-bound actions emitted by the embedded Blueprint assistant.
 *
 * Natural-language intent never reaches the filesystem through this module.
 * Every mutation is reconstructed from current Host facts, previewed, hash
 * bound, and applied as one recoverable transaction.
 *
 * @module @dsh-plugins/design-blueprint/assistant-actions
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix } from "node:path";
import { loadConfig } from "./config.js";
import { markdownSignature, serializePairRecord } from "./docs.js";
import { loadFeatureCatalog } from "./features.js";
import { normalizeRelativePath } from "./path-utils.js";
import { resolveBlueprintRoot } from "./project-root.js";
import { loadSpecs, parseSpec } from "./specs.js";
import { workingTreeSnapshot } from "./snapshot.js";
import { loadFeatureWorkflow } from "./workflow.js";
import { loadArchitectureCatalog } from "./architecture.js";
import { evaluateSpec as evaluateSpecDecomposition, loadThresholds as loadDecompositionThresholds } from "./spec-decomposition.js";
import { PREPARED_MARKER, resolveFeatureArtifacts } from "./artifacts.js";

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const MAX_PATCH_BYTES = 256 * 1024;

function sha256(content) {
	return createHash("sha256").update(content).digest("hex");
}

function reviewHash(en, zh) {
	return createHash("sha256").update(en).update("\0").update(zh).digest("hex");
}

function absolute(root, relative) {
	return join(root, ...relative.split("/"));
}

function firstContentAfterH1(content) {
	const lines = content.split(/\r?\n/);
	const h1 = lines.findIndex((line) => /^#\s+/.test(line));
	return h1 < 0 ? "" : lines.slice(h1 + 1).find((line) => line.trim())?.trim() ?? "";
}

function assertBilingualBrief(enFile, en, zhFile, zh) {
	if (!/^#\s+\S/m.test(en) || !/^#\s+\S/m.test(zh)) throw new Error("both Product briefs require one H1 title");
	const expectedEn = `English | [中文](${basename(zhFile)})`;
	const expectedZh = `[English](${basename(enFile)}) | 中文`;
	if (firstContentAfterH1(en) !== expectedEn || firstContentAfterH1(zh) !== expectedZh) {
		throw new Error("the Product brief language switchers do not match the registered bilingual paths");
	}
	if (JSON.stringify(markdownSignature(en)) !== JSON.stringify(markdownSignature(zh))) {
		throw new Error("the English and Chinese Product brief structures do not match");
	}
}

function assertChineseProposedSpec(content, featureId) {
	if (!/^#\s+(?:Spec|规格|规范)[：:]\s*\S/m.test(content)) throw new Error("the Chinese Spec requires a Chinese H1 title");
	if (!/^状态：\s*(?:提议|拟议)\s*$/m.test(content)) throw new Error("the Chinese Spec must remain in the proposed lifecycle");
	if (!new RegExp(`^功能：\\s*${featureId}\\s*$`, "m").test(content)) throw new Error("the Chinese Spec Feature identity does not match the selected Feature");
	if (content.includes(PREPARED_MARKER)) throw new Error("the Chinese Spec still contains the prepared skeleton marker");
}

function normalizePatch(action) {
	if (!action || typeof action !== "object" || Array.isArray(action)) throw new Error("patch must be one object");
	if (typeof action.featureId !== "string") throw new Error("patch.featureId is required");
	if (!Array.isArray(action.files) || action.files.length !== 4) throw new Error("a Spec artifact patch must contain exactly four registered bilingual files");
	let bytes = 0;
	const files = action.files.map((entry) => {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("each patch file must be one object");
		const file = normalizeRelativePath(entry.file);
		if (!HASH_PATTERN.test(entry.expectedHash ?? "")) throw new Error(`expectedHash is required for '${file}'`);
		if (typeof entry.content !== "string") throw new Error(`content is required for '${file}'`);
		bytes += Buffer.byteLength(entry.content, "utf8");
		return { file, expectedHash: entry.expectedHash, content: entry.content };
	});
	if (bytes > MAX_PATCH_BYTES) throw new Error("the bilingual Spec artifact patch exceeds 256 KiB");
	if (new Set(files.map((entry) => entry.file)).size !== files.length) throw new Error("a Spec artifact patch cannot contain duplicate paths");
	return { featureId: action.featureId, files };
}

async function patchFacts(root, action) {
	const patch = normalizePatch(action);
	const snapshot = await workingTreeSnapshot(root);
	const configResult = await loadConfig(snapshot);
	if (configResult.issues.some((entry) => entry.severity === "required")) throw new Error("repair design-blueprint.json before applying assistant actions");
	const config = configResult.config;
	const [catalog, specsResult, architectureResult] = await Promise.all([
		loadFeatureCatalog(snapshot, config),
		loadSpecs(snapshot, config),
		loadArchitectureCatalog(snapshot, config),
	]);
	const feature = catalog.features.find((entry) => entry.id === patch.featureId);
	if (!feature) throw new Error(`selected Feature '${patch.featureId}' does not exist`);
	const linked = specsResult.specs.filter((entry) => entry.featureId === feature.id && entry.status === "proposed");
	if (linked.length !== 1) throw new Error(`selected Feature '${feature.id}' must have exactly one proposed Spec pair`);
	const workflow = await loadFeatureWorkflow(snapshot, config, specsResult.specs, catalog.features, architectureResult.components);
	const state = workflow.states.get(feature.id);
	if (state?.spec?.file !== linked[0].file) throw new Error("the selected Feature workflow no longer points to the proposed Spec");
	const artifacts = await resolveFeatureArtifacts({ snapshot, config, feature, spec: linked[0] });
	if (artifacts.spec.lifecycle !== "proposed") throw new Error("assistant Spec patches can target only the proposed lifecycle");
	const allowed = [artifacts.brief.en.file, artifacts.brief.zh.file, artifacts.spec.en.file, artifacts.spec.zh.file];
	if ([artifacts.brief.en, artifacts.brief.zh, artifacts.brief.pairing, artifacts.spec.en, artifacts.spec.zh].some((entry) => !entry.exists)) {
		throw new Error("the registered bilingual Product brief and proposed Spec artifacts must already exist");
	}
	const byPath = new Map(patch.files.map((entry) => [entry.file, entry]));
	if (allowed.some((file) => !byPath.has(file)) || patch.files.some((entry) => !allowed.includes(entry.file))) {
		throw new Error("the patch contains a path outside the selected Feature's registered Product brief and proposed Spec pair");
	}
	for (const file of allowed) {
		const current = await snapshot.readText(file);
		if (current === null || sha256(current) !== byPath.get(file).expectedHash) throw new Error(`'${file}' changed after the assistant read it; refresh and propose again`);
	}
	const briefEn = byPath.get(artifacts.brief.en.file).content;
	const briefZh = byPath.get(artifacts.brief.zh.file).content;
	const specEn = byPath.get(artifacts.spec.en.file).content;
	const specZh = byPath.get(artifacts.spec.zh.file).content;
	if ([briefEn, briefZh, specEn, specZh].some((content) => content.includes(PREPARED_MARKER))) throw new Error("the patch must replace every prepared skeleton marker");
	assertBilingualBrief(artifacts.brief.en.file, briefEn, artifacts.brief.zh.file, briefZh);
	const parsed = parseSpec(artifacts.spec.en.file, specEn, config.authority.specsRoot);
	const requiredIssues = parsed.issues.filter((entry) => entry.severity === "required");
	if (requiredIssues.length > 0) throw new Error(`the proposed English Spec has ${requiredIssues.length} required validation issue(s)`);
	if (parsed.spec.status !== "proposed" || parsed.spec.featureId !== feature.id) throw new Error("the English Spec must remain proposed and linked to the selected Feature");
	assertChineseProposedSpec(specZh, feature.id);
	if (JSON.stringify(markdownSignature(specEn)) !== JSON.stringify(markdownSignature(specZh))) {
		throw new Error("the English and Chinese proposed Spec structures do not match");
	}
	runDecompositionGate(specEn, config, artifacts.spec.en.file);
	const files = allowed.map((file) => {
		const before = byPath.get(file).expectedHash;
		const content = byPath.get(file).content;
		return { file, beforeHash: before, afterHash: sha256(content), beforeContent: artifacts.brief.en.file === file ? artifacts.brief.en.content : artifacts.brief.zh.file === file ? artifacts.brief.zh.content : artifacts.spec.en.file === file ? artifacts.spec.en.content : artifacts.spec.zh.content, afterContent: content };
	});
	const pairingBefore = await snapshot.readText(artifacts.brief.pairing.file);
	const pairingAfter = serializePairRecord(artifacts.brief.en.file, briefEn, artifacts.brief.zh.file, briefZh);
	const preview = {
		featureId: feature.id,
		featureHash: feature.hash,
		workflowStage: state?.stage ?? "draft",
		files,
		pairing: { file: artifacts.brief.pairing.file, beforeHash: sha256(pairingBefore), afterHash: sha256(pairingAfter) },
		approvalBecomesStale: Boolean(artifacts.approval.exists),
	};
	const binding = {
		featureId: preview.featureId,
		featureHash: preview.featureHash,
		workflowStage: preview.workflowStage,
		files: files.map(({ file, beforeHash, afterHash }) => ({ file, beforeHash, afterHash })),
		pairing: preview.pairing,
		approvalBecomesStale: preview.approvalBecomesStale,
	};
	return { patch, artifacts, contents: { briefEn, briefZh, specEn, specZh, pairingAfter }, preview, previewHash: sha256(JSON.stringify(binding)) };
}

/** Preview an assistant-proposed update to exactly one Feature's four registered text artifacts. */
export async function previewAssistantSpecPatch({ cwd, patch }) {
	const root = await resolveBlueprintRoot(cwd);
	const facts = await patchFacts(root, patch);
	return { root, preview: { ...facts.preview, previewHash: facts.previewHash } };
}

/** Apply a hash-bound bilingual artifact preview as one recoverable transaction. */
export async function applyAssistantSpecPatch({ cwd, patch, expectedPreviewHash, confirmBilingual = false }) {
	if (!HASH_PATTERN.test(expectedPreviewHash ?? "")) throw new Error("expectedPreviewHash must be one SHA-256 value");
	if (confirmBilingual !== true) throw new Error("the developer must explicitly confirm bilingual semantic consistency");
	const root = await resolveBlueprintRoot(cwd);
	const facts = await patchFacts(root, patch);
	if (facts.previewHash !== expectedPreviewHash) throw new Error("the registered artifacts changed after preview; preview again");
	const writes = [
		...facts.patch.files.map((entry) => ({ file: entry.file, content: entry.content })),
		{ file: facts.artifacts.brief.pairing.file, content: facts.contents.pairingAfter },
	];
	const staged = [];
	const backups = [];
	const committed = [];
	try {
		for (const entry of writes) {
			const target = absolute(root, entry.file);
			await mkdir(dirname(target), { recursive: true });
			const temporary = `${target}.${randomUUID()}.tmp`;
			await writeFile(temporary, entry.content, { encoding: "utf8", flag: "wx" });
			staged.push({ target, temporary });
		}
		for (const entry of staged) {
			const backup = `${entry.target}.${randomUUID()}.bak`;
			await rename(entry.target, backup);
			backups.push({ target: entry.target, backup });
		}
		for (const entry of staged) {
			await rename(entry.temporary, entry.target);
			committed.push(entry.target);
		}
	} catch (error) {
		await Promise.all(staged.map((entry) => unlink(entry.temporary).catch(() => {})));
		await Promise.all(committed.map((target) => unlink(target).catch(() => {})));
		for (const entry of backups.reverse()) await rename(entry.backup, entry.target).catch(() => {});
		throw error;
	}
	await Promise.all(backups.map((entry) => unlink(entry.backup).catch(() => {})));
	return { root, featureId: facts.patch.featureId, files: writes.map((entry) => entry.file), approvalBecameStale: facts.preview.approvalBecomesStale };
}

function assertChineseLifecycle(content, featureId, lifecycle) {
	const labels = lifecycle === "implemented" ? ["已实现"] : ["已拒绝", "拒绝"];
	if (!labels.some((label) => new RegExp(`^状态：\\s*${label}(?:\\s*[—-]\\s*.+)?\\s*$`, "m").test(content))) throw new Error(`the Chinese Spec must declare lifecycle '${lifecycle}'`);
	if (!new RegExp(`^功能：\\s*${featureId}\\s*$`, "m").test(content)) throw new Error("the Chinese Spec Feature identity does not match the source");
}

/** Throw a structured `SPEC_TOO_BIG_FOR_REFINEMENT` error when the proposed Spec crosses a decomposition threshold. */
function runDecompositionGate(specEn, config, file) {
	const thresholds = loadDecompositionThresholds(config?.decomposition ?? null);
	const result = evaluateSpecDecomposition({ file, content: specEn, config: thresholds });
	if (result.ok) return;
	const first = result.violations[0];
	const suggestionLine = result.suggestion
? ` design-blueprint spec decompose <spec.md> would split it into ${result.suggestion.subSpecCount} sub-Specs covering REQ-${result.suggestion.allocations.map((a) => a.reqStart).join(",")}..${result.suggestion.allocations.map((a) => a.reqEnd).join(",")}.`
: "";
	const message = `${first.message};${suggestionLine}`.replace(/;\s*$/, "");
	const error = new Error(`SPEC_TOO_BIG_FOR_REFINEMENT: ${message}`);
	error.code = "SPEC_TOO_BIG_FOR_REFINEMENT";
	error.thresholds = { ...thresholds };
	error.observed = { ...result.observed };
	error.suggestion = result.suggestion;
	error.violations = result.violations;
	throw error;
}

/**
 * Perform a supported lifecycle transition. It is intentionally not exposed by
 * the embedded assistant HTTP API; approved development/rejection workflows own it.
 */
export async function applySpecLifecycleTransition({ cwd, sourceFile, targetLifecycle, expectedSourceHash, englishContent, chineseContent }) {
	if (!HASH_PATTERN.test(expectedSourceHash ?? "")) throw new Error("expectedSourceHash must be one SHA-256 value");
	if (targetLifecycle !== "implemented" && targetLifecycle !== "rejected") throw new Error("targetLifecycle must be implemented or rejected");
	const root = await resolveBlueprintRoot(cwd);
	const snapshot = await workingTreeSnapshot(root);
	const { config } = await loadConfig(snapshot);
	const normalizedSource = normalizeRelativePath(sourceFile);
	const proposedPrefix = `${config.authority.specsRoot}/proposed/`;
	if (!normalizedSource.startsWith(proposedPrefix) || normalizedSource.endsWith(".zh.md") || !normalizedSource.endsWith(".md")) {
		throw new Error("supported lifecycle transitions must start from one English proposed Spec");
	}
	if (typeof englishContent !== "string" || typeof chineseContent !== "string") throw new Error("both destination language contents are required");
	const sourceZh = normalizedSource.replace(/\.md$/, ".zh.md");
	const [currentEn, currentZh] = await Promise.all([snapshot.readText(normalizedSource), snapshot.readText(sourceZh)]);
	if (currentEn === null || currentZh === null) throw new Error("the complete proposed Spec pair must exist");
	if (reviewHash(currentEn, currentZh) !== expectedSourceHash) throw new Error("the proposed Spec pair changed before lifecycle transition");
	const targetEn = posix.join(config.authority.specsRoot, targetLifecycle, posix.basename(normalizedSource));
	const targetZh = targetEn.replace(/\.md$/, ".zh.md");
	if (snapshot.exists(targetEn) || snapshot.exists(targetZh)) throw new Error("the lifecycle destination already exists");
	const parsed = parseSpec(targetEn, englishContent, config.authority.specsRoot);
	if (parsed.issues.some((entry) => entry.severity === "required") || parsed.spec.status !== targetLifecycle || parsed.spec.featureId === null) {
		throw new Error("the destination English Spec does not validate for its target lifecycle");
	}
	assertChineseLifecycle(chineseContent, parsed.spec.featureId, targetLifecycle);
	const destinations = [{ file: targetEn, content: englishContent }, { file: targetZh, content: chineseContent }];
	const staged = [];
	const committed = [];
	const backups = [];
	try {
		for (const entry of destinations) {
			const target = absolute(root, entry.file);
			await mkdir(dirname(target), { recursive: true });
			const temporary = `${target}.${randomUUID()}.tmp`;
			await writeFile(temporary, entry.content, { encoding: "utf8", flag: "wx" });
			staged.push({ target, temporary });
		}
		for (const entry of staged) {
			await rename(entry.temporary, entry.target);
			committed.push(entry.target);
		}
		for (const file of [normalizedSource, sourceZh]) {
			const source = absolute(root, file);
			const backup = `${source}.${randomUUID()}.bak`;
			await rename(source, backup);
			backups.push({ source, backup });
		}
	} catch (error) {
		await Promise.all(staged.map((entry) => unlink(entry.temporary).catch(() => {})));
		await Promise.all(committed.map((target) => unlink(target).catch(() => {})));
		for (const entry of backups.reverse()) await rename(entry.backup, entry.source).catch(() => {});
		throw error;
	}
	await Promise.all(backups.map((entry) => unlink(entry.backup).catch(() => {})));
	return { root, source: [normalizedSource, sourceZh], destination: [targetEn, targetZh], lifecycle: targetLifecycle };
}
