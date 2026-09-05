# `decompose-spec`

English | [中文](decompose-spec.zh.md)

Detect a Spec that exceeds the decomposition thresholds and return the violation list plus a one-line suggestion. Read-only.

## What it does

Runs `decomposeSpec` from `lib/skills/backing-modules.js#decomposeSpec` on the referenced Spec path and returns `{ ok, violations, suggestion }`. Does not write to disk, does not split the Spec, does not create a new Spec. The function loads the Spec's content, applies the project's `decomposition` thresholds from `design-blueprint.json`, and reports which rule the Spec breaks.

## When to reach for it

- The user asks "is this Spec too big?", "does this Spec exceed the budget?", or "can this Spec fit in one Feature?".
- The user mentions `decompose` in the context of a Spec, not a feature decomposition.
- The model is about to call `blueprint_dispatch refine` on a Spec that may breach the framework's REQ, scope path, or line limits and wants a quick check first.
- The model is reviewing a Spec for any reason and wants the threshold report before recommending an action.
- The user types `/decompose-spec` followed by a Spec path.

## Common questions

**Is this Skill model-invocable?** Yes. The Skill carries no `disable-model-invocation` flag, so the runtime catalog exposes it to the model. The DSH agent may fire it on its own when its task fits (for example, before calling `blueprint_dispatch refine` on a Spec). The Skill is also user-invocable: the human can type `/decompose-spec` directly.

**Does `decompose-spec` rewrite the Spec?** No. It returns a structured report. The user owns the rewrite; the model suggests where to split, the user decides.

**What does `suggestion` look like?** A one-line recommendation such as "Split Spec at REQ-X..REQ-Y into a new sub-Spec". When `ok` is true, `violations` is empty and `suggestion` is null.

**Which thresholds does it check?** The current numbers live in `design-blueprint.json#decomposition`. The defaults (in case the section is missing) are 8 REQ, 5 scope paths, 1500 lines. Anything under those counts is fine.

**What if the Spec path is wrong?** The Skill body tells the model to default to the most recently touched proposed Spec. If the model picks the wrong file, the result still returns cleanly with `ok: false` and a `path-not-found` violation, not a thrown error.

## It's working if

- The result includes `ok`, `violations`, and `suggestion` keys.
- `violations` lists every rule the Spec breaks (REQ count, scope path count, line count) when `ok` is false.
- `suggestion` names a concrete REQ range to extract when the Spec is too big.
- The Skill body does not write anything: no new file under `.specs/`, no `.todos.yaml` change, no verification record.
- The user can immediately read the result and decide whether to refine the Spec or split it.

## Reference

- Source: `skills/decompose-spec/SKILL.md`
- Backing module: `lib/skills/backing-modules.js#decomposeSpec`
- Audit: `design-blueprint skills info decompose-spec`
- Feature brief: `docs/user/features/agent-interface--skills-layer.md`
