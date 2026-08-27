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
	assert.deepEqual(inject, ["commands", "systemPrompt", "webServer", "tools"]);
	assert.equal(section.name, "design-blueprint:spec-driven-development");
	assert.equal(section.text, MODEL_GUIDANCE);
	assert.equal(tool.name, "blueprint_dispatch");
	assert.deepEqual([...commands.keys()], ["blueprint", "blueprint-status", "blueprint-map"]);
	assert.ok(commands.get("blueprint").input?.hint);
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
