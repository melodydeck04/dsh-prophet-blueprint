# Spec: refine-time Spec auto-decomposition gate

Status: implemented
Feature: spec-governance

## Problem

`design-blueprint scan` already flags oversized proposed Specs with a `decomposition-contract` check, but the gate fires **after** the Spec is written. The assistant that produced the Spec has already spent the budget; the developer learns the spec was too big only after a manual review, a re-write, and a re-approval cycle. Refine should reject the patch during the assistant's first attempt, before any file write, so the assistant is forced to produce a parent + sub-Specs patch instead of one oversized draft.

Phase 2's `lib/spec-decomposition.js` already implements the detector and the template builder. This Spec wires that detector into `lib/assistant-actions.js` so `previewAssistantSpecPatch` and `applyAssistantSpecPatch` refuse a patch whose resulting English Spec would cross the same thresholds `scan` later enforces.

## Scope

### Allowed paths

- allow: `docs/user/features/spec-auto-decompose-at-refine.md`
- allow: `docs/user/features/spec-auto-decompose-at-refine.zh.md`
- allow: `docs/user/features/spec-auto-decompose-at-refine.i18n.yaml`

### Denied paths

- deny: `lib/scan.js`
- deny: `lib/web-api.js`
- deny: `lib/orchestration.js`
- deny: `lib/verification.js`
- deny: `lib/chat-commands.js`
- deny: `lib/client.js`
- deny: `lib/workflow.js`
- deny: `lib/specs.js`
- deny: `lib/policy.js`
- deny: `lib/config.js`
- deny: `lib/features.js`
- deny: `lib/architecture.js`
- deny: `lib/artifacts.js`
- deny: `lib/reconciliation.js`
- deny: `lib/snapshot.js`
- deny: `lib/project-binding.js`
- deny: `lib/version.js`
- deny: `lib/stamps.js`
- deny: `lib/path-utils.js`
- deny: `lib/docs.js`
- deny: `lib/init.js`
- deny: `lib/project-root.js`
- deny: `lib/project-discovery.js`
- deny: `lib/invariant.js`
- deny: `lib/spec-decomposition.js`
- deny: `lib/cli.js`
- deny: `lib/todo-store.js`
- deny: `lib/spec-todos.js`
- deny: `lib/todo-events.js`
- deny: `.blueprint/approvals/**`
- deny: `.blueprint/verifications/**`
- deny: `.specs/**` outside this Spec pair
- deny: `docs/i18n/**`
- deny: `design-blueprint.json` default or authority sections

## Decision
### Gate inside `patchFacts`

After the existing `parseSpec(...).issues.filter(required)` check, the gate calls `evaluateSpec({ file, content: specEn, config })` from `lib/spec-decomposition.js`. If the call returns `ok === false`, the gate throws an error whose message names:

- the exact threshold that fired (e.g., "Spec has 12 REQ-* entries; threshold is 8"),
- the suggestion shape from `suggestion` (`subSpecCount: 4`, plus REQ ranges), and
- a one-line pointer to `design-blueprint spec decompose <spec.md>` for manual exploration.

The throw happens in both `previewAssistantSpecPatch` and `applyAssistantSpecPatch`, since both route through `patchFacts`. Because `applyAssistantSpecPatch` runs `patchFacts` **before** the temp-file rename, no filesystem change occurs when the gate fires.

### Thresholds

The gate reads `config.decomposition` (loaded by `loadConfig`) and uses `loadThresholds` from `lib/spec-decomposition.js` to fall back to the defaults `maxReq: 8`, `maxScopePaths: 5`, `maxLines: 1500`. The same config key already drives the `decomposition-contract` scan check, so a maintainer who tunes the threshold in `design-blueprint.json` gets one consistent value across refine, scan, and CLI.

### Error shape

The thrown error is an `Error` with `.code = "SPEC_TOO_BIG_FOR_REFINEMENT"`, `.thresholds = { maxReq, maxScopePaths, maxLines }`, `.observed = { reqCount, scopePathCount, lineCount }`, and `.suggestion` carrying `{ subSpecCount, allocations: [{ index, reqStart, reqEnd, reqCount }] }`. The CLI and the Web dashboard's `assistant-spec-preview` action surface those fields; the assistant that produced the patch can read them and re-draft.

The existing `Error: the proposed English Spec has N required validation issue(s)` message format stays intact; the new gate is one more check on the same path.

## Acceptance criteria

- AC-AR-001: `applyAssistantSpecPatch` with an English Spec body containing 9 REQ-* entries throws `Error` whose `.code === "SPEC_TOO_BIG_FOR_REFINEMENT"`; the message names the threshold and the suggestion. [surface=api; moment=terminal; evidence=contract-integration]
- AC-AR-002: `previewAssistantSpecPatch` with the same oversized body throws the same error and does not advance to a filesystem write. [surface=api; moment=terminal; evidence=contract-integration]
- AC-AR-003: A Spec with REQ count exactly at the configured `maxReq` passes the gate (the threshold is `>` not `>=`). [surface=api; moment=terminal; evidence=contract-integration]
- AC-AR-004: A Spec whose only violation is `maxLines` is also rejected by the gate and reports `lineCount` in the observed block. [surface=api; moment=terminal; evidence=contract-integration]
- AC-AR-005: The gate's `thresholds` field on the thrown error matches the values loaded from `config.decomposition` when the maintainer overrides them in `design-blueprint.json`. [surface=repository; moment=static; evidence=static-unit]
- AC-AR-006: `applyAssistantSpecPatch` rejects the patch before any temp-file rename; the original Spec file on disk is unchanged after the throw. [surface=api; moment=terminal; evidence=contract-integration]
- AC-AR-007: All existing tests in `tests/*.test.js` continue to pass after the change. [surface=cli; moment=terminal; evidence=contract-integration]

