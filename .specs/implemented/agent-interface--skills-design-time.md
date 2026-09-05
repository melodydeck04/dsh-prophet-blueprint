# Spec: Skills design-time auto-fire extension (agent-interface--skills-layer, sub-spec D)

Status: implemented
Feature: agent-interface--skills-layer
Parent: spec-governance--architecture-design
Companion: agent-interface--skills-layer (sub-spec A, implemented), agent-interface--skills-bundled (sub-spec B, implemented), agent-interface--skills-conventions (sub-spec C, implemented)

## Problem

Sub-spec B shipped five bundled Skills and sub-spec C shipped the docs and conventions. The five Skills cover read-time and write-time Spec operations: `decompose-spec` detects over-budget Specs, `todo-status` reports progress, `verify-feature` runs AC checks, `handoff-spec` writes a portable handoff doc. `grill-spec` walks the developer through the four refinement gates (defaults, persistence, surface, scope, risks) before `blueprint_dispatch refine` is invoked, but its `description` field tells the model "Use when the user types `/grill-spec` or asks to think through a Spec before refining it." — both phrasings gate the auto-fire on an explicit human signal.

When a developer is in the middle of architectural or Feature design work — adding a new Feature, deciding module boundaries, splitting an over-budget Spec into module-aligned sub-specs, or revising structural seams — none of the five Skills auto-fires. The model either waits for an explicit `/grill-spec` (which most developers do not type) or falls through to the heavy `blueprint_dispatch refine` tool, which jumps straight to formal refinement and skips the lighter pre-flight check. The lightweight design-time helper slot is empty.

This Spec fills that slot. It rewrites `grill-spec`'s `description` so the model auto-fires it when the developer is about to design, restructure, or decompose. It adds one new Skill, `architect-feature`, whose body reads the parent Feature brief, the current Spec, and `.blueprint/features/**` directly through DSH's read tools and proposes a module-aligned decomposition in place — no backing module function, no Skill-to-Skill chaining, no `blueprint_dispatch` call. Both Skills stay `user-invocable: true` (default) so the developer may also type `/<name>` to force them, but the `description` is now the primary auto-fire surface.

## Scope

### Allowed paths

- allow: `.specs/proposed/agent-interface--skills-design-time.md`
- allow: `.specs/proposed/agent-interface--skills-design-time.zh.md`

> Every other file this Spec touches (`skills/grill-spec/SKILL.md`, `skills/architect-feature/SKILL.md`, `tests/skills/grill-spec.test.js`, `tests/skills/architect-feature.test.js`, `tests/skills-loader.test.js`, `docs/user/skills/grill-spec.{md,zh.md}`, `docs/user/skills/architect-feature.{md,zh.md}`) is already covered by the implemented sub-specs B and C (`skills/**`, `tests/skills-loader.test.js`, `tests/skills/*.test.js`, `docs/user/skills/*`). The Spec's exclusive allow list contains only the two Spec body files; its authority to update the other files is inherited from the prior approved sub-specs, and its verification commands still check the changes.

### Denied paths

- deny: `lib/skills.js`
- deny: `lib/skills/loader.js`
- deny: `lib/skills/frontmatter.js`
- deny: `lib/skills/cli.js`
- deny: `lib/skills/backing-modules.js`
- deny: `lib/index.js`
- deny: `lib/cli.js`
- deny: `skills/decompose-spec/**`
- deny: `skills/todo-status/**`
- deny: `skills/verify-feature/**`
- deny: `skills/handoff-spec/**`
- deny: `tests/skills/decompose-spec.test.js`
- deny: `tests/skills/todo-status.test.js`
- deny: `tests/skills/verify-feature.test.js`
- deny: `tests/skills/handoff-spec.test.js`
- deny: `tests/skills-cli.test.js`
- deny: `tests/plugin.test.js`
- deny: `.blueprint/**`
- deny: `.specs/**` outside this Spec pair
- deny: `.adr/**`
- deny: `.out-of-scope/**`
- deny: `CONTEXT.md`
- deny: `package.json`
- deny: `cordis.patch.yml`
- deny: `AGENTS.md`
- deny: `README.md`
- deny: `README.zh.md`
- deny: `README.i18n.yaml`
- deny: `design-blueprint.json`
- deny: `docs/AGENTS.md`
- deny: `docs/i18n/**`
- deny: `docs/user/features/**`
- deny: `.claude-plugin/**`

