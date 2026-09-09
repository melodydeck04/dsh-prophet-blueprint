import test from "node:test";
import assert from "node:assert/strict";
import { createBlueprintOrchestrator } from "../lib/orchestration.js";
import { verifyFeature } from "../lib/skills/backing-modules.js";

test("route and status never start lifecycle operations or compact", async () => {
	let mutations = 0;
	const mutate = () => { mutations++; throw new Error("unexpected write"); };
	const messages = [];
	const agent = { id: "s", session: { cwd: "D:/project" }, steer: (message) => messages.push(message) };
	const orchestrator = createBlueprintOrchestrator({}, {
		dashboard: async () => ({ project: { name: "p" }, catalog: { features: [] } }),
		begin: mutate, requestVerification: mutate, startVerification: mutate,
		watcher: { captureAgent: mutate, tick: mutate },
	});
	for (const request of ["查看当前功能进度", "审一下这个 Spec", "先研究再设计", "/grill-spec", "what is a database?"]) {
		const result = await orchestrator.dispatchNatural({ request }, { agent });
		assert.equal(result.action, "route");
		assert.ok(result.guidance.includes(request));
		assert.equal(result.packet, undefined);
		await orchestrator.dispatchCommand("blueprint", { agent, rawInput: request });
	}
	assert.equal((await orchestrator.dispatchNatural({ action: "status" }, { agent })).action, "status");
	assert.equal(mutations, 0);
	assert.equal(messages.length, 5);
	await assert.rejects(orchestrator.dispatchNatural({ action: "invented" }, { agent }), /Unknown/);
});

test("verification without an executable runner fails before accessing repository or writing evidence", async () => {
	await assert.rejects(verifyFeature({ cwd: "nonexistent", featureId: "f" }), /requires runChecks/);
});
