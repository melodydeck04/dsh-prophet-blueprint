import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

test("all DSH peers and client injections target 0.1.1-rc.2", async () => {
	const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
	const dshPeers = Object.entries(manifest.peerDependencies).filter(([name]) => name.startsWith("@deepseek-ai/dsh-"));
	assert.equal(dshPeers.length, 8);
	for (const [name, range] of dshPeers) assert.equal(range, "0.1.1-rc.2", name);
	assert.equal(manifest.peerDependencies["@deepseek-ai/cordis"], "4.0.1");
	assert.deepEqual(manifest.blueprintCompatibility, {
		profile: "web", dshRelease: "0.1.1-rc.2", officialReleaseRevision: "dsh-v0.1.1-rc.2 (b150a55)",
		verifiedNode: "22.23.1", hostComposition: "Cordis function plugin",
		clientComposition: "conversation.view via slots.inject/register", verifiedAt: "2026-08-27",
	});
	assert.deepEqual(manifest.dsh.client.inject, [
		"@deepseek-ai/dsh-client-runtime",
		"@deepseek-ai/dsh-client-ui-primitives",
		"@deepseek-ai/dsh-client-ui-conversation",
		"@deepseek-ai/dsh-client-ui-input-trigger",
	]);
});

test("the local web profile links this plugin into the official web bundle when present", async (context) => {
	const profile = join(process.env.USERPROFILE ?? "", ".dsh", "profiles", "web", "package.json");
	try { await stat(profile); } catch { context.skip("local DSH web profile is not installed"); return; }
	const manifest = JSON.parse(await readFile(profile, "utf8"));
	assert.match(manifest.dependencies["@dsh-plugins/design-blueprint"], /^link:/);
	assert.deepEqual(manifest.dsh.profile.bundles, ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "@dsh-plugins/design-blueprint"]);
});

test("client uses the frozen input-trigger source contract without private composer APIs", async () => {
	const code = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	assert.match(code, /trigger:"@"/);
	assert.match(code, /async candidates\(session,\{query,signal\}\)/);
	assert.match(code, /onPick\(\{candidate\}\)/);
	assert.match(code, /codec:\{clipboardText:/);
	assert.match(code, /async serialize\(ref\)/);
	assert.doesNotMatch(code, /remote\.commands|workspaces\.archiveSession|sessions\.binding|session\.prompt/);
});
