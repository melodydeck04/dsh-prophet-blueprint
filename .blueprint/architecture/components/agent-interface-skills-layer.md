# Component: Agent interface Skills layer

Id: agent-interface-skills-layer
Kind: plugin
Container: none
Deployment:
Status: active

## Summary

Bundles DSH Skills alongside the plugin and registers them through the native `ctx.skills` registry so the AI agent gets the same operations the CLI gives a human operator, exposed through DSH's automatic Skills system.

## Owned paths

- `lib/skills.js`
- `lib/skills/**`
- `skills/**`
- `tests/skills/**`
- `tests/skills-loader.test.js`
- `tests/skills-cli.test.js`

## Provided contracts

No provided contracts declared.

## Dependencies

- `@deepseek-ai/dsh-skill` (peer) — provides `ctx.skills.registerProvider(...)` and `BUNDLED_SKILL_RANK`.
- `@deepseek-ai/cordis` (peer) — the plugin composition framework.

## Supported features

- agent-interface--skills-layer

## Documents

- required: `.specs/implemented/agent-interface--skills-layer.md`
- required: `.specs/implemented/agent-interface--skills-bundled.md`

## Surface

### Modules

- `lib/skills.js` — Cordis plugin shape (`name = "skills-layer"`, `inject = ["skills"]`, `apply(ctx)`); registers one Skills provider via `ctx.skills.registerProvider(...)`; no-ops when `ctx.skills` is unavailable.
- `lib/skills/loader.js` — `loadBundledSkills({ pluginRoot })` walks `skills/` one level deep, reads every `SKILL.md`, returns the survivors.
- `lib/skills/frontmatter.js` — `parseFrontmatter(text)`, `mapFlagsToInvocation(...)`, `FrontmatterError`; hand-rolled YAML reader scoped to four keys.
- `lib/skills/backing-modules.js` — pure functions (`decomposeSpec`, `todoStatus`, `verifyFeature`, `grillSpecInterview`, `writeHandoffDoc`) called from Skill bodies at runtime.
- `lib/skills/cli.js` — `runSkillsCommand(args, cwd)` dispatching `list|show|info` to the same loader.

### Plugin entry

`lib/index.js` adds `"skills"` to its `inject` array and registers the loader through a `ctx.effect` step that lazy-imports `lib/skills.js` before the existing service registrations.

## Contracts

- Skills follow DSH's native format: `name` (kebab-case, required), `description` (non-empty, required), `disable-model-invocation` (boolean, optional), `user-invocable` (boolean, optional).
- A Skill with both flags resolving to false is dropped at load with a warning naming the Skill and the predicate.
- A Skill with `disable-model-invocation: true` is user-invoked; a Skill with `user-invocable: false` is model-only; a Skill with neither flag is reachable from both surfaces.
- The provider registers at runtime Skill rank (`BUNDLED_SKILL_RANK = 250`); project-local Skills (rank 100/200) lose name conflicts.
- Five concrete Skills ship in `skills/<name>/SKILL.md`: `decompose-spec`, `todo-status`, `verify-feature`, `grill-spec`, `handoff-spec`.
- All five bundled Skills are model-invocable and user-invocable: none carries `disable-model-invocation: true` or `user-invocable: false`. The runtime catalog exposes each Skill to both surfaces. Skills that mutate state (`verify-feature`, `grill-spec`, `handoff-spec`) document their write semantics in the Skill body; the agent is expected to surface `severity: required` findings to the human before declaring the Feature complete.
- `design-blueprint skills list|show|info` is registered on `lib/cli.js` and is read-only (no CLI flag mutates state).

## Compatibility

`apply(ctx)` returns early when `ctx.skills.registerProvider` is not a function, so the plugin loads on DSH releases that predate `@deepseek-ai/dsh-skill`. Other plugin services register normally.

## Subordinate Specs

- `.specs/implemented/agent-interface--skills-layer.md` (sub-spec A: loader + Cordis plugin)
- `.specs/implemented/agent-interface--skills-bundled.md` (sub-spec B: Skills content bundle + CLI subcommand)
- `.specs/implemented/agent-interface--skills-conventions.md` (sub-spec C: ADR, out-of-scope, glossary, per-Skill docs)

## Companion documentation

- `.adr/0001-add-skills-layer.md` — WHY the Skills layer was added (architectural decision record).
- `.out-of-scope/skills-not-rpc.md` — explicit non-goals: Skills are not an RPC over the CLI; a Skill never chains another Skill.
- `CONTEXT.md` — domain glossary for the plugin's own vocabulary (Skill, Spec, Feature, ADR, etc.).
- `docs/user/skills/<name>.{md,zh.md}` — human-facing page for each of the five Skills (`decompose-spec`, `todo-status`, `verify-feature`, `grill-spec`, `handoff-spec`).