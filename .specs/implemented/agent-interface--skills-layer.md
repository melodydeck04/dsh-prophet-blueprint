# Spec: Skills loader (agent-interface--skills-layer, sub-spec A)

Status: implemented
Feature: agent-interface--skills-layer
Parent: spec-governance--architecture-design
Companion: agent-interface--skills-content (sub-spec B), agent-interface--skills-conventions (sub-spec C)

## Problem

`@dsh-plugins/design-blueprint` exposes its operations to the AI agent through one surface: the `blueprint_dispatch` tool (registered via `ctx.tools`). The agent has no second, narrower surface keyed on DSH's native Skills system (`ctx.skills`), so narrow operations like "is this Spec over the decomposition threshold?" or "what is the current TODO state of this Spec?" require either inventing a private invocation pattern against the underlying library or falling back to the heavy `blueprint_dispatch` tool. Both are wrong: the first loses audit, the second costs tokens.

DSH already exposes `ctx.skills.registerProvider(...)` for plugins that bundle Skills (`@deepseek-ai/dsh-skill-badge` is the 53-line reference). The plugin today registers zero Skills. This Spec adds the loader that reads `skills/<name>/SKILL.md` files at boot, parses their frontmatter, and registers them with `ctx.skills`. It is the smallest possible change that gives the agent a Skills surface; the Skill content, CLI subcommand, and documentation conventions live in companion Specs (sub-spec B and C) that follow.

## Scope

### Allowed paths

- allow: `lib/skills.js`
- allow: `lib/skills/loader.js`
- allow: `lib/skills/frontmatter.js`
- allow: `.blueprint/features/agent-interface--skills-layer.md`
- allow: `.blueprint/architecture/components/agent-interface-skills-layer.md`
- allow: `docs/user/features/agent-interface--skills-layer.md`
- allow: `docs/user/features/agent-interface--skills-layer.zh.md`
- allow: `docs/user/features/agent-interface--skills-layer.i18n.yaml`

### Denied paths

- deny: `lib/spec-decomposition.js`
- deny: `lib/spec-todos.js`
- deny: `lib/todo-events.js`
- deny: `lib/verification.js`
- deny: `lib/orchestration.js`
- deny: `lib/scan.js`
- deny: `lib/specs.js`
- deny: `lib/policy.js`
- deny: `lib/config.js`
- deny: `lib/features.js`
- deny: `lib/architecture.js`
- deny: `lib/artifacts.js`
- deny: `lib/reconciliation.js`
- deny: `lib/snapshot.js`
- deny: `lib/project-binding.js`
- deny: `lib/version.js`
- deny: `lib/stamps.js`
- deny: `lib/path-utils.js`
- deny: `lib/docs.js`
- deny: `lib/init.js`
- deny: `lib/project-root.js`
- deny: `lib/project-discovery.js`
- deny: `lib/invariant.js`
- deny: `lib/web-api.js`
- deny: `lib/client.js`
- deny: `lib/workflow.js`
- deny: `lib/chat-commands.js`
- deny: `lib/assistant-actions.js`
- deny: `lib/todo-store.js`
- deny: `lib/install-hook.js`
- deny: `lib/skills/cli.js`
- deny: `lib/skills/backing-modules.js`
- deny: `lib/cli.js`
- deny: `skills/**`
- deny: `.adr/**`
- deny: `.out-of-scope/**`
- deny: `CONTEXT.md`
- deny: `.blueprint/approvals/**`
- deny: `.blueprint/verifications/**`
- deny: `.blueprint/architecture/**` outside this Spec pair
- deny: `.specs/**` outside this Spec pair
- deny: `docs/i18n/**`
- deny: `docs/AGENTS.md`
- deny: `design-blueprint.json`
- deny: `AGENTS.md`
- deny: `README.md`
- deny: `README.zh.md`
- deny: `README.i18n.yaml`
- deny: `cordis.patch.yml`
- deny: `.claude-plugin/**`

## Decision
### Loader shape

