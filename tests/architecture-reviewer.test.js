import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

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

test("architecture prompt carries delimited context and never authorizes self-writing of implementation", async () => {
	const code = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	assert.match(code, /ARCHITECTURE_MESSAGE_MARKER/);
	assert.match(code, /const ARCHITECTURE_PROTOCOL_VERSION = "guided-v2"/);
	assert.match(code, /不开始功能实现，不把 Spec 标记为 implemented/);
	assert.match(code, /不创建或修改 \.blueprint\/approvals、\.blueprint\/architecture 或实现文件/);
	assert.match(code, /function architecturePrompt/);
	assert.match(code, /architecture-catalog/);
	assert.match(code, /feature-catalog/);
	assert.match(code, /selected-feature/);
	assert.match(code, /selected-component/);
	assert.match(code, /页面或依赖本身不能作为新增插件的依据/);
	assert.match(code, /不直接继承主开发会话或 Spec 审核助手的历史/);
});

test("architecture Service creates, opens, and prompts a dedicated DSH session per focused target", async () => {
	const client = await loadClientModule();
	assert.equal(typeof client.architectureTitle, "function");
	assert.equal(typeof client.architecturePrompt, "function");
	const feature = { id: "accounts", title: "Accounts" };
	const component = { id: "backend-api", title: "Backend API" };
	assert.equal(client.architectureTitle(feature, null), "Blueprint 架构审核 · guided-v2 · feature-accounts");
	assert.equal(client.architectureTitle(null, component), "Blueprint 架构审核 · guided-v2 · component-backend-api");
	const prompt = client.architecturePrompt({ feature, component, dashboard: { architecture: { components: [] }, catalog: { features: [] } }, message: "请评估归属", includeContext: true });
	assert.match(prompt, /<!-- BLUEPRINT_ARCHITECTURE_MESSAGE -->/);
	assert.match(prompt, /请评估归属/);
	assert.match(prompt, /<selected-feature>/);
	assert.match(prompt, /<selected-component>/);
});

test("architecture service refuses to send without a DSH session capability", async () => {
	const client = await loadClientModule();
	const lifecycle = [];
	const reviewSession = {
		async rename(title) { lifecycle.push("rename"); return { ok: true, value: { title, seq: 1 } }; },
		async open() { lifecycle.push("open"); },
		async prompt(content, mode) { lifecycle.push("prompt"); return { ok: true, value: { accepted: true } }; },
		async cancel() { return { ok: true, value: { accepted: true } }; },
	};
	let registration = null;
	let injectedCallback = null;
	const ctx = {
		slots: {
			inject(name, callback) { assert.equal(name, "conversation.view"); injectedCallback = callback; return () => {}; },
			register(options) { registration = options; return () => {}; },
		},
		sessions: {
			list: { getSnapshot: () => ({ byId: { main: { id: "main", cwd: "D:/project", title: "Development" } } }) },
			async create() { return "review-arch"; },
			binding() { return { session: reviewSession }; },
		},
	};
	client.apply(ctx);
	assert.equal(typeof injectedCallback, "function");
	injectedCallback();
	const injected = registration.inject("main");
	const sessionId = await injected.architectureReviewer.send("D:/project", { id: "accounts" }, { id: "backend-api" }, { architecture: { components: [] }, catalog: { features: [] } }, "评估");
	assert.equal(sessionId.sessionId, "review-arch");
	assert.ok(lifecycle.includes("prompt"));
});

test("architecture assistant keeps the backing session visibly embedded in Blueprint", async () => {
	const code = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	const start = code.indexOf("function ArchitectureAssistant");
	const end = code.indexOf("function FeatureDiagram", start);
	assert.ok(start >= 0 && end > start, "ArchitectureAssistant source must be present");
	const assistant = code.slice(start, end);
	assert.match(assistant, /const live = reviewMessages\(snapshot\)/);
	assert.match(assistant, /className: "bp-reviewer-messages"/);
	assert.match(assistant, /messages\.map\(\(message\)/);
	assert.match(assistant, /className: "bp-review-activity"/);
	assert.match(assistant, /h\(MarkdownText, \{ text: message\.text, streaming: Boolean\(message\.partial\)/);
	assert.match(assistant, /onScroll: \(event\) => updateScrollPin\(event\.currentTarget\)/);
	assert.match(assistant, /"回到最新"/);
	assert.doesNotMatch(assistant, /navigate|location\.|window\.open/);
});
