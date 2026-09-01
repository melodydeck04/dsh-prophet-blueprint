/**
 * One-input DSH Chat routing and repository-grounded Spec refinement.
 * @module @dsh-plugins/design-blueprint/chat-commands
 */
import { randomUUID } from "node:crypto";
import { FEATURE_ID_PATTERN } from "./features.js";

export const WORK_COMMANDS = Object.freeze({ blueprint: "refine" });
export const DIRECT_COMMANDS = Object.freeze(["blueprint-use", "blueprint-status", "blueprint-map"]);
export const FEATURE_REFERENCE_SOURCE = "blueprint-feature";
export const PUBLIC_WORKFLOW_STAGES = Object.freeze(["refining", "ready", "implementing", "verifying", "blocked", "completed"]);

const FEATURE_REFERENCE_PATTERN = /(?:^|\s)@feature:([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)(?=$|\s|[.,;:!?，。；：！？])/g;
const STRUCTURAL_PATTERN = /\b(?:architecture|component|contract|api|database|schema|migration|deployment|permission|concurrency|queue|cache|public interface|breaking change)\b|架构|组件|契约|接口|数据库|数据结构|迁移|部署|权限|并发|队列|缓存|兼容性破坏/i;

export const REFINEMENT_DIMENSIONS = Object.freeze([
	"actor-and-goal", "entry-point", "happy-path", "inputs-and-outputs", "state-transitions",
	"business-rules", "failures-and-edge-cases", "permissions-and-persistence",
	"compatibility-and-quality", "non-goals", "observable-acceptance",
]);

function exactFeature(features, id) {
	return features.find((feature) => feature.id === id) ?? null;
}

export function extractFeatureReferences(text) {
	const ids = [];
	for (const match of String(text ?? "").matchAll(FEATURE_REFERENCE_PATTERN)) ids.push(match[1]);
	return [...new Set(ids)];
}

export function stripFeatureReferences(text) {
	return String(text ?? "").replace(FEATURE_REFERENCE_PATTERN, (whole) => whole.startsWith(" ") ? " " : "").trim();
}

function tokens(value) {
	return String(value ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((entry) => entry.length > 1);
}

function featureScore(feature, request) {
	const haystack = `${feature.id} ${feature.title ?? ""} ${feature.summary ?? ""}`.toLowerCase();
	let score = 0;
	for (const token of tokens(request)) if (haystack.includes(token)) score += token.length > 4 ? 2 : 1;
	if (request.toLowerCase().includes(feature.id)) score += 5;
	return score;
}

/** Select an owning Feature only when repository evidence is unambiguous. */
export function resolveRequirementOwner({ text, featureId = null, features }) {
	const references = extractFeatureReferences(text);
	if (references.length > 1) throw new Error("一次需求只能有一个 owning Feature；跨 Feature 影响会作为依赖单独记录");
	const explicit = featureId ?? references[0] ?? null;
	if (explicit !== null) {
		if (!FEATURE_ID_PATTERN.test(explicit)) throw new Error("featureId 必须是稳定的小写 ASCII id");
		const feature = exactFeature(features, explicit);
		if (!feature) throw new Error(`Feature '${explicit}' 不存在；请让 Blueprint 提出新 Feature，而不是模糊匹配写入目标`);
		return { status: "selected", feature, candidates: [], reason: "explicit-reference" };
	}
	if (features.length === 1) return { status: "selected", feature: features[0], candidates: [], reason: "single-feature" };
	const ranked = features.map((feature) => ({ feature, score: featureScore(feature, text) })).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score || a.feature.id.localeCompare(b.feature.id));
	if (ranked.length > 0 && (ranked.length === 1 || ranked[0].score > ranked[1].score)) {
		return { status: "selected", feature: ranked[0].feature, candidates: ranked.slice(1, 4).map((entry) => entry.feature), reason: "repository-match" };
	}
	return { status: "unresolved", feature: null, candidates: (ranked.length ? ranked : features.map((feature) => ({ feature, score: 0 }))).slice(0, 3).map((entry) => entry.feature), reason: ranked.length ? "ambiguous-match" : "new-or-unknown-boundary" };
}

function ownerProjection(resolution) {
	const project = (feature) => ({
		id: feature.id, title: feature.title, summary: feature.summary, parentId: feature.parentId ?? null,
		status: feature.status, currentStage: feature.workflow?.stage ?? "refining", codeScope: feature.scope ?? [],
		documents: feature.documents ?? [], currentBrief: feature.artifacts?.brief ?? null, activeSpec: feature.workflow?.spec ?? null,
	});
	return { status: resolution.status, reason: resolution.reason, selected: resolution.feature ? project(resolution.feature) : null, candidates: resolution.candidates.map(project) };
}

/** Build the typed packet shared by /blueprint and blueprint_dispatch. */
export function createRefinementPacket({ text, featureId = null, features, sessionId, source, requestId = randomUUID(), createdAt = new Date().toISOString() }) {
	const body = stripFeatureReferences(text);
	if (body.length === 0 || body.length > 16_000) throw new Error("Blueprint 需求必须包含 1-16000 个字符");
	if (typeof sessionId !== "string" || sessionId.length === 0) throw new Error("Blueprint 请求缺少 DSH Session id");
	if (!["command", "tool"].includes(source)) throw new Error("Blueprint 请求来源必须是 command 或 tool");
	const owner = resolveRequirementOwner({ text, featureId, features });
	return Object.freeze({
		version: 2, requestId, createdAt, requestSessionId: sessionId, source, originalRequest: body,
		owner: ownerProjection(owner),
		refinement: {
			requirementIdFormat: "REQ-*", scenarioFormat: "Given/When/Then", dimensions: REFINEMENT_DIMENSIONS,
			questionLimitPerRound: 3,
			ambiguityRule: "Ask only when plausible answers materially change behavior, data, compatibility, risk, or scope; record everything else as an assumption.",
			requiredPreview: ["goal", "owning-feature", "requirements", "scenarios", "assumptions", "non-goals", "affected-contracts-or-paths", "acceptance", "unresolved-decisions"],
			persistIn: "feature-linked-proposed-spec",
			persistedEvidence: ["original-request", "clarification-answers", "requirements", "scenarios", "assumptions", "tasks", "traceability", "checklist-results", "unresolved-decisions"],
		},
		qualityGates: {
			requirementsChecklist: ["complete", "unambiguous", "bounded", "failure-aware", "testable", "non-contradictory"],
			crossArtifactAnalysis: ["requirements-to-scenarios", "requirements-to-tasks", "requirements-to-verification", "tasks-to-scope", "design-to-scope", "scope-to-paths"],
			approvalPrerequisites: ["zero-blocking-decisions", "all-checklist-items-pass", "every-task-maps-to-requirement-scope-and-verification"],
			failClosed: true,
		},
		planning: {
			designRequired: STRUCTURAL_PATTERN.test(body),
			designTriggers: ["module ownership", "public contract", "persistence", "deployment", "permissions", "migration", "concurrency"],
			defaultExecution: "current-dsh-agent", independentVerification: "optional-for-high-risk",
		},
	});
}

export function parseWorkCommand({ commandName, rawInput, features, sessionId, requestId, createdAt }) {
	if (commandName !== "blueprint") throw new Error(`Unknown Blueprint work command '${commandName}'`);
	return createRefinementPacket({ text: rawInput, features, sessionId, source: "command", requestId, createdAt });
}

export function parseNaturalDispatch({ featureId = null, text, sessionId, features, requestId, createdAt }) {
	return createRefinementPacket({ text, featureId, features, sessionId, source: "tool", requestId, createdAt });
}

export function coordinatorMessage(packet) {
	return [
		"Blueprint 已把这条需求转换为仓库事实约束下的 Spec 完善任务。继续留在当前 DSH Chat；不要创建或要求用户选择内部角色。",
		packet.owner.selected ? `Owning Feature: ${packet.owner.selected.id}` : "Owning Feature 尚不唯一：先根据仓库证据提出归属；只有边界会改变产品含义时才提问。",
		"先拆出稳定 REQ-*、具体场景、失败与边界、假设、非目标和可观察验收；一轮最多询问三个实质问题。通过需求清单与跨工件一致性检查后，再按项目审批策略实现。",
		"小型有界变更直接使用当前 DSH Agent；只有结构风险才写技术设计，高风险时才增加独立验收。完成时更新 Feature 当前事实与不可变变更历史。",
		"Persist the original request, clarification answers, assumptions, REQ-* requirements, Given/When/Then scenarios, ordered tasks, traceability, checklist results, and unresolved decisions in the one Feature-linked proposed Spec. Every task must map to REQ-*, declared Scope paths, and AC verification; do not create a parallel state file.",
		"Do not request exact-hash approval or call blueprint_dispatch action=begin until blocking decisions are zero, every checklist item passes, and every cross-artifact mapping is complete. Otherwise keep refining the Spec and show the unresolved items.",
		"", `Blueprint refinement packet: ${JSON.stringify(packet)}`,
	].join("\n");
}

export function featureReference(feature) {
	if (!feature || !FEATURE_ID_PATTERN.test(feature.id ?? "")) throw new Error("Feature reference requires a valid id");
	return { name: feature.title || feature.id, description: `${feature.id} · ${feature.summary || "No summary"}`, value: feature.id };
}

