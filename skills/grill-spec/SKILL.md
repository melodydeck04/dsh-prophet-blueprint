---
name: grill-spec
description: auto-fire when the developer is about to design a new Feature, decompose an over-budget Spec into module-aligned sub-specs, or modify a change that touches architectural boundaries (module ownership, public contracts, persistence, deployment, permissions, migration, concurrency). Also auto-fires when the developer asks "should I plan this first?" or "what's the scope?" before refinement. Walks the developer through the Spec refinement questions (defaults, persistence, surface, scope, risks) before `blueprint_dispatch refine` is invoked. The model can also auto-fire it on design activity; the human operator may still type `/grill-spec` to force the interview.
user-invocable: true
---

# grill-spec

Drive a four-gate interview with the developer before any Spec is refined. The interview surfaces the product shape, the persistence model, the delivery surface, the scope, and the risks. Refuse to invoke `blueprint_dispatch refine` until each gate resolves or the developer explicitly skips it.

Steps:

1. Resolve the working Spec path (default to the most recently touched proposed Spec, or ask if none).
2. Call `grillSpecInterview({ specPath, answers: {} })` from `lib/skills/backing-modules.js#grillSpecInterview`. The function returns the next pending gate plus the four standard gate objects: `defaults`, `persistence`, `surface`, `scope`, `risks`.
3. For each gate, present the developer with one focused question. The questions live in `lib/skills/backing-modules.js#grillSpecInterview` and are written in plain English. The model relays them verbatim and returns the developer's answer to the next call.
4. When all five gates have either an answer or an explicit skip, return a short summary. The summary is a Markdown checklist the developer can paste into the Spec as `## Notes`.
5. After the interview, the human can call `blueprint_dispatch refine` themselves. The skill does not call refine on the developer's behalf.

Notes:

- The interview is multi-turn. The model must call `grillSpecInterview` once per turn, passing the running `answers` map.
- A "skip" answer is recorded as `answers.<gate> = null` and the gate moves on. Skips are visible in the summary.
- Do not invent answers for the developer. If the developer gives a one-word reply, the model asks for the missing detail before moving on.
- The skill is `user-invocable: true`. The model may not auto-trigger it; the human must type `/grill-spec`.