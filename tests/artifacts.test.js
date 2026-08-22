import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deriveFeatureId, prepareFeatureArtifacts, previewFeatureIdentityMigration, applyFeatureIdentityMigration, resolveFeatureArtifacts, PREPARED_MARKER } from "../lib/artifacts.js";
import { initBlueprint } from "../lib/init.js";
import { saveBlueprintFeature, getBlueprintDashboard } from "../lib/web-api.js";
import { loadConfig } from "../lib/config.js";
import { loadFeatureCatalog } from "../lib/features.js";
import { workingTreeSnapshot } from "../lib/snapshot.js";

function input(overrides = {}) {
	return {
		localKey: "accounts",
		title: "Accounts",
		status: "planned",
		parentId: null,
		summary: "Owns account behavior.",
		scope: ["lib/accounts/**"],
		documents: [{ level: "required", path: "README.md" }],
		acceptance: ["Accounts are visible."],
		notes: "",
		...overrides,
	};
}

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "blueprint-artifacts-"));
	await initBlueprint(root);
	return root;
}

test("Host derives stable root and child ids from a confirmed local key", () => {
	assert.equal(deriveFeatureId(null, "accounts"), "accounts");
	assert.equal(deriveFeatureId("accounts", "profile"), "accounts--profile");
	assert.throws(() => deriveFeatureId(null, "123"), /start with a lowercase ASCII letter/);
	assert.throws(() => deriveFeatureId(null, "需求分析"), /start with a lowercase ASCII letter/);
});

test("Host prepares only the registered bilingual artifact set", async () => {
	const root = await fixture();
	const saved = await saveBlueprintFeature({ cwd: root, feature: input(), expectedHash: null });
	const created = await prepareFeatureArtifacts({ cwd: root, featureId: saved.featureId, expectedFeatureHash: saved.hash });
	assert.deepEqual(created.created.sort(), [
		".specs/proposed/accounts.md",
		".specs/proposed/accounts.zh.md",
		"docs/user/features/accounts.i18n.yaml",
		"docs/user/features/accounts.md",
		"docs/user/features/accounts.zh.md",
	].sort());
	assert.match(await readFile(join(root, ".specs", "proposed", "accounts.md"), "utf8"), new RegExp(PREPARED_MARKER));
	const dashboard = await getBlueprintDashboard(root);
	const feature = dashboard.catalog.features[0];
	assert.equal(feature.workflow.stage, "prepared");
	assert.equal(feature.artifacts.spec.en.file, ".specs/proposed/accounts.md");
	await mkdir(join(root, "docs", "user", "features"), { recursive: true });
	await writeFile(join(root, "docs", "user", "features", "account.md"), "# Stray\n", "utf8");
	const snapshot = await workingTreeSnapshot(root);
	const { config } = await loadConfig(snapshot);
	const catalog = await loadFeatureCatalog(snapshot, config);
	const descriptor = await resolveFeatureArtifacts({ snapshot, config, feature: catalog.features[0] });
	assert.equal(descriptor.brief.en.file, "docs/user/features/accounts.md");
	assert.notEqual(descriptor.brief.en.content, "# Stray\n");
});

test("identity migration previews exact paths, updates references, and invalidates approval", async () => {
	const root = await fixture();
	const saved = await saveBlueprintFeature({ cwd: root, feature: input({ localKey: "legacy", id: "legacy" }), expectedHash: null });
	const child = await saveBlueprintFeature({ cwd: root, feature: input({ localKey: "profile", id: "legacy--profile", parentId: "legacy", title: "Profile" }), expectedHash: null });
	await prepareFeatureArtifacts({ cwd: root, featureId: saved.featureId, expectedFeatureHash: saved.hash });
	await prepareFeatureArtifacts({ cwd: root, featureId: child.featureId, expectedFeatureHash: child.hash });
	await writeFile(join(root, ".blueprint", "approvals", "legacy.json"), "{}\n", "utf8");
	const result = await previewFeatureIdentityMigration({ cwd: root, featureId: "legacy", parentId: null, localKey: "accounts" });
	assert.equal(result.preview.targetId, "accounts");
	assert.deepEqual(result.preview.identities, [["legacy", "accounts"], ["legacy--profile", "accounts--profile"]].map(([from, to]) => ({ from, to })));
	assert.ok(result.preview.moves.some((entry) => entry.to === ".blueprint/features/accounts.md"));
	assert.equal(result.preview.approval.action, "invalidate");
	await applyFeatureIdentityMigration({ cwd: root, featureId: "legacy", parentId: null, localKey: "accounts", expectedPreviewHash: result.preview.previewHash });
	assert.match(await readFile(join(root, ".blueprint", "features", "accounts.md"), "utf8"), /^Id: accounts$/m);
	assert.match(await readFile(join(root, ".blueprint", "features", "accounts--profile.md"), "utf8"), /^Parent: accounts$/m);
	await assert.rejects(readFile(join(root, ".blueprint", "approvals", "legacy.json"), "utf8"), /ENOENT/);
});
