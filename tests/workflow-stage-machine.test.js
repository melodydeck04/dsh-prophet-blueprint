import test from "node:test";
import assert from "node:assert/strict";
import { workflowContext } from "../lib/workflow.js";

const spec = { featureId: "search", reviewHash: "a".repeat(64), changePackage: { scope: { allowedPaths: ["lib/search.js"] }, execution: { tasks: ["implement search"] } } };

test("AC-STAGE-001: workflow context is compact and finite", () => {
	const context = workflowContext({ stage: "approved", spec });
	assert.deepEqual(context.allowedActions, ["begin"]);
	assert.equal(context.currentStage, "ready");
	assert.equal(context.nextRequiredAction, "begin");
	assert.deepEqual(context.workPackage.scope, ["lib/search.js"]);
	assert.deepEqual(context.workPackage.tasks, ["implement search"]);
});

test("AC-STAGE-002: each durable stage has only its permitted transition action", () => {
	assert.deepEqual(workflowContext({ stage: "review", spec }).allowedActions, ["refine"]);
	assert.deepEqual(workflowContext({ stage: "implementing", spec }).allowedActions, ["complete"]);
	assert.deepEqual(workflowContext({ stage: "verifying", spec }).allowedActions, []);
	assert.equal(workflowContext({ stage: "completed", spec }).nextRequiredAction, null);
});