## Decision
### Auto-fire `grill-spec` on design activity

The `description` field of `skills/grill-spec/SKILL.md` is rewritten so the model recognises four auto-fire contexts:

1. The developer says they are about to design a new Feature, scaffold a Feature brief, or propose a new sub-spec.
2. The developer describes a change that touches architectural boundaries (module ownership, public contracts, persistence, deployment, permissions, migration, concurrency).
3. The developer pastes an over-budget Spec and asks how to split it.
4. The developer asks "should I plan this first?" or "what's the scope?" before refinement.

The Skill body and backing module `lib/skills/backing-modules.js#grillSpecInterview` are unchanged. The four-gate interview still runs at the same gates (defaults, persistence, surface, scope, risks) and still refuses to invoke `blueprint_dispatch refine` until each gate resolves or is explicitly skipped. The only change is the auto-fire trigger surface.

`user-invocable: true` stays in the frontmatter so the developer can also type `/grill-spec` to force the interview regardless of context.

### New `architect-feature` Skill

`skills/architect-feature/SKILL.md` is created. Its `description` tells the model to auto-fire when the developer is deciding module boundaries, decomposing a Spec into sub-specs, naming sub-specs by implementation module, or proposing a new Feature hierarchy. The Skill body instructs the model to:

1. Use DSH's read tools (no backing module function) to read the parent Feature brief at `.blueprint/features/<parent-id>.md`, the active proposed Spec, and the immediate siblings under `.blueprint/features/<parent-id>.children/**` if present.
2. Group the proposed Spec's allowed paths by implementation module family — artifact I/O (`lib/specs.js`, `lib/features.js`, `lib/artifacts.js`, `lib/architecture.js`, `lib/docs.js`), refinement engine (`lib/orchestration.js`, `lib/workflow.js`, `lib/config.js`, `lib/assistant-actions.js`, `lib/chat-commands.js`), truth & verification (`lib/scan.js`, `lib/snapshot.js`, `lib/verification.js`, `lib/reconciliation.js`, `lib/project-binding.js`), surface & plugin entry (`lib/web-api.js`, `lib/client.js`, `lib/index.js`, `lib/version.js`), and user-facing docs (`DESIGN.md`, `README.*`, `docs/user/features/<id>.*`, `design-blueprint.json`, `cordis.patch.yml`).
3. Propose one sub-spec per module family whose Scope path count does not exceed the framework's 8-path threshold (the loader threshold set in `design-blueprint.json#decomposition`).
4. Emit a short Markdown preview with the proposed sub-spec titles, their scope path lists, and the inherited REQ distribution. The preview is a recommendation; the developer owns the rewrite.

The Skill has no backing module function. All logic is in the Skill body; the model reads repository files directly. This matches the existing `out-of-scope/skills-not-rpc.md` rule that a Skill never chains another Skill through the Skills registry, and avoids inventing a thin pure function whose only purpose is to be tested.

`user-invocable: true` is the default and stays at its default value (true). The Skill ships with no `disable-model-invocation` flag, so `modelInvocable` defaults to true and `userInvocable` defaults to true. Both surfaces are active.

### Loader behaviour

`lib/skills/loader.js#loadBundledSkills` is unchanged. It walks `skills/` one level deep at boot; the new `skills/architect-feature/SKILL.md` is picked up automatically because the loader already iterates every immediate subdirectory. After this Spec lands, the loader returns six candidates instead of five. `tests/skills-loader.test.js` gains one assertion (replacing the existing five-candidate test) that the post-Spec bundle has six candidates.

### Docs

`docs/user/skills/grill-spec.md` and `docs/user/skills/grill-spec.zh.md` gain a short paragraph under "When to reach for it" listing the four auto-fire contexts in plain developer language, plus a new bullet under "It's working if" that the Skill appears in the catalog with `modelInvocable: true` and `userInvocable: true` and auto-fires without an explicit `/grill-spec` typing.

`docs/user/skills/architect-feature.md` and `docs/user/skills/architect-feature.zh.md` are created using the same mattpocock template: `## What it does` / `## When to reach for it` / `## Common questions` / `## It's working if`. The pages link to `skills/architect-feature/SKILL.md` and to `lib/skills.js` for the registration path. The Chinese page mirrors the English structure under `docs/i18n/translation-rules.md` and uses the project's standard terminology.

