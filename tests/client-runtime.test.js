import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

async function loadClientModule(fetchImpl = async () => ({ ok: true, json: async () => ({ ok: true, value: { catalog: { features: [] } } }) })) {
	const code = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	let declaration;
	vm.runInNewContext(code, { fetch: fetchImpl, window: { __ModuleLoader__: { load(value) { declaration = value; } } } });
	const React = {
		createElement() {}, useEffect() {}, useMemo(factory) { return factory(); }, useState(value) { return [value, () => {}]; },
	};
	return declaration.factory((name) => {
		if (name === "react") return React;
		if (name === "@deepseek-ai/dsh-client-ui-primitives") return { MarkdownText() {} };
		assert.fail(`Unexpected client dependency: ${name}`);
	});
}

test("@Feature source searches localized facts and serializes the exact stable id", async () => {
	const features = [
		{ id: "evidence-workspace", title: "证据工作台", summary: "调查并展示证据" },
		{ id: "accounts", title: "Accounts", summary: "Manage identities" },
	];
	const client = await loadClientModule(async () => ({ json: async () => ({ ok: true, value: { catalog: { features } } }) }));
	const ctx = { sessions: { list: { getSnapshot: () => ({ byId: { main: { cwd: "D:/project" } } }) } } };
	const source = client.createFeatureSource(ctx);
	assert.equal(source.trigger, "@");
	const rows = await source.candidates({ sessionId: "main" }, { query: "证据", signal: new AbortController().signal });
	assert.equal(rows.length, 1);
	assert.equal(rows[0].value, "evidence-workspace");
	const picked = source.onPick({ candidate: rows[0] });
	assert.deepEqual(JSON.parse(JSON.stringify(picked)), {
		insert: {
			source: "blueprint-feature",
			ref: "evidence-workspace",
			label: "证据工作台",
			clipboardText: "@feature:evidence-workspace",
		},
	});
	assert.equal(await source.codec.serialize("evidence-workspace"), "@feature:evidence-workspace");
	assert.equal(source.codec.clipboardText("evidence-workspace"), "@feature:evidence-workspace");
});

test("client registers only the dashboard view and Feature input source", async () => {
	const client = await loadClientModule();
	let source;
	let registration;
	const ctx = {
		inputTriggers: { registerSource(value) { source = value; return () => {}; } },
		slots: {
			inject(name, callback) { assert.equal(name, "conversation.view"); return callback(); },
			register(value) { registration = value; return () => {}; },
		},
		sessions: { list: { getSnapshot: () => ({ byId: { main: { cwd: "D:/project" } } }) } },
	};
	client.apply(ctx);
	assert.equal(source.name, "Feature");
	assert.equal(registration.id, "blueprint");
	assert.deepEqual(JSON.parse(JSON.stringify(registration.inject("main"))), { cwd: "D:/project" });
	assert.deepEqual(JSON.parse(JSON.stringify(client.inject)), ["slots", "sessions", "inputTriggers"]);
});
