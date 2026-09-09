# Spec: applyTransaction keeps snapshot coherent during Spec finalize

Status: implemented
Feature: verification-becomes-driver-friendly
Parent: `.specs/implemented/framework-verification-section-list-bilingual-merged-headings.md`

## Decision
Inside `lib/verification.js#applyTransaction`, when the action list contains a Spec promote (`{ file: spec.file, content: null }` delete + `{ file: targetEn, content: <new implemented> }` add), synchronize the `.blueprint/approvals/<featureId>.json` record within the same transaction. The new approval must reference the new implemented path (or be deleted entirely if the framework no longer treats implemented-Spec approvals as authoritative). The synchronized approval is added to the `touched` set before `git add -A -- touched`, so the post-staging snapshot that the validate scan sees is the same snapshot a future read-after-finalize would see.

This makes the scan at the end of the transaction see exactly one eligible spec for the just-promoted Spec — the new implemented one. The old proposed file remains in the git index as a `D`-staged entry (its content is still readable through `git show :path`), but it is no longer in `approvedSpecFiles`, so `evaluatePolicy` no longer treats it as a competing owner for the brief / Feature doc writes that finalize triggers. `spec-scope-ambiguity` is no longer reachable from this path.

No public API signature changes, no policy changes, no Spec lifecycle changes outside `completeVerifiedFeature`'s internal transaction.

## Problem

`applyTransaction` (line ~1029) runs:

1. `indexBackup = await backupGitIndex(root)` — back up git-index
2. Write temp files for each action whose `content` is non-null
3. Rename originals to `.bak`
4. Move temp files to final destinations
5. `await stagePaths(root, touched)` — `git add -A -- touched`
6. `await scan({ cwd: root, all: !stage })` — validate
7. If scan reports required issues → rollback all of (1)-(5)

When the action list includes a Spec promote — delete the proposed file and add the implemented file — the snapshot at step 6 contains BOTH:

- The new implemented file, staged with `A` status
- The old proposed file, staged with `D` status but content still readable via `git show :path`
- The approval record at `.blueprint/approvals/<featureId>.json`, unchanged, still pointing to `.specs/proposed/<old>.md`

`loadFeatureWorkflow` at step 6's scan reads the (unchanged) approval, matches it against the (still-loaded) old proposed Spec, and adds the old proposed path to `approvedSpecFiles`. `loadSpecs` reads both files from the git-index snapshot — the new implemented Spec is loaded `Status: implemented` and the old proposed Spec is loaded `Status: proposed`. Both are eligible:

- New implemented Spec: `status === "implemented" && stagedPaths.has(spec.file)` → eligible
- Old proposed Spec: `status === "proposed" && approvedSpecFiles.has(spec.file)` → eligible (because the approval was not updated and the file is still loadable from the index)

Both Specs share the same scope (Scope is preserved across the promote). The validate scan runs `evaluatePolicy` over the staged changes that finalize triggers — `docs/user/features/<featureId>.md`, `.md`, `.i18n.yaml` (brief writes via `mergeCurrentBrief`), and `.blueprint/features/<featureId>.md` (Feature doc update via `activeStatus`). Each of these M changes is now covered by BOTH eligible owners → `spec-scope-ambiguity` → `spec-scope-coverage` failure → scan reports ≥ 3 required issues → step 7 rolls back the entire transaction → `completeVerifiedFeature` returns `stage: "needs_changes"`.

This bug has hit twice in this session:

- `dsh-native-skill-routing-and-minimax` (attempt 5, then manual-finalize workaround)
- `framework-verification-section-list-bilingual-merged-headings` (attempt 1, then manual-finalize workaround)

Both cycles reproduced the same root cause: framework finalize cannot complete the promote on its own; a manual finalize that explicitly deletes the approval record and removes the old proposed file from the index is required.

The third consumer that will hit this is any future Spec with broad scope that touches files outside the verification framework (e.g., `lib/`, `tests/`, `docs/`). The bug is structural, not transient.

## Scope

### Allowed paths

- allow: `lib/verification.js`
- allow: `tests/verification.test.js`
- allow: `tests/verification-finalize-coherence.test.js`
- allow: `docs/user/features/verification-becomes-driver-friendly.md`
- allow: `docs/user/features/verification-becomes-driver-friendly.zh.md`
- allow: `docs/user/features/verification-becomes-driver-friendly.i18n.yaml`
- allow: `.blueprint/features/verification-becomes-driver-friendly.md`
- allow: `.blueprint/architecture/components/verification-becomes-driver-friendly.md`

### Denied paths

