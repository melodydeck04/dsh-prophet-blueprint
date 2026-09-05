# `grill-spec`

English | [中文](grill-spec.zh.md)

Walk the developer through the Spec refinement questions before `blueprint_dispatch refine` is invoked. Stateful.

## What it does

Runs the four-gate interview (`grillSpecInterview` from `lib/skills/backing-modules.js#grillSpecInterview`) on the referenced Spec path. The Skill carries an in-memory interview state per session: defaults, persistence, surface, scope, risks. Each gate resolves to either `set`, `skip`, or `default`. The Skill refuses to invoke `blueprint_dispatch refine` until every gate resolves, or the developer explicitly skips one with a recorded reason.

## When to reach for it

- The model is about to call `blueprint_dispatch refine` on a Spec and wants to settle defaults, persistence, surface, scope, and risks first; the Skill serves as a structured warm-up.
- The user types `/grill-spec` followed by a Spec path (or with no path, to grill the most recently touched proposed Spec).
- The user asks "before I refine, can you walk me through the questions?", "I want to think through this Spec before invoking `refine`", "what should I settle before refining?".
- The user has just opened a new proposed Spec and wants to make sure defaults, persistence, surface, scope, and risks are settled before they author the body.

### Auto-fire contexts (model-invocable)

The Skill also auto-fires without the user typing `/grill-spec` when the developer is in the middle of design work. The model recognizes four contexts:

1. The developer says they are about to design a new Feature, scaffold a Feature brief, or propose a new sub-spec.
2. The developer describes a change that touches architectural boundaries (module ownership, public contracts, persistence, deployment, permissions, migration, concurrency).
3. The developer pastes an over-budget Spec and asks how to split it.
4. The developer asks "should I plan this first?" or "what's the scope?" before refinement.

In every auto-fire context the model surfaces the four gates one at a time and pauses for the developer's answers. The Skill never invents defaults on its own.

## Common questions

**Is this Skill model-invocable?** Yes. The Skill carries no `disable-model-invocation` flag, so the runtime catalog exposes it to the model. The DSH agent may fire it on its own when its task fits (for example, right before recommending `blueprint_dispatch refine`). The Skill is also user-invocable: the human can type `/grill-spec` directly. The interview pauses for input either way; the agent fires it but waits for the developer's answers before proceeding.

**Why does the Skill pause for human input if the model fires it?** Because the interview cannot resolve without a developer answering each gate. The Skill body tells the model to surface the gates one at a time and wait. A model that runs `grill-spec` must hand control back to the developer for each gate; the backing module does not invent defaults on its own.

**What does "set" vs "default" vs "skip" mean?** `set` means the developer answered with a value that overrides the gate's default. `default` means the developer accepted the framework's default. `skip` means the developer explicitly skipped the gate and the Skill records the reason in the interview state.

**Can I re-grill after `set`?** Yes. The interview state lives in the session and the developer can re-open any gate, change its answer, and re-run. Each re-grill writes a new state transition with the previous answer and the new answer.

**Does the Skill write to the Spec?** No. The Skill only writes the interview state. The actual Spec edits happen later, after `blueprint_dispatch refine` is invoked (or independently, with the interview state as guidance).

**What does `blueprint_dispatch refine` see?** It sees the most recent interview state if the developer tags the Spec with it. The framework does not enforce that the developer uses `grill-spec` first; the Skill is a guided warm-up, not a gate.

## It's working if

- The Skill prints each gate (defaults, persistence, surface, scope, risks) one at a time, with the framework's default visible.
- Each gate records the developer's answer (`set` / `default` / `skip`) into the in-session state.
- The Skill refuses to invoke `blueprint_dispatch refine` until every gate is `set`, `default`, or explicitly `skip`-ped with a reason.
- The final state, when printed, lists every gate's resolution and the reasons for any `skip`s.
- The Spec itself is untouched during the interview.
- The Skill appears in the catalog with `modelInvocable: true` and `userInvocable: true`, and the model auto-fires it on design activity (new Feature, architectural boundaries, over-budget Spec decomposition, "plan first" question) without the developer typing `/grill-spec`.

## Reference

- Source: `skills/grill-spec/SKILL.md`
- Backing module: `lib/skills/backing-modules.js#grillSpecInterview`
- Audit: `design-blueprint skills info grill-spec`
- Feature brief: `docs/user/features/agent-interface--skills-layer.md`
