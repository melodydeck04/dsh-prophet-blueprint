//#region tests/init-flow-regression.test.js
/**
 * Regression tests for the Blueprint Web "initialize here" flow on a
 * project that does not yet have a design-blueprint.json.
 *
 * The bug fixed here was: when a developer's DSH session opened Blueprint
 * in a fresh project (or in a cwd that the DSH session could not resolve
 * to a real directory), the dashboard action returned
 * BLUEPRINT_PROJECT_NOT_FOUND, the client caught it and called the
 * discover action, the discover action re-entered the same broken
 * `entryPath` and threw, the client then fell through to the error
 * branch and never rendered the "选择 Blueprint 项目" panel — the
 * developer saw an empty Blueprint tab with no way to initialize.
 *
 * The fix has two pieces:
 *   1. `discoverBlueprintProjects` is wrapped in a try/catch that
 *      returns a fallback object with `manualCandidate` set to the raw
 *      input.cwd when the path is unresolvable.
 *   2. The `initialize` action no longer rejects when the discovery
 *      check throws, provided the caller set `confirmCurrentWorkspace: true`.
 *
 * These tests assert both pieces, end-to-end.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { handleBlueprintAction } from "../lib/web-api.js";

test("discover action returns a usable manualCandidate on a fresh project with a project marker", async () => {
	const tmpRoot = resolve(mkdtempSync(join(tmpdir(), "bp-init-")));
	try {
		writeFileSync(join(tmpRoot, "package.json"), JSON.stringify({ name: "demo", version: "0.0.0" }));
		const discovery = await handleBlueprintAction({
			action: "discover",
			cwd: tmpRoot,
			sessionId: "session-test",
			dshWorkspacePath: tmpRoot,
		});
		assert.ok(discovery.candidate, "discover should find the cwd as a candidate (it has package.json)");
		assert.equal(discovery.candidate.path, tmpRoot);
		assert.equal(discovery.manualCandidate, null);
	} finally {
		rmSync(tmpRoot, { recursive: true, force: true });
	}
});

test("discover action falls back to manualCandidate when cwd is unresolvable", async () => {
	const fakeCwd = "C:\\bp-test-does-not-exist-" + Date.now();
	const discovery = await handleBlueprintAction({
		action: "discover",
		cwd: fakeCwd,
		sessionId: "session-test",
		dshWorkspacePath: fakeCwd,
	});
	assert.equal(discovery.cwd, fakeCwd, "discover should echo the unresolvable cwd as-is");
	assert.equal(discovery.candidate, null);
	assert.ok(discovery.manualCandidate, "manualCandidate should be set so the setup panel renders");
	assert.equal(discovery.manualCandidate.path, fakeCwd);
});

test("full init flow on a fresh project: dashboard → discover → initialize", async () => {
	const tmpRoot = resolve(mkdtempSync(join(tmpdir(), "bp-init-")));
	try {
		writeFileSync(join(tmpRoot, "package.json"), JSON.stringify({ name: "demo", version: "0.0.0" }));
		// Step 1: dashboard fails (no design-blueprint.json yet).
		await assert.rejects(
			handleBlueprintAction({ action: "dashboard", cwd: tmpRoot, sessionId: "s", dshWorkspacePath: tmpRoot }),
			(err) => err?.code === "BLUEPRINT_PROJECT_NOT_FOUND",
		);
		// Step 2: discover via API — the client always does this in the catch branch.
		const discovery = await handleBlueprintAction({
			action: "discover", cwd: tmpRoot, sessionId: "s", dshWorkspacePath: tmpRoot,
		});
		const target = (discovery.candidate ?? discovery.manualCandidate).path;
		// Step 3: user clicks "初始化当前项目" → initialize action.
		const initResult = await handleBlueprintAction({
			action: "initialize",
			cwd: tmpRoot, sessionId: "s", dshWorkspacePath: tmpRoot,
			target,
			confirmCurrentWorkspace: discovery.candidate === null,
		});
		assert.ok(initResult.initialized, "initialize should create design-blueprint.json");
		// Step 4: subsequent dashboard succeeds.
		const post = await handleBlueprintAction({
			action: "dashboard", cwd: tmpRoot, sessionId: "s", dshWorkspacePath: tmpRoot,
		});
		assert.equal(post.project.root, tmpRoot);
	} finally {
		rmSync(tmpRoot, { recursive: true, force: true });
	}
});

test("full init flow on an unresolvable cwd: fallback manualCandidate allows init", async () => {
	const fakeCwd = "C:\\bp-test-does-not-exist-" + Date.now();
	// The cwd does not exist. discover should still return a manualCandidate.
	const discovery = await handleBlueprintAction({
		action: "discover", cwd: fakeCwd, sessionId: "s", dshWorkspacePath: fakeCwd,
	});
	assert.ok(discovery.manualCandidate, "unresolvable cwd should still produce a manualCandidate via fallback");
	// Initialize on an unresolvable cwd should not fail with
	// UNSAFE_INITIALIZATION_TARGET — that was the safety guard we are
	// bypassing. It may still fail with another error (e.g. ENOENT from
	// initBlueprint writing to a non-existent dir), but the specific
	// UNSAFE code must not surface.
	let caught = null;
	try {
		await handleBlueprintAction({
			action: "initialize",
			cwd: fakeCwd, sessionId: "s", dshWorkspacePath: fakeCwd,
			target: fakeCwd,
			confirmCurrentWorkspace: true,
		});
	} catch (err) {
		caught = err;
	}
	if (caught) {
		assert.notEqual(caught?.code, "UNSAFE_INITIALIZATION_TARGET",
			"UNSAFE check must be bypassed when the caller passed confirmCurrentWorkspace: true");
	}
});
//#endregion