---
title: Verification framework becomes driver-friendly
title.zh: 验证框架对 driver 友好
---

# Verification framework becomes driver-friendly

English | [中文](verification-becomes-driver-friendly.zh.md)

## What changed

Blueprint's verification framework (the `lib/verification.js` machinery that powers `blueprint_dispatch action=complete`) was opinionated toward a chat-agent driver: a single Chat session that holds context across `requestVerification` → `prepareVerification` → `startVerification` → `submitResult` → `finalize`, never staging or committing files between those steps, and never losing the in-memory `resultCapability`. Programmatic drivers (Node scripts, CI pipelines, hand-rolled completion scripts) hit four structural friction points that the chat agent avoids by accident:

1. `submitResult` throws on the first error. A driver with 8 AC × check pairing problems had to fix one, re-run, see the next, fix it, and repeat — eight iterations.
2. Snapshot drift after `git add` / `git commit` is unrecoverable from `verification_ready`. There was no public API to refresh the snapshot, so drivers either finished the submit flow without touching git or abandoned the cycle and started over.
3. No read-only inspection. A driver that wanted to know "what is the current cycle's state, and which attempts have failed and why?" had to parse `.blueprint/verifications/<feature-id>.json` manually.
4. Session-id attribution is enforced. A driver that wanted to submit on behalf of a non-chat identity (CI service account, completion script) was blocked because its session id did not match the chat-agent session id bound to the attempt.

This Feature ships four framework additions that close those four gaps.

## The four additions

### 1. `validateVerificationPayload(spec, payload)` — aggregate, non-throwing

`lib/verification.js` exports a pure function that walks every AC × check pairing inside one loop and accumulates every problem into an `issues` list. It does not throw. A driver sees every pairing problem in one call and fixes them all at once.

```js
import { validateVerificationPayload } from "@dsh-plugins/design-blueprint/verification";

const result = validateVerificationPayload(spec, payload);
if (!result.ok) {
	for (const issue of result.issues) console.error(issue);
}
```

The existing `validateVerificationEvidence(spec, value)` (which throws) is preserved as a thin wrapper that calls `validateVerificationPayload` and re-throws on failure.

### 2. `refreshVerificationSnapshot({ cwd, featureId, expectedRecordHash })` — snapshot recovery

`lib/verification.js` exports a function that re-records the snapshot for a `verification_ready` cycle without abandoning it. Drivers call it once after staging or committing files between `prepareVerification` and `submitResult`. Pre-conditions: `record.stage === "verification_ready"` and the record hash matches `expectedRecordHash`.

```js
import { refreshVerificationSnapshot } from "@dsh-plugins/design-blueprint/verification";

await refreshVerificationSnapshot({ cwd, featureId, expectedRecordHash: recordHash });
```

The next `prepareFeatureVerification` call then succeeds against the new snapshot. The function does not call `materializeVerificationWorkspace` — the driver calls `prepareFeatureVerification` separately.

### 3. Two CLI subcommands

- `design-blueprint verification status <feature-id> [--cwd <path>] [--json]` — read-only cycle inspection. Prints cycle id, stage, snapshot, attempts, and history. With `--json`, prints the public record. Does not write to `.blueprint/verifications/<feature-id>.json`.
- `design-blueprint verification dry-run <feature-id> --payload-file <path> [--cwd <path>] [--json]` — pre-flight check. Reads the payload from `--payload-file`, calls `validateVerificationPayload`, and prints either `OK: payload is valid` (exit 0) or a numbered issue list plus `FAIL: <n> issue(s) found` (exit 1). Does not write to the record.

### 4. Session-id attribution on submit

`lib/verification.js#submitFeatureVerificationResult` accepts an optional `submittedBySessionId` parameter. When passed, the value is recorded at the start of the new attempt's `summary` as `[submittedBySessionId=<x>]` for attribution. The capability check (`sha256(resultCapability) === capabilityHash`) remains the security anchor; the session id is recorded only for the audit trail.

```js
import { submitFeatureVerificationResult } from "@dsh-plugins/design-blueprint/verification";

await submitFeatureVerificationResult({
	cwd, featureId, expectedRecordHash, attemptId, resultCapability,
	result, submittedBySessionId: "ci-pipeline-1234",
});
```

## What did not change

- The chat-agent flow through `lib/orchestration.js`. The chat handler still submits with the chat-agent session id; the relaxation only opens the gate for non-chat drivers.
- The `capabilityHash = sha256(resultCapability)` invariant. The capability hash remains the security anchor. The session id was attribution only; the relaxation makes that explicit.
- The verification record format. The new field (`submittedBySessionId` inside `summary`) is a backwards-compatible addition to an existing string.

## When to use it

- Programmatic completion scripts that close verification cycles from CI.
- Hand-rolled completion drivers (Node scripts) that orchestrate multiple verification flows.
- A single Host that drives several Features concurrently and wants to inspect cycle state without reading the JSON file directly.

The chat-agent flow continues to work without changes; this Feature is additive.

## Verified current behavior

<!-- blueprint-current:framework-verification-becomes-driver-friendly.md -->

### framework verification becomes driver-friendly

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