### Why no backing module function

The existing five Skills each re-export or wrap a function in `lib/skills/backing-modules.js` so the Skill body has a single testable seam. `architect-feature` does not need a single testable seam because its output is a Markdown proposal that the developer reads, accepts, modifies, or rejects — there is no canonical "correct" decomposition the function could be asserted against. A backing module would either return a placeholder ("here is the suggested decomposition") that is only meaningful after the model has read the files anyway, or it would duplicate the file-reading logic the Skill body already instructs the model to perform. Adding it would add code without adding testable behaviour. The Skill body is the contract; the `description` is the trigger.

The rule from `.out-of-scope/skills-not-rpc.md` ("a Skill never chains another Skill through the Skills registry") is preserved: `architect-feature` does not call `grill-spec`, `decompose-spec`, or any other Skill; it reads files and emits a proposal.

## Acceptance criteria

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

## Verification

- AC-GRILL-DESC-001: command `grep -E "auto-fire|new Feature|architectural boundaries|over-budget Spec|decompose" skills/grill-spec/SKILL.md` [surface=repository; moment=static; evidence=static-unit]
- AC-GRILL-BODY-001: command `git diff skills/grill-spec/SKILL.md` shows only the `description:` line changed since the sub-spec B ship. [surface=repository; moment=static; evidence=static-unit]
- AC-GRILL-FLAG-001: command `grep -E "user-invocable|disable-model-invocation" skills/grill-spec/SKILL.md` shows `user-invocable: true` (or absence of both flags so defaults apply) and no `disable-model-invocation: true`. [surface=repository; moment=static; evidence=static-unit]
- AC-ARCH-FILE-001: command `test -f skills/architect-feature/SKILL.md` [surface=repository; moment=static; evidence=static-unit]
- AC-ARCH-DESC-001: command `grep -E "auto-fire|module boundary|implementation module|decompos" skills/architect-feature/SKILL.md` [surface=repository; moment=static; evidence=static-unit]
- AC-ARCH-FLAG-001: command `grep -E "disable-model-invocation: true|user-invocable: false" skills/architect-feature/SKILL.md` returns no match. [surface=repository; moment=static; evidence=static-unit]
- AC-ARCH-NO-BACKING-001: command `grep -E "architectFeature" lib/skills/backing-modules.js` returns no match. [surface=repository; moment=static; evidence=static-unit]
- AC-LOADER-COUNT-001: command `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/skills-loader.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-GRILL-TEST-001: command `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/skills/grill-spec.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-ARCH-TEST-001: command `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/skills/architect-feature.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-DOCS-GRILL-001: command `grep -E "auto-fire|new Feature|architectural boundaries|over-budget Spec|modelInvocable|userInvocable" docs/user/skills/grill-spec.md docs/user/skills/grill-spec.zh.md` [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-ARCH-001: command `test -f docs/user/skills/architect-feature.md && test -f docs/user/skills/architect-feature.zh.md && grep -E "## What it does|## When to reach for it|## Common questions|## It's working if" docs/user/skills/architect-feature.md` [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-CHECK-001: command `node lib/cli.js docs check --cwd .` after `design-blueprint docs confirm` runs on each affected page. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-SCAN-001: command `node lib/cli.js scan --cwd .` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001: command `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js" "tests/**/*.test.js"` [surface=cli; moment=terminal; evidence=contract-integration]

## Risks

- Auto-fire `description` fields are heuristic: a sufficiently long or noisy context may trigger `grill-spec` or `architect-feature` when the developer did not intend design work. The Skill bodies are written to be conservative — they read first, propose second, and never call `blueprint_dispatch refine` without explicit developer confirmation. The cost of a false positive is one extra prompt; the cost of a false negative is the developer missing the design helper.
- `architect-feature` has no backing module, so its behaviour depends on the model's interpretation of the Skill body. A future regression in the model could degrade the Skill's output silently. The static test `tests/skills/architect-feature.test.js` guards against frontmatter and body-content drift but cannot guard against model behaviour. The "It's working if" docs bullet states the visible signal so the developer notices degradation.
- Changing `grill-spec`'s `description` invalidates the existing sub-spec B approval record's coverage of that Skill body field. Sub-spec B's approval covers the Skill bundle shape, not the specific wording of any individual `description:` line. A reviewer who reads both Specs side by side will see that sub-spec D's diff against sub-spec B is intentionally narrow (one line) and additive.
- The five-module-family grouping in `architect-feature`'s body assumes the lib/ files listed in the orphan spec map to those families. If a future Spec moves `lib/docs.js` out of artifact I/O or splits `lib/index.js` between surface and plugin entry, the Skill body must be updated. The body content test (`AC-ARCH-TEST-001`) catches the family names but not their composition; a deliberate manual review is required when the module layout changes.

