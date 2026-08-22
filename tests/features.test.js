import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DEFAULT_CONFIG } from "../lib/config.js";
import { loadFeatureCatalog, parseFeature, serializeFeature } from "../lib/features.js";
import { workingTreeSnapshot } from "../lib/snapshot.js";

const PARENT = {
	id: "accounts",
	title: "Accounts",
	status: "active",
	parentId: null,
	summary: "Owns account identity and profile behavior.",
	scope: ["src/accounts/**"],
	documents: [{ level: "required", path: "README.md" }],
	acceptance: ["A user can see an account profile."],
	notes: "",
};

test("feature form values round-trip through canonical Markdown", () => {
	const content = serializeFeature(PARENT);
	const parsed = parseFeature(".blueprint/features/accounts.md", content);
	assert.deepEqual(parsed.issues, []);
	assert.equal(parsed.feature.id, "accounts");
	assert.equal(parsed.feature.summary, PARENT.summary);
	assert.deepEqual(parsed.feature.documents, PARENT.documents);
});

test("catalog builds hierarchy facts and required-document satisfaction", async () => {
	const root = await mkdtemp(join(tmpdir(), "blueprint-features-"));
	await mkdir(join(root, ".blueprint", "features"), { recursive: true });
	await writeFile(join(root, "README.md"), "# Project\n", "utf8");
	await writeFile(join(root, ".blueprint", "features", "accounts.md"), serializeFeature(PARENT), "utf8");
	await writeFile(join(root, ".blueprint", "features", "login.md"), serializeFeature({
		...PARENT,
		id: "login",
		title: "Login",
		parentId: "accounts",
		documents: [{ level: "required", path: "docs/login.md" }],
	}), "utf8");
	const catalog = await loadFeatureCatalog(await workingTreeSnapshot(root), DEFAULT_CONFIG);
	assert.equal(catalog.features.find((entry) => entry.id === "accounts").satisfaction, 100);
	assert.ok(catalog.features.find((entry) => entry.id === "login").satisfaction < 100);
	assert.equal(catalog.summary.missingRequiredDocuments, 1);
	assert.deepEqual(catalog.issues, []);
});

test("feature allocations survive a parent change because id stays stable while the file moves", () => {
	const initial = serializeFeature({
		...PARENT,
		id: "accounts",
		components: ["backend-api"],
	});
	const parsed = parseFeature(".blueprint/features/accounts.md", initial);
	assert.deepEqual(parsed.feature.components, ["backend-api"]);
	const renamed = initial.replace(/^Id: accounts$/m, "Id: accounts--identity");
	const reparsed = parseFeature(".blueprint/features/accounts--identity.md", renamed);
	assert.deepEqual(reparsed.feature.components, ["backend-api"]);
	assert.equal(reparsed.feature.id, "accounts--identity");
});
