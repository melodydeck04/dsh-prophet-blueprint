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
	assert.match(code, /const ARCHITECTURE_PROTOCOL_VERSION = "guided-v3"/);
	assert.match(code, /不开始功能实现，不把 Spec 标记为 implemented/);
	assert.match(code, /不创建或修改 \.blueprint\/approvals、\.blueprint\/architecture 或实现文件/);
	assert.match(code, /function architecturePrompt/);
	assert.match(code, /architecture-catalog/);
	assert.match(code, /feature-catalog/);
	assert.match(code, /selected-feature/);
	assert.match(code, /selected-component/);
	assert.match(code, /页面或依赖本身不能作为新增插件的依据/);
	assert.match(code, /不直接继承主开发会话或 Spec 审核助手的历史/);
	assert.match(code, /Blueprint 当前没有 Component Tab、Relationships 面板/);
	assert.match(code, /dependencies\.relation 只允许 depends_on、calls、publishes、consumes、exposes、extends/);
	assert.match(code, /Feature→Feature 关系、结构化 contract direction\/purpose 当前都不能由提案卡应用/);
	assert.match(code, /<blueprint-architecture-change>/);
	assert.match(code, /每条回复最多只能包含一个架构变更/);
});

test("architecture proposal parser extracts one exact component change and hides its machine block", async () => {
	const client = await loadClientModule();
	assert.equal(typeof client.parseArchitectureProposal, "function");
	const change = {
		action: "upsert",
		id: "web-shell",
		title: "Web shell",
		kind: "frontend",
		containerId: null,
		deployment: "web",
		status: "planned",
		summary: "Owns the browser surface.",
		ownedPaths: ["web/**"],
		contracts: ["web.shell"],
		dependencies: [{ relation: "calls", target: "backend-api" }],
		supportedFeatures: ["web-dashboard"],
		documents: [{ level: "required", path: "DESIGN.md" }],
	};
	const parsed = client.parseArchitectureProposal(`分析结论。\n<blueprint-architecture-change>\n${JSON.stringify(change)}\n</blueprint-architecture-change>`);
	assert.equal(parsed.text, "分析结论。");
	assert.equal(JSON.stringify(parsed.change), JSON.stringify(change));
	assert.equal(parsed.error, null);
});

test("architecture proposal parser refuses malformed, multi-component, and invented schema actions", async () => {
	const client = await loadClientModule();
	const malformed = client.parseArchitectureProposal("说明\n<blueprint-architecture-change>\n{bad}\n</blueprint-architecture-change>");
	assert.equal(malformed.change, null);
	assert.match(malformed.error, /JSON 无效/);
	const multiple = client.parseArchitectureProposal("<blueprint-architecture-change>{\"action\":\"delete\",\"id\":\"one\"}</blueprint-architecture-change><blueprint-architecture-change>{\"action\":\"delete\",\"id\":\"two\"}</blueprint-architecture-change>");
	assert.equal(multiple.change, null);
	assert.match(multiple.error, /最多只能包含一个/);
	const invented = client.parseArchitectureProposal("<blueprint-architecture-change>{\"action\":\"relationship\",\"id\":\"one\"}</blueprint-architecture-change>");
	assert.equal(invented.change, null);
	assert.match(invented.error, /action 只能是/);
});

test("architecture Service creates, opens, and prompts a dedicated DSH session per focused target", async () => {
	const client = await loadClientModule();
	assert.equal(typeof client.architectureTitle, "function");
	assert.equal(typeof client.architecturePrompt, "function");
	const feature = { id: "accounts", title: "Accounts" };
	const component = { id: "backend-api", title: "Backend API" };
	assert.equal(client.architectureTitle(feature, null), "Blueprint 架构审核 · guided-v3 · feature-accounts");
	assert.equal(client.architectureTitle(null, component), "Blueprint 架构审核 · guided-v3 · component-backend-api");
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
		workspaces: {
			list: { getSnapshot: () => ({ archivedSessionIds: [] }) },
			async archiveSession(sessionId) { assert.equal(sessionId, "review-arch"); lifecycle.push("archive"); },
		},
	};
	client.apply(ctx);
	assert.equal(typeof injectedCallback, "function");
	injectedCallback();
	const injected = registration.inject("main");
	const sessionId = await injected.architectureReviewer.send("D:/project", { id: "accounts" }, { id: "backend-api" }, { architecture: { components: [] }, catalog: { features: [] } }, "评估");
	assert.equal(sessionId.sessionId, "review-arch");
	assert.ok(lifecycle.includes("prompt"));
	assert.deepEqual(lifecycle, ["archive", "rename", "open", "prompt"]);
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
	assert.match(assistant, /parseArchitectureProposal\(message\.text\)/);
	assert.match(assistant, /h\(MarkdownText, \{ text: proposal\.text, streaming: Boolean\(message\.partial\)/);
	assert.match(assistant, /h\(ArchitectureProposalCard/);
	assert.match(assistant, /onScroll: \(event\) => updateScrollPin\(event\.currentTarget\)/);
	assert.match(assistant, /"回到最新"/);
	assert.doesNotMatch(assistant, /navigate|location\.|window\.open/);
	assert.match(code, /ctx\.workspaces\.archiveSession\(sessionId\)/);
});

test("architecture proposal card previews through Host before exact-hash apply", async () => {
	const code = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	assert.match(code, /function ArchitectureProposalCard/);
	assert.match(code, /"生成变更预览"/);
	assert.match(code, /"确认并应用"/);
	assert.match(code, /action: "architecture-preview", cwd, change/);
	assert.match(code, /action: "architecture-apply", cwd, change, expectedPreviewHash/);
	assert.match(code, /onApply\(change, preview\.previewHash\)/);
	assert.match(code, /setData\(result\.dashboard\)/);
});

test("architecture workspace preserves its mounted assistant, draft, and archived session across tab switches", async () => {
	const code = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	assert.match(code, /const \[architectureMounted, setArchitectureMounted\] = useState\(false\)/);
	assert.match(code, /setArchitectureMounted\(true\); setWorkspaceTab\("architecture"\)/);
	assert.match(code, /architectureMounted \? h\("div", \{ hidden: workspaceTab !== "architecture"/);
	assert.match(code, /const draftStorageKey = `\$\{storageKey\}:draft`/);
	assert.match(code, /const sessionStorageKey = `\$\{storageKey\}:session`/);
	assert.match(code, /setDraft\(window\.localStorage\.getItem\(draftStorageKey\) \?\? ""\)/);
	assert.match(code, /window\.localStorage\.setItem\(draftStorageKey, value\)/);
	assert.match(code, /rememberedSessionId = window\.localStorage\.getItem\(sessionStorageKey\)/);
	assert.match(code, /architectureService\.send\(cwd, feature, component, dashboard, text, sessionId\)/);
	assert.match(code, /preferredSessionId && ctx\.sessions\.binding\?\.\(preferredSessionId\)\?\.session/);
});
