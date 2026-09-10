import test from "node:test";
import assert from "node:assert/strict";
import { MODEL_GUIDANCE } from "../lib/index.js";

test("AC-STAGE-006: MiniMax guidance makes workflowContext current-turn authority", () => {
	assert.match(MODEL_GUIDANCE, /workflowContext/);
	assert.match(MODEL_GUIDANCE, /allowedActions/);
});