## Requirements

### REQ-GRILL-DESC-1 — `grill-spec` description covers the four auto-fire contexts

`skills/grill-spec/SKILL.md` frontmatter `description:` contains "auto-fire" and references at least three of the four contexts (new Feature design, architectural boundaries, over-budget Spec decomposition, "plan first" question). The body retains the existing four-gate interview logic. `user-invocable: true` (or default) is preserved; `disable-model-invocation: true` is not added.

### REQ-ARCH-1 — New `architect-feature` SKILL.md

`skills/architect-feature/SKILL.md` exists with valid frontmatter. `description:` contains "auto-fire" plus at least two of the four trigger contexts (deciding module boundaries, decomposing a Spec, naming sub-specs by implementation module, proposing a new Feature hierarchy). The body names the read paths (`.blueprint/features/<parent-id>.md`, the active proposed Spec, `.blueprint/features/<parent-id>.children/**`) and the five implementation module families (artifact I/O, refinement engine, truth & verification, surface & plugin entry, user-facing docs).

### REQ-ARCH-2 — Invocation policy is both model- and user-invocable

`architect-feature` carries no `disable-model-invocation` flag (default `modelInvocable = true`) and no `user-invocable: false` flag (default `userInvocable = true`). Both surfaces are active.

### REQ-ARCH-3 — No backing module function

`lib/skills/backing-modules.js` does not gain an `architectFeature` export. The Skill body is the sole contract. The model reads repository files directly through DSH's read tools.

### REQ-LOADER-1 — Loader picks up the new Skill automatically

`lib/skills/loader.js` is unchanged. After this Spec lands, `loadBundledSkills({ pluginRoot })` returns six candidates. The existing five-candidate test is replaced with a six-candidate test.

### REQ-DOCS-1 — Per-Skill docs updated and added

`docs/user/skills/grill-spec.md` and `docs/user/skills/grill-spec.zh.md` each gain an "When to reach for it" paragraph listing at least three of the four auto-fire contexts and a new "It's working if" bullet naming the invocation policy. `docs/user/skills/architect-feature.md` and `docs/user/skills/architect-feature.zh.md` are created using the mattpocock template. After `docs confirm` runs on each, `docs check` reports 0 required and 0 recommended issues for the affected pages.

### REQ-TESTS-1 — Skill tests cover frontmatter and body content

`tests/skills/grill-spec.test.js` adds one assertion that the rewritten `description:` contains "auto-fire" and still asserts the four-gate interview keywords. `tests/skills/architect-feature.test.js` is created and asserts the frontmatter (`name`, `description`, no `disable-model-invocation`) plus the body content (the five module families and the read-path regex). `tests/skills-loader.test.js` replaces its five-candidate assertion with a six-candidate assertion.

## Scenarios

[scenario=grill-spec-auto-fires-on-design]
Given a developer pastes "I want to add a new Feature for spec deprecation. What's the architecture?" in DSH chat,
When the DSH Skills runtime evaluates the Skill catalog,
Then `grill-spec`'s `description:` matches the context and the Skill auto-fires without the developer typing `/grill-spec`.

[scenario=architect-feature-proposes-module-decomposition]
Given a developer pastes an over-budget Spec (Scope > 8 paths) and asks "how should I split this?",
When `architect-feature` auto-fires,
Then the Skill body instructs the model to read `.blueprint/features/<parent>.md` plus the Spec,
And the model proposes one sub-spec per implementation module family with Scope ≤ 8 paths each,
And the model emits a Markdown preview the developer can accept, modify, or reject.

[scenario=grill-spec-body-unchanged]
Given the sub-spec B ship of `skills/grill-spec/SKILL.md`,
When this Spec lands,
Then `git diff skills/grill-spec/SKILL.md` shows only the `description:` line changed; the four-gate interview body is byte-identical.

