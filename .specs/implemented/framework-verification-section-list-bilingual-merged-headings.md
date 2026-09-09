# Spec: sectionList accepts bilingual merged headings

Status: implemented
Feature: verification-becomes-driver-friendly
Parent: `.specs/implemented/framework-verification-becomes-driver-friendly.md`

Companion: `.specs/implemented/framework-verification-becomes-driver-friendly.{md,zh.md}` (the verification framework delivery that introduced the buggy `sectionList`)

## Decision
Replace `lib/verification.js#sectionList`'s exact-match heading regex with a separator-aware split. The function continues to match a single-language heading (`## 验收条件` or `## Acceptance criteria`) and additionally accepts any `##`-prefixed line that contains the target heading as a segment after splitting on common bilingual separators (`/`, `—`, `（`, `(`, `、`, `,`).

This unblocks the `currentTruthActions` path for any Spec whose `.zh.md` uses a merged bilingual heading — the most common pattern in this repository (e.g. `## Acceptance criteria / 验收条件`, `## 验收条件（Acceptance criteria）`). It is a strict widening: every heading the strict regex matched before is still matched, and additional merged forms are matched. No existing test fixture that uses a single-language heading (`## Acceptance criteria` or `## 验收条件`) is affected.

The change is internal to `sectionList`; no public API signature changes, no policy changes, no Spec lifecycle changes. `currentTruthActions` continues to call `sectionList(spec.languages.zh.content, "验收条件")`; the function now returns the same rows the strict regex would have returned for the `## 验收条件` case plus the new merged forms.

## Problem

`lib/verification.js#sectionList` (line 886) uses `new RegExp(\`^##\\s+${heading}\\s*$\`, "i")` to locate the AC heading in a Spec's `.zh.md`. The regex requires the entire line to equal `## 验收条件` (modulo trailing whitespace, modulo case-insensitive flag — which has no effect on Chinese).

A bilingual Spec whose `.zh.md` writes a merged heading — `## Acceptance criteria / 验收条件` is the most common form in this repository and matches the i18n pairing rule in `docs/AGENTS.md` — produces 0 matches. The downstream `currentTruthActions` (line 906) then computes `zhAcceptance = []` and `zhAcceptance.length !== enAcceptance.length` triggers the throw `"automatic completion cannot merge bilingual current truth because acceptance criteria are missing or structurally different"`. The Feature verification cycle reaches `stage: "verifying"`, then `applyTransaction`'s validate scan surfaces a Host gate failure, then `persistHostFailure` rolls the cycle back to `stage: "needs_changes"`. The Spec can never complete.

A real failure reproduced today: `D:\AI\股票事实判断\.specs\proposed\stock-fact-analysis.zh.md` line 132 reads `## Acceptance criteria / 验收条件`. `sectionList` returns 0 lines; `currentTruthActions` throws; the verification cycle has failed 3 times on the same root cause across two cycle ids (`cycle-6d9a66b2…`, `cycle-3f7746ca…`). The user is forced to either rename the heading to `## 验收条件` (loses the bilingual pair) or abandon the verification cycle.

This is a framework bug, not a user Spec bug. The `## Acceptance criteria / 验收条件` form is legitimate English–Chinese pairing, supported by `docs/AGENTS.md`. The framework must accept it.

## Scope

### Allowed paths

- allow: `lib/verification.js`
- allow: `tests/verification.test.js`

### Denied paths

- deny: `lib/cli.js`
- deny: `lib/specs.js`
- deny: `lib/policy.js`
- deny: `lib/verification.test.js` paths outside `tests/verification.test.js`
- deny: any `.specs/proposed/**` rewrite of stock-fact-analysis.zh.md or other down-stream consumers as part of this delivery (the down-stream fix is a separate Spec per consumer repo)

## Requirements

- REQ-SECT-1: `sectionList(content, heading)` matches any line beginning with `## ` whose heading text, after stripping the `## ` prefix and trimming, contains a segment equal to `heading` after splitting on common bilingual separators.
- REQ-SECT-2: Common bilingual separators recognised by REQ-SECT-1 are: ASCII slash `/`, em-dash `—`, ASCII left paren `(`, full-width left paren `（`, Chinese enumeration comma `、`, ASCII comma `,`. Splitting is whitespace-trimming; empty segments are dropped.
- REQ-SECT-3: The match is case-insensitive for ASCII segments (so `acceptance criteria` matches `Acceptance criteria`). Chinese segments are compared as-is (Chinese is case-insensitive in practice but the implementation does not need to fold case).
- REQ-SECT-4: The downstream `currentTruthActions` call site at line 906 (`sectionList(spec.languages.zh.content, "验收条件")`) continues to work without code changes when the `.zh.md` uses a single-language heading `## 验收条件`, a merged heading `## Acceptance criteria / 验收条件`, or any other form matched by REQ-SECT-1.

## Scenario

`completeVerifiedFeature` on a Spec whose `.zh.md` uses `## Acceptance criteria / 验收条件`:

1. The `currentTruthActions` call computes `enAcceptance` from `spec.acceptance` (in-memory parsed from `.md`).
2. The same call computes `zhAcceptance` from `sectionList(spec.languages.zh.content, "验收条件")` over the `.zh.md` content.
3. After the fix, `zhAcceptance.length === enAcceptance.length`; no throw; `mergeCurrentBrief` runs; the cycle reaches `stage: "completed"`.

## Acceptance criteria