## Verification

- AC-AR-001: test `tests/assistant-actions-decomposition.test.js` [surface=api; moment=terminal; evidence=contract-integration]
- AC-AR-002: test `tests/assistant-actions-decomposition.test.js` [surface=api; moment=terminal; evidence=contract-integration]
- AC-AR-003: test `tests/assistant-actions-decomposition.test.js` [surface=api; moment=terminal; evidence=contract-integration]
- AC-AR-004: test `tests/assistant-actions-decomposition.test.js` [surface=api; moment=terminal; evidence=contract-integration]
- AC-AR-005: test `tests/assistant-actions-decomposition.test.js` [surface=repository; moment=static; evidence=static-unit]
- AC-AR-006: test `tests/assistant-actions-decomposition.test.js` [surface=api; moment=terminal; evidence=contract-integration]
- AC-AR-007: command `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js"` [surface=cli; moment=terminal; evidence=contract-integration]

## Risks

- The gate is fire-once: the assistant that receives the throw must re-draft a decomposition patch. If the assistant ignores the error and retries the same oversized Spec, the gate fires again and the cycle stalls. The framework has no kill switch; future work may want a `--force-decompose-skip` flag, but that decision belongs to a separate Spec.
- The detector's `evaluateSpec` runs on the proposed English Spec body only. The Chinese `.zh.md` body is not re-counted; the framework already asserts `markdownSignature` parity, so a Spec that fits in English but bloats in Chinese would slip through the gate and surface later as a `decomposition-contract` finding. The risk is small (Chinese mirrors the English structure), and the parity check catches the structural mismatch on the next scan cycle.
- `loadThresholds` falls back to defaults when the loaded config has no `decomposition` block. A repository that intentionally removes the block keeps the original 8/5/1500 thresholds, which matches the unmodified Phase 2 detector.

## Alternatives considered

**Warn-only: emit a `decomposition-recommended: true` field on the preview.** Rejected because the framework already has `decomposition-contract` issues in `scan`, and a soft warning would just add a third place to consult. A hard gate gives the assistant a single, mechanical signal to react to.

**Gate after `applyAssistantSpecPatch` writes the patch and then rolls back.** Rejected because rolling back a freshly-written Spec leaves the developer's trust in the refine workflow lower than rejecting before any write. The existing temp-file dance is for accidental filesystem failures; a known-too-big patch should never touch disk.

**Decompose automatically inside the gate by calling `buildDecompositionTemplate` and writing parent + sub-Specs.** Rejected because automatic decomposition loses authorial intent (the assistant decides how to split). The gate forces the assistant to re-draft; the developer keeps control.

## Tasks

1. In `lib/assistant-actions.js`, add a `runDecompositionGate(specEn, config, file)` helper that calls `evaluateSpec` and throws the structured `SPEC_TOO_BIG_FOR_REFINEMENT` error on `ok === false`. REQ: AC-AR-001..AC-AR-006. Scope: `tests/assistant-actions-decomposition.test.js`, `docs/user/features/spec-auto-decompose-at-refine.{md,zh.md,i18n.yaml}`.
2. Call `runDecompositionGate` from `patchFacts` immediately after the existing `required validation issue(s)` check, before any temp-file work. REQ: AC-AR-001, AC-AR-002, AC-AR-006. Scope: `tests/assistant-actions-decomposition.test.js`.
3. Author `docs/user/features/spec-auto-decompose-at-refine.md` + `.zh.md` + `.i18n.yaml`; run `node lib/cli.js docs confirm <owner>`. REQ: AC-AR-001..AC-AR-007. Scope: docs.
4. Run `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js"` and `node lib/cli.js scan --all --cwd .`; confirm scan reports `0 required` and the full test suite still passes. REQ: AC-AR-007. Scope: -

## Consequences

Blueprint completed this delivery automatically after requirement-linked verification.

- Verified snapshot: `git-index:a3cf6dc85884216f70e0f275812decb877d6a553a185394d99d16a6476b91c0b`
- Verification attempt: `attempt-4`
- Conclusion: Phase 6 (spec-auto-decompose-at-refine) implementation complete. lib/assistant-actions.js adds runDecompositionGate helper called from patchFacts. previewAssistantSpecPatch and applyAssistantSpecPatch now reject oversized proposed Specs with structured SPEC_TOO_BIG_FOR_REFINEMENT error before any filesystem write. 6 new tests pass; bilingual docs pair confirmed. Architectural-drift blocker resolved by adding the two missing .specs/proposed/automatic-verification-and-completion-loop placeholder files and narrowing the diagnostics Component document list to only docs that compact-at-checkpoint actually created.
- AC evidence: all 7 acceptance criteria passed.
- Check evidence: decomposition-gate-unit-api (command), threshold-override-static (inspection), full-suite (command).
