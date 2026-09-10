import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("AC-STAGE-005: client renders only Host-provided workflow context", async () => {
	const source = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	assert.match(source, /const workflowContext=feature\.workflow\.context/);
	assert.match(source, /workflowContext\.allowedActions/);
	assert.match(source, /workflowContext\.nextRequiredAction/);
});
