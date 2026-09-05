import test from "node:test";
import assert from "node:assert/strict";
import { createBlueprintOrchestrator } from "../lib/orchestration.js";

function makeAgent() {
	const messages = [];
	return {
		id: "chat-1",
		session: { id: "chat-1", cwd: "D:/project" },
		messages,
		steer(message) { this.messages.push(message); },
	};
}

function makeStubWatcher() {
	const captures = [];
	const ticks = [];
	let disposed = false;
	return {
		captures,
		ticks,
		disposed: () => disposed,
		captureAgent(sessionId, capture) {
			captures.push({ sessionId, capture });
		},
		async tick(args) {
			ticks.push(args);
			return { skipped: "test-stub" };
		},
		dispose() {
			disposed = true;
		},
	};
}

function makeFeature() {
	return {
		id: "search",
		title: "Search",
		summary: "Search files",
		parentId: null,
		workflow: { stage: "ready", internalStage: "approved", spec: { hash: "a".repeat(64) }, verification: null },
	};
}

function makeDashboard() {
	return async (cwd) => ({ project: { root: cwd, name: "project" }, catalog: { features: [makeFeature()] } });
}

test("dispatchCommand forwards capture + tick to the watcher (AC-ORCH-001)", async () => {
	const current = makeAgent();
	const watcher = makeStubWatcher();
	const orchestrator = createBlueprintOrchestrator({}, {
		dashboard: makeDashboard(),
		watcher,
	});
	await orchestrator.dispatchCommand("blueprint", { agent: current, rawInput: "@feature:search x", signal: { aborted: false }, commandId: "cmd-1" });
	assert.equal(watcher.captures.length, 1);
	assert.equal(watcher.captures[0].sessionId, "chat-1");
	assert.equal(watcher.captures[0].capture.agent, current);
	assert.equal(watcher.captures[0].capture.commandId, "cmd-1");
	assert.equal(watcher.ticks.length, 1);
	assert.equal(watcher.ticks[0].sessionId, "chat-1");
	assert.equal(watcher.ticks[0].cwd, "D:/project");
});

test("dispatchCommand tolerates watcher=null (AC-ORCH-002)", async () => {
	const current = makeAgent();
	const orchestrator = createBlueprintOrchestrator({}, {
		dashboard: makeDashboard(),
		watcher: null,
	});
	const result = await orchestrator.dispatchCommand("blueprint", { agent: current, rawInput: "@feature:search x" });
	assert.equal(result.kind, "success");
	assert.equal(current.messages.length, 1);
});

test("dispatchCommand: tick is fire-and-forget (chat handler returns before tick resolves)", async () => {
	const current = makeAgent();
	let resolveTick;
	const watcher = {
		captureAgent() {},
		tick() {
			return new Promise((resolve) => { resolveTick = resolve; });
		},
	};
	const orchestrator = createBlueprintOrchestrator({}, {
		dashboard: makeDashboard(),
		watcher,
	});
	const handlerPromise = orchestrator.dispatchCommand("blueprint", { agent: current, rawInput: "x" });
	const settled = await Promise.race([handlerPromise, new Promise((r) => setTimeout(() => r("timeout"), 50))]);
	assert.notEqual(settled, "timeout", "dispatchCommand must not wait for tick");
	resolveTick({ skipped: "ok" });
	await handlerPromise;
});
