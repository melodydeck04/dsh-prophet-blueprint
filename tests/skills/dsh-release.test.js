import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import * as blueprint from "../../lib/skills.js";

// Set to the released dsh-skill entry; no server or model is started.
const entry = process.env.BLUEPRINT_DSH_SKILL_ENTRY;
test("released DSH registry and native tool load bundled Skills", { skip: !entry }, async () => {
	const require = createRequire(resolve(entry));
	const { Context } = await import(pathToFileURL(require.resolve("@deepseek-ai/cordis")));
	const { SkillRegistry, renderSkillContent } = await import(pathToFileURL(resolve(entry)));
	const toolEntry = process.env.BLUEPRINT_DSH_TOOL_SKILL_ENTRY;
	assert.ok(toolEntry, "Set BLUEPRINT_DSH_TOOL_SKILL_ENTRY to the matching release");
	const native = await import(pathToFileURL(resolve(toolEntry)));
	const version = JSON.parse(await readFile(resolve(dirname(entry), "../package.json"), "utf8")).version;
	assert.equal(version, "0.1.2-rc.1");
	const ctx = new Context();
	await ctx.plugin(SkillRegistry);
	await ctx.plugin(blueprint);
	try {
		let tool;
		// Real released tool implementation; only its registration/event sinks are captured.
		native.apply({ skills: ctx.skills, tools: { register(value) { tool = value; } }, on() {} });
		const catalog = await ctx.skills.list({ cwd: process.cwd() });
		assert.equal(catalog.length, 6);
		for (const item of catalog) {
			assert.equal(typeof item.invocation.userInvocable, "boolean");
			if (!item.invocation.modelInvocable) continue;
			const loaded = await tool.execute({ name: item.name }, { signal: new AbortController().signal });
			assert.equal(loaded.name, item.name);
			assert.ok(loaded.content.length > 50);
			assert.equal(loaded.resourceBase.kind, "directory");
			assert.ok((await readFile(resolve(loaded.resourceBase.path, "SKILL.md"), "utf8")).includes(loaded.content));
			assert.match(renderSkillContent(loaded), /Base directory for this skill/);
		}
		await assert.rejects(tool.execute({ name: "nonexistent-skill" }, {}), /unknown/);
	} finally { await ctx.fiber.dispose(); }
});
