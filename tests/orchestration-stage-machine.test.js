import test from "node:test";
import assert from "node:assert/strict";
import { createBlueprintOrchestrator } from "../lib/orchestration.js";

const hash = "a".repeat(64);
const agent = { id: "s", session: { id: "s", cwd: "D:/fixture" } };
function dashboard(context) { return { project: { root: "D:/fixture", name: "fixture" }, catalog: { features: [{ id: "search", workflow: { stage: context.currentStage, internalStage: "approved", spec: { hash }, context } }] } }; }

test("AC-STAGE-003: dispatch rejects a begin outside the Host allowlist", async () => {
	const context = { currentStage: "implementing", allowedActions: ["complete"], nextRequiredAction: "complete" };
	const orchestrator = createBlueprintOrchestrator({}, { dashboard: async () => dashboard(context) });
	await assert.rejects(orchestrator.dispatchNatural({ action: "begin", featureId: "search", specHash: hash }, { agent }), /not allowed.*next required action: complete/);
});

test("AC-STAGE-004: begin returns the refreshed Host work package", async () => {
	const approved = { currentStage: "ready", allowedActions: ["begin"], nextRequiredAction: "begin" };
	const implementing = { currentStage: "implementing", allowedActions: ["complete"], nextRequiredAction: "complete", workPackage: { featureId: "search" } };
	let calls = 0;
	const orchestrator = createBlueprintOrchestrator({}, { dashboard: async () => dashboard(calls++ === 0 ? approved : implementing), begin: async () => ({ record: { cycle: { id: "c" } } }) });
	const result = await orchestrator.dispatchNatural({ action: "begin", featureId: "search", specHash: hash }, { agent });
	assert.equal(result.workflowContext.currentStage, "implementing");
});
