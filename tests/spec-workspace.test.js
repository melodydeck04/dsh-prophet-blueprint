import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function clientSource() { return readFile(new URL("../lib/client.js", import.meta.url), "utf8"); }

test("Blueprint exposes a Feature system map and project audit without an embedded assistant", async () => {
	const client = await clientSource();
	for (const label of ["系统地图", "项目检查", "Feature 层级", "搜索 Feature"]) assert.match(client, new RegExp(label));
	for (const removed of [/UnifiedAssistant/, /textarea/, /sendPrompt/, /sessions\.create/, /localStorage/]) assert.doesNotMatch(client, removed);
});

test("Feature details expose current truth, hierarchy, implementation facts, and active change", async () => {
	const client = await clientSource();
	const start = client.indexOf("function FeatureDetail");
	const end = client.indexOf("function ProjectAudit", start);
	assert.ok(start >= 0 && end > start);
	const detail = client.slice(start, end);
	for (const label of ["当前行为", "层级、依赖与实现", "活动变更与历史", "登记文档", "在当前 DSH Chat 中工作"]) assert.match(detail, new RegExp(label));
	assert.match(detail, /MarkdownText/);
	assert.match(detail, /workflow\.spec\.hash/);
	assert.match(detail, /ownedPaths/);
	assert.match(detail, /dependencies/);
	assert.match(detail, /contracts/);
});

test("registered documents use the bounded document action", async () => {
	const client = await clientSource();
	assert.match(client, /action:"document",cwd,sessionId,dshWorkspacePath,dshWorkspaceTitle,featureId:feature\.id,file/);
	assert.match(client, /返回 Feature/);
	assert.doesNotMatch(client, /readFile|arbitraryPath|exec_command|powershell/);
});

test("Feature filtering keeps hierarchy ancestors and exposes six public stages", async () => {
	const client = await clientSource();
	assert.match(client, /PUBLIC_STAGES = \["refining", "ready", "implementing", "verifying", "blocked", "completed"\]/);
	assert.match(client, /while\(parent\)\{visible\.add\(parent\)/);
});

test("Feature selection stays dashboard-local while @Feature serializes the stable id", async () => {
	const client = await clientSource();
	assert.match(client, /onSelect:\(id\)=>\{setSelectedId\(id\)/);
	assert.doesNotMatch(client, /setFocus|blueprint-focus/);
	assert.match(client, /trigger:"@",name:"Feature"/);
	assert.match(client, /clipboardText:`@feature:\$\{candidate\.value\}`/);
	assert.match(client, /async serialize\(ref\)\{return`@feature:\$\{ref\}`;\}/);
});
