# Feature: Verification framework becomes driver-friendly

Id: verification-becomes-driver-friendly
Parent: spec-governance
Status: active

## Summary

Blueprint's verification framework (the `lib/verification.js` machinery that powers `blueprint_dispatch action=complete`) is opinionated toward a chat-agent driver: it expects a single Chat session that holds context across `requestVerification` → `prepareVerification` → `startVerification` → `submitResult` → `finalize`, never staging or committing files between those steps, and never losing the in-memory `resultCapability`. Programmatic drivers (Node scripts, CI pipelines, hand-rolled completion scripts) hit four structural friction points that the chat agent avoids by accident: validation errors fire one-at-a-time without an aggregate list, snapshot drift after `git add` / `git commit` is unrecoverable from `verification_ready`, attempt ownership is locked to a single session id with no rescue API, and the CLI has no read-only inspection of cycle state. This Feature ships the small framework additions that let a non-chat driver complete the same flow without fighting the framework.

## Scope

- `lib/verification.js`
- `lib/specs.js`
- `lib/spec-decomposition.js`
- `lib/cli.js`
- `tests/verification-payload-validation.test.js`
- `tests/verification-snapshot-refresh.test.js`
- `tests/verification-cli-status.test.js`
- `tests/verification-cli-dry-run.test.js`
- `tests/verification-session-relaxation.test.js`
- `tests/spec-decomposition-evidence-schema.test.js`
- `docs/user/features/verification-becomes-driver-friendly.md`
- `docs/user/features/verification-becomes-driver-friendly.zh.md`
- `docs/user/features/verification-becomes-driver-friendly.i18n.yaml`
- `.blueprint/features/spec-governance.md`
- `.blueprint/architecture/components/verification-becomes-driver-friendly.md`

## Components

- `verification-becomes-driver-friendly`

## Documents

- required: `AGENTS.md`
- required: `DESIGN.md`
- required: `README.md`
- required: `.specs/implemented/framework-verification-becomes-driver-friendly.md`
- required: `.specs/implemented/framework-verification-becomes-driver-friendly.zh.md`
- required: `lib/verification.js`
- required: `lib/specs.js`
- required: `lib/spec-decomposition.js`
- required: `lib/cli.js`
- required: `tests/verification-payload-validation.test.js`
- required: `tests/verification-snapshot-refresh.test.js`
- required: `tests/verification-cli-status.test.js`
- required: `tests/verification-cli-dry-run.test.js`
- required: `tests/verification-session-relaxation.test.js`
- required: `tests/spec-decomposition-evidence-schema.test.js`
- required: `docs/user/features/verification-becomes-driver-friendly.md`
- required: `docs/user/features/verification-becomes-driver-friendly.zh.md`
- required: `docs/user/features/verification-becomes-driver-friendly.i18n.yaml`

## Acceptance

- A programmatic driver calling the new `validateVerificationPayload` API receives an aggregate list of all AC × check pairing issues in one call, not one error at a time.
- A driver that stages or commits files between `prepareVerification` and `submitResult` can call `refreshVerificationSnapshot` once and continue without abandoning the cycle.
- A driver can read the current cycle state via `design-blueprint verification status <feature-id>` without writing anything to disk.
- A driver can dry-run a verification payload via `design-blueprint verification dry-run <feature-id> --payload-file <path>` and get the same aggregate list without committing to the verification record.
- A Spec whose `## Acceptance criteria` entries declare malformed `[surface=…; moment=…; evidence=…]` tags is rejected at refine-time by `lib/spec-decomposition.js#evaluateSpec` instead of at submit-time by the verification gate.
- A submitter whose session id differs from the attempt's recorded session id can still submit, provided the `resultCapability` matches `capabilityHash`. The session id is recorded as attribution; it is no longer a security gate.
- All 244 existing host tests continue to pass.

## Notes

The four structural improvements are independent. Each one can be lifted in isolation; the Spec ships them together because they share the same Spec body, the same tests, and the same verification pattern. The session-id relaxation is the only one that touches the security model — it relies on the `capabilityHash = sha256(resultCapability)` invariant that the framework already enforces, so the relaxation is purely attributional.
