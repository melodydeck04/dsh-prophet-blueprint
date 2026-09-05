import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initBlueprint } from "../lib/init.js";

const execute = promisify(execFile);
const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "cli.js");

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "blueprint-cli-spec-show-"));
	await initBlueprint(root);
	const specDir = join(root, ".specs/proposed");
	await mkdir(specDir, { recursive: true });
	const specPath = join(specDir, "my-spec.md");
	const content = `# Spec: My test\n\nStatus: proposed\nFeature: foo\n\n## Problem\n\nA test.\n\n## Scope\n\n- allow: \`lib/foo.js\`\n\n## Proposal\n\nDo the thing.\n\n## Alternatives considered\n\nNone.\n\n## Acceptance criteria\n\n- AC-1: works.\n\n## Verification\n\n- AC-1: manual.\n\n## Risks\n\nNone.\n`;
	await writeFile(specPath, content, "utf8");
	return { root, specPath };
}

test("spec show prints content with one-based line numbers", async () => {
	const { root, specPath } = await fixture();
	try {
		const { stdout } = await execute(process.execPath, [cli, "spec", "show", "--spec", ".specs/proposed/my-spec.md"], { cwd: root });
		assert.match(stdout, /^   1  # Spec: My test/m);
		assert.match(stdout, /^   2  /m);
		assert.match(stdout, /^   3  Status: proposed/m);
		assert.match(stdout, /\n$/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("spec show without --line-numbers strips the gutter", async () => {
	const { root, specPath } = await fixture();
	try {
		const { stdout } = await execute(process.execPath, [cli, "spec", "show", "--spec", ".specs/proposed/my-spec.md", "--no-line-numbers"], { cwd: root });
		assert.doesNotMatch(stdout, /^   1  /m);
		assert.match(stdout, /^# Spec: My test/m);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("spec show --json returns file, lineCount, byteCount, content", async () => {
	const { root, specPath } = await fixture();
	try {
		const { stdout } = await execute(process.execPath, [cli, "spec", "show", "--spec", ".specs/proposed/my-spec.md", "--json"], { cwd: root });
		const parsed = JSON.parse(stdout);
		assert.equal(parsed.file, ".specs/proposed/my-spec.md");
		assert.equal(typeof parsed.lineCount, "number");
		assert.equal(typeof parsed.byteCount, "number");
		assert.ok(parsed.lineCount > 5);
		assert.match(parsed.content, /# Spec: My test/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("spec show with a missing file exits non-zero with a clear error", async () => {
	const { root } = await fixture();
	try {
		let result = null;
		let thrown = null;
		try {
			result = await execute(process.execPath, [cli, "spec", "show", "--spec", ".specs/proposed/nope.md"], { cwd: root });
		} catch (e) {
			thrown = e;
		}
		const stderr = thrown?.stderr ?? result?.stderr ?? "";
		const code = thrown?.code ?? result?.code ?? 1;
		assert.notEqual(code, 0);
		assert.match(stderr, /spec file not found/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("spec show rejects content containing ESC bytes unless --json", async () => {
	const { root, specPath } = await fixture();
	try {
		const malicious = "# Spec: evil\nStatus: proposed\nFeature: foo\n## Problem\n\n\u001b[2J\u001b[H\n\n## Scope\n\n- allow: x\n\n## Proposal\n\np\n\n## Alternatives considered\n\nn\n\n## Acceptance criteria\n\n- AC-1: a.\n\n## Verification\n\n- AC-1: manual.\n\n## Risks\n\nn\n";
		await writeFile(specPath, malicious, "utf8");
		let result = null;
		let thrown = null;
		try {
			result = await execute(process.execPath, [cli, "spec", "show", "--spec", ".specs/proposed/my-spec.md"], { cwd: root });
		} catch (e) {
			thrown = e;
		}
		const stderr = thrown?.stderr ?? result?.stderr ?? "";
		const code = thrown?.code ?? result?.code ?? 0;
		assert.notEqual(code, 0);
		assert.match(stderr, /ESC bytes/);
		// --json allows the ESC bytes through
		let jsonResult = null;
		let jsonThrown = null;
		try {
			jsonResult = await execute(process.execPath, [cli, "spec", "show", "--spec", ".specs/proposed/my-spec.md", "--json"], { cwd: root });
		} catch (e) {
			jsonThrown = e;
		}
		assert.equal(jsonThrown, null);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