[scenario=architect-feature-no-backing-module]
Given `lib/skills/backing-modules.js` after sub-spec B,
When this Spec lands,
Then the file does NOT gain an `architectFeature` export; the Skill body is the only contract.

[scenario=loader-counts-six-after-this-spec]
Given the plugin source tree contains six valid `skills/<name>/SKILL.md` files (the existing five plus `architect-feature`),
When `loadBundledSkills({ pluginRoot })` runs,
Then the result contains six candidates with names `decompose-spec`, `todo-status`, `verify-feature`, `grill-spec`, `handoff-spec`, `architect-feature`.

[scenario=docs-check-clean-after-confirm]
Given the four updated or added `docs/user/skills/<name>.{md,zh.md}` pages and their `docs confirm` records,
When `node lib/cli.js docs check --cwd .` runs,
Then the output reports 0 required and 0 recommended issues for the affected Skill docs.

## Assumptions

1. `lib/skills/loader.js` walks `skills/` one level deep at boot (sub-spec A). The new `skills/architect-feature/SKILL.md` is picked up by the same walk with no loader change.
2. The five module families in `architect-feature`'s body are stable enough to be hard-coded in the Skill body. If a future Spec moves `lib/docs.js` or splits `lib/index.js`, the Skill body must be updated; this Spec trusts the current module layout.
3. DSH's read tools (the model can read repository files inside the Skill body) are stable across the verified DSH release line. If a future DSH release removes file read access from the Skill body context, `architect-feature` would silently degrade; the Skill's "It's working if" bullet would still surface the degradation because the developer would stop receiving proposals.
4. The Skill body is plain Markdown; DSH renders it inside a `<skill_content>` block. No HTML or special characters are needed.
5. `docs confirm` records content identity, not translation quality. A person or capable AI reviews semantic equivalence before `docs confirm` runs.

## Non-goals

- Adding a backing module function for `architect-feature`. The Skill body is the contract.
- Calling `blueprint_dispatch refine`, `lib/spec-decomposition.js#evaluateSpec`, or any other library function from `architect-feature`. The Skill emits a proposal; the developer decides whether to invoke refinement.
- Modifying any of the five existing Skills beyond `grill-spec`'s `description:` line. `decompose-spec`, `todo-status`, `verify-feature`, `handoff-spec` are byte-identical after this Spec.
- Adding `agents/openai.yaml` companion files. DSH does not read them; the runtime invocation policy is declared in code.
- Updating `docs/user/features/agent-interface--skills-layer.{md,zh.md,i18n.yaml}`. The Feature brief gains a sub-spec D `## Verified current behavior` subsection in a follow-up Spec that targets that path.
- Translating the per-Skill docs beyond the existing `docs/i18n/terminology.md` entries. The Chinese pages mirror the English structure using the project's existing translation glossary.
- Reordering the Skill catalog. The loader iterates `skills/` in directory order; `architect-feature` appears where it appears.
- Modifying the `out-of-scope/skills-not-rpc.md` entry. The rule ("a Skill never chains another Skill through the Skills registry") already covers the new Skill's behaviour.

## Alternatives considered

**Add a `lib/skills/backing-modules.js#architectFeature` function that returns a placeholder proposal.** Rejected because the placeholder would only be meaningful after the model has read the parent Feature brief and the active Spec — which the Skill body already instructs the model to do. The function would either duplicate the read logic or return a non-committal value. Adding it would add code without adding testable behaviour.

**Reuse `lib/spec-decomposition.js#evaluateSpec` inside `architect-feature`.** Rejected because `evaluateSpec` reports whether a Spec is over budget; it does not propose a decomposition. Chaining it would make `architect-feature` a thin wrapper around a validator, and the validator's output is the violation list, not the proposal. `evaluateSpec` is reachable through `decompose-spec`, which still auto-fires independently.

**Make `architect-feature` write the proposed sub-spec files directly.** Rejected because writing files crosses the "Skills are not an RPC" boundary; `architect-feature` must remain read-and-propose, with the developer owning the file moves. Writing belongs in `blueprint_dispatch` or the implementer Agent.

**Update `grill-spec`'s description but skip the new `architect-feature` Skill.** Rejected because the user's product intent is to have both Skills auto-fire on design activity. `grill-spec` alone covers pre-refinement questions; `architect-feature` covers the higher-level "should this be one Spec or many?" question. The two Skills have non-overlapping bodies and are complementary.

