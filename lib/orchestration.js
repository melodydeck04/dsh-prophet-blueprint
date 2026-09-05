/**
 * DSH-native single-Chat Blueprint assistant.
 *
 * The visible DSH Agent refines, implements, and verifies ordinary work. This
 * Host layer provides repository grounding and durable lifecycle gates without
 * creating a mandatory family of background role Agents.
 *
 * @module @dsh-plugins/design-blueprint/orchestration
 */
import { randomUUID } from "node:crypto";
import { coordinatorMessage, parseNaturalDispatch, parseWorkCommand } from "./chat-commands.js";
import { getBlueprintDashboard } from "./web-api.js";
import { bindSessionBlueprintRoot } from "./project-binding.js";
import {
	abandonFeatureVerification,
	beginFeatureImplementation,
	completeVerifiedFeature,
	prepareFeatureVerification,
	requestFeatureVerification,
	startFeatureVerification,
	submitFeatureVerificationResult,
} from "./verification.js";

const DISPATCH_TOOL = "blueprint_dispatch";

function sessionId(agent) {
	return String(agent?.id ?? agent?.session?.id ?? "");
}

function cwdOf(agent) {
	return String(agent?.session?.cwd ?? process.cwd());
}

function workspaceOf(agent) {
	const workspace = agent?.session?.workspace ?? agent?.workspace ?? null;
	const path = agent?.session?.workspacePath ?? agent?.session?.dshWorkspacePath ?? agent?.workspacePath ?? workspace?.path;
	if (typeof path !== "string" || path.trim().length === 0) return { dshWorkspacePath: null, dshWorkspaceTitle: null };
	const title = agent?.session?.workspaceTitle ?? agent?.session?.dshWorkspaceTitle ?? agent?.workspaceTitle ?? workspace?.title ?? null;
	return { dshWorkspacePath: path, dshWorkspaceTitle: typeof title === "string" ? title : null };
}

function contextOf(agent) {
	return { sessionId: sessionId(agent), ...workspaceOf(agent) };
}
function userMessage(text, purpose = "refinement") {
	return Object.freeze({
		id: randomUUID(), role: "user", content: Object.freeze([{ type: "text", text }]),
		source: Object.freeze({ kind: "plugin", plugin: "design-blueprint", form: "notice", summary: `Blueprint ${purpose}` }),
	});
}

function output(render) {
	return { schema: { type: "object", additionalProperties: true }, render: (_args, value) => [{ type: "text", text: render(value) }] };
}

function commandText(execution) {
	const args = execution?.arguments ?? execution?.args ?? {};
	if (typeof args === "string") return args;
	return String(args?.cmd ?? args?.command ?? args?.script ?? JSON.stringify(args));
}

function mutatingTool(name) {
	return /(?:apply[_-]?patch|write|edit|replace|delete|remove|move|copy|rename|stage|commit|push|upload|install)/i.test(name);
}

/** Compatibility guard retained for projects that opt into a separate implementer. */
export function implementerGuardReason(execution, authority) {
	const name = String(execution?.name ?? execution?.tool?.name ?? "");
	const detail = commandText(execution);
	if (name === DISPATCH_TOOL) return `implementer cannot invoke '${name}'`;
	if (/\.blueprint[\\/]approvals|\.blueprint[\\/]verifications/i.test(detail)) return "implementer cannot modify approval or verification authority";
	if (authority?.sourceFile && detail.replaceAll("\\", "/").includes(authority.sourceFile)) return "implementer cannot change the approved proposed Spec";
	return undefined;
}

