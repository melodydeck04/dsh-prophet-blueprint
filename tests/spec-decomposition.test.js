import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateSpec, loadThresholds, buildDecompositionTemplate } from "../lib/spec-decomposition.js";

async function tempRoot() {
	const root = await mkdtemp(join(tmpdir(), "blueprint-spec-decomp-"));
	return root;
}

test("loadThresholds returns defaults when config is null", () => {
	const t = loadThresholds(null);
	assert.equal(t.maxReq, 8);
	assert.equal(t.maxScopePaths, 5);
	assert.equal(t.maxLines, 1500);
});

test("loadThresholds merges overrides", () => {
	const t = loadThresholds({ maxReq: 20, maxLines: 3000 });
	assert.equal(t.maxReq, 20);
	assert.equal(t.maxLines, 3000);
	assert.equal(t.maxScopePaths, 5);
});

test("evaluateSpec returns ok for a small Spec", () => {
	const content = `# Spec: tiny\n\n## Problem\n\nTiny.\n\n## Scope\n\n- allow: \`lib/foo.js\`\n\n## Proposal\n\nTiny.\n\n## Alternatives considered\n\nNo.\n\n## Acceptance criteria\n\n- AC-1: tiny works.\n\n## Verification\n\n- AC-1: manual.\n\n## Risks\n\nNone.\n`;
	const result = evaluateSpec({ file: ".specs/proposed/tiny.md", content, config: null });
	assert.equal(result.ok, true);
	assert.equal(result.violations.length, 0);
	assert.equal(result.suggestion, null);
});

test("evaluateSpec flags over-sized REQ count with severity-aware thresholds", () => {
	const reqs = Array.from({ length: 10 }, (_, i) => `- REQ-${i + 1}: foo`).join("\n");
	const content = `# Spec: big\n\n## Problem\n\nBig.\n\n## Scope\n\n- allow: \`lib/foo.js\`\n\n## Proposal\n\nBig.\n\n## Alternatives considered\n\nNo.\n\n## Acceptance criteria\n\n- AC-1: works.\n\n## Verification\n\n- AC-1: manual.\n\n## Risks\n\nNone.\n\n## Requirements\n\n${reqs}\n`;
	const result = evaluateSpec({ file: ".specs/proposed/big.md", content, config: null });
	assert.equal(result.ok, false);
	assert.ok(result.violations.some((v) => v.check === "spec-decomposition.req-count"));
	assert.ok(result.suggestion);
	assert.ok(result.suggestion.subSpecCount >= 2 && result.suggestion.subSpecCount <= 4);
});

test("evaluateSpec counts allow-list entries inside ## Scope ### Allowed paths only", () => {
	const content = `# Spec: paths\n\n## Problem\n\nP.\n\n## Scope\n\n### Allowed paths\n\n- allow: \`a.js\`\n- allow: \`b.js\`\n- allow: \`c.js\`\n- allow: \`d.js\`\n- allow: \`e.js\`\n- allow: \`f.js\`\n\n### Denied paths\n\n- deny: \`x.js\`\n- deny: \`y.js\`\n- deny: \`z.js\`\n\n## Proposal\n\nP.\n\n## Alternatives considered\n\nP.\n\n## Acceptance criteria\n\n- AC-1: P.\n\n## Verification\n\n- AC-1: P.\n\n## Risks\n\nNone.\n`;
	const result = evaluateSpec({ file: ".specs/proposed/paths.md", content, config: null });
	assert.equal(result.ok, false);
	assert.ok(result.violations.some((v) => v.check === "spec-decomposition.scope-paths"));
	assert.equal(result.observed.scopePathCount, 6);
});

test("evaluateSpec flags long Specs", () => {
	const padding = Array.from({ length: 1600 }, () => "# filler").join("\n");
	const content = `# Spec: long\n\n## Problem\n\nL.\n\n## Scope\n\n- allow: \`a.js\`\n\n## Proposal\n\nL.\n\n## Alternatives considered\n\nL.\n\n## Acceptance criteria\n\n- AC-1: L.\n\n## Verification\n\n- AC-1: L.\n\n## Risks\n\nL.\n\n${padding}\n`;
	const result = evaluateSpec({ file: ".specs/proposed/long.md", content, config: null });
	assert.equal(result.ok, false);
	assert.ok(result.violations.some((v) => v.check === "spec-decomposition.line-count"));
});

test("buildDecompositionTemplate returns parent + sub-Specs with correct slice ranges", () => {
	const reqs = Array.from({ length: 10 }, (_, i) => `- REQ-${i + 1}: foo`).join("\n");
	const content = `# Spec: split-me\n\nStatus: proposed\nFeature: foo\n\n## Problem\n\nSplit me.\n\n## Scope\n\n### Allowed paths\n\n- allow: \`lib/foo.js\`\n\n### Denied paths\n\n- deny: \`bar.js\`\n\n## Proposal\n\nDo the thing.\n\n## Alternatives considered\n\nNothing.\n\n## Acceptance criteria\n\n- AC-1: works.\n\n## Verification\n\n- AC-1: manual.\n\n## Risks\n\nNone.\n\n## Requirements\n\n${reqs}\n`;
	const evaluate = evaluateSpec({ file: ".specs/proposed/split-me.md", content, config: null });
	assert.equal(evaluate.ok, false);
	const template = buildDecompositionTemplate({ file: ".specs/proposed/split-me.md", content, suggestion: evaluate.suggestion, parentFeature: "foo" });
	assert.equal(template.parent.kind, "parent");
	assert.match(template.parent.body, /Status: proposed/);
	assert.match(template.parent.body, /Feature: foo/);
	assert.match(template.parent.body, /## Sub-specs/);
	assert.equal(template.subSpecs.length, evaluate.suggestion.subSpecCount);
	for (let i = 0; i < template.subSpecs.length; i += 1) {
		const sub = template.subSpecs[i];
		assert.equal(sub.kind, "subSpec");
		assert.equal(sub.index, i);
		assert.match(sub.body, /## Acceptance criteria/);
	}
});