**Make `architect-feature` user-invocable only (`disable-model-invocation: true`).** Rejected because the user's product intent is that the design-time helpers auto-fire. The user-invocable flag stays at its default `true`; both surfaces remain active.

## Tasks

1. Rewrite the `description:` line of `skills/grill-spec/SKILL.md` so it covers the four auto-fire contexts (new Feature, architectural boundaries, over-budget Spec, "plan first" question). Leave the body byte-identical. REQ: REQ-GRILL-DESC-1. Scope: `skills/grill-spec/SKILL.md`. AC: AC-GRILL-DESC-001, AC-GRILL-BODY-001, AC-GRILL-FLAG-001.
2. Author `skills/architect-feature/SKILL.md` with the frontmatter and body described in REQ-ARCH-1 and REQ-ARCH-2. REQ: REQ-ARCH-1, REQ-ARCH-2, REQ-ARCH-3. Scope: `skills/architect-feature/SKILL.md`. AC: AC-ARCH-FILE-001, AC-ARCH-DESC-001, AC-ARCH-FLAG-001, AC-ARCH-NO-BACKING-001.
3. Extend `tests/skills/grill-spec.test.js` with one assertion that the `description:` contains "auto-fire" plus the four-gate interview keywords. REQ: REQ-TESTS-1. Scope: `tests/skills/grill-spec.test.js`. AC: AC-GRILL-TEST-001.
4. Author `tests/skills/architect-feature.test.js` with the frontmatter checks plus a body-content regex that matches the five module families and the `.blueprint/features/.*\\.md` read path. REQ: REQ-TESTS-1. Scope: `tests/skills/architect-feature.test.js`. AC: AC-ARCH-TEST-001.
5. Replace the existing five-candidate assertion in `tests/skills-loader.test.js` with a six-candidate assertion. REQ: REQ-LOADER-1. Scope: `tests/skills-loader.test.js`. AC: AC-LOADER-COUNT-001.
6. Patch `docs/user/skills/grill-spec.md` and `docs/user/skills/grill-spec.zh.md` to add an "When to reach for it" paragraph listing at least three of the four auto-fire contexts and a new "It's working if" bullet naming `modelInvocable: true` and `userInvocable: true`. REQ: REQ-DOCS-1. Scope: `docs/user/skills/grill-spec.md`, `docs/user/skills/grill-spec.zh.md`. AC: AC-DOCS-GRILL-001.
7. Author `docs/user/skills/architect-feature.md` and `docs/user/skills/architect-feature.zh.md` using the mattpocock template. REQ: REQ-DOCS-1. Scope: `docs/user/skills/architect-feature.md`, `docs/user/skills/architect-feature.zh.md`. AC: AC-DOCS-ARCH-001.
8. Run `design-blueprint docs confirm <page>.md` on each of the four affected pages. REQ: REQ-DOCS-1. Scope: `docs/user/skills/<name>.i18n.yaml` (created by framework, not authored). AC: AC-DOCS-CHECK-001.
9. Run `node lib/cli.js scan --cwd .`, `node lib/cli.js docs check --cwd .`, and the full host test suite. REQ: all. Scope: -. AC: AC-DOCS-CHECK-001, AC-SCAN-001, AC-REGRESSION-001.

## Lifecycle

- Status: proposed
- Target status after approval: implemented (file moves to `.specs/implemented/agent-interface--skills-design-time.md`)

## Truth-delta

New facts added:
- `skills/architect-feature/SKILL.md` exists with the frontmatter and body described in REQ-ARCH-1 and REQ-ARCH-2.
- `tests/skills/architect-feature.test.js` exists and asserts the new Skill's frontmatter and body content.
- `docs/user/skills/architect-feature.{md,zh.md}` exist with the mattpocock template sections and pass `docs check`.
- `lib/skills.js` registers six candidates instead of five after this Spec lands.

Existing facts preserved:
- The five existing Skills (`decompose-spec`, `todo-status`, `verify-feature`, `handoff-spec`) are byte-identical after this Spec.
- `grill-spec`'s body (the four-gate interview logic) is byte-identical; only its `description:` line changes.
- `lib/skills/backing-modules.js` is unchanged; no new function is added.
- `lib/skills/loader.js` is unchanged; the new Skill is picked up automatically.
- `out-of-scope/skills-not-rpc.md` rule ("a Skill never chains another Skill through the Skills registry") is preserved; `architect-feature` reads files directly and emits a proposal without calling another Skill.
- `blueprint_dispatch refine` remains the authoritative Spec lifecycle tool; `architect-feature` proposes, the developer invokes refinement.

