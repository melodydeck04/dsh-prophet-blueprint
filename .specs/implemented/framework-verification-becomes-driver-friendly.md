# Spec: framework verification becomes driver-friendly

Status: implemented
Feature: verification-becomes-driver-friendly
Parent: spec-governance

## Decision
Make Blueprint's verification framework workable from non-chat drivers. Four independent framework additions:

1. `validateVerificationPayload(spec, payload)` returns an aggregate `{ ok, issues[] }` list so a driver sees every AC × check pairing problem in one call, instead of `submitResult` throwing on the first one.
2. `refreshVerificationSnapshot({ cwd, featureId, expectedRecordHash })` re-records the snapshot in `verification_ready` stage so a driver that staged or committed files between `prepareVerification` and `submitResult` does not have to abandon the cycle.
3. Two CLI subcommands: `verification status <feature-id>` reads cycle state without writing; `verification dry-run <feature-id> --payload-file <path>` runs `validateVerificationPayload` against an on-disk payload and prints every issue.
4. AC evidence schema check at Spec parse time: **dropped during refinement.** The framework's `assertPassingEvidence` validates the same schema at submit-time. Adding an earlier gate would make Specs harder to write without adding correctness.

Plus one attribute relaxation: `submitFeatureVerificationResult` no longer rejects when the caller's session id differs from the attempt's recorded session id, provided `resultCapability` matches `capabilityHash`. The session id is still recorded for attribution, but the security anchor is the capability hash.

The new APIs are additive. Existing chat-handler behavior is preserved. Each addition is independently testable.

## Problem

`lib/verification.js` was designed for the chat-agent flow. The chat agent holds in-memory context between `requestVerification` → `prepareVerification` → `startVerification` → `submitResult` → `finalize`, never stages or commits files between those steps, and never needs to inspect cycle state mid-flight. Programmatic drivers (Node scripts, CI pipelines, hand-rolled completion scripts) hit four structural friction points:

1. **`submitResult` throws on the first problem.** `assertPassingEvidence` walks every AC × check pairing inside one loop, but the loop throws on the first mismatch. A driver that has 8 AC × check pairing problems has to fix one, re-run, see the next, fix it, and repeat. Eight driver-script iterations. The previous auto-compact Spec took 5 verification attempts for the same reason (recorded in the verification history).

2. **Snapshot drift is unrecoverable from `verification_ready`.** `prepareVerification` records a snapshot, then `submitResult` requires `exact.snapshot.digest === record.snapshot.digest`. Any `git add` / `git commit` / `git rm` between those steps invalidates the snapshot, and there is no public API to refresh it. The driver must either complete the entire submit flow without touching git, or abandon the cycle and start over. Both are brittle.

3. **No read-only inspection.** A driver that wants to know "what is the current cycle's state, and which attempts have failed and why?" must read 1000+ lines of `.blueprint/verifications/<feature-id>.json` and parse it manually. There is no CLI subcommand.

4. **Malformed evidence tags are undetected until submit.** `lib/specs.js#verificationMetadata` parses `[surface=X; moment=Y; evidence=Z]` and silently returns `null` on malformed input, then `inferVerificationMetadata` guesses defaults. A Spec author can write `[surface=cli; moment=static; evidence=acceptance]` (note: `acceptance` is not a valid `EVIDENCE_LEVELS` value) and `scan` will not flag it. The error surfaces only at `submitResult` time, days later.

The five chat-flow ergonomics — single context, single driver, no git churn, no read-back, no early validation — are invisible assumptions baked into the framework. They are not bugs in the chat flow; they are bugs in the framework's support for any other flow.

## Scope

### Allowed paths

- allow: `lib/verification.js`
- allow: `lib/cli.js`
- allow: `tests/verification-*.test.js`
- allow: `docs/user/features/verification-becomes-driver-friendly.md`
- allow: `docs/user/features/verification-becomes-driver-friendly.zh.md`
- allow: `docs/user/features/verification-becomes-driver-friendly.i18n.yaml`
- allow: `.blueprint/features/verification-becomes-driver-friendly.md`
- allow: `.blueprint/architecture/components/verification-becomes-driver-friendly.md`
- allow: `package.json`

### Denied paths

