import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

async function loadClientModule() {
	const code = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	let declaration;
	vm.runInNewContext(code, { window: { __ModuleLoader__: { load(value) { declaration = value; } } } });
	const React = {
		createElement() {},
		useEffect() {},
		useMemo(factory) { return factory(); },
		useRef(value) { return { current: value }; },
		useState(value) { return [value, () => {}]; },
		useSyncExternalStore(_subscribe, snapshot) { return snapshot(); },
	};
	return declaration.factory((name) => {
		if (name === "react") return React;
		if (name === "@deepseek-ai/dsh-client-ui-primitives") return { MarkdownText() {} };
		assert.fail(`Unexpected client dependency: ${name}`);
	});
}

test("client review service creates and prompts a fresh DSH session", async () => {
	const client = await loadClientModule();
	let registration;
	let createOptions;
	let createCount = 0;
	let renamed;
	let prompt;
	const lifecycle = [];
	const rows = {
		main: { id: "main", cwd: "D:/project", title: "Development" },
	};
	const reviewSession = {
		async rename(title) {
			lifecycle.push("rename");
			renamed = title;
			rows.review = { id: "review", cwd: "D:/project", title };
			return { ok: true, value: { title, seq: 1 } };
		},
		async open() { lifecycle.push("open"); },
		async prompt(content, mode) {
			lifecycle.push("prompt");
			prompt = { content, mode };
			return { ok: true, value: { accepted: true } };
		},
		async cancel() { return { ok: true, value: { accepted: true } }; },
	};
	const ctx = {
		slots: {
			inject(name, callback) { assert.equal(name, "conversation.view"); return callback(); },
			register(options) { registration = options; return () => {}; },
		},
		sessions: {
			list: { getSnapshot: () => ({ byId: rows }) },
			async create(options) { createCount += 1; createOptions = options; return "review"; },
			binding(id) { return id === "review" ? { session: reviewSession } : { session: reviewSession }; },
		},
	};
	client.apply(ctx);
	const injected = registration.inject("main");
	const feature = {
		id: "analysis",
		title: "需求分析",
		status: "planned",
		summary: "拆解问题",
		scope: ["src/**"],
		acceptance: ["输出结构化结果"],
		notes: "",
		artifacts: {
			brief: { en: { file: "docs/user/features/analysis.md", exists: false }, zh: { file: "docs/user/features/analysis.zh.md", exists: false } },
			spec: { en: { file: ".specs/proposed/analysis.md", exists: true }, zh: { file: ".specs/proposed/analysis.zh.md", exists: false } },
		},
		workflow: { stage: "review", spec: { file: ".specs/proposed/analysis.md", hash: "a".repeat(64), content: "# Spec: Analysis" } },
	};
	const result = await injected.reviewer.send("D:/project", feature, "检查边界条件", "simple");
	assert.equal(result.sessionId, "review");
	assert.equal(createOptions.cwd, "D:/project");
	assert.equal(renamed, "Blueprint 审核 · guided-v2 · analysis");
	assert.deepEqual(lifecycle, ["rename", "open", "prompt"]);
	assert.equal(createCount, 1);
	assert.equal(prompt.mode, "queue");
	assert.match(prompt.content[0].text, /独立审核 Session，不直接继承主开发会话历史/);
	assert.match(prompt.content[0].text, /review-output-mode name="simple"/);
	assert.match(prompt.content[0].text, /最多提出 3 个问题/);
	assert.match(prompt.content[0].text, /<product-brief-en path="docs\/user\/features\/analysis\.md" state="missing">/);
	assert.match(prompt.content[0].text, /<product-brief-zh path="docs\/user\/features\/analysis\.zh\.md" state="missing">/);
	assert.match(prompt.content[0].text, /不得自创文件名/);
	assert.match(prompt.content[0].text, /检查边界条件$/);

	feature.workflow.spec.hash = "b".repeat(64);
	feature.workflow.spec.content = "# Spec: Analysis\n\n最新内容";
	const continued = await injected.reviewer.send("D:/project", feature, "继续检查", "technical");
	assert.equal(continued.sessionId, "review");
	assert.equal(createCount, 1, "a changed Spec hash must reuse the feature review session");
	assert.deepEqual(lifecycle, ["rename", "open", "prompt", "open", "prompt"]);
	assert.match(prompt.content[0].text, /b{64}/);
	assert.match(prompt.content[0].text, /最新内容/);
	assert.match(prompt.content[0].text, /review-output-mode name="technical"/);
	assert.match(prompt.content[0].text, /继续检查$/);
});

test("review scroll pin uses a stable near-bottom threshold", async () => {
	const client = await loadClientModule();
	assert.equal(client.reviewScrollNearBottom(null), true);
	assert.equal(client.reviewScrollNearBottom({ scrollHeight: 1000, scrollTop: 552, clientHeight: 400 }), true);
	assert.equal(client.reviewScrollNearBottom({ scrollHeight: 1000, scrollTop: 551, clientHeight: 400 }), false);
	assert.equal(client.reviewScrollNearBottom({ scrollHeight: 1000, scrollTop: 500, clientHeight: 400 }, 100), true);
});

test("tool-only turn completion remains deterministic", async () => {
	const client = await loadClientModule();
	assert.equal(client.reviewTurnJustFinished(false, false), false);
	assert.equal(client.reviewTurnJustFinished(false, true), false);
	assert.equal(client.reviewTurnJustFinished(true, true), false);
	assert.equal(client.reviewTurnJustFinished(true, false), true);
});