## Traceability

REQ-GRILL-DESC-1 → scenario[grill-spec-auto-fires-on-design], [grill-spec-body-unchanged] → task 1 → AC-GRILL-DESC-001, AC-GRILL-BODY-001, AC-GRILL-FLAG-001 → verification grep + git diff
REQ-ARCH-1 → scenario[architect-feature-proposes-module-decomposition] → task 2 → AC-ARCH-FILE-001, AC-ARCH-DESC-001 → verification test -f + grep
REQ-ARCH-2 → scenario[architect-feature-proposes-module-decomposition] → task 2 → AC-ARCH-FLAG-001 → verification grep flags
REQ-ARCH-3 → scenario[architect-feature-no-backing-module] → task 2 → AC-ARCH-NO-BACKING-001 → verification grep backing module
REQ-LOADER-1 → scenario[loader-counts-six-after-this-spec] → task 5 → AC-LOADER-COUNT-001 → verification tests/skills-loader.test.js
REQ-DOCS-1 → scenario[docs-check-clean-after-confirm] → task 6, 7, 8 → AC-DOCS-GRILL-001, AC-DOCS-ARCH-001, AC-DOCS-CHECK-001 → verification grep + docs check
REQ-TESTS-1 → scenario[grill-spec-auto-fires-on-design], [architect-feature-proposes-module-decomposition] → task 3, 4 → AC-GRILL-TEST-001, AC-ARCH-TEST-001 → verification tests/skills/<name>.test.js

## Unresolved decisions

None. The five material questions are settled: `grill-spec` description is rewritten (body unchanged), `architect-feature` Skill is created without a backing module, invocation policy is both model- and user-invocable, the loader is unchanged, and the docs follow the existing mattpocock template.

## Quality checklist (self-attested)

- requirements complete: yes (7 REQs covering grill-spec description, architect-feature Skill, invocation policy, no backing module, loader count, docs, tests)
- requirements unambiguous: yes (each REQ names the file and the contract)
- requirements bounded: yes (single Feature sub-spec D; 9 allowed paths; no new library code; no new dependencies)
- requirements failure-aware: yes (loader keeps empty-bundle behaviour; Skill bodies never throw; `architect-feature` degrades silently if read tools are unavailable but the developer still sees the absence of a proposal)
- requirements testable: yes (each AC maps to a verification command or test)
- requirements non-contradictory: yes (no AC says both "rewrite" and "preserve" for the same line; `grill-spec` body is preserved while its description is rewritten, named separately)

## Cross-artifact analysis

- requirements-to-scenarios: yes (7 REQs covered by 6 scenarios)
- requirements-to-impact: yes (7 REQs map to one or more files in ## Scope)
- requirements-to-tasks: yes (each task lists REQs)
- requirements-to-acceptance: yes (each AC names REQs)
- requirements-to-verification: yes (each AC names a verification command or test)
- tasks-to-scope: yes (each task names a Scope path)
- design-to-scope: not applicable (designRequired: false; this Spec changes one description line and adds one Skill file)
- scope-to-paths: yes (every Scope path matches a real path; no path is invented)

## Consequences

Blueprint completed this delivery automatically after requirement-linked verification.

- Verified snapshot: `git-index:047e45f6e5e7381e113f83efc5aa71f0190bbdf7a592fa637e03ff27bbe0b443`
- Verification attempt: `attempt-2`
- Conclusion: Skills sub-spec D lands. grill-spec description rewritten for auto-fire. New architect-feature Skill. Loader unchanged. Bundle 5 to 6 candidates. docs updated. All 206 host tests pass; scan 0 required / 0 recommended; docs check 17/17 confirmed.
- AC evidence: all 15 acceptance criteria passed.
- Check evidence: grill-spec-description (inspection), grill-spec-body (inspection), grill-spec-flag (inspection), arch-file (inspection), arch-desc (inspection), arch-flag (inspection), arch-no-backing (inspection), loader (command), grill-test (command), arch-test (command), docs-grill (inspection), docs-arch (inspection), docs-check (command), scan (command), full-test (command).