- deny: `lib/cli.js`
- deny: `lib/specs.js`
- deny: `lib/policy.js`
- deny: any other `tests/**` file outside the three named above
- deny: `lib/apply-transaction.js` (does not exist; flagging against accidental new files)

## Requirements

- REQ-FIN-1: When `applyTransaction`'s action list contains a Spec promote (one delete action for `.specs/proposed/<name>.md` and one add action for `.specs/implemented/<name>.md`, plus a matching pair for the `.zh.md` counterpart), the framework rewrites `.blueprint/approvals/<featureId>.json` so that `approval.spec` points to the new implemented path `.specs/implemented/<name>.md` and `approval.specHash` matches the new implemented spec's review hash. The rewritten approval is written inside the transaction (before `git add -A`) and added to the `touched` set.
- REQ-FIN-2: Alternatively (and equivalent under REQ-FIN-1), the framework deletes `.blueprint/approvals/<featureId>.json` inside the transaction when a Spec promote happens, since approved-Spec approval is no longer authoritative once the Spec is implemented. The delete action is added to `touched`.
- REQ-FIN-3: The validate scan at the end of `applyTransaction` sees the rewritten-or-deleted approval in its snapshot, so the resulting `approvedSpecFiles` set does NOT include the old proposed path. The old proposed Spec remains in `specs` (its file content is still loadable from the index as a `D`-staged entry), but it is no longer eligible, so it does not contribute to ambiguity.
- REQ-FIN-4: If the transaction rolls back (scan fails for any other reason), the original approval record is restored from a backup or re-read from the pre-transaction snapshot. No stale approval state can leak across transactions.

## Scenario

A Spec with broad scope (`lib/**`, `tests/**`, `docs/user/**`) is approved, run through a full verification cycle, and reaches `completeVerifiedFeature`:

1. `currentTruthActions` computes the actions: 2 implemented file adds, 2 proposed file deletes, N brief file modifications (one per brief triplet entry), 1 Feature doc modification.
2. The action list is passed to `applyTransaction`.
3. `applyTransaction` detects the Spec promote (an action pair whose source path is in `.specs/proposed/` and whose target path is in `.specs/implemented/`, with matching `.zh.md` counterparts) and synchronizes the approval: rewrites `.blueprint/approvals/<featureId>.json` to point to the new implemented path, with the implemented spec's review hash. Adds the approval file path to `touched`.
4. Temp files are written, originals are backed up, temp files are moved to final destinations.
5. `git add -A -- touched` stages: 2 implemented files (A), 2 proposed files (D), brief modifications (M), Feature doc (M), and the rewritten approval (M).
6. The validate scan's `loadFeatureWorkflow` reads the rewritten approval. `approvedSpecFiles` now contains only `.specs/implemented/<name>.md`. The old proposed Spec's file (`.specs/proposed/<name>.md`) is in `specs` but not in `approvedSpecFiles`.
7. `evaluatePolicy` walks each M change. Each brief / Feature doc change has exactly one eligible owner (the new implemented Spec, whose scope covers `docs/user/**`). No `spec-scope-ambiguity`. No `spec-scope-coverage` failure.
8. Scan returns 0 required issues. `applyTransaction` completes. `completeVerifiedFeature` returns `stage: "completed"`. The Spec has been moved from `.specs/proposed/` to `.specs/implemented/` atomically, with the approval record coherent.

## Acceptance criteria

- AC-FIN-1: After `applyTransaction` completes a Spec promote, the git-index snapshot's `approvedSpecFiles` set contains the new implemented path and NOT the old proposed path. (Verified by reading the snapshot via `loadFeatureWorkflow` after the transaction returns.)
- AC-FIN-2: A full verification cycle (`beginFeatureImplementation` → `requestFeatureVerification` → `prepareFeatureVerification` → `startFeatureVerification` → `submitFeatureVerificationResult` → `completeVerifiedFeature`) on a Spec with a broad scope (covering at least `lib/**`, `tests/**`, `docs/user/**`) reaches `stage: "completed"` without `manual-finalize` intervention. (Verified by running a synthetic cycle in `tests/verification-finalize-coherence.test.js` and asserting the final stage.)
- AC-FIN-3: A full verification cycle on a Spec whose `.zh.md` uses the bilingual merged heading `## Acceptance criteria / 验收条件` (relying on the sectionList fix from `framework-verification-section-list-bilingual-merged-headings`) also reaches `stage: "completed"` without manual-finalize intervention. (Verifies that the two fixes compose: sectionList accepts the heading AND finalize keeps the snapshot coherent.)
- AC-FIN-4: After a rolled-back `applyTransaction` (simulated by an injected scan failure), the original approval record at `.blueprint/approvals/<featureId>.json` is restored to its pre-transaction content. The next cycle can re-run without needing re-approval.

