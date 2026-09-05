# `verify-feature`

English | [中文](verify-feature.zh.md)

Run the verification flow for one Feature and print AC pass / fail per Feature. Writes one verification record.

## What it does

Runs the three-step verification flow on one Feature id: `startFeatureVerification` → `submitFeatureVerificationResult` → `completeVerifiedFeature` (or `requestLegacyFeatureVerification` for historical implementations). The Skill calls `verifyFeature` from `lib/skills/backing-modules.js#verifyFeature`, which re-exports the framework's existing verification orchestration. The Skill writes exactly one verification record at `.blueprint/verifications/<feature-id>.json` and returns the AC pass/fail table.

## When to reach for it

- The model decides the implementation cycle for a Feature has produced enough evidence and wants the framework to evaluate it before recommending the next Spec or the next development task.
- The user types `/verify-feature` and names a Feature id.
- The user asks "did this Feature pass?", "are all ACs green?", "what's blocking this Feature?".
- The implementation work for a Spec has just landed and either the human or the agent wants the framework to evaluate it.

## Common questions

**Is this Skill model-invocable?** Yes. The Skill carries no `disable-model-invocation` flag, so the runtime catalog exposes it to the model. The DSH agent may fire it on its own when its task fits (for example, after implementing a Spec, before suggesting the next one). The Skill is also user-invocable: the human can type `/verify-feature` directly. The "human in the loop" check is not enforced by the Skill's invocation policy; it is the agent's responsibility to surface findings with `severity: required` to the user before declaring the Feature complete.

**What does the backing module actually write?** One file: `.blueprint/verifications/<feature-id>.json`. The Skill body does not write anywhere else. The Skill body documents this so the model can decide whether to call the Skill or recommend a different action.

**What if the Feature has no approved Spec yet?** The framework rejects the request with `feature '<id>' requires at least one valid non-deprecated Component owner before approval`. The Skill body surfaces that error verbatim; it does not invent a default.

**What if I run it twice?** The framework's verification flow is idempotent on the active cycle. The second call sees the previous attempt in the record and short-circuits to `idempotent: true` if the prior attempt's result matches.

**What about historical Features (no active cycle)?** The Skill body routes to `requestLegacyFeatureVerification`, which handles lifecycle-drifted implementations whose Spec status is `implemented` but whose verification record was never opened. The output looks the same to the user.

## It's working if

- A verification record appears at `.blueprint/verifications/<feature-id>.json` with `stage: completed`.
- The result prints the AC pass/fail table for the Feature, naming each AC by id.
- Findings with `severity: required` are surfaced to the user verbatim.
- The user can re-run `/verify-feature` immediately and get `idempotent: true` (the second call does no new work).
- The Feature's `.blueprint/features/<feature-id>.md` `Acceptance` section aligns with the verification record's verdict.

## Reference

- Source: `skills/verify-feature/SKILL.md`
- Backing module: `lib/skills/backing-modules.js#verifyFeature`
- Audit: `design-blueprint skills info verify-feature`
- Feature brief: `docs/user/features/agent-interface--skills-layer.md`