/** Compatibility guard retained for optional independent verification. */
export function verifierGuardReason(execution) {
	const name = String(execution?.name ?? execution?.tool?.name ?? "");
	if (mutatingTool(name)) return `verifier cannot use mutating tool '${name}'`;
	const detail = commandText(execution).trim();
	if (!/(?:shell|exec|command|terminal|bash|powershell|pwsh)/i.test(name)) return undefined;
	if (!detail || /[;&|><\r\n]/.test(detail)) return "verifier shell commands must be one read-only inspection or test command";
	const allowed = [
		/^(?:node(?:\.exe)?\s+(?:--check|--test)\b|npm(?:\.cmd)?\s+(?:test|run\s+(?:test|lint|check|verify))\b)/i,
		/^(?:node(?:\.exe)?\s+lib[\\/]cli\.js\s+(?:scan(?:\s+--all)?|docs\s+(?:check|list))(?:\s+--cwd\s+\S+|\s+--severity\s+\S+|\s+--json)*\s*$)/i,
		/^(?:git(?:\s+-c\s+\S+|\s+-C\s+\S+)*\s+(?:status|diff|show|log|ls-files|rev-parse|grep|cat-file))\b/i,
		/^(?:rg|findstr|Select-String|Get-Content|Get-ChildItem|Test-Path)\b/i,
	];
	return allowed.some((pattern) => pattern.test(detail)) ? undefined : "verifier shell command is outside the read-only/test allowlist";
}

function exactFeature(dashboard, featureId) {
	const feature = dashboard.catalog.features.find((entry) => entry.id === featureId);
	if (!feature) throw new Error(`Feature '${featureId}' does not exist`);
	return feature;
}

function workflowStage(feature) {
	return feature.workflow.internalStage ?? feature.workflow.stage;
}

function featureTree(features) {
	const children = new Map();
	for (const feature of features) {
		const key = feature.parentId ?? null;
		if (!children.has(key)) children.set(key, []);
		children.get(key).push(feature);
	}
	for (const rows of children.values()) rows.sort((a, b) => a.title.localeCompare(b.title));
	const lines = [];
	const visit = (feature, depth) => {
		lines.push(`${"  ".repeat(depth)}- ${feature.title} (@feature:${feature.id}) · ${feature.workflow.stage}`);
		for (const child of children.get(feature.id) ?? []) visit(child, depth + 1);
	};
	for (const root of children.get(null) ?? []) visit(root, 0);
	return lines.join("\n") || "No Blueprint Features are registered.";
}