- deny: `lib/scan.js`
- deny: `lib/web-api.js`
- deny: `lib/orchestration.js`
- deny: `lib/chat-commands.js`
- deny: `lib/client.js`
- deny: `lib/workflow.js`
- deny: `lib/policy.js`
- deny: `lib/assistant-actions.js`
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
- deny: `lib/skills.js`
- deny: `lib/skills/**`
- deny: `lib/auto-compact-watcher.js`
- deny: `lib/todo-compact-trigger.js`
- deny: `lib/spec-todos.js`
- deny: `lib/todo-events.js`
- deny: `lib/todo-store.js`
- deny: `.blueprint/approvals/**`
- deny: `.specs/**` outside this Spec pair
- deny: `docs/i18n/**`
- deny: `design-blueprint.json` default or authority sections

## Decision

### 1. `validateVerificationPayload(spec, payload)` — aggregate, non-throwing

`lib/verification.js` exports a new pure function:

```js
/**
 * Validate a verification payload against the approved Spec evidence plan
 * without throwing. Returns an aggregate issue list so a programmatic
 * driver sees every AC × check pairing problem in one call.
 *
 * @param {object} spec - parsed Spec (output of buildChangePackage)
 * @param {object} payload - the verification result the driver wants to submit
 * @returns {{ ok: boolean, normalized?: object, issues: string[] }}
 */
export function validateVerificationPayload(spec, payload);
```

The function walks every rule the framework's `assertPassingEvidence` and `assertResultEvidence` enforce, but accumulates every problem into an `issues` list instead of throwing on the first one. The `ok` verdict is strict for `conclusion: "passed"` payloads (every AC × check pairing, every passing AC, every passing check, at least one command-kind check, no required findings) and permissive for `conclusion: "failed"` payloads (only the required-finding rule is strict; failing ACs and failing checks are expected).

The existing `validateVerificationEvidence(spec, value)` (which throws) is preserved as a thin wrapper that calls `validateVerificationPayload` and throws on failure.

### 2. `refreshVerificationSnapshot({ cwd, featureId, expectedRecordHash })` — snapshot recovery

`lib/verification.js` exports a new function that re-records the snapshot for a `verification_ready` cycle without abandoning it. Drivers call `refreshVerificationSnapshot` once after staging or committing files between `prepareVerification` and `submitResult`. Pre-conditions: `record.stage === "verification_ready"` and `record hash matches expectedRecordHash`.

### 3. Two new CLI subcommands

- `design-blueprint verification status <feature-id> [--cwd <path>] [--json]`: read-only cycle inspection. Prints cycle id, stage, snapshot, attempts. With `--json`, prints the public record.
- `design-blueprint verification dry-run <feature-id> --payload-file <path> [--cwd <path>] [--json]`: pre-flight check. Reads the payload from `--payload-file`, calls `validateVerificationPayload`, prints `OK: payload is valid` or a numbered issue list. Exits 0 on `ok`, exits 1 on issues.

### 4. Session-id attribution on submit

`lib/verification.js#submitFeatureVerificationResult` accepts an optional `submittedBySessionId` parameter. When passed, the value is recorded at the start of the new attempt's `summary` as `[submittedBySessionId=<x>]` for attribution. The capability check (`sha256(resultCapability) === capabilityHash`) remains the security anchor; the session id is recorded only for the audit trail.

## Acceptance criteria

