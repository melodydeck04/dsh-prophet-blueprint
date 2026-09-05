import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("manifest and browser bundle expose a dashboard-only Blueprint contract", async () => {
	const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
	const client = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	assert.equal(manifest.version, "0.22.0");
	assert.equal(manifest.dsh.client.platform, "web");
	assert.ok(manifest.dsh.client.inject.includes("@deepseek-ai/dsh-client-ui-input-trigger"));
	assert.equal(manifest.exports["./orchestration"].default, "./lib/orchestration.js");
	assert.equal(manifest.exports["./chat-commands"].default, "./lib/chat-commands.js");
	assert.match(client, /^window\.__ModuleLoader__\.load\(/);
	assert.match(client, /ctx\.slots\.inject\("conversation\.view"/);
	assert.match(client, /ctx\.inputTriggers\.registerSource/);
	assert.match(client, /fetch\("\/design-blueprint\/api"/);
	assert.match(client, /Feature 层级/);
	assert.match(client, /搜索 Feature/);
	assert.match(client, /批准精确 Spec 哈希/);
	assert.match(client, /活动变更与历史/);
	assert.match(client, /action:"document"/);
	assert.match(client, /MarkdownText/);
	assert.match(client, /CLIENT_VERSION = "0\.22\.0"/);
	assert.match(client, /手动兜底项目/);
	assert.match(client, /action:"bind"/);
	assert.match(client, /dshWorkspacePath/);
});

test("Blueprint Web has no second Chat, browser role orchestration, or canned AI follow-up controls", async () => {
	const client = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	for (const forbidden of [
		"UnifiedAssistant",
		"<textarea",
		"localStorage",
		"sessions.create",
		"sendPrompt",
		"assistantRequest",
		"verification-start",
		"verification-result",
		"verification-finalize",
		"报告问题",
		"提出新能力",
		"规划新能力",
		"整理现有能力",
		"开始开发",
		"新建会话",
	]) assert.doesNotMatch(client, new RegExp(forbidden));
	assert.match(client, /\/blueprint @feature:\$\{feature\.id\} 描述你的需求/);
	assert.match(client, /页面选择仅用于浏览，不会改变 Chat 目标或授予写权限/);
	assert.match(client, /不会创建第二个助手/);
});