/** Build the single-Agent assistant used by Host commands and the model tool. */
export function createBlueprintOrchestrator(_ctx, dependencies = {}) {
	const api = {
		dashboard: dependencies.dashboard ?? getBlueprintDashboard,
		bind: dependencies.bind ?? bindSessionBlueprintRoot,
		begin: dependencies.begin ?? beginFeatureImplementation,
		requestVerification: dependencies.requestVerification ?? requestFeatureVerification,
		prepareVerification: dependencies.prepareVerification ?? prepareFeatureVerification,
		startVerification: dependencies.startVerification ?? startFeatureVerification,
		submitResult: dependencies.submitResult ?? submitFeatureVerificationResult,
		finalize: dependencies.finalize ?? completeVerifiedFeature,
		abandonAttempt: dependencies.abandonAttempt ?? abandonFeatureVerification,
	};
	const watcher = dependencies.watcher ?? null;

	async function dashboardFor(agent) {
		return api.dashboard(cwdOf(agent), contextOf(agent));
	}

	async function autoCompactAfter(invocation) {
		if (watcher === null) return { skipped: "no-watcher" };
		const sid = sessionId(invocation.agent);
		if (sid.length === 0) return { skipped: "no-session-id" };
		watcher.captureAgent(sid, { agent: invocation.agent, signal: invocation.signal, commandId: invocation.commandId });
		return await watcher.tick({ cwd: cwdOf(invocation.agent), sessionId: sid, nowMs: Date.now() });
	}

	function scheduleAutoCompactAfter(invocation) {
		const promise = autoCompactAfter(invocation);
		if (promise && typeof promise.then === "function") {
			promise.then(
				(result) => { /* resolved — diagnostics captured inside watcher */ if (result && result.invoked === true) { /* fired */ } },
				(error) => { if (typeof _ctx?.logger?.warn === "function") _ctx.logger.warn(`auto-compact: tick failed (${error instanceof Error ? error.message : String(error)}).`); },
			);
		}
		return promise;
	}

	async function dispatchCommand(commandName, invocation) {
		const dashboard = await dashboardFor(invocation.agent);
		const packet = parseWorkCommand({ commandName, rawInput: invocation.rawInput, features: dashboard.catalog.features, sessionId: sessionId(invocation.agent) });
		invocation.agent.steer(userMessage(coordinatorMessage(packet)));
		scheduleAutoCompactAfter(invocation);
		return { kind: "success", text: packet.owner.selected ? `已关联 ${packet.owner.selected.id}，继续在当前 Chat 完善 Spec。` : "已开始完善 Spec；Blueprint 会先确认 owning Feature 边界。" };
	}

	async function begin(args, agent) {
		if (typeof args.featureId !== "string" || typeof args.specHash !== "string") throw new Error("begin requires featureId and exact specHash");
		const dashboard = await dashboardFor(agent);
		const feature = exactFeature(dashboard, args.featureId);
		if (feature.workflow.spec?.hash !== args.specHash) throw new Error("specHash does not match the current bilingual proposed Spec");
		const started = await api.begin({ cwd: dashboard.project.root, featureId: feature.id, expectedSpecHash: args.specHash, intent: "natural", requestSessionId: sessionId(agent) });
		return { action: "begin", featureId: feature.id, stage: "implementing", cycleId: started.record?.cycle?.id ?? null, guidance: "审批已绑定；请在当前 DSH Chat 中按 Spec Scope 实现，并在完成相关检查后调用 blueprint_dispatch action=complete。" };
	}

	async function complete(args, agent) {
		if (typeof args.featureId !== "string" || typeof args.specHash !== "string" || !args.verification) throw new Error("complete requires featureId, exact specHash, and verification evidence");
		let dashboard = await dashboardFor(agent);
		let feature = exactFeature(dashboard, args.featureId);
		if (feature.workflow.spec?.hash !== args.specHash) throw new Error("specHash does not match the approved Spec");
		let stage = workflowStage(feature);
		if (stage === "approved") {
			await api.begin({ cwd: dashboard.project.root, featureId: feature.id, expectedSpecHash: args.specHash, intent: "natural", requestSessionId: sessionId(agent) });
			dashboard = await api.dashboard(dashboard.project.root); feature = exactFeature(dashboard, args.featureId); stage = workflowStage(feature);
		}
		if (["implementing", "needs_changes"].includes(stage)) {
			await api.requestVerification({ cwd: dashboard.project.root, featureId: feature.id, expectedSpecHash: args.specHash });
			dashboard = await api.dashboard(dashboard.project.root); feature = exactFeature(dashboard, args.featureId); stage = workflowStage(feature);
		}
		// Recovery: a previous call may have started an attempt (stage: verifying) but failed before
		// submit. Abandon it so the pipeline can restart from a clean verification_ready state. The
		// abandon step requires the in-progress attempt to belong to this same session.
		if (stage === "verifying") {
			const inProgress = (feature.workflow.verification?.attempts ?? []).find((entry) => entry.completedAt === null);
			if (inProgress === undefined) {
				throw new Error(`delivery cannot complete from internal stage '${stage}' with no in-progress attempt`);
			}
			if (inProgress.sessionId !== sessionId(agent)) {
				throw new Error(`in-progress attempt belongs to session '${inProgress.sessionId}'; this caller's session is '${sessionId(agent)}'`);
			}
			await api.abandonAttempt({
				cwd: dashboard.project.root,
				featureId: feature.id,
				expectedRecordHash: feature.workflow.verification.hash,
				attemptId: inProgress.id,
				sessionId: sessionId(agent),
			});
			dashboard = await api.dashboard(dashboard.project.root); feature = exactFeature(dashboard, args.featureId); stage = workflowStage(feature);
		}
		if (stage === "needs_changes") {
			await api.requestVerification({ cwd: dashboard.project.root, featureId: feature.id, expectedSpecHash: args.specHash });
			dashboard = await api.dashboard(dashboard.project.root); feature = exactFeature(dashboard, args.featureId); stage = workflowStage(feature);
		}
		if (stage !== "verification_ready") throw new Error(`delivery cannot complete from internal stage '${stage}'`);
		const record = feature.workflow.verification;
		const prepared = await api.prepareVerification({ cwd: dashboard.project.root, featureId: feature.id, expectedRecordHash: record.hash });
		const started = await api.startVerification({ cwd: dashboard.project.root, featureId: feature.id, expectedRecordHash: record.hash, sessionId: sessionId(agent), workspacePath: prepared.workspacePath, preparationCapability: prepared.preparationCapability });
		dashboard = await api.dashboard(dashboard.project.root); feature = exactFeature(dashboard, args.featureId);
		const running = feature.workflow.verification;
		// Pass the resultCapability returned by start. submitResult will accept this OR fall back to
		// the persisted one in the attempt record if the caller lost the in-memory copy.
		const accepted = await api.submitResult({ cwd: dashboard.project.root, featureId: feature.id, expectedRecordHash: running.hash, attemptId: started.attempt.id, resultCapability: started.resultCapability, result: args.verification });
		if (!accepted.verified) return { action: "complete", featureId: feature.id, stage: "blocked", completed: false, guidance: "验证未通过；请根据结构化 finding 修复后重新提交。" };
		dashboard = await api.dashboard(dashboard.project.root); feature = exactFeature(dashboard, args.featureId);
		const completed = await api.finalize({ cwd: dashboard.project.root, featureId: feature.id, expectedRecordHash: feature.workflow.verification.hash });
		return { action: "complete", featureId: feature.id, stage: completed.completed ? "completed" : "blocked", completed: completed.completed, guidance: completed.completed ? "验证、当前事实和不可变变更历史已完成。" : "Host 完成门禁失败；请查看最新 finding。" };
	}

	async function dispatchNatural(args, execution) {
		const agent = execution?.agent;
		if (!agent) throw new Error("blueprint_dispatch requires one initiating DSH Agent");
		const action = args.action ?? "refine";
		if (action === "begin") return begin(args, agent);
		if (action === "complete") return complete(args, agent);
		const dashboard = await dashboardFor(agent);
		const packet = parseNaturalDispatch({ featureId: args.featureId ?? null, text: args.request, sessionId: sessionId(agent), features: dashboard.catalog.features });
		return { action: "refine", packet, guidance: coordinatorMessage(packet) };
	}

	async function bindProject(invocation) {
		const target = String(invocation.rawInput ?? "").trim();
		if (target.length === 0) return { kind: "error", text: "用法：/blueprint-use <Blueprint 项目路径>" };
		const binding = await api.bind({ cwd: cwdOf(invocation.agent), target });
		return { kind: "success", text: `已设置 Blueprint 手动兜底项目：${binding.root}。正常情况下 Blueprint 会优先跟随当前 DSH workspace。` };
	}

	async function status(invocation) {
		const dashboard = await dashboardFor(invocation.agent);
		const rows = dashboard.catalog.features.map((feature) => `- ${feature.id}: ${feature.workflow.stage}`).join("\n");
		return { kind: "success", text: `Blueprint · ${dashboard.project.name}\n${rows || "No Features"}` };
	}

	async function map(invocation) {
		const dashboard = await dashboardFor(invocation.agent);
		return { kind: "success", text: `Blueprint system map · ${dashboard.project.name}\n${featureTree(dashboard.catalog.features)}` };
	}

	function dispatchToolDefinition() {
		return {
			name: DISPATCH_TOOL,
			description: "Refine one development requirement against Blueprint current truth, begin an approved delivery, or complete it with requirement-linked evidence in the same DSH Chat.",
			parameters: {
				type: "object",
				properties: {
					action: { type: "string", enum: ["refine", "begin", "complete"] },
					request: { type: "string" }, featureId: { type: "string" }, specHash: { type: "string" },
					verification: { type: "object", additionalProperties: true },
				},
				additionalProperties: false,
			},
			output: output((value) => value.guidance), execute: dispatchNatural,
		};
	}

	return { dispatchCommand, dispatchNatural, bindProject, status, map, dispatchToolDefinition, dispose: async () => {} };
}

export const createBlueprintAssistant = createBlueprintOrchestrator;
export { DISPATCH_TOOL };


