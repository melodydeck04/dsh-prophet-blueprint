import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRefinementPacket } from "../lib/chat-commands.js";

const features = [{ id: "search", title: "Search", summary: "Search files", workflow: { stage: "refining" } }];

test("technical design is proportional to structural risk", () => {
	for (const text of ["调整 Component 归属", "迁移数据库 schema", "change the public API contract", "新增并发队列"]) assert.equal(createRefinementPacket({ text, featureId: "search", features, sessionId: "chat", source: "tool" }).planning.designRequired, true, text);
	for (const text of ["导出结果增加标题", "点击按钮显示结果", "补充失败提示的验收标准"]) assert.equal(createRefinementPacket({ text, featureId: "search", features, sessionId: "chat", source: "tool" }).planning.designRequired, false, text);
});

test("the normal path stays in the current DSH Agent", async () => {
	const code = await readFile(new URL("../lib/orchestration.js", import.meta.url), "utf8");
	assert.match(code, /single-Chat Blueprint assistant/);
	assert.match(code, /visible DSH Agent refines, implements, and verifies/);
	assert.doesNotMatch(code, /ctx\.agents|agents\.create|startArchitectureRole|ARCHITECTURE_TOOL/);
});
