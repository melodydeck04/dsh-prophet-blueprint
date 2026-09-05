# Feature: Agent interface Skills layer

Id: agent-interface--skills-layer
Parent: spec-governance--architecture-design
Status: active

## Summary

Exposes AI-facing workflows as DSH Skills (harness-neutral SKILL.md plus agents/openai.yaml files) so the model can invoke framework operations through the same harness-agnostic mechanism used for mattpocock/skills, while the existing CLI commands continue to serve human operators directly. The Skills layer is the atomic AI workflow interface; the spec-driven framework remains the orchestration layer above it.

## Scope

- `lib/skill-loader.js`
- `lib/plugin-bootstrap.js` (new, registers Skills at plugin load)
- `.dsh/skills/**`
- `.claude-plugin/plugin.json`
- `.adr/**`
- `.out-of-scope/**`
- `CONTEXT.md`
- `docs/user/features/agent-interface--skills-layer.{md,zh.md,i18n.yaml}`
- `docs/user/skills/**` (bilingual docs pages for each promoted Skill)
- `tests/skill-loader.test.js`
- `tests/skills/**` (one test file per Skill)

## Components

- `agent-interface-skills-layer` — the Skills loader and Skill registry.

## Documents

- required: `AGENTS.md`
- required: `DESIGN.md`
- required: `README.md`
- required: `docs/user/features/agent-interface--skills-layer.md`
- required: `docs/user/features/agent-interface--skills-layer.zh.md`
- required: `docs/user/features/agent-interface--skills-layer.i18n.yaml`

## Initial Skills (named in the Feature-linked Spec)

| Skill | Invocation | Backing module |
|---|---|---|
| `decompose-spec` | model-invocable | `lib/spec-decomposition.js` |
| `todo-status` | model-invocable | `lib/cli.js` (todo status subcommand) |
| `verify-feature` | model-invocable | `lib/verification.js` + `lib/orchestration.js` |
| `grill-spec` | model-invocable | new interview-state module |
| `handoff-spec` | model-invocable | new handoff writer |

All five Skills are model-invocable (the DSH agent may auto-fire them based on context) and user-invocable (the human operator may type `/<name>` directly). No Skill carries `disable-model-invocation: true` or `user-invocable: false` in its frontmatter, so the runtime catalog exposes every Skill to both surfaces. Skills that mutate state (`verify-feature`, `grill-spec`, `handoff-spec`) document their write semantics in the Skill body; the agent is expected to surface `severity: required` findings to the human before declaring the Feature complete.

## Out of scope (this Feature)

- Replacing the CLI surface. CLI commands stay; Skills do not retire or alias them.
- Replacing the Spec lifecycle. Skills sit below the Spec lifecycle; they do not create or approve Specs.
- Adding new CLI commands. CLI growth continues through separate Feature-linked Specs.

## Acceptance

- The framework's existing tests still pass (no regression in spec lifecycle, approval flow, or verification).
- Each promoted Skill is registered exactly once at plugin bootstrap; the loader rejects duplicates, malformed frontmatter, and missing companion files.
- Every promoted Skill is reachable from both the model and the human operator. The runtime catalog exposes each Skill with `modelInvocable: true` and `userInvocable: true`.
- A bilingual docs page exists for every promoted Skill, synced via `design-blueprint docs check`.
- `.adr/0001-add-skills-layer.md` records WHY the Skills layer was added (separated from any implementation Spec).

## Reference docs

- `DESIGN.md` section on Skills loader — seam between plugin bootstrap and DSH skill system, written when the implementation Spec lands.
- `.adr/0001-add-skills-layer.md` — architectural decision record (WHY), written when sub-spec C lands.
- `.out-of-scope/skills-not-rpc.md` — explicit declaration that Skills are not an RPC over the CLI and that a Skill never chains another Skill.
- `CONTEXT.md` — domain glossary for the plugin's own vocabulary.
- `docs/user/skills/<name>.md` — human-facing page for each promoted Skill (mattpocock template: What it does / When to reach for it / Common questions / It's working if).