# ADR: Add a DSH Skills layer alongside `blueprint_dispatch`

Status: Accepted
Date: 2026-09-04

## Context and problem statement

`@dsh-plugins/design-blueprint` exposes its operations to the AI agent through exactly one surface: the `blueprint_dispatch` tool, registered via `ctx.tools`. Every AI-driven action — start a Feature implementation, request verification, decompose a Spec, surface a TODO state, run a refinement interview, write a handoff — funnels through that single heavyweight tool. Each call spends tokens on the full Spec lifecycle machinery even when the agent only wanted to ask "is this Spec over the decomposition threshold?" or "what is the current TODO state of this Spec?".

DSH already exposes a second, narrower surface for plugins that bundle Skills: `ctx.skills.registerProvider(...)`. `@deepseek-ai/dsh-skill-badge` is the 53-line reference implementation. Plugins ship Skills as harness-neutral `SKILL.md` files and the runtime discovers them at boot. The agent invokes a Skill when its trigger phrase matches, and the Skill body carries the imperative instructions the model follows.

This plugin today registers zero Skills. A developer who runs DSH against a project bound to this plugin sees no Skills, the auto-trigger logic has nothing to fire on, and narrow operations still flow through the heavy `blueprint_dispatch` tool. The CLI commands that the human operator uses (`approve`, `todo mark`, `spec show`) have no AI-side counterpart — they exist only on the human-facing surface.

The plugin's two project-local Skills (`blueprint-doc-standards`, `blueprint-translate-docs`), written by `lib/init.js`, demonstrate that the plugin already knows how to ship Skills. They just cover documentation work; the plugin's own workflow operations are not exposed.

## Decision

Ship a Skills layer alongside the existing `blueprint_dispatch` tool. Five concrete Skills bundle in the plugin at `skills/<name>/SKILL.md`:

- `decompose-spec` (model-invoked) — detects a Spec over the decomposition thresholds and returns `{ ok, violations, suggestion }` without writing.
- `todo-status` (model-invoked) — returns the current TODO list and verdict for a Spec without writing.
- `verify-feature` (user-invoked) — runs the verification flow (`start → submit → complete`) and surfaces AC pass / fail per Feature.
- `grill-spec` (user-invoked) — walks the developer through the refinement questions before `blueprint_dispatch refine` is invoked.
- `handoff-spec` (user-invoked) — writes a portable Markdown summary of the current Spec lifecycle state to `os.tmpdir()` so a fresh agent can resume.

The Skills follow DSH's native format: `name` (kebab-case), `description` (non-empty), `disable-model-invocation` (optional boolean), `user-invocable` (optional boolean). The harness-neutral `SKILL.md` shape is DSH's only required surface; no `agents/openai.yaml` companion file is added because DSH does not read it.

The plugin registers the Skills at boot via `ctx.skills.registerProvider(...)` from `lib/skills.js`, mirroring the pattern used by `@deepseek-ai/dsh-skill-badge`. A read-only CLI subcommand (`design-blueprint skills list|show|info`) lets the human operator audit the bundle from the terminal without typing `/<name>` in chat. The CLI subcommand is informational; authoritative state changes still go through `blueprint_dispatch` or the CLI.

The plugin ships the Skill bodies as Markdown files. The model sees the body in a `<skill_content>` block; no HTML or special characters are needed. Each Skill body references a pure function in `lib/skills/backing-modules.js` that the runtime calls.

## Consequences

The plugin gains a narrow AI surface. The agent can run a five-skill subset of the framework's operations without paying the `blueprint_dispatch` token cost on every call. Model-invoked Skills trigger automatically when the agent's task fits; user-invoked Skills require explicit human typing, preserving a human-in-the-loop checkpoint for state-mutating operations (`verify-feature`, `grill-spec`, `handoff-spec` all write state).

The CLI surface is unchanged. Existing commands continue to work; the Skills are not a replacement, only an additional surface. The plugin's two project-local Skills (`blueprint-doc-standards`, `blueprint-translate-docs`) are unaffected.

The plugin takes on a small bundle to keep in sync: five `SKILL.md` files, one `lib/skills/backing-modules.js` module, one `lib/skills/cli.js` module, one `docs/user/skills/<name>.md` page per Skill, and one `.adr/` plus one `.out-of-scope/` plus one `CONTEXT.md` documentation surface. A future Feature that adds a sixth Skill lands as another Spec under this same Feature.

The implementation details live in sub-spec A (loader + Cordis plugin shape) and sub-spec B (Skill bodies + CLI subcommand). This ADR is the WHY. The companion file `.out-of-scope/skills-not-rpc.md` declares the non-goals. The per-Skill docs at `docs/user/skills/<name>.md` are the HOW for each individual Skill. Future contributors should read this ADR first, then the Feature brief, then the Skill page they care about.
