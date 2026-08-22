import test from "node:test";
import assert from "node:assert/strict";
import { apply, COMPONENT_ID_PATTERN, COMPONENT_KINDS, COMPONENT_RELATION_TYPES, COMPONENT_STATUSES, hashComponentContent, inject, loadArchitectureCatalog, MODEL_GUIDANCE, name, parseComponent, serializeComponent } from "../lib/index.js";

test("DSH plugin registers current system-prompt and command contracts", () => {
	let section;
	let command;
	let route;
	const ctx = {
		effect(generatorFactory) {
			for (const disposer of generatorFactory()) assert.equal(typeof disposer, "function");
		},
		systemPrompt: { section(value) { section = value; return () => {}; } },
		commands: { register(value) { command = value; return () => {}; } },
		webServer: { register(value) { route = value; return () => {}; } },
	};
	apply(ctx);
	assert.equal(name, "design-blueprint");
	assert.deepEqual(inject, ["commands", "systemPrompt", "webServer"]);
	assert.equal(section.name, "design-blueprint:spec-driven-development");
	assert.equal(section.text, MODEL_GUIDANCE);
	assert.equal(command.name, "blueprint");
	assert.deepEqual(command.input, { hint: "all" });
	assert.equal(route.kind, "exact");
	assert.equal(route.path, "/design-blueprint/api");
});

test("DSH plugin exports the architecture parser and the canonical component sets", () => {
	assert.equal(typeof parseComponent, "function");
	assert.equal(typeof serializeComponent, "function");
	assert.equal(typeof loadArchitectureCatalog, "function");
	assert.equal(typeof hashComponentContent, "function");
	assert.equal(COMPONENT_ID_PATTERN.source, "^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$");
	assert.ok(COMPONENT_KINDS.has("service"));
	assert.ok(COMPONENT_KINDS.has("plugin"));
	assert.ok(COMPONENT_STATUSES.has("active"));
	assert.ok(COMPONENT_RELATION_TYPES.has("depends_on"));
});
