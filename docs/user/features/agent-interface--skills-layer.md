# Agent interface Skills layer

English | [中文](agent-interface--skills-layer.zh.md)

## What it does

`@dsh-plugins/design-blueprint` ships a small set of DSH Skills alongside its CLI. The Skills give the AI agent the same operations the CLI gives a human operator, exposed through DSH's native `ctx.skills` registry so they trigger automatically when the agent's task fits. The CLI is preserved: a developer can still type `design-blueprint approve`, `design-blueprint todo mark`, or `design-blueprint spec show` directly. The Skills are the AI's counterpart, not a replacement.

A Skill in this plugin is a Markdown file with YAML frontmatter (DSH's native format), bundled in the plugin at `skills/<name>/SKILL.md`. The plugin reads the file at boot, parses the frontmatter, and registers the Skill through `ctx.skills.registerProvider(...)`, mirroring the pattern used by `@deepseek-ai/dsh-skill-badge`. A Skill carries `name`, `description`, and the optional `disable-model-invocation` / `user-invocable` flags — the same flags the plugin already uses for the two project-local Skills it writes on `init` (`blueprint-doc-standards`, `blueprint-translate-docs`).

## Expected result

After this Feature ships, a fresh DSH session running against a project bound to this plugin sees five Skills in the menu:

| Skill | Invocation | What it does |
|---|---|---|
| `decompose-spec` | model-invocable | Detects a Spec that exceeds the decomposition thresholds (8 REQ, 5 scope paths, 1500 lines) and returns the violation list plus a one-line suggestion. |
| `todo-status` | model-invocable | Returns the current TODO list and verdict for a Spec without writing anything. |
| `verify-feature` | model-invocable | Runs the verification flow (start → submit → complete) and surfaces AC pass / fail per Feature. Writes one verification record; the agent surfaces findings to the human before declaring the Feature complete. |
| `grill-spec` | model-invocable | Walks the developer through the refinement questions (defaults, persistence, surface, scope, risks) before the agent invokes `blueprint_dispatch refine`. The Skill pauses for human input at each gate. |
| `handoff-spec` | model-invocable | Writes a portable Markdown summary of the current Spec lifecycle state to the OS temp directory so a fresh agent can resume. |

A developer can additionally run `design-blueprint skills list` / `show <name>` / `info <name>` from the CLI to inspect what the plugin would expose.

## How to use

The Skills are passive: DSH's skill filesystem provider discovers them at boot and the Cordis plugin registers them via `ctx.skills.registerProvider`. There is nothing to enable or configure. To inspect:

```bash
design-blueprint skills list
design-blueprint skills show decompose-spec
design-blueprint skills info decompose-spec
```

To trigger a Skill from the chat box, type `/<name>` (e.g. `/todo-status`); model-invoked Skills may also fire automatically when the agent decides they fit.

## Compatibility

The plugin keeps working on DSH releases that do not include `@deepseek-ai/dsh-skill` — the Cordis injection of `skills` is skipped, and `apply()` returns early before any registry call. The CLI subcommand `skills` is independent and always available.

## Companion diagnostics

`design-blueprint skills list` writes the bundle's Skill manifest into the diagnostics-friendly format expected by `@dsh-plugins/design-blueprint-diagnostics`. A future Spec may add a diagnostics check that the bundled Skills match the Skeleton Skills declared in `.blueprint/features/agent-interface--skills-layer.md`.

## Reference docs

- `docs/user/skills/<name>.md` — human-facing page for each promoted Skill (mattpocock template: What it does / When to reach for it / Common questions / It's working if).
- `.adr/0001-add-skills-layer.md` — WHY the Skills layer was added (architectural decision, separated from any implementation Spec).
- `.out-of-scope/` — explicit declarations of things this plugin will not do, in the mattpocock convention.
- `CONTEXT.md` — domain glossary for this plugin's own vocabulary.

## Verified current behavior

<!-- blueprint-current:agent-interface--skills-layer.md -->

### Skills loader (agent-interface--skills-layer, sub-spec A)

- AC-LOADER-001: `lib/skills/loader.js` exports `loadBundledSkills`. Given a fixture directory containing one valid SKILL.md (with name + description) and one invalid SKILL.md (with `disable-model-invocation: "yes"`), `loadBundledSkills` returns one Skill (the valid one) and logs one warning for the invalid one. [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-002: `lib/skills/frontmatter.js` parses the four keys correctly and rejects non-boolean values for the two flag keys with a clear error message. [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-003: `lib/skills.js` exports `apply`, `inject`, `name`; `inject` is `["skills"]`; `name` is `"skills-layer"`. [surface=api; moment=static; evidence=static-unit]
- AC-LOADER-004: `apply(ctx)` with `ctx.skills = undefined` returns without throwing and without registering anything. [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-005: `apply(ctx)` with a stub `ctx.skills` that records calls invokes `registerProvider(...)` exactly once with a factory whose `list()` returns `[]` when the plugin ships with an empty `skills/` directory. [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-006: `lib/index.js` injects `"skills"` alongside `["commands", "systemPrompt", "webServer", "tools"]`. [surface=api; moment=static; evidence=static-unit]
- AC-LOADER-007: `lib/index.js`'s `apply()` adds a `ctx.effect` step that runs the Skills loader before the existing registrations. [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-008: All existing tests continue to pass. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-LOADER-009: `design-blueprint scan --all --cwd .` reports 0 required issues after this Spec lands. [surface=cli; moment=terminal; evidence=contract-integration]

## Verified current behavior

<!-- blueprint-current:agent-interface--skills-bundled.md -->

### Skills content and CLI (agent-interface--skills-layer, sub-spec B)

- AC-SKILL-001: `skills/decompose-spec/SKILL.md` exists with frontmatter `name: decompose-spec`, `description: <text>`, no `disable-model-invocation` flag (so `modelInvocable` defaults to true), body referencing `lib/skills/backing-modules.js#decomposeSpec`. [surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-002: `skills/todo-status/SKILL.md` exists with frontmatter `name: todo-status`, `description: <text>`, no `disable-model-invocation` flag (so `modelInvocable` defaults to true), body referencing `lib/skills/backing-modules.js#todoStatus`. [surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-003: `skills/verify-feature/SKILL.md` exists with frontmatter `name: verify-feature`, `user-invocable: true` (no `disable-model-invocation`), body referencing `lib/skills/backing-modules.js#verifyFeature`. [surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-004: `skills/grill-spec/SKILL.md` exists with frontmatter `name: grill-spec`, `user-invocable: true` (no `disable-model-invocation`), body referencing `lib/skills/backing-modules.js#grillSpecInterview`. [surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-005: `skills/handoff-spec/SKILL.md` exists with frontmatter `name: handoff-spec`, `user-invocable: true` (no `disable-model-invocation`), body referencing `lib/skills/backing-modules.js#writeHandoffDoc`. [surface=repository; moment=static; evidence=static-unit]
- AC-CLI-001: `node lib/cli.js skills list` exits 0 and prints a Markdown table whose `name` column contains all five Skill names. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-CLI-002: `node lib/cli.js skills show decompose-spec` prints the SKILL.md body with line numbers (or refuses unless `--json` when the file contains an embedded NUL byte, matching `spec show`). [surface=cli; moment=terminal; evidence=contract-integration]
- AC-CLI-003: `node lib/cli.js skills info decompose-spec` prints `modelInvocable: true` and `userInvocable: true` plus the resolved path of the backing module. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-PKG-001: `package.json#files` contains `skills/**`. `package.json#exports` contains `./skills/*` and `./skills/<name>` entries. `package.json#lint:js` includes the new files. [surface=repository; moment=static; evidence=static-unit]
- AC-REGISTER-001: After this Spec lands, `node lib/cli.js scan --cwd .` reports 0 required issues and the loader registers 5 candidates (verified via `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/skills-loader.test.js` which gains a 6th test that asserts the bundle has 5 candidates). [surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001: All existing 173 host tests continue to pass after the change. [surface=cli; moment=terminal; evidence=contract-integration]

## Verified current behavior

<!-- blueprint-current:agent-interface--skills-conventions.md -->

### Skills conventions and documentation (agent-interface--skills-layer, sub-spec C)

- AC-ADR-001: `.adr/0001-add-skills-layer.md` exists and contains the four required MADR sections (`## Context and problem statement`, `## Decision`, `## Consequences`, plus a `Status:` line set to `Accepted`). [surface=repository; moment=static; evidence=static-unit]
- AC-OOS-001: `.out-of-scope/skills-not-rpc.md` exists and declares that Skills are not an RPC over the CLI and that a Skill never chains another Skill through the Skills registry. [surface=repository; moment=static; evidence=static-unit]
- AC-CONTEXT-001: `CONTEXT.md` exists at the repository root and lists `Skill`, `Spec`, `Feature`, `ADR`, `Component`, `verification cycle`, `Scope`, `Acceptance criterion`, and `evidence level` with a one-sentence definition each, plus a pointer to the owning authority document for `Skill`, `Spec`, and `ADR`. [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-001 through AC-DOCS-005: `docs/user/skills/<name>.{md,zh.md}` exists for each of the five Skill names (`decompose-spec`, `todo-status`, `verify-feature`, `grill-spec`, `handoff-spec`). Each English page contains the four mattpocock section headings (`## What it does`, `## When to reach for it`, `## Common questions`, `## It's working if`). [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-006: `node lib/cli.js docs check --cwd .` reports 0 required issues for the new `docs/user/skills/**` pairs. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-DOCS-007: After `design-blueprint docs confirm` runs on each of the five `docs/user/skills/<name>.md` files, `node lib/cli.js docs check --cwd .` reports 0 required and 0 recommended issues for the Skill docs. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-BRIEF-001: This `## Verified current behavior` subsection lists at least AC-ADR-001, AC-OOS-001, AC-CONTEXT-001, and AC-DOCS-001 through AC-DOCS-007. [surface=repository; moment=static; evidence=static-unit]
- AC-FEATURE-001: `.blueprint/features/agent-interface--skills-layer.md` and `.blueprint/architecture/components/agent-interface-skills-layer.md` reference `.adr/0001-add-skills-layer.md`, `.out-of-scope/skills-not-rpc.md`, `CONTEXT.md`, and `docs/user/skills/<name>.md` under their respective Reference / Companion sections. [surface=repository; moment=static; evidence=static-unit]
- AC-SCAN-001: `node lib/cli.js scan --cwd .` reports 0 required issues after this Spec lands. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001: All 199 host tests continue to pass after this Spec lands. [surface=cli; moment=terminal; evidence=contract-integration]

## Verified current behavior

<!-- blueprint-current:agent-interface--skills-design-time.md -->

### Skills design-time auto-fire extension (agent-interface--skills-layer, sub-spec D)

- AC-GRILL-DESC-001: `skills/grill-spec/SKILL.md` frontmatter `description:` contains the literal phrase "auto-fire" plus at least three of the four contexts (new Feature, architectural boundaries, over-budget Spec decomposition, "plan first" question). [surface=repository; moment=static; evidence=static-unit]
- AC-GRILL-BODY-001: `skills/grill-spec/SKILL.md` body is unchanged for the four-gate interview logic; the only diff against the sub-spec B ship is the `description:` line. [surface=repository; moment=static; evidence=static-unit]
- AC-GRILL-FLAG-001: `skills/grill-spec/SKILL.md` frontmatter still carries `user-invocable: true` (or omits the flag so the default `true` applies) and does NOT carry `disable-model-invocation: true`. [surface=repository; moment=static; evidence=static-unit]
- AC-ARCH-FILE-001: `skills/architect-feature/SKILL.md` exists at the path with valid frontmatter (`name: architect-feature`, `description:` <non-empty>) and a body that names the read paths and the five implementation module families. [surface=repository; moment=static; evidence=static-unit]
- AC-ARCH-DESC-001: `description:` of the new Skill contains the literal phrase "auto-fire" and at least two of the four trigger contexts (deciding module boundaries, decomposing a Spec, naming sub-specs by implementation module, proposing a new Feature hierarchy). [surface=repository; moment=static; evidence=static-unit]
- AC-ARCH-FLAG-001: The new Skill does NOT carry `disable-model-invocation: true`. `user-invocable` is at its default value (true). [surface=repository; moment=static; evidence=static-unit]
- AC-ARCH-NO-BACKING-001: `lib/skills/backing-modules.js` does NOT gain a new `architectFeature` export. The Skill body is the sole contract. [surface=repository; moment=static; evidence=static-unit]
- AC-LOADER-COUNT-001: `tests/skills-loader.test.js` asserts the post-Spec bundle has six candidates (the existing five plus `architect-feature`); the previous five-candidate assertion is replaced. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-GRILL-TEST-001: `tests/skills/grill-spec.test.js` adds one assertion that the frontmatter `description:` contains the literal phrase "auto-fire" and still asserts the four-gate interview keywords (`defaults`, `persistence`, `surface`, `scope`, `risks`). [surface=cli; moment=terminal; evidence=contract-integration]
- AC-ARCH-TEST-001: `tests/skills/architect-feature.test.js` exists and asserts the frontmatter `name`, `description` non-empty, no `disable-model-invocation`, plus a body-content assertion that the names of all five module families and the read-path pattern `\\.blueprint/features/.*\\.md` are present. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-DOCS-GRILL-001: `docs/user/skills/grill-spec.md` and `docs/user/skills/grill-spec.zh.md` each gain a paragraph under "When to reach for it" listing at least three of the four auto-fire contexts and a new "It's working if" bullet naming `modelInvocable: true` and `userInvocable: true`. [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-ARCH-001: `docs/user/skills/architect-feature.md` and `docs/user/skills/architect-feature.zh.md` exist and each contain the four mattpocock section headings (`## What it does`, `## When to reach for it`, `## Common questions`, `## It's working if`). [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-CHECK-001: After `docs confirm` runs on each of the two new and two updated English pages, `node lib/cli.js docs check --cwd .` reports 0 required and 0 recommended issues for the affected Skill docs. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-SCAN-001: `node lib/cli.js scan --cwd .` reports 0 required issues after this Spec lands. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001: All 199 host tests continue to pass after the change. [surface=cli; moment=terminal; evidence=contract-integration]