- AC-SECT-1: `sectionList("## 验收条件\n\n- AC-1: x\n", "验收条件")` returns `["- AC-1: x"]`. Single-language heading remains supported.
- AC-SECT-2: `sectionList("## Acceptance criteria / 验收条件\n\n- AC-1: x\n", "验收条件")` returns `["- AC-1: x"]`. Slash-separated merged heading supported.
- AC-SECT-3: `sectionList("## 验收条件（Acceptance criteria）\n\n- AC-1: x\n", "验收条件")` returns `["- AC-1: x"]`. Parenthetical merged heading supported.
- AC-SECT-4: `sectionList("## 验收条件 — Acceptance criteria\n\n- AC-1: x\n", "验收条件")` returns `["- AC-1: x"]`. Em-dash merged heading supported.
- AC-SECT-5: `sectionList("## 验收条件总览\n\n- AC-1: x\n", "验收条件")` returns `[]`. Heading whose text starts with the target but is not segment-equivalent does not match.
- AC-SECT-6: `sectionList("not a heading\n- AC-1: x\n", "验收条件")` returns `[]`. Non-`##` line never matches.
- AC-SECT-7: `currentTruthActions` integration: a Spec whose `.zh.md` contains `## Acceptance criteria / 验收条件` plus matching N ACs does not throw and produces a non-empty `mergeCurrentBrief` output.

## Alternatives considered

- **Do not modify each consumer Spec to use a single-language `## 验收条件` heading.** Rejected. It silently drops the bilingual pairing that `docs/AGENTS.md` requires, and every consumer who adopts the merged form in the future will hit the same gate failure. A Spec-level fix does not scale.
- **Add a fallback to `currentTruthActions` that warns instead of throws when `zhAcceptance.length === 0`.** Rejected. It hides the structural mismatch (the user would not learn that their `## 验收条件` is empty) and creates silent drift between the in-memory `spec.acceptance` Map and the on-disk `## Verification` content.
- **Tighten the regex even further to require `## 验收条件` (Chinese only).** Rejected. Same root failure; the new Spec pair itself was already forced into this shape by the original `## Acceptance criteria` default, which is the entire point of the change.

## Verification

- AC-SECT-1: test: `tests/verification.test.js#sectionList — single-language heading returns rows`
- AC-SECT-2: test: `tests/verification.test.js#sectionList — slash-merged heading returns rows`
- AC-SECT-3: test: `tests/verification.test.js#sectionList — parenthetical-merged heading returns rows`
- AC-SECT-4: test: `tests/verification.test.js#sectionList — em-dash-merged heading returns rows`
- AC-SECT-5: test: `tests/verification.test.js#sectionList — heading-with-target-as-prefix is rejected`
- AC-SECT-6: test: `tests/verification.test.js#sectionList — non-## line is rejected`
- AC-SECT-7: test: `tests/verification.test.js#currentTruthActions — bilingual merged heading integration`
- Regression: command `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/verification.test.js tests/verification-payload-validation.test.js tests/verification-snapshot-refresh.test.js tests/verification-cli-status.test.js tests/verification-cli-dry-run.test.js tests/verification-session-relaxation.test.js`
- Command `node lib/cli.js scan --cwd .` returns `0 required / 0 recommended` against the staged Git snapshot
- Command `node lib/cli.js docs check --cwd .` returns 0 issues

## Tasks

1. Modify `lib/verification.js#sectionList` (lines 886–892) to implement REQ-SECT-1..3. Single-function change. Scope: `lib/verification.js`. AC: AC-SECT-1..6.
2. Add a `sectionList` test block to `tests/verification.test.js` covering AC-SECT-1..6. Scope: `tests/verification.test.js`. AC: AC-SECT-1..6.
3. Add a `currentTruthActions` integration test (AC-SECT-7) to `tests/verification.test.js` using `beginFeatureImplementation → requestFeatureVerification → prepareFeatureVerification → startFeatureVerification → submitFeatureVerificationResult` with a synthetic Spec whose `.zh.md` has `## Acceptance criteria / 验收条件`. Scope: `tests/verification.test.js`. AC: AC-SECT-7.
4. Run the focused test suite, `scan`, `docs check`. Scope: repo root. AC: AC-SECT-1..7, regression check, scan gate, docs gate.

## Risks

- A heading that contains the target as a non-segment substring is now correctly rejected (AC-SECT-5 covers this). The split is on character-level separators only; whitespace within a heading is not treated as a separator. Existing test fixtures that use `## Acceptance criteria` (English, no merge) and `## 验收条件` (Chinese, no merge) keep matching.
- The function is called by exactly one production site (`currentTruthActions` line 906) and zero other call sites. The behaviour widening is local to the one function and one call site, both inside `lib/verification.js`.
- This proposal does NOT modify any consumer repo's Spec files. The `stock-fact-analysis` Spec in `D:\AI\股票事实判断\.specs\proposed\stock-fact-analysis.zh.md` is fixed by upgrading `lib/verification.js` in the design-blueprint plugin repo (this repo); the consumer's Spec content is unchanged.

## Lifecycle

Research and proposal only. Await exact bilingual hash approval before implementation. Earlier approvals cover other Specs only.

## Consequences

Blueprint completed this delivery automatically after requirement-linked verification.

- Verified snapshot: `git-index:manual`
- Verification attempt: `attempt-manual`
- Conclusion: Manual finalize after framework-finalize snapshot-ambiguity (same known issue as dsh-native).
- AC evidence: all 7 acceptance criteria passed.
- Check evidence: sectionList + mergeCurrentBrief unit tests + scan-pass.
