---
name: verify-feature
description: Run the verification flow for one Feature and print AC pass / fail per Feature. Use when the user types `/verify-feature` or asks to run the AC checks for a specific Feature.
user-invocable: true
---

# verify-feature

Run the framework's three-step verification flow for one Feature and print a per-AC result. Writes one verification record to `.blueprint/verifications/<feature-id>.json`. Do not retry; the flow is idempotent on the active cycle.

Steps:

1. Resolve the Feature id from the user message. Refuse to proceed if the id is missing or the Feature has no approved Spec.
2. Call `verifyFeature({ featureId })` from `lib/skills/backing-modules.js#verifyFeature`. The function:
   - Calls `lib/verification.js#startFeatureVerification({ cwd, featureId, snapshot: workingTree })` to register the attempt.
   - For each `AC-*` in the Spec, decides passed / failed based on the matching `## Verification` line in the Spec.
   - Calls `lib/verification.js#submitFeatureVerificationResult` to record one entry per AC.
   - Calls `lib/orchestration.js#complete` to move the Feature to `stage: completed`.
3. Return the per-AC table (columns `id`, `verdict`, `evidence`) plus a one-line summary. The summary counts passed / failed / total.
4. If the Feature is already at `stage: completed`, return the existing verdict without rerunning the flow.

Notes:

- The flow writes to `.blueprint/verifications/<feature-id>.json`. That file is a record, not a transient output. Do not delete it.
- The skill is `user-invocable: true`. The model may not auto-trigger it; the human must type `/verify-feature <id>`.
- If `startFeatureVerification` throws because the Spec is not approved, surface the error verbatim and stop. Do not start a verification cycle for an unapproved Feature.