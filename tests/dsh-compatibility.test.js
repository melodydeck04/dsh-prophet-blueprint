import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

async function loadClientModule() {
	const code = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	let declaration;
	vm.runInNewContext(code, { window: { __ModuleLoader__: { load(value) { declaration = value; } } } });
	return declaration.factory((name) => {
		if (name === "react") return {};
		if (name === "@deepseek-ai/dsh-client-ui-primitives") return { MarkdownText() {} };
		assert.fail(`Unexpected client dependency: ${name}`);
	});
}

test("all DSH peers and client injections target 0.1.1-rc.2", async () => {
	const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
	const dshPeers = Object.entries(manifest.peerDependencies).filter(([name]) => name.startsWith("@deepseek-ai/dsh-"));
	assert.ok(dshPeers.length > 0);
	for (const [name, range] of dshPeers) assert.equal(range, "^0.1.1-rc.2", name);
	assert.deepEqual(manifest.dsh.client.inject, [
		"@deepseek-ai/dsh-client-runtime",
		"@deepseek-ai/dsh-client-ui-primitives",
		"@deepseek-ai/dsh-client-ui-conversation",
	]);
});

test("review projection prefers the DSH 0.1.1 chat legacy slice", async () => {
	const client = await loadClientModule();
	const officialNodes = [{ kind: "assistant", seq: 2, blocks: [] }];
	const fallbackNodes = [{ kind: "assistant", seq: 1, blocks: [] }];
	const officialPartial = { turn: 1, step: 1, blocks: [] };
	const officialRunning = [{ callId: "call-1", name: "tool", argsRaw: "{}", subCalls: [] }];
	const slice = client.reviewConversationSlice({
		chat: { legacy: { nodes: officialNodes, partial: officialPartial, runningCalls: officialRunning } },
		nodes: fallbackNodes,
		partial: null,
	});
	assert.strictEqual(slice.nodes, officialNodes);
	assert.strictEqual(slice.partial, officialPartial);
	assert.strictEqual(slice.runningCalls, officialRunning);
});

test("review projection falls back to the pre-0.1.1 top-level shape", async () => {
	const client = await loadClientModule();
	const nodes = [{ kind: "user", seq: 1, content: [] }];
	const partial = { turn: 1, step: 1, blocks: [] };
	const slice = client.reviewConversationSlice({ nodes, partial });
	assert.strictEqual(slice.nodes, nodes);
	assert.strictEqual(slice.partial, partial);
});

test("review projection exposes DSH reasoning, tool, file and subagent activity safely", async () => {
	const client = await loadClientModule();
	const entries = client.reviewMessages({
		chat: { legacy: {
			nodes: [
				{ kind: "user", seq: 1, content: [{ type: "text", text: "检查这个 Spec" }] },
				{ kind: "assistant", seq: 2, blocks: [
					{ kind: "reasoning", text: "先检查边界条件" },
					{ kind: "text", text: "我发现两个问题。" },
				] },
				{ kind: "tool-result", seq: 3, callId: "edit-1", call: { name: "file_edit", argsRaw: '{"path":".specs/proposed/example.zh.md"}' }, content: [{ type: "text", text: "done" }], isError: false, subCalls: [] },
			],
			partial: { turn: 2, step: 1, blocks: [
				{ kind: "reasoning", text: "正在核对修改结果" },
				{ kind: "text", text: "修改已经" },
			] },
			runningCalls: [{ callId: "agent-1", name: "subagent", argsRaw: '{"task":"检查测试"}', subCalls: [] }],
		} },
	});
	assert.ok(entries.some((entry) => entry.activityKind === "reasoning" && entry.detail === "先检查边界条件" && entry.status === "completed"));
	assert.ok(entries.some((entry) => entry.title?.startsWith("文件修改 · file_edit") && entry.detail.includes("example.zh.md") && entry.status === "completed"));
	assert.ok(entries.some((entry) => entry.title?.startsWith("子任务 · subagent") && entry.detail.includes("检查测试") && entry.status === "running"));
	assert.ok(entries.some((entry) => entry.activityKind === "reasoning" && entry.title === "正在思考" && entry.status === "running"));
	assert.ok(entries.some((entry) => entry.role === "assistant" && entry.text === "修改已经" && entry.partial));
	assert.ok(entries.every((entry) => typeof entry.key === "string" && !entry.detail?.includes("[object Object]")));
});
