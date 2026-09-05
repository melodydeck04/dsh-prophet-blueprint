---
name: decompose-spec
description: Detect a Spec that exceeds the decomposition thresholds and return the violation list plus a one-line suggestion. Use when the user asks whether a Spec is too big, mentions 'decompose', asks 'is this Spec within budget?', or the model is about to refine a Spec that may breach the framework's REQ / scope path / line limits.
---

# decompose-spec

Run `decomposeSpec` from `lib/skills/backing-modules.js#decomposeSpec` on the referenced Spec path and return `{ ok, violations, suggestion }`. Do not write to disk.

Steps:

1. Resolve the Spec path from the user message (default to the most recently touched proposed Spec if the user did not name one).
2. Call `decomposeSpec({ file: specPath, config })` from `lib/skills/backing-modules.js#decomposeSpec`. The config block is loaded from `design-blueprint.json` via `lib/config.js#loadConfig`; pass it through unchanged.
3. Return the result verbatim. If `ok` is `true`, say so in one sentence. If `ok` is `false`, list each violation in its own bullet, then surface `suggestion` as a one-line recommendation.
4. Do not propose specific code or Spec text. The user owns the rewrite.

Notes:

- The current thresholds are 35 REQ, 8 scope paths, 2000 lines (set in `design-blueprint.json#decomposition`). Anything under those counts is fine; anything over should be split.
- The backing function is read-only. It does not modify the Spec or its approval state.
- If the Spec file does not exist, return `{ ok: false, violations: [{ code: "ENOENT" }], suggestion: "Spec not found at <path>" }`. Do not invent content.