`lib/skills/loader.js` exports `loadBundledSkills({ pluginRoot })` returning `Skill[]` where each Skill carries `{ name, description, invocation, body, filePath }`. The function walks `skills/` one level deep, reads every `SKILL.md`, parses the frontmatter through `lib/skills/frontmatter.js#parseFrontmatter`, validates `name` (kebab-case) and `description` (non-empty), and returns the survivors. Files that fail validation are dropped with a warning logged through the standard plugin logger; the loader does not throw on individual failures.

### Frontmatter schema

`lib/skills/frontmatter.js` exports `parseFrontmatter(text) -> { name, description, invocation, raw, errors }`. The function uses a small hand-rolled YAML reader for the four documented keys (`name`, `description`, `disable-model-invocation`, `user-invocable`). It does NOT depend on a YAML package — the schema is fixed and small. Non-boolean values for `disable-model-invocation` or `user-invocable` produce an error and drop the Skill. The mapping follows DSH's documented behavior:

| `disable-model-invocation` | `user-invocable` | `invocation.modelInvocable` | `invocation.userInvocable` |
|---|---|---|---|
| absent | absent | true | true |
| `true` | absent | false | true |
| absent | `false` | true | false |
| `true` | `false` | (dropped) | (dropped) |

### Cordis plugin shape

`lib/skills.js` exports the standard DSH plugin shape: `name = "skills-layer"`, `inject = ["skills"]`, `apply(ctx)`. `apply(ctx)` checks `typeof ctx.skills?.registerProvider === "function"`; if false, returns without registering anything. If true, calls `ctx.skills.registerProvider(() => provider)` exactly once, where `provider.list()` returns the loader's Skills re-shaped into DSH's candidate shape (`{ name, description, invocation, provider: "design-blueprint", source: "bundled", resourceBase, rank: BUNDLED_SKILL_RANK, locator }`) and `provider.get(candidate)` returns the candidate augmented with `content` set to the loaded body.

### Plugin entry extension

`lib/index.js` adds `"skills"` to its `inject` array. Its `apply()` adds a `ctx.effect` step that lazy-imports `lib/skills.js` and runs it before the existing `commands`/`systemPrompt`/`webServer`/`tools` registrations. The lazy import is necessary so the plugin can be loaded on DSH releases that predate `@deepseek-ai/dsh-skill`.

### Empty bundle is a valid state

When `skills/` does not exist (companion Specs B and C not yet shipped, or the plugin is consumed in a thin deployment), `loadBundledSkills` returns `[]`, the provider registers with zero candidates, and no Skill appears in any catalog. Sub-spec A ships in this empty state and is the foundation for sub-specs B (which fills `skills/`) and C (which writes the docs).

## Acceptance criteria

