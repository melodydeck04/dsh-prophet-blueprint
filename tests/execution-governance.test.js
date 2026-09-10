import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { classifyExecutionFailure, createDelegationBudget, repeatedFailureState, writeExecutionCheckpoint } from "../lib/execution-governance.js";

test("AC-BUDGET-001 and AC-BUDGET-002: direct fresh child budget is bounded", () => {
	const budget = createDelegationBudget();
	assert.equal(budget.authorize({ deliverable: "one report" }).mode, "spawn");
	budget.authorize({ deliverable: "two report" }); budget.authorize({ deliverable: "three report" });
	assert.throws(() => budget.authorize({ deliverable: "four report" }), /exhausted/);
	assert.throws(() => createDelegationBudget().authorize({ parentKind: "child", deliverable: "nested" }), /child-originated/);
	assert.throws(() => createDelegationBudget().authorize({ mode: "fork", deliverable: "history" }), /requiresParentHistory/);
});

test("AC-BUDGET-003 and AC-BUDGET-004: classified repeated failures block without blanket retry", () => {
	const first = repeatedFailureState([], new Error("HTTP 529 server unavailable"));
	const second = repeatedFailureState([first], new Error("HTTP 529 server unavailable"));
	assert.equal(first.category, "SERVER_529"); assert.equal(second.blocked, true);
	assert.equal(classifyExecutionFailure(new Error("429 rate limit")).category, "RATE_LIMIT");
	assert.equal(classifyExecutionFailure(new Error("missing capability subagents")).category, "MISSING_CAPABILITY");
	assert.equal(classifyExecutionFailure(new Error("Spec hash mismatch")).category, "SPEC_AUTHORITY_MISMATCH");
});

test("AC-BUDGET-005: lifecycle checkpoint is durable and compact", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "blueprint-checkpoint-"));
	const result = await writeExecutionCheckpoint({ cwd, featureId: "search", completed: ["implemented"], remaining: ["verify"], changedFiles: ["lib/search.js"], checks: [{ name: "test", passed: true }], nextAction: "complete" });
	const saved = JSON.parse(await readFile(join(cwd, result.file), "utf8"));
	assert.equal(saved.featureId, "search"); assert.deepEqual(saved.remaining, ["verify"]); assert.equal(saved.nextAction, "complete");
});
