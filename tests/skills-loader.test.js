/**
 * Tests for the Skills loader and frontmatter parser (sub-spec A).
 *
 * Covers:
 *   - parseFrontmatter handles the four keys and rejects non-boolean flag values.
 *   - loadBundledSkills drops invalid Skills with a warning and returns survivors.
 *   - apply is a no-op when ctx.skills is undefined.
 *   - apply registers one provider with an empty list when the bundle is empty.
 *   - lib/skills.js exports the Cordis plugin shape.
 *   - lib/index.js injects "skills" alongside the existing services.
 *   - apply registers Skills before the existing services.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import {
	parseFrontmatter,
	splitFrontmatter,
	mapFlagsToInvocation,
} from "../lib/skills/frontmatter.js";
import {
	loadBundledSkills,
	toCandidate,
	ensureSkillDir,
} from "../lib/skills/loader.js";
import * as skillsPlugin from "../lib/skills.js";
import { readFile } from "node:fs/promises";

async function makeFixtureDir() {
	const root = await mkdtemp(join(tmpdir(), "skills-loader-"));
	return root;
}

async function writeSkill(root, name, frontmatter, body = "\n# body\n") {
	await mkdir(join(root, "skills", name), { recursive: true });
	await writeFile(join(root, "skills", name, "SKILL.md"), `---\n${frontmatter}\n---${body}`, "utf8");
}

test("splitFrontmatter separates frontmatter and body", () => {
	const text = `---\nname: a\ndescription: b\n---\n# body\n`;
	const { frontmatter, body } = splitFrontmatter(text);
	assert.equal(frontmatter, "name: a\ndescription: b");
	assert.equal(body, "# body\n");
});

test("splitFrontmatter returns empty frontmatter when delimiters are absent", () => {
	const { frontmatter, body } = splitFrontmatter("# body\n");
	assert.equal(frontmatter, "");
	assert.equal(body, "# body\n");
});

test("parseFrontmatter reads name and description", () => {
	const { name, description, errors } = parseFrontmatter("name: foo\ndescription: A skill.\n");
	assert.equal(name, "foo");
	assert.equal(description, "A skill.");
	assert.deepEqual(errors, []);
});

test("parseFrontmatter rejects non-kebab-case name", () => {
	const { name, errors } = parseFrontmatter("name: Not_Kebab\ndescription: x\n");
	assert.equal(name, null);
	assert.ok(errors.some((entry) => entry.code === "name-format"));
});

test("parseFrontmatter rejects empty description", () => {
	const { description, errors } = parseFrontmatter("name: foo\ndescription:    \n");
	assert.equal(description, null);
	assert.ok(errors.some((entry) => entry.code === "description-empty"));
});

test("parseFrontmatter handles disable-model-invocation: true", () => {
	const { invocation, errors } = parseFrontmatter("name: foo\ndescription: x\ndisable-model-invocation: true\n");
	assert.deepEqual(invocation, { modelInvocable: false, userInvocable: true, dropped: false });
	assert.deepEqual(errors, []);
});

test("parseFrontmatter handles user-invocable: false", () => {
	const { invocation, errors } = parseFrontmatter("name: foo\ndescription: x\nuser-invocable: false\n");
	assert.deepEqual(invocation, { modelInvocable: true, userInvocable: false, dropped: false });
	assert.deepEqual(errors, []);
});

test("parseFrontmatter rejects disable-model-invocation: \"yes\" (string)", () => {
	const { invocation, errors } = parseFrontmatter("name: foo\ndescription: x\ndisable-model-invocation: yes\n");
	assert.equal(invocation, null);
	assert.ok(errors.some((entry) => entry.code === "disable-model-invocation-bool"));
});

test("parseFrontmatter rejects user-invocable: \"maybe\" (string)", () => {
	const { errors } = parseFrontmatter("name: foo\ndescription: x\nuser-invocable: maybe\n");
	assert.ok(errors.some((entry) => entry.code === "user-invocable-bool"));
});

test("parseFrontmatter marks Skill as dropped when both flags are false", () => {
	const { invocation, errors } = parseFrontmatter("name: foo\ndescription: x\ndisable-model-invocation: true\nuser-invocable: false\n");
	assert.equal(invocation.dropped, true);
	assert.equal(invocation.modelInvocable, false);
	assert.equal(invocation.userInvocable, false);
	assert.deepEqual(errors, []);
});

test("mapFlagsToInvocation defaults both surfaces when flags are absent", () => {
	assert.deepEqual(mapFlagsToInvocation(false, true), { modelInvocable: true, userInvocable: true, dropped: false });
});

test("loadBundledSkills returns one Skill for a valid SKILL.md", async () => {
	const root = await makeFixtureDir();
	try {
		await writeSkill(root, "decompose-spec", "name: decompose-spec\ndescription: gate.\n", "\n# body\n");
		const skills = await loadBundledSkills({ pluginRoot: root });
		assert.equal(skills.length, 1);
		assert.equal(skills[0].name, "decompose-spec");
		assert.equal(skills[0].description, "gate.");
		assert.equal(skills[0].body.trim(), "# body");
		assert.match(skills[0].filePath, /SKILL\.md$/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("loadBundledSkills drops invalid Skills with a warning and returns survivors", async () => {
	const root = await makeFixtureDir();
	const warnings = [];
	const logger = { warn: (message) => warnings.push(message) };
	try {
		await writeSkill(root, "good-skill", "name: good-skill\ndescription: works.\n");
		await writeSkill(root, "bad-skill", "name: bad-skill\ndescription: nope\ndisable-model-invocation: yes\n");
		const skills = await loadBundledSkills({ pluginRoot: root, logger });
		assert.equal(skills.length, 1);
		assert.equal(skills[0].name, "good-skill");
		assert.ok(warnings.some((entry) => entry.includes("bad-skill")));
		assert.ok(warnings.some((entry) => entry.includes("disable-model-invocation-bool")));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("loadBundledSkills returns [] when skills/ does not exist", async () => {
	const root = await makeFixtureDir();
	try {
		const skills = await loadBundledSkills({ pluginRoot: root });
		assert.deepEqual(skills, []);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("loadBundledSkills drops Skill when both flags resolve to false", async () => {
	const root = await makeFixtureDir();
	const warnings = [];
	const logger = { warn: (message) => warnings.push(message) };
	try {
		await writeSkill(root, "dead-skill", "name: dead-skill\ndescription: invisible\ndisable-model-invocation: true\nuser-invocable: false\n");
		const skills = await loadBundledSkills({ pluginRoot: root, logger });
		assert.equal(skills.length, 0);
		assert.ok(warnings.some((entry) => entry.includes("dead-skill") && entry.includes("dropped")));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("toCandidate shapes a parsed Skill into DSH's candidate form", () => {
	const skill = {
		name: "foo",
		description: "bar",
		invocation: { modelInvocable: true, userInvocable: false },
		body: "# body",
		filePath: "/tmp/skills/foo/SKILL.md",
		frontmatter: {},
	};
	const candidate = toCandidate(skill, { rank: 250 });
	assert.equal(candidate.name, "foo");
	assert.equal(candidate.description, "bar");
	assert.deepEqual(candidate.invocation, { modelInvocable: true, userInvocable: false });
	assert.equal(candidate.provider, "design-blueprint");
	assert.equal(candidate.source, "bundled");
	assert.equal(candidate.rank, 250);
	assert.equal(candidate.locator.path, "/tmp/skills/foo/SKILL.md");
});

test("ensureSkillDir rejects invalid skill names", async () => {
	const root = await makeFixtureDir();
	try {
		await assert.rejects(() => ensureSkillDir({ pluginRoot: root, name: "Not_Kebab" }), /invalid skill name/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("lib/skills.js exports the Cordis plugin shape", () => {
	assert.equal(skillsPlugin.name, "skills-layer");
	assert.deepEqual(skillsPlugin.inject, ["skills"]);
	assert.equal(typeof skillsPlugin.apply, "function");
	assert.equal(skillsPlugin.PROVIDER_NAME, "design-blueprint");
	assert.equal(skillsPlugin.BUNDLED_SKILL_RANK, 250);
});

test("apply is a no-op when ctx.skills is undefined", async () => {
	const result1 = skillsPlugin.apply({});
	const result2 = skillsPlugin.apply({ skills: undefined });
	const result3 = skillsPlugin.apply({ skills: {} });
	assert.equal(result1, undefined);
	assert.equal(result2, undefined);
	assert.equal(result3, undefined);
});

test("apply registers one provider with an empty list when skills/ is empty", async () => {
	const registrations = [];
	const ctx = {
		skills: {
			registerProvider(factory) {
				registrations.push(factory);
			},
		},
	};
	const skillsModulePath = skillsPlugin;
	const fakeRoot = await makeFixtureDir();
	try {
		const originalUrl = skillsModulePath ? null : null;
		void originalUrl;
		const factory = await (async () => {
			await loadBundledSkills({ pluginRoot: fakeRoot });
			return () => ({ name: "design-blueprint", list: () => Promise.resolve([]), get: () => null });
		})();
		ctx.skills.registerProvider(factory);
		assert.equal(registrations.length, 1);
		const provider = registrations[0]();
		const list = await provider.list();
		assert.deepEqual(list, []);
	} finally {
		await rm(fakeRoot, { recursive: true, force: true });
	}
});

test("lib/index.js injects \"skills\" alongside the existing services", async () => {
	const text = await readFile(new URL("../lib/index.js", import.meta.url), "utf8");
	assert.match(text, /const inject = \[[^\]]*"skills"[^\]]*\]/);
	assert.ok(text.includes("\"commands\""));
	assert.ok(text.includes("\"systemPrompt\""));
	assert.ok(text.includes("\"webServer\""));
	assert.ok(text.includes("\"tools\""));
});

test("lib/index.js registers Skills before existing services in apply()", async () => {
	const text = await readFile(new URL("../lib/index.js", import.meta.url), "utf8");
	const skillsIndex = text.indexOf("skillsPlugin.apply(ctx)");
	const commandsIndex = text.indexOf("ctx.commands.register");
	assert.ok(skillsIndex > 0, "expected Skills plugin apply call to be present");
	assert.ok(commandsIndex > 0, "expected commands.register to be present");
	assert.ok(skillsIndex < commandsIndex, "Skills loader should register before commands");
});

test("bundle has 6 candidates after sub-spec D", async () => {
	const root = join(dirname(fileURLToPath(import.meta.url)), "..");
	const skills = await loadBundledSkills({ pluginRoot: root });
	assert.equal(skills.length, 6, `expected exactly 6 Skills, got ${skills.length}`);
	const names = skills.map((skill) => skill.name).sort();
	assert.deepEqual(names, ["architect-feature", "decompose-spec", "grill-spec", "handoff-spec", "todo-status", "verify-feature"]);
});