- AC-LOADER-001: `lib/skills/loader.js` exports `loadBundledSkills`. Given a fixture directory containing one valid SKILL.md (with name + description) and one invalid SKILL.md (with `disable-model-invocation: "yes"`), `loadBundledSkills` returns one Skill (the valid one) and logs one warning for the invalid one. [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-002: `lib/skills/frontmatter.js` parses the four keys correctly and rejects non-boolean values for the two flag keys with a clear error message. [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-003: `lib/skills.js` exports `apply`, `inject`, `name`; `inject` is `["skills"]`; `name` is `"skills-layer"`. [surface=api; moment=static; evidence=static-unit]
- AC-LOADER-004: `apply(ctx)` with `ctx.skills = undefined` returns without throwing and without registering anything. [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-005: `apply(ctx)` with a stub `ctx.skills` that records calls invokes `registerProvider(...)` exactly once with a factory whose `list()` returns `[]` when the plugin ships with an empty `skills/` directory. [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-006: `lib/index.js` injects `"skills"` alongside `["commands", "systemPrompt", "webServer", "tools"]`. [surface=api; moment=static; evidence=static-unit]
- AC-LOADER-007: `lib/index.js`'s `apply()` adds a `ctx.effect` step that runs the Skills loader before the existing registrations. [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-008: All existing tests continue to pass. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-LOADER-009: `design-blueprint scan --all --cwd .` reports 0 required issues after this Spec lands. [surface=cli; moment=terminal; evidence=contract-integration]

## Verification

- AC-LOADER-001: test `tests/skills-loader.test.js#loadBundledSkills drops invalid Skills and warns` [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-002: test `tests/skills-loader.test.js#parseFrontmatter handles flag keys and rejects non-boolean values` [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-003: test `tests/skills-loader.test.js#lib/skills.js exports the Cordis plugin shape` [surface=api; moment=static; evidence=static-unit]
- AC-LOADER-004: test `tests/skills-loader.test.js#apply is a no-op when ctx.skills is undefined` [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-005: test `tests/skills-loader.test.js#apply registers one provider with empty list when bundle is empty` [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-006: test `tests/skills-loader.test.js#lib/index.js injects skills` [surface=api; moment=static; evidence=static-unit]
- AC-LOADER-007: test `tests/skills-loader.test.js#apply registers Skills before existing services` [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-008: command `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js"` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-LOADER-009: command `node lib/cli.js scan --all --cwd .` [surface=cli; moment=terminal; evidence=contract-integration]

## Risks

- DSH's `ctx.skills` API is stable across the verified release (0.1.1-rc.2, b150a55) and the next minor. A breaking change would silently no-op the loader; the `ctx.skills?.registerProvider` guard in REQ-LOADER-3 keeps the plugin loadable.
- The hand-rolled YAML reader for four keys is intentionally narrow. If a future Skill needs a richer frontmatter, the reader is replaced with a YAML package through a separate Spec; this Spec does not import one to keep the bundle small.
- The empty-bundle state means no Skill appears in the catalog until sub-spec B ships. Sub-spec A is the foundation; a developer who runs the plugin in this state will see no Skills and must wait for sub-spec B.

## Requirements

### REQ-LOADER-1 — Loader walks skills/ one level deep

`loadBundledSkills({ pluginRoot })` reads `<pluginRoot>/skills/<name>/SKILL.md` for each immediate subdirectory. Files that fail to read (I/O error, missing `---` delimiters) are skipped with a warning. The function never throws on individual file failures.

### REQ-LOADER-2 — Frontmatter parser handles the four keys

`parseFrontmatter(text)` extracts `name` (string), `description` (string), `disable-model-invocation` (optional boolean), and `user-invocable` (optional boolean). The reader is a small, dependency-free parser scoped to this schema; non-boolean values for the flag keys produce a `FrontmatterError`.

### REQ-LOADER-3 — User-invoked vs model-invoked invariant

`mapFlagsToInvocation(disableModelInvocation, userInvocable)` returns `{ modelInvocable, userInvocable }` per the table in `## Proposal`. When both flags resolve to false, the Skill is dropped at load with a warning that names the Skill and the predicate.

### REQ-LOADER-4 — Cordis plugin shape

`lib/skills.js` exports `apply`, `inject = ["skills"]`, `name = "skills-layer"`. `apply(ctx)` no-ops when `ctx.skills.registerProvider` is not a function; otherwise registers one provider whose `list()` returns the loader's Skills shaped into DSH's candidate shape and whose `get(candidate)` returns the candidate with `content` set to the loaded body.

### REQ-LOADER-5 — Plugin entry registers the loader

`lib/index.js` adds `"skills"` to its `inject` array and adds a `ctx.effect` step that lazy-imports `lib/skills.js` and runs it before the existing service registrations. The lazy import is `await import("./skills.js")` inside the effect body so the plugin can be loaded on DSH releases without `@deepseek-ai/dsh-skill`.

## Scenarios

[scenario=loader-reads-one-valid-skill]
Given a fixture `<root>/skills/decompose-spec/SKILL.md` with valid frontmatter,
When `loadBundledSkills({ pluginRoot: <root> })` runs,
Then the result contains one Skill with `name: "decompose-spec"`, `description: <text>`, `invocation: { modelInvocable: true, userInvocable: true }`, `body: <body>`, `filePath: <absolute path>`.

[scenario=loader-drops-invalid-frontmatter]
Given a fixture `<root>/skills/bad-skill/SKILL.md` with `disable-model-invocation: "yes"`,
When `loadBundledSkills({ pluginRoot: <root> })` runs,
Then the result does NOT include `bad-skill`,
And the loader logs one warning naming `bad-skill` and the predicate.

[scenario=apply-noop-without-ctx-skills]
Given a stub `ctx` whose `ctx.skills` is undefined,
When `apply(ctx)` runs,
Then it returns normally,
And `ctx.skills` is not touched (no call to `registerProvider`, no setter mutation).

[scenario=apply-registers-empty-provider]
Given an empty `<pluginRoot>/skills/` directory,
When `apply(ctx)` runs with a recording stub `ctx.skills`,
Then `ctx.skills.registerProvider(...)` is called exactly once with a factory whose `list()` resolves to `[]`.

[scenario=index-injects-skills]
Given the plugin's `lib/index.js`,
When the file is read,
Then the `inject` array contains `"skills"` alongside `"commands"`, `"systemPrompt"`, `"webServer"`, `"tools"`.

## Assumptions

1. The plugin already declares `@deepseek-ai/dsh-skill` as a peer dependency through the verified DSH release line; this Spec does not change `package.json#peerDependencies`.
2. `BUNDLED_SKILL_RANK = 250` is the runtime Skill rank. The provider sets `rank: 250` on each candidate; this Spec does not invent a new rank.
3. Sub-specs B and C will follow. Sub-spec A ships with an empty `skills/` directory and is the foundation for them.
4. The hand-rolled YAML parser is acceptable for v1; if a future Skill needs richer frontmatter, the parser is replaced with a YAML package through a separate Spec.

## Non-goals

- Shipping Skill content (`skills/<name>/SKILL.md`). Sub-spec B owns that.
- Adding a CLI subcommand. Sub-spec B owns `design-blueprint skills list|show|info`.
- Documentation conventions (`.adr/`, `.out-of-scope/`, `CONTEXT.md`, bilingual Skill pages). Sub-spec C owns them.
- Replacing `blueprint_dispatch`. The Skills loader sits beside it.
- Adding YAML or other frontmatter parser dependencies.

## Alternatives considered

**Import a YAML package (`yaml` or `js-yaml`) for the frontmatter parser.** Rejected for v1 because the schema is fixed at four keys; a hand-rolled reader is ~30 lines and avoids a new dependency. A future Spec may swap it in if the schema grows.

**Implement the loader as one file instead of three.** Rejected because `frontmatter.js` is independently testable and reusable; collapsing it into `loader.js` would couple validation to file walking.

**Register Skills directly via `ctx.skills.register(skill)` instead of `registerProvider`.** Rejected because `register()` is for runtime embedded Skills, not plugin-bundled Skills. `registerProvider()` is the documented path (`@deepseek-ai/dsh-skill-badge` uses it).

**Ship Skill content in this same Spec.** Rejected because the Spec would exceed the framework's REQ / scope thresholds (already at the cap with 5 REQs and 6 allowed paths).

## Tasks

1. Author `lib/skills/frontmatter.js`: `parseFrontmatter`, `mapFlagsToInvocation`, `FrontmatterError`. REQ: REQ-LOADER-2, REQ-LOADER-3. Scope: `lib/skills/frontmatter.js`. AC: AC-LOADER-002.
2. Author `lib/skills/loader.js`: `loadBundledSkills`. REQ: REQ-LOADER-1, REQ-LOADER-3. Scope: `lib/skills/loader.js`. AC: AC-LOADER-001.
3. Author `lib/skills.js`: exports `apply`, `inject`, `name`. REQ: REQ-LOADER-4. Scope: `lib/skills.js`. AC: AC-LOADER-003, AC-LOADER-004, AC-LOADER-005.
4. Extend `lib/index.js`: add `"skills"` to `inject`; add `ctx.effect` step. REQ: REQ-LOADER-5. Scope: `lib/index.js`. AC: AC-LOADER-006, AC-LOADER-007.
5. Update `package.json` `lint:js` to include the new files. REQ: REQ-LOADER-5. Scope: `package.json`. AC: AC-LOADER-008.
6. Write `tests/skills-loader.test.js`. REQ: REQ-LOADER-1, REQ-LOADER-2, REQ-LOADER-3, REQ-LOADER-4, REQ-LOADER-5. Scope: `tests/skills-loader.test.js`. AC: AC-LOADER-001 through AC-LOADER-007.
7. Run full host test suite and `design-blueprint scan --all --cwd .`. REQ: all. Scope: -. AC: AC-LOADER-008, AC-LOADER-009.

## Lifecycle

- Status: proposed
- Target status after approval: implemented (file moves to `.specs/implemented/`)

## Truth-delta

New facts added:
- `lib/skills.js`, `lib/skills/loader.js`, `lib/skills/frontmatter.js` exist and export the documented functions.
- `lib/index.js` injects `"skills"` and registers the loader through `ctx.effect`.
- `tests/skills-loader.test.js` covers the loader contract.

Existing facts preserved:
- All existing CLI subcommands.
- All existing tests.
- The two project-local Skills (`blueprint-doc-standards`, `blueprint-translate-docs`) written by `lib/init.js`.
- `blueprint_dispatch` as the authoritative Spec lifecycle tool.

## Traceability

REQ-LOADER-1 → scenario[loader-reads-one-valid-skill] → task 2 → AC-LOADER-001 → verification tests/skills-loader.test.js
REQ-LOADER-2 → scenario[loader-reads-one-valid-skill], [loader-drops-invalid-frontmatter] → task 1 → AC-LOADER-002 → verification tests/skills-loader.test.js
REQ-LOADER-3 → scenario[loader-drops-invalid-frontmatter] → task 1, 2 → AC-LOADER-001, AC-LOADER-002 → verification tests/skills-loader.test.js
REQ-LOADER-4 → scenario[apply-noop-without-ctx-skills], [apply-registers-empty-provider] → task 3 → AC-LOADER-003, AC-LOADER-004, AC-LOADER-005 → verification tests/skills-loader.test.js
REQ-LOADER-5 → scenario[index-injects-skills] → task 4, 5 → AC-LOADER-006, AC-LOADER-007 → verification tests/skills-loader.test.js

## Unresolved decisions

None. The three material questions are settled: schema is hand-rolled (no YAML dep), loader is three files (not one), provider is registered via `registerProvider()` (not `register()`).

## Quality checklist (self-attested)

- requirements complete: ✓ (5 REQs covering walker, parser, mapping, plugin shape, entry extension)
- requirements unambiguous: ✓ (each REQ names the file and the contract)
- requirements bounded: ✓ (single Feature, sub-spec A; empty `skills/` is the shipped state)
- requirements failure-aware: ✓ (invalid frontmatter dropped with warning; missing `ctx.skills` no-ops)
- requirements testable: ✓ (each AC maps to a verification command or test)
- requirements non-contradictory: ✓ (no AC says both "register" and "skip" for the same condition)

## Cross-artifact analysis

- requirements-to-scenarios: ✓ all 5 REQs covered by 5 scenarios
- requirements-to-impact: ✓ all 5 REQs map to one or more files in ## Scope
- requirements-to-tasks: ✓ each task lists REQs
- requirements-to-acceptance: ✓ each AC names REQs
- requirements-to-verification: ✓ each AC names a verification command or test
- tasks-to-scope: ✓ each task names a Scope path
- design-to-scope: not applicable (designRequired: false)
- scope-to-paths: ✓ every Scope path matches a real path

## Consequences

Recorded in `.adr/0001-add-skills-layer.md` after sub-spec C ships, per the mattpocock convention.

## Consequences

Blueprint completed this delivery automatically after requirement-linked verification.

- Verified snapshot: `git-index:b9843ad597f9d82156600eebeb710c553e8c614ba310312b6de4f0dd44c51022`
- Verification attempt: `attempt-1`
- Conclusion: Skills loader sub-spec A implemented: lib/skills.js, lib/skills/loader.js, lib/skills/frontmatter.js. lib/index.js adds skills to inject and registers loader before existing services. 173/173 host tests pass (22 new); scan clean; 11/11 bilingual pairs confirmed.
- AC evidence: all 9 acceptance criteria passed.
- Check evidence: skills-loader-unit-api (command), index-injects-api-static (inspection), index-injects-api-terminal (inspection), full-suite-cli (command), scan-all-cli (command).
