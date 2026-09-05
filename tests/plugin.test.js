import test from "node:test";
import assert from "node:assert/strict";
import {
	apply,
	COMPONENT_ID_PATTERN,
	COMPONENT_KINDS,
	COMPONENT_RELATION_TYPES,
	COMPONENT_STATUSES,
	hashComponentContent,
	implementerGuardReason,
	inject,
	loadArchitectureCatalog,
	MODEL_GUIDANCE,
	name,
	parseComponent,
	serializeComponent,
	verifierGuardReason,
} from "../lib/index.js";

test("DSH plugin registers native main-Chat commands, one dispatch tool, and dashboard route", () => {
	let section;
	let route;
	let tool;
	const commands = new Map();
	const ctx = {
		effect(generatorFactory) { for (const disposer of generatorFactory()) assert.equal(typeof disposer, "function"); },
		systemPrompt: { section(value) { section = value; return () => {}; } },
		commands: { register(value) { commands.set(value.name, value); return () => {}; } },
		webServer: { register(value) { route = value; return () => {}; } },
		tools: { register(value) { tool = value; return () => {}; } },
		agents: {},
	};
	apply(ctx);
	assert.equal(name, "design-blueprint");
	assert.deepEqual(inject, ["commands", "systemPrompt", "webServer", "tools", "skills", "compaction"]);
	assert.equal(section.name, "design-blueprint:spec-driven-development");
	assert.equal(section.text, MODEL_GUIDANCE);
	assert.equal(tool.name, "blueprint_dispatch");
	assert.deepEqual([...commands.keys()], ["blueprint", "blueprint-use", "blueprint-status", "blueprint-map"]);
	assert.ok(commands.get("blueprint").input?.hint);
	assert.ok(commands.get("blueprint-use").input?.hint);
	assert.equal(commands.get("blueprint-use").recordInput, false);
	assert.equal(commands.get("blueprint").recordInput, false);
	assert.equal(route.kind, "exact");
	assert.equal(route.path, "/design-blueprint/api");
});

test("role guards bind authority without prompt markers or Session title lookup", () => {
	assert.match(implementerGuardReason({ name: "apply_patch", arguments: { path: ".blueprint/approvals/x.json" } }, { sourceFile: ".specs/proposed/x.md" }), /approval or verification/);
	assert.match(implementerGuardReason({ name: "exec_command", arguments: { cmd: "edit .specs/proposed/x.md" } }, { sourceFile: ".specs/proposed/x.md" }), /approved proposed Spec/);
	assert.match(verifierGuardReason({ name: "apply_patch", arguments: {} }), /mutating tool/);
	assert.match(verifierGuardReason({ name: "exec_command", arguments: { cmd: "git add lib/index.js" } }), /allowlist/);
	assert.equal(verifierGuardReason({ name: "exec_command", arguments: { cmd: "node --test" } }), undefined);
	assert.equal(verifierGuardReason({ name: "exec_command", arguments: { cmd: "node lib/cli.js scan --all --cwd ." } }), undefined);
	assert.equal(verifierGuardReason({ name: "exec_command", arguments: { cmd: "node lib/cli.js docs check --cwd ." } }), undefined);
	assert.match(verifierGuardReason({ name: "exec_command", arguments: { cmd: "node lib/cli.js verification request feature-id" } }), /allowlist/);
	assert.match(verifierGuardReason({ name: "exec_command", arguments: { cmd: "node lib/cli.js install-hook --global" } }), /allowlist/);
});

test("DSH plugin still exports canonical architecture contracts", () => {
	assert.equal(typeof parseComponent, "function");
	assert.equal(typeof serializeComponent, "function");
	assert.equal(typeof loadArchitectureCatalog, "function");
	assert.equal(typeof hashComponentContent, "function");
	assert.match(COMPONENT_ID_PATTERN.source, /a-z0-9/);
	assert.ok(COMPONENT_KINDS.has("service"));
	assert.ok(COMPONENT_STATUSES.has("active"));
	assert.ok(COMPONENT_RELATION_TYPES.has("depends_on"));
});

test("plugin entry declares compaction in inject (AC-INDEX-001)", () => {
	assert.ok(inject.includes("compaction"), `inject must include 'compaction', got ${JSON.stringify(inject)}`);
});

test("plugin entry registers auto-compact watcher inside the effect block when ctx.compaction.compactNow is exposed (AC-INDEX-002)", async () => {
	const { createAutoCompactWatcher } = await import("../lib/auto-compact-watcher.js");
	const { mkdtemp, rm } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const compactNowCalls = [];
	const ctx = {
		compaction: { compactNow: async (...args) => { compactNowCalls.push(args); return null; } },
		logger: { info() {}, warn() {} },
		effect(generatorFactory) {
			for (const step of generatorFactory()) {
				if (typeof step === "function") {
					const result = step();
					if (result && typeof result.then === "function") return result;
				}
			}
		},
		systemPrompt: { section() { return () => {}; } },
		commands: { register() { return () => {}; } },
		webServer: { register() { return () => {}; } },
		tools: { register() { return () => {}; } },
	};
	const watcher = createAutoCompactWatcher({ ctx });
	assert.equal(typeof watcher.tick, "function");
	watcher.captureAgent("s-x", { agent: { id: "fake" }, signal: undefined, commandId: "blueprint-auto-compact" });
	const emptyDir = await mkdtemp((tmpdir() + "/blueprint-acw-").replace(/\\/g, "/"));
	try {
		const result = await watcher.tick({ cwd: emptyDir, sessionId: "s-x", nowMs: Date.now() });
		assert.equal(result.skipped, "no-session-file");
		assert.ok(compactNowCalls.length === 0, "no compaction call without a session.jsonl");
	} finally {
		await rm(emptyDir, { recursive: true, force: true });
	}
});

test("plugin entry logs and degrades when ctx.compaction.compactNow is missing (AC-INDEX-002 fallback)", async () => {
	const { createAutoCompactWatcher } = await import("../lib/auto-compact-watcher.js");
	const infoMessages = [];
	const ctx = {
		logger: { info: (m) => infoMessages.push(m), warn() {} },
		effect(generatorFactory) { for (const step of generatorFactory()) { if (typeof step === "function") step(); } },
		systemPrompt: { section() { return () => {}; } },
		commands: { register() { return () => {}; } },
		webServer: { register() { return () => {}; } },
		tools: { register() { return () => {}; } },
	};
	const watcher = createAutoCompactWatcher({ ctx, logger: { info: (m) => infoMessages.push(m), warn() {} } });
	watcher.captureAgent("s-x", { agent: { id: "fake" }, signal: undefined, commandId: "blueprint-auto-compact" });
	const result = await watcher.tick({ cwd: process.cwd(), sessionId: "s-x", nowMs: Date.now() });
	assert.equal(result.skipped, "no-compaction-service");
	assert.ok(infoMessages.length >= 1, "info log emitted exactly once at boot");
});

test("plugin entry registers watcher.dispose as a cordis disposer (AC-INDEX-003)", () => {
	const disposers = [];
	const ctx = {
		compaction: { compactNow: async () => null },
		effect(generatorFactory) { for (const step of generatorFactory()) { if (typeof step === "function") disposers.push(step); } },
		systemPrompt: { section() { return () => {}; } },
		commands: { register() { return () => {}; } },
		webServer: { register() { return () => {}; } },
		tools: { register() { return () => {}; } },
	};
	apply(ctx);
	const hasAsyncDispose = disposers.some((d) => typeof d === "function" && d.constructor.name === "AsyncFunction");
	assert.ok(hasAsyncDispose, "expected at least one async disposer for the watcher");
});

