import test from "node:test";
import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { confirmTranslationPair, gitBlobHash, inspectDocumentation } from "../lib/docs.js";
import { initBlueprint } from "../lib/init.js";
import { loadConfig } from "../lib/config.js";
import { workingTreeSnapshot } from "../lib/snapshot.js";

const execFile = promisify(execFileCallback);

async function inspect(root) {
	const snapshot = await workingTreeSnapshot(root);
	const { config } = await loadConfig(snapshot);
	return inspectDocumentation(snapshot, config);
}

test("git blob hashes match git hash-object", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-doc-hash-"));
	const content = "Git blob identity\n";
	await writeFile(join(root, "sample.md"), content, "utf8");
	const { stdout } = await execFile("git", ["hash-object", join(root, "sample.md")], { windowsHide: true });
	assert.equal(gitBlobHash(content), stdout.trim());
});

test("initialization creates confirmed policy and README pairs", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-doc-init-"));
	const result = await initBlueprint(root);
	assert.ok(result.created.includes("docs/AGENTS.md"));
	assert.ok(result.created.includes(".dsh/skills/blueprint-doc-standards/SKILL.md"));
	assert.ok(result.created.includes(".dsh/skills/blueprint-translate-docs/SKILL.md"));
	const docs = await inspect(root);
	assert.deepEqual(docs.summary, { enabled: true, total: 3, ok: 3, missing: 0, outOfSync: 0 });
	assert.equal(docs.issues.length, 0);
});

test("an existing unpaired README is preserved and reported as migration advice", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-doc-preserve-"));
	await writeFile(join(root, "README.md"), "# Existing product\n", "utf8");
	await initBlueprint(root);
	assert.equal(await readFile(join(root, "README.md"), "utf8"), "# Existing product\n");
	const docs = await inspect(root);
	const readme = docs.pairs.find((pair) => pair.owner === "README.md");
	assert.equal(readme.status, "missing");
	assert.equal(readme.issues[0].severity, "recommended");
});

test("confirmation refuses structural drift and records reviewed synchronized edits", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-doc-confirm-"));
	await initBlueprint(root);
	await writeFile(join(root, "README.zh.md"), `${await readFile(join(root, "README.zh.md"), "utf8")}\n## Extra\n`, "utf8");
	await assert.rejects(() => confirmTranslationPair(root, "README.zh.md"), /structures do not match/);
	const english = (await readFile(join(root, "README.md"), "utf8")).replace("public purpose", "reviewed public purpose");
	const chinese = (await readFile(join(root, "README.zh.md"), "utf8")).replace("\n## Extra\n", "").replace("公开的用途", "经审阅的公开用途");
	await writeFile(join(root, "README.md"), english, "utf8");
	await writeFile(join(root, "README.zh.md"), chinese, "utf8");
	await confirmTranslationPair(root, "README.md");
	const docs = await inspect(root);
	assert.equal(docs.pairs.find((pair) => pair.owner === "README.md").status, "ok");
});