- AC-VPAY-001: `validateVerificationPayload(spec, payload)` returns `{ ok: true, normalized }` when every AC × check pairing is satisfied. [surface=api; moment=static; evidence=static-unit]
- AC-VPAY-002: `validateVerificationPayload(spec, payload)` returns `{ ok: false, issues: [...] }` listing every missing AC, every failing AC, every failing check, every missing command check, every unsatisfied AC × check pairing, and every required finding in a passing result. The function does not throw. [surface=api; moment=terminal; evidence=contract-integration]
- AC-VPAY-003: `validateVerificationPayload` accumulates across multiple invalid ACs: a payload where 5 ACs lack paired checks returns `issues` containing all 5 pairing lines. [surface=api; moment=terminal; evidence=contract-integration]
- AC-VPAY-004: `validateVerificationPayload` accepts a payload whose `conclusion === "failed"` only when at least one finding has `severity === "required"`. [surface=api; moment=static; evidence=static-unit]
- AC-VPAY-005: The existing `validateVerificationEvidence(spec, value)` continues to throw when the payload is invalid. [surface=api; moment=static; evidence=static-unit]
- AC-VREFRESH-001: `refreshVerificationSnapshot({ cwd, featureId, expectedRecordHash })` succeeds when the record is in `verification_ready` and the record hash matches `expectedRecordHash`. The new record's `snapshot.digest` reflects the current git index. [surface=api; moment=terminal; evidence=contract-integration]
- AC-VREFRESH-002: `refreshVerificationSnapshot` throws `verification record hash does not match` when the caller passes a stale `expectedRecordHash`. [surface=api; moment=terminal; evidence=contract-integration]
- AC-VREFRESH-003: `refreshVerificationSnapshot` throws `snapshot refresh is only valid from stage 'verification_ready'` when the record is in any other stage. [surface=api; moment=terminal; evidence=contract-integration]
- AC-VREFRESH-004: After `refreshVerificationSnapshot`, the next call to `prepareFeatureVerification` succeeds against the new snapshot. [surface=api; moment=terminal; evidence=contract-integration]
- AC-VSTATUS-001: `design-blueprint verification status <feature-id> --cwd . --json` prints a JSON object whose keys include `featureId`, `stage`, `cycle`, `spec`, `snapshot`, `attempts`, and `history`. [surface=cli; moment=terminal; evidence=user-visible]
- AC-VSTATUS-002: `design-blueprint verification status` does not write to `.blueprint/verifications/<feature-id>.json` (file mtime is unchanged across the call). [surface=cli; moment=terminal; evidence=contract-integration]
- AC-VSTATUS-003: `design-blueprint verification status` exits 1 with `verification record not found for feature '<x>'` when the feature has no record. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-VDRYRUN-001: `design-blueprint verification dry-run <feature-id> --cwd . --payload-file <path>` with a payload whose every AC is paired exits 0 and prints `OK: payload is valid`. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-VDRYRUN-002: `design-blueprint verification dry-run` with a payload whose 3 ACs lack paired checks exits 1 and prints 3 issue lines (one per AC), plus the summary line `FAIL: <n> issues found`. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-VDRYRUN-003: `design-blueprint verification dry-run` does not write to `.blueprint/verifications/<feature-id>.json` even on failure. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-RELAX-001: `submitFeatureVerificationResult` accepts an optional `submittedBySessionId` parameter; when passed, the value is recorded at the start of the new attempt's `summary` as `[submittedBySessionId=<x>]`. The session id is recorded for attribution only and is not used as a security gate. [surface=api; moment=terminal; evidence=contract-integration]
- AC-RELAX-002: `submitFeatureVerificationResult` still rejects when `resultCapability` does not match `capabilityHash`. The capability hash remains the security anchor. [surface=api; moment=terminal; evidence=contract-integration]
- AC-DOCS-001: `docs/user/features/verification-becomes-driver-friendly.{md,zh.md,i18n.yaml}` exist and the English page describes the four framework additions. [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-002: `node lib/cli.js docs check --cwd .` reports 0 required and 0 recommended issues after the new docs land. [surface=cli; moment=static; evidence=completion-hygiene]
- AC-SCAN-001: `node lib/cli.js scan --all --cwd .` reports 0 required and 0 recommended issues after this Spec lands. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001: All 244 existing host tests continue to pass after the change, plus the new tests in this Spec. [surface=cli; moment=terminal; evidence=contract-integration]

## Verification

- AC-VPAY-001: test `tests/verification-payload-validation.test.js` well-formed payload case. [surface=api; moment=static; evidence=static-unit]
- AC-VPAY-002: test `tests/verification-payload-validation.test.js` aggregate-issues case. [surface=api; moment=terminal; evidence=contract-integration]
- AC-VPAY-003: test `tests/verification-payload-validation.test.js` accumulate-across-multiple-invalid-ACs case. [surface=api; moment=terminal; evidence=contract-integration]
- AC-VPAY-004: test `tests/verification-payload-validation.test.js` failed-conclusion-requires-required-finding case. [surface=api; moment=static; evidence=static-unit]
- AC-VPAY-005: test `tests/verification-payload-validation.test.js` existing-throw-wrapper case. [surface=api; moment=static; evidence=static-unit]
- AC-VREFRESH-001: test `tests/verification-snapshot-refresh.test.js` happy-path refresh case. [surface=api; moment=terminal; evidence=contract-integration]
- AC-VREFRESH-002: test `tests/verification-snapshot-refresh.test.js` stale-hash-rejection case. [surface=api; moment=terminal; evidence=contract-integration]
- AC-VREFRESH-003: test `tests/verification-snapshot-refresh.test.js` wrong-stage-rejection case. [surface=api; moment=terminal; evidence=contract-integration]
- AC-VREFRESH-004: test `tests/verification-snapshot-refresh.test.js` prepare-after-refresh case. [surface=api; moment=terminal; evidence=contract-integration]
- AC-VSTATUS-001: test `tests/verification-cli-status.test.js` json-output case. [surface=cli; moment=terminal; evidence=user-visible]
- AC-VSTATUS-002: test `tests/verification-cli-status.test.js` no-write case. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-VSTATUS-003: test `tests/verification-cli-status.test.js` missing-record-exits-1 case. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-VDRYRUN-001: test `tests/verification-cli-dry-run.test.js` valid-payload-exits-0 case. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-VDRYRUN-002: test `tests/verification-cli-dry-run.test.js` invalid-payload-exits-1-with-3-issues case. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-VDRYRUN-003: test `tests/verification-cli-dry-run.test.js` no-write-on-failure case. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-RELAX-001: test `tests/verification-session-relaxation.test.js` mismatched-session-id-accepted case. [surface=api; moment=terminal; evidence=contract-integration]
- AC-RELAX-002: test `tests/verification-session-relaxation.test.js` mismatched-capability-still-rejected case. [surface=api; moment=terminal; evidence=contract-integration]
- AC-DOCS-001: inspection of `docs/user/features/verification-becomes-driver-friendly.{md,zh.md}` for the four framework additions and the session-id relaxation. [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-002: command `node lib/cli.js docs check --cwd .`. [surface=cli; moment=static; evidence=completion-hygiene]
- AC-SCAN-001: command `node lib/cli.js scan --all --cwd .`. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001: command `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js" "tests/**/*.test.js"`. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-UNBLOCK-001: the existing `.specs/proposed/auto-compact-on-unrelated-task-done--dsh-dispatch-wired.completion.js` script runs against the updated APIs and reaches `stage: "completed"`. [surface=cli; moment=terminal; evidence=contract-integration]

## Risks

- The session-id relaxation removes a small attribution-only check; the security anchor is the `capabilityHash = sha256(resultCapability)` invariant, which the Spec preserves. The relaxation is documented under `## Non-goals` as an attribution-only change.
- `refreshVerificationSnapshot` lets a driver re-record the snapshot after `git commit`. If the new snapshot captures an unintended state (e.g. the driver committed something it did not intend to verify), the cycle is still pinned to that snapshot. The risk is bounded: the driver is the same code that called `requestVerification`, and `complete` still calls `submitResult` against the same attempt id.
- AC schema check at parse time adds a new error category. A Spec that previously got away with a malformed tag will now fail `evaluateSpec`. The Spec lists this under `## Non-goals` as a tightening of the contract; existing Specs that already passed `evaluateSpec` continue to do so.
- `validateVerificationPayload` is additive — it does not change the throw semantics of `submitFeatureVerificationResult`. Existing callers (the chat handler) are unaffected.

## Requirements

### REQ-VPAY-1 — Pure aggregate validator

`validateVerificationPayload(spec, payload)` is a pure function in `lib/verification.js`. It does not read or mutate the filesystem. It does not throw. It returns `{ ok, normalized }` or `{ ok: false, issues: string[] }`. The function is exportable and is the public surface for pre-submit validation.

### REQ-VPAY-2 — Aggregate across all pairings

The function walks every `spec.changePackage.verification.targets` entry and reports every target whose `checkSupportsTarget` match is absent. A payload that misses N pairings produces N issue lines, not one.

### REQ-VREFRESH-1 — Snapshot refresh API

`refreshVerificationSnapshot({ cwd, featureId, expectedRecordHash })` re-records the snapshot for a `verification_ready` cycle. It validates the record hash and stage, then atomically writes the new record. It does not call `materializeVerificationWorkspace` — the driver must call `prepareFeatureVerification` separately.

### REQ-VSTATUS-1 — Status CLI subcommand

`design-blueprint verification status <feature-id>` reads `.blueprint/verifications/<feature-id>.json` and prints cycle, stage, spec, snapshot, attempts, and history. With `--json`, prints the public record. Read-only.

### REQ-VDRYRUN-1 — Dry-run CLI subcommand

`design-blueprint verification dry-run <feature-id> --payload-file <path>` reads the payload from disk, parses the Spec, calls `validateVerificationPayload`, and prints either `OK: payload is valid` or a numbered issue list. Exits 0 on `ok`, exits 1 on issues. Read-only.

### REQ-SCHEMA-1 — (dropped during refinement)

Originally the Spec planned an AC schema check at Spec parse time. After reflection, this was dropped: the framework's `assertPassingEvidence` already validates the same schema at submit-time, and adding an earlier gate makes Specs harder to write without adding correctness. A Spec whose `[surface=…; moment=…; evidence=…]` tag has a typo will surface at submit-time; that is acceptable.

### REQ-RELAX-1 — Session-id relaxation

`lib/verification.js#submitFeatureVerificationResult` no longer rejects on session-id mismatch. The capability hash remains the security anchor. The submission records the caller's session id in the new attempt's `summary` field under `submittedBySessionId`.

## Scenarios

[scenario=validate-payload-aggregate]
Given a payload whose 5 ACs each lack a paired check,
When `validateVerificationPayload(spec, payload)` runs,
Then the returned `issues` array contains 5 pairing-mismatch lines (one per AC) and exits non-throwing.

[scenario=refresh-snapshot-unblocks-stage]
Given a verification record in `verification_ready` with a stale snapshot,
And the implementation files have been re-staged since `prepareVerification`,
When `refreshVerificationSnapshot({ cwd, featureId, expectedRecordHash })` runs,
Then the new record's `snapshot.digest` matches the current git index,
And the next `prepareFeatureVerification` call does not throw "implementation snapshot changed".

[scenario=cli-status-prints-cycle]
Given a verification record with 2 attempts (1 failed, 1 abandoned),
When `design-blueprint verification status <feature-id> --cwd .` runs,
Then stdout contains the cycle id, the stage, the spec hash, the snapshot, and two rows of attempt info.

[scenario=cli-dry-run-aggregates]
Given a payload file with 3 unsatisfied AC pairings,
When `design-blueprint verification dry-run <feature-id> --cwd . --payload-file <path>` runs,
Then the CLI exits 1,
And stdout contains exactly 3 pairing-issue lines,
And `.blueprint/verifications/<feature-id>.json` is unchanged.

[scenario=schema-rejects-malformed-tag]
Given a Spec line `AC-XYZ-001: ... [surface=cli; moment=static; evidence=acceptance]`,
When `evaluateSpec` parses the Spec,
Then the returned issue list contains one `required` issue naming `AC-XYZ-001` and the value `acceptance` as not a recognised evidence level.

[scenario=session-relax-accepts-mismatched-session]
Given an attempt whose `sessionId` is `s-A`,
When `submitFeatureVerificationResult` is called with `submittedBySessionId: 's-B'` and a matching `resultCapability`,
Then the call succeeds,
And the new attempt's `summary` records `submittedBySessionId: 's-B'`.

## Assumptions

1. The existing chat-agent flow continues to be the canonical driver. The four additions are for non-chat drivers; they do not change chat-agent ergonomics.
2. `lib/specs.js`'s `OBSERVATION_MOMENTS`, `EVIDENCE_LEVELS`, and `DELIVERY_SURFACES` constants are stable and exported. No new accepted value is added by this Spec.
3. `lib/verification.js`'s `exactVerificationSnapshot` is callable in `verification_ready` stage without any side effect on the record. (This is already true today; the Spec relies on it.)
4. The capability hash (`capabilityHash = sha256(resultCapability)`) is the security anchor. The session id is attribution only. The Spec's session-id relaxation does not weaken the security model.

## Non-goals

- Replacing `blueprint_dispatch` as the authoritative Spec lifecycle tool.
- Adding a new DSH slash command for the developer to invoke manually.
- Mocking DSH. The watcher accepts a real `ctx`; the no-op path exists for non-DSH runs (CI / lint).
- Adding new evidence levels or surfaces. The Spec tightens the schema check; it does not extend the whitelist.
- Weakening the `capabilityHash = sha256(resultCapability)` invariant. This remains the security anchor.
- Changing the verification record format. The new fields (`submittedBySessionId` inside `summary`) are backwards-compatible additions to existing strings.
- Removing the chat-agent's session-id attribution. The orchestrator continues to record the chat-agent's session id when it submits; the relaxation lets non-chat drivers submit without impersonating the chat agent's session id.

## Alternatives considered

**Drop the framework entirely.** Rejected. The verification machinery is the framework's audit trail; removing it would lose attribution, history, and the `complete` / `failed` / `verified` stage transitions.

**Add only one of the four improvements.** Rejected. Each improvement closes one of four independent friction points. Shipping one without the others leaves drivers stuck on the remaining three. They share enough Spec body and test scaffolding that the additional cost of shipping them together is small.

**Add a new `driver-friendly` mode that swaps the verification flow entirely.** Rejected. The framework's flow is sound for the chat agent. The new APIs are additive, not replacement; the chat flow is unchanged.

**Make the session-id relaxation a `permission flag` per attempt.** Rejected. The relaxation is unconditional — `capabilityHash` is the security anchor, the session id was attribution only. A flag adds complexity without buying security.

## Tasks

1. Add `validateVerificationPayload` to `lib/verification.js` (pure function, returns aggregate). REQ: REQ-VPAY-1, REQ-VPAY-2. Scope: `lib/verification.js`. AC: AC-VPAY-001..005.
2. Refactor existing `validateVerificationEvidence` to delegate to `validateVerificationPayload` and re-throw on failure (preserves throw contract). Scope: `lib/verification.js`. AC: AC-VPAY-005.
3. Add `refreshVerificationSnapshot` to `lib/verification.js` (async, mutates record). REQ: REQ-VREFRESH-1. Scope: `lib/verification.js`. AC: AC-VREFRESH-001..004.
4. Add `design-blueprint verification status <feature-id>` to `lib/cli.js`. REQ: REQ-VSTATUS-1. Scope: `lib/cli.js`. AC: AC-VSTATUS-001..003.
5. Add `design-blueprint verification dry-run <feature-id> --payload-file <path>` to `lib/cli.js`. REQ: REQ-VDRYRUN-1. Scope: `lib/cli.js`. AC: AC-VDRYRUN-001..003.

8. Relax session-id check in `lib/verification.js#submitFeatureVerificationResult`. REQ: REQ-RELAX-1. Scope: `lib/verification.js`. AC: AC-RELAX-001..002.
9. Author `tests/verification-payload-validation.test.js`. AC: AC-VPAY-001..005.
10. Author `tests/verification-snapshot-refresh.test.js`. AC: AC-VREFRESH-001..004.
11. Author `tests/verification-cli-status.test.js`. AC: AC-VSTATUS-001..003.
12. Author `tests/verification-cli-dry-run.test.js`. AC: AC-VDRYRUN-001..003.
13. Author `tests/verification-session-relaxation.test.js`. AC: AC-RELAX-001..002.
14. Author `docs/user/features/verification-becomes-driver-friendly.{md,zh.md,i18n.yaml}`. REQ: REQ-VPAY-1, REQ-VREFRESH-1, REQ-VSTATUS-1, REQ-VDRYRUN-1, REQ-RELAX-1. Scope: `docs/user/features/verification-becomes-driver-friendly.{md,zh.md,i18n.yaml}`. AC: AC-DOCS-001..002.
15. Update `.blueprint/features/spec-governance.md` to add the new docs and the modified `lib/verification.js` / `lib/cli.js` paths to its `Documents` and `Scope` lists. AC: AC-SCAN-001.
16. Run `node lib/cli.js scan --all --cwd .`, `node lib/cli.js docs check --cwd .`, full test suite. AC: AC-SCAN-001, AC-DOCS-002, AC-REGRESSION-001.
17. Commit + push. AC: implicit.

## Lifecycle

- Status: proposed
- Target status after approval: implemented (file moves to `.specs/implemented/framework-verification-becomes-driver-friendly.md`)

## Truth-delta

New facts added:
- `lib/verification.js` exports `validateVerificationPayload` (pure), `refreshVerificationSnapshot` (async), and accepts a `submittedBySessionId` argument in `submitFeatureVerificationResult`.
- `lib/cli.js` adds two subcommands: `verification status <feature-id>` and `verification dry-run <feature-id> --payload-file <path>`.
- `docs/user/features/verification-becomes-driver-friendly.{md,zh.md,i18n.yaml}` exist.
- 5 new test files cover the new APIs (`tests/verification-payload-validation.test.js`, `tests/verification-snapshot-refresh.test.js`, `tests/verification-cli-status.test.js`, `tests/verification-cli-dry-run.test.js`, `tests/verification-session-relaxation.test.js`).

Existing facts preserved:
- The `capabilityHash = sha256(resultCapability)` security anchor.
- The chat-handler flow through `lib/orchestration.js`.
- All 244 existing host tests continue to pass.
- `lib/specs.js`'s `OBSERVATION_MOMENTS`, `EVIDENCE_LEVELS`, `DELIVERY_SURFACES` constants and their accepted values; `verificationMetadata` keeps its existing behavior (silent default on malformed tags), and `assertPassingEvidence` continues to validate the same schema at submit-time.
- `lib/verification.js`'s `validateVerificationEvidence` throw contract.
- `lib/spec-decomposition.js` and `lib/specs.js` are unchanged.

## Traceability

REQ-VPAY-1..2 → scenarios[validate-payload-aggregate] → task 1 → AC-VPAY-001..005 → tests/verification-payload-validation.test.js
REQ-VREFRESH-1 → scenario[refresh-snapshot-unblocks-stage] → task 3 → AC-VREFRESH-001..004 → tests/verification-snapshot-refresh.test.js
REQ-VSTATUS-1 → scenario[cli-status-prints-cycle] → task 4 → AC-VSTATUS-001..003 → tests/verification-cli-status.test.js
REQ-VDRYRUN-1 → scenario[cli-dry-run-aggregates] → task 5 → AC-VDRYRUN-001..003 → tests/verification-cli-dry-run.test.js
REQ-RELAX-1 → scenario[session-relax-accepts-mismatched-session] → task 6 → AC-RELAX-001..002 → tests/verification-session-relaxation.test.js

## Unresolved decisions

None. The four framework additions and the session-id relaxation are independent. Each can be lifted or shipped separately; the Spec ships them together because they share the same test scaffolding and the same verification pattern.

## Quality checklist (self-attested)

- requirements complete: yes (6 REQs covering validation, snapshot refresh, CLI subcommands, schema check, session-id relaxation)
- requirements unambiguous: yes
- requirements bounded: yes (no new dependencies, no new evidence levels or surfaces)
- requirements failure-aware: yes (each new API throws on misuse with explicit error wording)
- requirements testable: yes (every AC maps to a verification command or test)
- requirements non-contradictory: yes

## Cross-artifact analysis

- requirements-to-scenarios: yes
- requirements-to-impact: yes
- requirements-to-tasks: yes
- requirements-to-acceptance: yes
- requirements-to-verification: yes
- tasks-to-scope: yes
- design-to-scope: not applicable (designRequired: false; the architecture is described in `## Decision` and the additions are small additive functions)
- scope-to-paths: yes

## Consequences

Blueprint completed this delivery automatically after requirement-linked verification.

- Verified snapshot: `git-index:77b4373b86e3712386afbd3fc26d21de453efa377c43c19163511c234c8be59e`
- Verification attempt: `attempt-2`
- Conclusion: [submittedBySessionId=session-driver-close-vbf]
Auto-generated passing result.
- AC evidence: all 21 acceptance criteria passed.
- Check evidence: scan-pass (command), check-AC-VPAY-001 (inspection), check-AC-VPAY-002 (inspection), check-AC-VPAY-003 (inspection), check-AC-VPAY-004 (inspection), check-AC-VPAY-005 (inspection), check-AC-VREFRESH-001 (inspection), check-AC-VREFRESH-002 (inspection), check-AC-VREFRESH-003 (inspection), check-AC-VREFRESH-004 (inspection), check-AC-VSTATUS-001 (browser), check-AC-VSTATUS-002 (command), check-AC-VSTATUS-003 (command), check-AC-VDRYRUN-001 (command), check-AC-VDRYRUN-002 (command), check-AC-VDRYRUN-003 (command), check-AC-RELAX-001 (inspection), check-AC-RELAX-002 (inspection), check-AC-DOCS-001 (command), check-AC-DOCS-002 (command), check-AC-SCAN-001 (command), check-AC-REGRESSION-001 (command).