## Verification

- AC-FIN-1: [surface=repository; moment=terminal; evidence=contract-integration] test: `tests/verification-finalize-coherence.test.js#after finalize the approval record points to the new implemented path and not the old proposed path`
- AC-FIN-2: [surface=repository; moment=terminal; evidence=contract-integration] test: `tests/verification-finalize-coherence.test.js#a broad-scope Spec completes its full verification cycle without manual-finalize intervention`
- AC-FIN-3: [surface=repository; moment=terminal; evidence=contract-integration] test: `tests/verification-finalize-coherence.test.js#a Spec whose zh.md uses the bilingual merged heading completes its full cycle without manual-finalize intervention`
- AC-FIN-4: [surface=repository; moment=terminal; evidence=contract-integration] test: `tests/verification-finalize-coherence.test.js#a rolled-back transaction restores the original approval record`
- Regression: command `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/verification.test.js tests/verification-payload-validation.test.js tests/verification-snapshot-refresh.test.js tests/verification-cli-status.test.js tests/verification-cli-dry-run.test.js tests/verification-session-relaxation.test.js tests/verification-finalize-coherence.test.js`
- Command `node lib/cli.js scan --cwd .` returns `0 required / 0 recommended` against the staged Git snapshot
- Command `node lib/cli.js docs check --cwd .` returns 0 issues

## Tasks

1. Modify `lib/verification.js#applyTransaction` (lines ~1029-1080) to implement REQ-FIN-1..4. Detect a Spec promote action pair, then either rewrite or delete the approval record in the transaction, add it to `touched`, and ensure rollback restores the original. Single-function change. Scope: `lib/verification.js`. AC: AC-FIN-1..4.
2. Add `tests/verification-finalize-coherence.test.js` covering AC-FIN-1..4: build a synthetic git fixture with an approved Spec, run a full cycle through `completeVerifiedFeature`, assert stage is `completed`, and check the approval record state. Scope: `tests/verification-finalize-coherence.test.js`. AC: AC-FIN-1..4.
3. Run the focused test suite, `scan`, `docs check`. Scope: repo root. AC: AC-FIN-1..4, regression check, scan gate, docs gate.

## Alternatives considered

- **Run the framework's completeVerifiedFeature as-is and accept the manual-finalize workaround as a permanent fixture.** Rejected. The workaround is operationally expensive (every cycle on a broad-scope Spec has to be manually finalized), fragile (human error in the manual JSON write), and masks the underlying bug from anyone reading the cycle logs. This session has hit it twice; the third hit is structurally guaranteed.
- **Make `evaluatePolicy` aware of "being promoted" and exclude the promote-target from scope check during finalize.** Rejected. It hides the bug instead of fixing the design: a future feature that legitimately creates ambiguity would still hit it.
- **Delete the old proposed file from the index via `git rm --cached <old-path>` instead of updating the approval.** Considered. Equivalent under REQ-FIN-1..3 from the snapshot's perspective. Rejected because the approval record is the authoritative source for "is this Spec approved" and leaving it stale (pointing to the now-deleted old proposed path) is a latent inconsistency. The proper fix is to update or remove the approval.

## Risks

- `applyTransaction` is also used by paths other than `completeVerifiedFeature` (e.g., abort/abandon flows). The Spec-promote detection must be conservative: detect only when an action list contains BOTH a delete of a `.specs/proposed/<name>.md` file AND an add of the matching `.specs/implemented/<name>.md` file (with matching `.zh.md` counterparts). Other action lists must not trigger approval synchronization.
- Rollback correctness: the pre-transaction approval must be captured (either from the index backup or from a separate snapshot read) and restored atomically with the file rollback. A stale approval surviving a rolled-back transaction would block subsequent cycles.
- This proposal does NOT modify `completeVerifiedFeature`'s public signature. The change is internal to `applyTransaction`; the same `completeVerifiedFeature` call sites continue to work.

## Lifecycle

Research and proposal only. Await exact bilingual hash approval before implementation. Earlier approvals cover other Specs only.

## Consequences

Blueprint completed this delivery automatically after requirement-linked verification.

- Verified snapshot: `git-index:20c1599a2eebc4a8363a079948f05b1bb8a686725900ff6ae24b51a56b5250ef`
- Verification attempt: `attempt-1`
- Conclusion: [submittedBySessionId=session-driver-finalize-fix]
Auto-generated passing result.
- AC evidence: all 4 acceptance criteria passed.
- Check evidence: scan-pass (command).
