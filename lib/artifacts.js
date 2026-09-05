/**
 * Canonical Host-owned Feature identity and artifact operations.
 *
 * @module @dsh-plugins/design-blueprint/artifacts
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix } from "node:path";
import { serializePairRecord } from "./docs.js";
import { FEATURE_ID_PATTERN, loadFeatureCatalog, parseFeature, serializeFeature } from "./features.js";
import { COMPONENT_ID_PATTERN, COMPONENT_RELATION_TYPES, COMPONENT_STATUSES, COMPONENT_KINDS, DEPLOYMENT_ID_PATTERN, architecturePathFor, hashComponentContent, loadArchitectureCatalog, parseComponent, serializeComponent } from "./architecture.js";
import { loadConfig } from "./config.js";
import { resolveBlueprintRoot } from "./project-root.js";
import { loadSpecs } from "./specs.js";
import { workingTreeSnapshot } from "./snapshot.js";

export const FEATURE_LOCAL_KEY_PATTERN = /^[a-z](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
export const PREPARED_MARKER = "<!-- BLUEPRINT_PREPARED_SKELETON -->";

function sha256(content) {
	return createHash("sha256").update(content).digest("hex");
}

function canonicalPath(...parts) {
	return posix.join(...parts).replace(/^\.\//, "");
}

function absolute(root, relative) {
	return join(root, ...relative.split("/"));
}

export function normalizeLocalKey(value) {
	if (typeof value !== "string") return "";
	return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function deriveFeatureId(parentId, localKey) {
	const key = normalizeLocalKey(localKey);
	if (!FEATURE_LOCAL_KEY_PATTERN.test(key) || /^\d+$/.test(key)) {
		throw new Error("localKey must start with a lowercase ASCII letter and contain only lowercase letters, numbers, and hyphens");
	}
	if (parentId !== null && parentId !== undefined && parentId !== "" && !FEATURE_ID_PATTERN.test(parentId)) {
		throw new Error("parentId must be an existing canonical feature id or empty");
	}
	const id = parentId ? `${parentId}--${key}` : key;
	if (!FEATURE_ID_PATTERN.test(id)) throw new Error("the derived feature id exceeds the 64-character canonical id limit");
	return id;
}

async function artifact(snapshot, file, includeContent = false) {
	const content = await snapshot.readText(file);
	return {
		file,
		exists: content !== null,
		hash: content === null ? null : sha256(content),
		...(includeContent && content !== null ? { content } : {}),
	};
}

export async function resolveFeatureArtifacts({ snapshot, config, feature, spec = null }) {
	if (!feature || !FEATURE_ID_PATTERN.test(feature.id)) throw new Error("feature must have a canonical id");
	const featureId = feature.id;
	const briefBase = canonicalPath("docs/user/features", featureId);
	const specEn = spec?.file ?? canonicalPath(config.authority.specsRoot, "proposed", `${featureId}.md`);
	const specZh = spec?.languages?.zh?.file ?? specEn.replace(/\.md$/, ".zh.md");
	const [definition, briefEn, briefZh, briefPairing, specEnArtifact, specZhArtifact, approval] = await Promise.all([
		artifact(snapshot, canonicalPath(config.features.root, `${featureId}.md`), true),
		artifact(snapshot, `${briefBase}.md`, true),
		artifact(snapshot, `${briefBase}.zh.md`, true),
		artifact(snapshot, `${briefBase}.i18n.yaml`),
		artifact(snapshot, specEn, true),
		artifact(snapshot, specZh, true),
		artifact(snapshot, canonicalPath(config.features.approvalsRoot, `${featureId}.json`)),
	]);
	return {
		featureId,
		definition,
		brief: { en: briefEn, zh: briefZh, pairing: briefPairing },
		spec: { lifecycle: spec?.lifecycle ?? "proposed", en: specEnArtifact, zh: specZhArtifact },
		approval,
	};
}

function briefSkeleton(feature, language) {
	if (language === "zh") return `# ${feature.title}\n\n[English](${feature.id}.md) | 中文\n\n${PREPARED_MARKER}\n\n## 实现什么\n\n由助手根据已登记的功能边界填写。\n\n## 最终效果\n\n由助手填写可观察的用户结果。\n\n## 怎么使用\n\n由助手填写使用流程。\n\n## 注意事项\n\n由助手填写边界、风险和兼容性说明。\n`;
	return `# ${feature.title}\n\nEnglish | [中文](${feature.id}.zh.md)\n\n${PREPARED_MARKER}\n\n## What it does\n\nThe assistant fills this section from the registered Feature boundary.\n\n## Expected result\n\nThe assistant fills the observable user outcome.\n\n## How to use\n\nThe assistant fills the usage flow.\n\n## Usage notes\n\nThe assistant fills boundaries, risks, and compatibility notes.\n`;
}

function specSkeleton(feature, language) {
	if (language === "zh") return `# Spec：${feature.title}\n\n状态：拟议\n功能：${feature.id}\n\n${PREPARED_MARKER}\n\n## 原始需求\n\n由助手保留开发者的原始输入。\n\n## 问题\n\n由助手填写仓库事实、目标和边界。\n\n## 范围\n\n${feature.scope.map((entry) => `- 允许：\`${entry}\``).join("\n")}\n\n## 需求与场景\n\n- REQ-FEATURE-1：由助手替换为稳定需求。\n- Given 前置条件，When 发生动作，Then 出现可观察结果。\n\n## 假设与非目标\n\n- 假设：由助手填写。\n- 非目标：由助手填写。\n\n## 影响与设计\n\n由助手记录 Feature、Component、契约、数据、依赖和结构风险；只有结构风险存在时才展开技术设计。\n\n## 方案\n\n由助手填写。\n\n## 任务与追溯\n\n- TASK-FEATURE-1：实现 REQ-FEATURE-1，并由 AC-FEATURE-1 验收。\n- REQ-FEATURE-1 -> TASK-FEATURE-1 -> AC-FEATURE-1\n\n## 其他方案\n\n由助手填写。\n\n## 验收条件\n\n- AC-FEATURE-1：由助手替换为稳定、可观察的验收条件。\n\n## 验证\n\n- AC-FEATURE-1：[surface=repository; moment=terminal; evidence=contract-integration] 由助手替换为真实入口、动作、判断标准和证据。\n\n## 当前事实增量\n\n由助手填写完成后需要合并到 Feature brief 和系统地图的事实。\n\n## 风险\n\n由助手填写。\n`;
	return `# Spec: ${feature.title}\n\nStatus: proposed\nFeature: ${feature.id}\n\n${PREPARED_MARKER}\n\n## Original request\n\nThe assistant preserves the developer's original input.\n\n## Problem\n\nThe assistant records repository facts, goal, and boundaries.\n\n## Scope\n\n${feature.scope.map((entry) => `- allow: \`${entry}\``).join("\n")}\n\n## Requirements and scenarios\n\n- REQ-FEATURE-1: The assistant replaces this with a stable requirement.\n- Given a precondition, When an action occurs, Then an observable result follows.\n\n## Assumptions and non-goals\n\n- Assumption: The assistant fills this entry.\n- Non-goal: The assistant fills this entry.\n\n## Impact and design\n\nThe assistant records affected Features, Components, contracts, data, dependencies, and structural risk; detailed design expands only for structural risk.\n\n## Proposal\n\nThe assistant fills this section.\n\n## Tasks and traceability\n\n- TASK-FEATURE-1: Implement REQ-FEATURE-1 and verify it through AC-FEATURE-1.\n- REQ-FEATURE-1 -> TASK-FEATURE-1 -> AC-FEATURE-1\n\n## Alternatives considered\n\nThe assistant fills this section.\n\n## Acceptance criteria\n\n- AC-FEATURE-1: The assistant replaces this with a stable observable outcome.\n\n## Verification\n\n- AC-FEATURE-1: [surface=repository; moment=terminal; evidence=contract-integration] The assistant replaces this with the real entry point, action, oracle, and evidence.\n\n## Truth delta\n\nThe assistant records the facts to merge into the Feature brief and system map after completion.\n\n## Risks\n\nThe assistant fills this section.\n`;
}

async function createFilesRecoverably(root, files) {
	const staged = [];
	const committed = [];
	try {
		for (const entry of files) {
			const target = absolute(root, entry.file);
			await mkdir(dirname(target), { recursive: true });
			const temporary = `${target}.${randomUUID()}.tmp`;
			await writeFile(temporary, entry.content, { encoding: "utf8", flag: "wx" });
			staged.push({ ...entry, target, temporary });
		}
		for (const entry of staged) {
			await rename(entry.temporary, entry.target);
			committed.push(entry.target);
		}
	} catch (error) {
		await Promise.all(staged.map((entry) => unlink(entry.temporary).catch(() => {})));
		await Promise.all(committed.map((target) => unlink(target).catch(() => {})));
		throw error;
	}
}

export async function prepareFeatureArtifacts({ cwd, featureId, expectedFeatureHash }) {
	if (!FEATURE_ID_PATTERN.test(featureId)) throw new Error("featureId is invalid");
	if (!/^[a-f0-9]{64}$/.test(expectedFeatureHash)) throw new Error("expectedFeatureHash must be one SHA-256 value");
	const root = await resolveBlueprintRoot(cwd);
	const snapshot = await workingTreeSnapshot(root);
	const { config } = await loadConfig(snapshot);
	const [catalog, specsResult] = await Promise.all([loadFeatureCatalog(snapshot, config), loadSpecs(snapshot, config)]);
	const feature = catalog.features.find((entry) => entry.id === featureId);
	if (!feature) throw new Error(`feature '${featureId}' does not exist`);
	if (feature.hash !== expectedFeatureHash) throw new Error("the feature changed after the page loaded; refresh before preparing artifacts");
	const linked = specsResult.specs.filter((entry) => entry.featureId === featureId && entry.status === "proposed");
	if (linked.length > 1) throw new Error(`feature '${featureId}' has multiple proposed specifications`);
	const descriptor = await resolveFeatureArtifacts({ snapshot, config, feature, spec: linked[0] ?? null });
	const briefStates = [descriptor.brief.en.exists, descriptor.brief.zh.exists, descriptor.brief.pairing.exists];
	if (briefStates.some(Boolean) && !briefStates.every(Boolean)) throw new Error("the registered Product brief triplet is incomplete; repair it before planning");
	const specStates = [descriptor.spec.en.exists, descriptor.spec.zh.exists];
	if (specStates.some(Boolean) && !specStates.every(Boolean)) throw new Error("the registered proposed Spec pair is incomplete; repair it before planning");
	const files = [];
	if (!briefStates.some(Boolean)) {
		const en = briefSkeleton(feature, "en");
		const zh = briefSkeleton(feature, "zh");
		files.push(
			{ file: descriptor.brief.en.file, content: en },
			{ file: descriptor.brief.zh.file, content: zh },
			{ file: descriptor.brief.pairing.file, content: serializePairRecord(descriptor.brief.en.file, en, descriptor.brief.zh.file, zh) },
		);
	}
	if (!specStates.some(Boolean)) {
		files.push(
			{ file: descriptor.spec.en.file, content: specSkeleton(feature, "en") },
			{ file: descriptor.spec.zh.file, content: specSkeleton(feature, "zh") },
		);
	}
	if (files.length > 0) await createFilesRecoverably(root, files);
	return { root, featureId, created: files.map((entry) => entry.file) };
}

function replaceFeatureMetadata(content, oldId, newId, newParentId = undefined) {
	let output = content.replace(new RegExp(`^Id:\\s*${oldId}\\s*$`, "m"), `Id: ${newId}`);
	if (newParentId !== undefined) output = output.replace(/^Parent:\s*.*$/m, `Parent: ${newParentId ?? "none"}`);
	return output.replace(new RegExp(`^Parent:\\s*${oldId}\\s*$`, "gm"), `Parent: ${newId}`);
}

async function migrationFacts(root, featureId, parentId, localKey) {
	const snapshot = await workingTreeSnapshot(root);
	const { config } = await loadConfig(snapshot);
	const [catalog, specsResult] = await Promise.all([loadFeatureCatalog(snapshot, config), loadSpecs(snapshot, config)]);
	const feature = catalog.features.find((entry) => entry.id === featureId);
	if (!feature) throw new Error(`feature '${featureId}' does not exist`);
	if (parentId && !catalog.features.some((entry) => entry.id === parentId)) throw new Error(`parent feature '${parentId}' does not exist`);
	const targetId = deriveFeatureId(parentId, localKey);
	if (targetId === featureId) throw new Error("the target identity is unchanged");
	if (catalog.features.some((entry) => entry.id === targetId)) throw new Error(`feature '${targetId}' already exists`);
	if (parentId === featureId || parentId?.startsWith(`${featureId}--`)) throw new Error("the target parent cannot be inside the migrating feature subtree");
	const idMap = new Map([[featureId, targetId]]);
	for (const entry of catalog.features) {
		if (entry.id.startsWith(`${featureId}--`)) idMap.set(entry.id, `${targetId}${entry.id.slice(featureId.length)}`);
	}
	for (const [oldId, newId] of idMap) {
		if (newId.length > 64) throw new Error(`migrated feature id exceeds 64 characters: ${newId}`);
		if (catalog.features.some((entry) => entry.id === newId && !idMap.has(entry.id))) throw new Error(`feature '${newId}' already exists`);
	}
	const linkedSpecs = specsResult.specs.filter((entry) => idMap.has(entry.featureId));
	const oldBase = canonicalPath("docs/user/features", featureId);
	const newBase = canonicalPath("docs/user/features", targetId);
	const moves = [
		{ from: canonicalPath(config.features.root, `${featureId}.md`), to: canonicalPath(config.features.root, `${targetId}.md`), kind: "feature" },
		...[[".md", "brief-en"], [".zh.md", "brief-zh"], [".i18n.yaml", "brief-pairing"]].map(([suffix, kind]) => ({ from: `${oldBase}${suffix}`, to: `${newBase}${suffix}`, kind })),
	];
	for (const [oldId, newId] of idMap) {
		if (oldId === featureId) continue;
		const descendantOldBase = canonicalPath("docs/user/features", oldId);
		const descendantNewBase = canonicalPath("docs/user/features", newId);
		moves.push(
			{ from: canonicalPath(config.features.root, `${oldId}.md`), to: canonicalPath(config.features.root, `${newId}.md`), kind: "feature" },
			...[['.md', 'brief-en'], ['.zh.md', 'brief-zh'], ['.i18n.yaml', 'brief-pairing']].map(([suffix, kind]) => ({ from: `${descendantOldBase}${suffix}`, to: `${descendantNewBase}${suffix}`, kind })),
		);
	}
	for (const spec of linkedSpecs) {
		const mappedId = idMap.get(spec.featureId);
		const canonicalOld = canonicalPath(config.authority.specsRoot, spec.lifecycle, `${spec.featureId}.md`);
		if (spec.file === canonicalOld) {
			moves.push({ from: spec.file, to: canonicalPath(config.authority.specsRoot, spec.lifecycle, `${mappedId}.md`), kind: "spec-en" });
			moves.push({ from: spec.file.replace(/\.md$/, ".zh.md"), to: canonicalPath(config.authority.specsRoot, spec.lifecycle, `${mappedId}.zh.md`), kind: "spec-zh" });
		}
	}
	const existingMoves = moves.filter((entry) => snapshot.exists(entry.from));
	for (const entry of existingMoves) if (snapshot.exists(entry.to)) throw new Error(`migration target already exists: ${entry.to}`);
	const updates = [];
	for (const catalogFeature of catalog.features) {
		const content = await snapshot.readText(catalogFeature.file);
		if (content === null) continue;
		let next = content;
		for (const [oldId, newId] of idMap) {
			if (catalogFeature.id === oldId) {
				const mappedParent = oldId === featureId ? parentId || null : idMap.get(catalogFeature.parentId) ?? catalogFeature.parentId;
				next = replaceFeatureMetadata(next, oldId, newId, mappedParent);
			} else {
				next = replaceFeatureMetadata(next, oldId, newId);
			}
		}
		for (const move of existingMoves) next = next.split(move.from).join(move.to);
		if (next !== content) updates.push({ file: catalogFeature.file, content: next, previousHash: sha256(content), kind: "feature-reference" });
	}
	for (const spec of linkedSpecs) {
		const mappedId = idMap.get(spec.featureId);
		for (const file of [spec.file, spec.languages.zh?.file].filter(Boolean)) {
			const content = await snapshot.readText(file);
			if (content === null) continue;
			const next = content.replace(new RegExp(`^Feature:\\s*${spec.featureId}\\s*$`, "m"), `Feature: ${mappedId}`).replace(new RegExp(`^功能：\\s*${spec.featureId}\\s*$`, "m"), `功能：${mappedId}`);
			if (next !== content) updates.push({ file, content: next, previousHash: sha256(content), kind: "spec-reference" });
		}
	}
	for (const move of existingMoves.filter((entry) => entry.kind === "brief-en" || entry.kind === "brief-zh")) {
		const content = await snapshot.readText(move.from);
		if (content === null) continue;
		let next = content;
		for (const [oldId, newId] of idMap) next = next.split(`${oldId}.zh.md`).join(`${newId}.zh.md`).split(`${oldId}.md`).join(`${newId}.md`);
		if (next !== content) updates.push({ file: move.from, content: next, previousHash: sha256(content), kind: "brief-reference" });
	}
	const approvals = [...idMap.keys()].map((id) => canonicalPath(config.features.approvalsRoot, `${id}.json`)).filter((file) => snapshot.exists(file)).map((file) => ({ file, action: "invalidate" }));
	const preview = {
		featureId,
		targetId,
		parentId: parentId || null,
		localKey: normalizeLocalKey(localKey),
		identities: [...idMap].map(([from, to]) => ({ from, to })),
		moves: existingMoves,
		updates: updates.map(({ file, previousHash, kind }) => ({ file, previousHash, kind })),
		approval: approvals[0] ?? null,
		approvals,
	};
	return { snapshot, config, preview, updates, previewHash: sha256(JSON.stringify(preview)) };
}

export async function previewFeatureIdentityMigration({ cwd, featureId, parentId = null, localKey }) {
	const root = await resolveBlueprintRoot(cwd);
	const { preview, previewHash } = await migrationFacts(root, featureId, parentId, localKey);
	return { root, preview: { ...preview, previewHash } };
}

export async function applyFeatureIdentityMigration({ cwd, featureId, parentId = null, localKey, expectedPreviewHash }) {
	if (!/^[a-f0-9]{64}$/.test(expectedPreviewHash)) throw new Error("expectedPreviewHash must be one SHA-256 value");
	const root = await resolveBlueprintRoot(cwd);
	const facts = await migrationFacts(root, featureId, parentId, localKey);
	if (facts.previewHash !== expectedPreviewHash) throw new Error("the migration sources changed after preview; preview again");
	const moveByFrom = new Map(facts.preview.moves.map((entry) => [entry.from, entry.to]));
	const writes = new Map();
	for (const update of facts.updates) writes.set(moveByFrom.get(update.file) ?? update.file, update.content);
	for (const move of facts.preview.moves) {
		if (writes.has(move.to)) continue;
		const content = await readFile(absolute(root, move.from), "utf8");
		writes.set(move.to, content);
	}
	for (const briefPairingMove of facts.preview.moves.filter((entry) => entry.kind === "brief-pairing")) {
		const base = briefPairingMove.to.replace(/\.i18n\.yaml$/, "");
		const briefEnMove = facts.preview.moves.find((entry) => entry.kind === "brief-en" && entry.to === `${base}.md`);
		const briefZhMove = facts.preview.moves.find((entry) => entry.kind === "brief-zh" && entry.to === `${base}.zh.md`);
		if (briefEnMove && briefZhMove) writes.set(briefPairingMove.to, serializePairRecord(briefEnMove.to, writes.get(briefEnMove.to), briefZhMove.to, writes.get(briefZhMove.to)));
	}
	const originals = new Set([...facts.preview.moves.map((entry) => entry.from), ...facts.updates.map((entry) => entry.file)]);
	for (const approval of facts.preview.approvals) originals.add(approval.file);
	const backups = [];
	const staged = [];
	const committed = [];
	try {
		for (const [file, content] of writes) {
			const target = absolute(root, file);
			await mkdir(dirname(target), { recursive: true });
			const temporary = `${target}.${randomUUID()}.tmp`;
			await writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
			staged.push({ target, temporary });
		}
		for (const file of originals) {
			const source = absolute(root, file);
			const backup = `${source}.${randomUUID()}.bak`;
			await rename(source, backup);
			backups.push({ source, backup });
		}
		for (const entry of staged) {
			await rename(entry.temporary, entry.target);
			committed.push(entry.target);
		}
		await Promise.all(backups.map((entry) => unlink(entry.backup)));
	} catch (error) {
		await Promise.all(staged.map((entry) => unlink(entry.temporary).catch(() => {})));
		await Promise.all(committed.map((target) => unlink(target).catch(() => {})));
		for (const entry of backups.reverse()) await rename(entry.backup, entry.source).catch(() => {});
		throw error;
	}
	return { root, featureId, targetId: facts.preview.targetId, invalidatedApprovals: facts.preview.approvals.map((entry) => entry.file) };
}

function normalizeChangeAction(change) {
	if (change === null || typeof change !== "object" || Array.isArray(change)) throw new Error("change must be an object");
	const action = change.action;
	if (action !== "upsert" && action !== "delete") throw new Error("change.action must be 'upsert' or 'delete'");
	if (action === "delete") {
		if (typeof change.id !== "string" || !COMPONENT_ID_PATTERN.test(change.id)) throw new Error("change.id must be the canonical component id to delete");
		return { action: "delete", id: change.id };
	}
	if (typeof change.id !== "string" || !COMPONENT_ID_PATTERN.test(change.id)) throw new Error("change.id must use 1-64 lowercase letters, numbers, and hyphens");
	const serialized = serializeComponent(change);
	if (Buffer.byteLength(serialized, "utf8") > 128 * 1024) throw new Error("component content exceeds 128 KiB");
	return { action: "upsert", id: change.id, content: serialized };
}

async function collectArchitectureState(root, config) {
	const snapshot = await workingTreeSnapshot(root);
	const architectureResult = await loadArchitectureCatalog(snapshot, config);
	const componentIds = new Set(architectureResult.components.map((component) => component.id));
	const featuresResult = await loadFeatureCatalog(snapshot, config);
	const featureIds = new Set(featuresResult.features.map((feature) => feature.id));
	return {
		snapshot,
		config,
		components: architectureResult.components,
		componentIds,
		features: featuresResult.features,
		featureIds,
		files: architectureResult.components.map((component) => component.file),
	};
}

function validateArchitectureReferences(state, normalized) {
	if (normalized.action === "upsert") {
		const parsed = parseComponent(`${state.config.architecture.root}/components/${normalized.id}.md`, normalized.content);
		const issues = [];
		for (const issue of parsed.issues) {
			if (issue.severity === "required") issues.push(issue);
		}
		if (issues.length > 0) throw new Error(`the proposed component has ${issues.length} required issue(s); repair it before applying`);
		for (const dep of parsed.component.dependencies) {
			if (dep.target === normalized.id) continue;
			if (!state.componentIds.has(dep.target)) throw new Error(`the proposed component depends on unknown component '${dep.target}'`);
		}
		for (const featureId of parsed.component.supportedFeatures) {
			if (!state.featureIds.has(featureId)) throw new Error(`the proposed component claims unknown Feature '${featureId}'`);
		}
		return parsed.component;
	}
	return null;
}

function computeArchitectureDelta(state, parsedComponent, deletedId) {
	const added = [];
	const updated = [];
	const removed = [];
	const typedEdges = [];
	const contracts = [];
	const deploymentEffects = new Set();
	const identityEffects = [];
	const documentEffects = [];
	const approvalInvalidations = [];
	const governanceFeatureId = "spec-governance--architecture-design";
	const governanceApprovalFile = `${state.config.features.approvalsRoot}/${governanceFeatureId}.json`;
	const recordsGovernanceInvalidation = state.featureIds.has(governanceFeatureId) && state.snapshot.exists(governanceApprovalFile);
	if (parsedComponent) {
		const previous = state.components.find((component) => component.id === parsedComponent.id);
		if (!previous) added.push(parsedComponent.id);
		else updated.push(parsedComponent.id);
		for (const dep of parsedComponent.dependencies) typedEdges.push({ component: parsedComponent.id, ...dep });
		for (const dep of previous?.dependencies ?? []) {
			if (!parsedComponent.dependencies.some((entry) => entry.target === dep.target && entry.relation === dep.relation)) {
				typedEdges.push({ component: parsedComponent.id, relation: dep.relation, target: dep.target, removed: true });
			}
		}
		for (const contract of parsedComponent.contracts) {
			if (!(previous?.contracts ?? []).includes(contract)) contracts.push({ component: parsedComponent.id, contract, action: previous ? "added" : "added" });
		}
		for (const contract of previous?.contracts ?? []) {
			if (!parsedComponent.contracts.includes(contract)) contracts.push({ component: parsedComponent.id, contract, action: "removed" });
		}
		if (parsedComponent.deployment !== null) deploymentEffects.add(parsedComponent.deployment);
		if (previous?.deployment && previous.deployment !== parsedComponent.deployment) deploymentEffects.delete(previous.deployment);
		for (const document of parsedComponent.documents) {
			if (document.level === "required") documentEffects.push({ path: document.path, kind: "component-document", component: parsedComponent.id });
		}
		if (recordsGovernanceInvalidation) approvalInvalidations.push({ kind: "component-change", component: parsedComponent.id, file: governanceApprovalFile });
	}
	if (deletedId) {
		removed.push(deletedId);
		const previous = state.components.find((component) => component.id === deletedId);
		if (previous) {
			for (const dep of previous.dependencies) typedEdges.push({ component: previous.id, relation: dep.relation, target: dep.target, removed: true });
			if (previous.deployment) deploymentEffects.delete(previous.deployment);
			if (recordsGovernanceInvalidation) approvalInvalidations.push({ kind: "component-deleted", component: previous.id, file: governanceApprovalFile });
		}
	}
	return {
		added: [...new Set(added)],
		updated: [...new Set(updated)],
		removed: [...new Set(removed)],
		typedEdges,
		contracts,
		deploymentEffects: [...deploymentEffects],
		identityEffects,
		documentEffects,
		approvalInvalidations,
	};
}

export async function previewArchitectureChange({ cwd, change }) {
	const root = await resolveBlueprintRoot(cwd);
	const { config } = await loadConfig(await workingTreeSnapshot(root));
	const state = await collectArchitectureState(root, config);
	const normalized = normalizeChangeAction(change);
	const parsed = validateArchitectureReferences(state, normalized);
	const delta = computeArchitectureDelta(state, parsed, normalized.action === "delete" ? normalized.id : null);
	const preview = {
		change: normalized,
		delta,
	};
	const previewHash = sha256(JSON.stringify(preview));
	return { root, preview: { ...preview, previewHash } };
}

export async function applyArchitectureChange({ cwd, change, expectedPreviewHash }) {
	if (!/^[a-f0-9]{64}$/.test(expectedPreviewHash)) throw new Error("expectedPreviewHash must be one SHA-256 value");
	const root = await resolveBlueprintRoot(cwd);
	const { config } = await loadConfig(await workingTreeSnapshot(root));
	const state = await collectArchitectureState(root, config);
	const normalized = normalizeChangeAction(change);
	const parsed = validateArchitectureReferences(state, normalized);
	const preview = {
		change: normalized,
		delta: computeArchitectureDelta(state, parsed, normalized.action === "delete" ? normalized.id : null),
	};
	const previewHash = sha256(JSON.stringify(preview));
	if (previewHash !== expectedPreviewHash) throw new Error("the architecture sources changed after preview; preview again");
	const target = absolute(root, architecturePathFor(config, normalized.id, "file"));
	await mkdir(dirname(target), { recursive: true });
	if (normalized.action === "upsert") {
		const previous = state.components.find((component) => component.id === normalized.id);
		if (previous) {
			const backup = `${target}.${randomUUID()}.bak`;
			await rename(target, backup);
			try {
				await writeFile(target, normalized.content, { encoding: "utf8", flag: "w" });
				await unlink(backup);
			} catch (error) {
				await rename(backup, target).catch(() => {});
				throw error;
			}
		} else {
			const temporary = `${target}.${randomUUID()}.tmp`;
			await writeFile(temporary, normalized.content, { encoding: "utf8", flag: "wx" });
			await rename(temporary, target);
		}
	} else {
		try { await unlink(target); }
		catch (error) { if (error?.code !== "ENOENT") throw error; }
	}
	return { root, change: normalized, delta: preview.delta };
}

function starterComponentId(value) {
	const leaf = String(value ?? "").split("/").filter(Boolean).at(-1) ?? "";
	const normalized = leaf.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64).replace(/-+$/g, "");
	return COMPONENT_ID_PATTERN.test(normalized) ? normalized : "project-component";
}

function starterComponentKind(manifest) {
	if (manifest?.dsh && typeof manifest.dsh === "object") return "plugin";
	const dependencies = { ...(manifest?.dependencies ?? {}), ...(manifest?.devDependencies ?? {}) };
	if (["next", "react", "vue", "svelte", "@angular/core"].some((name) => typeof dependencies[name] === "string")) return "frontend";
	if (manifest?.main || manifest?.exports) return "library";
	return "internal";
}

function starterOwnedPaths(snapshot, manifest) {
	const published = Array.isArray(manifest?.files)
		? manifest.files.filter((entry) => typeof entry === "string" && entry.trim().length > 0).slice(0, 100)
		: [];
	if (published.length > 0) return published;
	const paths = new Set();
	for (const file of snapshot.files) {
		const [head, ...tail] = file.split("/");
		if (!head || head === ".git" || head === "node_modules") continue;
		paths.add(tail.length > 0 ? `${head}/**` : head);
		if (paths.size >= 100) break;
	}
	return [...paths];
}

async function deriveArchitectureStarter(cwd) {
	const root = await resolveBlueprintRoot(cwd);
	const { config } = await loadConfig(await workingTreeSnapshot(root));
	const state = await collectArchitectureState(root, config);
	if (state.components.length > 0) throw new Error("the architecture model is already initialized");
	let manifest = null;
	const manifestText = await state.snapshot.readText("package.json");
	if (manifestText !== null) {
		try { manifest = JSON.parse(manifestText); }
		catch { throw new Error("package.json must contain valid JSON before architecture initialization"); }
	}
	const projectName = (typeof manifest?.name === "string" && manifest.name.trim().length > 0 ? manifest.name.trim() : basename(root)).slice(0, 120);
	const id = starterComponentId(projectName);
	const ownedPaths = starterOwnedPaths(state.snapshot, manifest);
	if (ownedPaths.length === 0) throw new Error("the project has no files from which to derive an initial component boundary");
	const documents = [{ level: "required", path: state.snapshot.exists("DESIGN.md") ? "DESIGN.md" : "README.md" }];
	if (state.snapshot.exists("README.md") && documents[0].path !== "README.md") documents.push({ level: "recommended", path: "README.md" });
	return {
		action: "upsert",
		id,
		title: projectName,
		kind: starterComponentKind(manifest),
		containerId: null,
		deployment: null,
		status: "active",
		summary: typeof manifest?.description === "string" && manifest.description.trim().length > 0
			? manifest.description.trim().slice(0, 4_000)
			: `Repository-level component boundary for ${projectName}.`,
		ownedPaths,
		contracts: [],
		dependencies: [],
		supportedFeatures: [],
		documents,
	};
}

/** Preview the deterministic repository-level component used to start an empty architecture catalog. */
export async function previewArchitectureInitialization({ cwd }) {
	const proposal = await deriveArchitectureStarter(cwd);
	const result = await previewArchitectureChange({ cwd, change: proposal });
	return { ...result, proposal };
}

/** Re-derive and apply the exact starter preview, refusing non-empty or stale architecture state. */
export async function applyArchitectureInitialization({ cwd, expectedPreviewHash }) {
	const proposal = await deriveArchitectureStarter(cwd);
	return applyArchitectureChange({ cwd, change: proposal, expectedPreviewHash });
}
