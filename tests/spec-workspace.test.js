import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Blueprint defaults to a two-tab Spec workspace", async () => {
	const client = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	assert.match(client, /const \[workspaceTab, setWorkspaceTab\] = useState\("spec"\)/);
	assert.match(client, /aria-label": "Blueprint 工作区"/);
	assert.match(client, /\}, "优化 Spec"\)/);
	assert.match(client, /\}, "项目结构"\)/);
	assert.match(client, /workspaceTab === "spec" \? h\("main", \{ className: "bp-spec-workspace" \}/);
});

test("Spec document keeps the selected file and lifecycle visible beside the assistant", async () => {
	const client = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	const start = client.indexOf("function SpecDocument");
	const end = client.indexOf("function FeatureRead", start);
	assert.ok(start >= 0 && end > start);
	const component = client.slice(start, end);
	assert.match(component, /当前功能/);
	assert.match(component, /选择要优化 Spec 的功能/);
	assert.match(component, /Spec：\$\{spec\?\.status \?\? "尚未生成"\}/);
	assert.match(component, /WORKFLOW_LABELS\[workflow\.stage\]/);
	assert.match(component, /useState\("brief"\)/);
	assert.match(component, /useState\("zh"\)/);
	assert.match(component, /"功能说明"/);
	assert.match(component, /"开发 Spec"/);
	assert.match(component, /"中文"/);
	assert.match(component, /"English"/);
	assert.match(component, /const artifactFile = artifact\?\.file \?\? registeredArtifact\?\.file/);
	assert.match(component, /h\(MarkdownText, \{ text: artifact\.content \}\)/);
	assert.match(component, /助手会同步维护中英文文件/);
	assert.match(component, /生成开发方案/);
});

test("missing languages are reported without mixed-language fallback", async () => {
	const client = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	assert.match(client, /当前功能还没有中文功能说明/);
	assert.match(client, /助手必须写入 \$\{expectedBriefFile\}/);
	assert.match(client, /const expectedBriefFile = registered\?\.brief\?\.\[language\]\?\.file \?\? null/);
	assert.doesNotMatch(client, /function featureBriefFile/);
	assert.match(client, /当前 Spec 还没有独立中文文件/);
	assert.match(client, /对应语言文件尚未生成/);
	assert.doesNotMatch(client, /feature\?\.brief\?\.zh \?\? feature\?\.brief\?\.en/);
});

test("structure tab does not embed the Spec assistant or workflow document", async () => {
	const client = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	const start = client.indexOf("function FeatureRead");
	const end = client.indexOf("function FeatureForm", start);
	const component = client.slice(start, end);
	assert.doesNotMatch(component, /WorkflowPanel/);
	assert.doesNotMatch(component, /ReviewerPanel/);
	assert.match(client, /功能结构显示方式/);
	assert.match(client, /"架构图"/);
	assert.match(client, /"目录"/);
});

test("completed assistant turns still refresh the Spec document", async () => {
	const client = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	assert.match(client, /completedAssistantTurns <= previous/);
	assert.match(client, /const finished = reviewTurnJustFinished\(observedRunning\.current, running\)/);
	assert.match(client, /if \(finished\) refreshDashboard\(\)/);
	assert.match(client, /Promise\.resolve\(onRefresh\?\.\(\)\)/);
	assert.match(client, /onRefresh: load/);
	assert.match(client, /key: `\$\{selected\.id\}:\$\{REVIEW_PROTOCOL_VERSION\}`/);
	assert.doesNotMatch(client, /key: `\$\{selected\.id\}:\$\{selected\.workflow\?\.spec\?\.hash/);
});
