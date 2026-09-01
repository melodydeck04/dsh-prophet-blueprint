import test from "node:test";
import assert from "node:assert/strict";
import { createBlueprintOrchestrator, DISPATCH_TOOL } from "../lib/orchestration.js";

const specHash = "a".repeat(64);
function agent() { return { id: "chat-1", session: { id: "chat-1", cwd: "D:/project" }, messages: [], steer(message) { this.messages.push(message); } }; }
function feature(stage = "ready", record = null) { return { id: "search", title: "Search", summary: "Search files", parentId: null, workflow: { stage, internalStage: stage === "ready" ? "approved" : stage, spec: { hash: specHash }, verification: record } }; }

test("one command steers the initiating Chat with the refinement packet", async () => {
	const current = agent();
	const orchestrator = createBlueprintOrchestrator({}, { dashboard: async () => ({ project: { root: "D:/project", name: "project" }, catalog: { features: [feature()] } }) });
	const result = await orchestrator.dispatchCommand("blueprint", { agent: current, rawInput: "@feature:search improve errors" });
	assert.equal(result.kind, "success");
	assert.equal(current.messages.length, 1);
	assert.match(current.messages[0].content[0].text, /继续留在当前 DSH Chat/);
	assert.match(current.messages[0].content[0].text, /REQ-\*/);
});

test("dispatch tool refines and begins an exact approved Spec", async () => {
	const current = agent();
	const begins = [];
	const orchestrator = createBlueprintOrchestrator({}, { dashboard: async () => ({ project: { root: "D:/project", name: "project" }, catalog: { features: [feature()] } }), begin: async (value) => { begins.push(value); return { record: { cycle: { id: "cycle-1" } } }; } });
	assert.equal(orchestrator.dispatchToolDefinition().name, DISPATCH_TOOL);
	const refined = await orchestrator.dispatchNatural({ action: "refine", featureId: "search", request: "improve search" }, { agent: current });
	assert.equal(refined.packet.owner.selected.id, "search");
	const started = await orchestrator.dispatchNatural({ action: "begin", featureId: "search", specHash }, { agent: current });
	assert.equal(started.stage, "implementing");
	assert.equal(begins[0].requestSessionId, "chat-1");
	await assert.rejects(orchestrator.dispatchNatural({ action: "begin", featureId: "search", specHash: "b".repeat(64) }, { agent: current }), /does not match/);
});


test("project binding command records a fallback for the initiating cwd", async () => {
	const current = agent();
	const bindings = [];
	const dashboardCalls = [];
	const orchestrator = createBlueprintOrchestrator({}, {
		dashboard: async (cwd, context) => { dashboardCalls.push({ cwd, context }); return { project: { root: "D:/bound", name: "bound" }, catalog: { features: [feature()] } }; },
		bind: async (value) => { bindings.push(value); return { sessionId: value.sessionId, root: "D:/bound", boundAt: "2026-08-31T00:00:00.000Z" }; },
	});
	const bound = await orchestrator.bindProject({ agent: current, rawInput: "D:/bound" });
	assert.equal(bound.kind, "success");
	assert.deepEqual(bindings[0], { cwd: "D:/project", target: "D:/bound" });
	await orchestrator.dispatchCommand("blueprint", { agent: current, rawInput: "@feature:search improve errors" });
	assert.deepEqual(dashboardCalls[0], { cwd: "D:/project", context: { sessionId: "chat-1", dshWorkspacePath: null, dshWorkspaceTitle: null } });
});

test("completion preserves exact-snapshot verification and durable finalization", async () => {
	const current = agent(); const calls = []; let stage = "implementing"; let record = { hash: "r".repeat(64) };
	const dashboard = async () => ({ project: { root: "D:/project", name: "project" }, catalog: { features: [feature(stage, record)] } });
	const orchestrator = createBlueprintOrchestrator({}, {
		dashboard,
		requestVerification: async () => { calls.push("request"); stage = "verification_ready"; record = { hash: "s".repeat(64) }; return { record }; },
		prepareVerification: async () => { calls.push("prepare"); return { workspacePath: "D:/snapshot", preparationCapability: "prepare-cap" }; },
		startVerification: async () => { calls.push("start"); stage = "verifying"; record = { hash: "t".repeat(64) }; return { attempt: { id: "attempt-1" }, resultCapability: "result-cap" }; },
		submitResult: async () => { calls.push("submit"); stage = "verified"; record = { hash: "u".repeat(64) }; return { verified: true }; },
		finalize: async () => { calls.push("finalize"); stage = "completed"; return { completed: true }; },
	});
	const result = await orchestrator.dispatchNatural({ action: "complete", featureId: "search", specHash, verification: { conclusion: "passed", acResults: [], checks: [], findings: [] } }, { agent: current });
	assert.deepEqual(calls, ["request", "prepare", "start", "submit", "finalize"]);
	assert.equal(result.completed, true);
	assert.equal(result.stage, "completed");
});

test("failed requirement-linked verification blocks completion", async () => {
	const current = agent(); let stage = "verification_ready"; let record = { hash: "r".repeat(64) };
	const orchestrator = createBlueprintOrchestrator({}, {
		dashboard: async () => ({ project: { root: "D:/project", name: "project" }, catalog: { features: [feature(stage, record)] } }),
		prepareVerification: async () => ({ workspacePath: "D:/snapshot", preparationCapability: "prepare-cap" }),
		startVerification: async () => { stage = "verifying"; record = { hash: "s".repeat(64) }; return { attempt: { id: "attempt-1" }, resultCapability: "result-cap" }; },
		submitResult: async () => ({ verified: false }),
	});
	const result = await orchestrator.dispatchNatural({ action: "complete", featureId: "search", specHash, verification: { conclusion: "failed" } }, { agent: current });
	assert.equal(result.completed, false);
	assert.equal(result.stage, "blocked");
});


