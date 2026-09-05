# Spec: Skills conventions and documentation (agent-interface--skills-layer, sub-spec C)

Status: implemented
Feature: agent-interface--skills-layer
Parent: spec-governance--architecture-design
Companion: agent-interface--skills-layer (sub-spec A, implemented), agent-interface--skills-bundled (sub-spec B, implemented)

## Problem

Sub-spec A shipped the Skills loader and sub-spec B shipped five bundled Skills plus a CLI subcommand. A developer who wants to know why the Skills layer exists, what it deliberately does not do, what the plugin's vocabulary means, or how to use one of the five Skills from the chat box has nowhere to read. The Feature brief at `docs/user/features/agent-interface--skills-layer.md` already promises four pieces of companion documentation: an ADR, an out-of-scope declaration, a domain glossary, and a per-Skill page. None exist yet. This Spec lands those four pieces so a fresh contributor can read the WHY, the non-goals, the vocabulary, and the per-Skill instructions in one pass without spelunking the source tree.

## Scope

### Allowed paths

- allow: `.adr/0001-add-skills-layer.md`
- allow: `.out-of-scope/skills-not-rpc.md`
- allow: `CONTEXT.md`
- allow: `docs/user/skills/*`

### Denied paths

- deny: `lib/skills.js`
- deny: `lib/skills/loader.js`
- deny: `lib/skills/frontmatter.js`
- deny: `lib/skills/backing-modules.js`
- deny: `lib/skills/cli.js`
- deny: `lib/index.js`
- deny: `lib/cli.js`
- deny: `skills/**`
- deny: `tests/**`
- deny: `package.json`
- deny: `.blueprint/approvals/**`
- deny: `.blueprint/verifications/**`
- deny: `.specs/**` outside this Spec pair
- deny: `docs/i18n/**`
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
### ADR at `.adr/0001-add-skills-layer.md`

A single ADR records WHY the Skills layer was added. It follows the lightweight MADR shape (`# ADR: ...` / `Status:` / `## Context and problem statement` / `## Decision` / `## Consequences`) so the format is recognized by future readers familiar with the convention. The Status is `Accepted`. The Context describes the gap that motivated the layer: the AI agent had only the heavy `blueprint_dispatch` tool for narrow operations. The Decision describes the chosen shape: harness-neutral `SKILL.md` per Skill, registered through `ctx.skills.registerProvider(...)`, with explicit model-invoked vs user-invoked flags. The Consequences call out what the plugin gains (a narrow AI surface, no regression risk on the CLI) and what it costs (a small bundle to keep in sync, a separate docs surface). The ADR does NOT describe HOW the implementation works — that lives in sub-spec A and B.

### Out-of-scope entry at `.out-of-scope/skills-not-rpc.md`

A short file following the mattpocock convention (title, then a short declarative paragraph per non-goal) declares two non-goals: Skills are not an RPC over the CLI, and a Skill never chains another Skill through the Skills registry. For complex multi-step flows, the developer or agent uses `blueprint_dispatch` or the CLI directly. This file exists so a contributor who is tempted to add a Skill that mutates state across Specs sees the boundary written down.

### Domain glossary at `CONTEXT.md`

`CONTEXT.md` at the repository root is a domain glossary. It lists the plugin's own vocabulary in English, one term per line with a one-sentence definition, alphabetized. Terms included: `Skill`, `Spec`, `Feature`, `ADR`, `Component`, `verification cycle`, `Scope`, `Acceptance criterion`, `evidence level`. The glossary points at the owning authority document for each term — for example, `Spec` points at `docs/AGENTS.md` and the Spec schema, `Skill` points at `@deepseek-ai/dsh-skill`, `ADR` points at `.adr/0001-add-skills-layer.md`. `CONTEXT.md` does not redefine terms that are already canonically defined elsewhere.

### Per-Skill docs at `docs/user/skills/<name>.{md,zh.md}`

Five bilingual pages, one per Skill, follow the mattpocock template referenced from the Feature brief: `What it does` / `When to reach for it` / `Common questions` / `It's working if`. Each page is short (one screen), links to the Skill's `SKILL.md` source, links to the backing module path, and links to the Feature brief. Each Chinese page mirrors the English structure and preserves the mattpocock heading order; terminology follows `docs/i18n/terminology.md`. After authoring each pair, run `design-blueprint docs confirm <name>.md` so the framework records the Git blob hashes in `.i18n.yaml`.

### Brief update

`docs/user/features/agent-interface--skills-layer.{md,zh.md}` gains a `Verified current behavior` subsection for sub-spec C that lists the new ACs (ADR exists, out-of-scope exists, CONTEXT.md exists, each per-Skill page exists, `docs check` reports no required issues). The Feature doc at `.blueprint/features/agent-interface--skills-layer.md` and the architecture Component at `.blueprint/architecture/components/agent-interface-skills-layer.md` are updated to reference the ADR and the out-of-scope entry alongside the existing references to sub-spec A and B.

## Acceptance criteria

- AC-ADR-001: `.adr/0001-add-skills-layer.md` exists and contains the four required MADR sections (`## Context and problem statement`, `## Decision`, `## Consequences`, plus a `Status:` line set to `Accepted`). [surface=repository; moment=static; evidence=static-unit]
- AC-OOS-001: `.out-of-scope/skills-not-rpc.md` exists and declares that Skills are not an RPC over the CLI and that a Skill never chains another Skill through the Skills registry. [surface=repository; moment=static; evidence=static-unit]
- AC-CONTEXT-001: `CONTEXT.md` exists at the repository root and lists `Skill`, `Spec`, `Feature`, `ADR`, `Component`, `verification cycle`, `Scope`, `Acceptance criterion`, and `evidence level` with a one-sentence definition each, plus a pointer to the owning authority document for `Skill`, `Spec`, and `ADR`. [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-001: `docs/user/skills/decompose-spec.{md,zh.md}` exists. The English page contains the four mattpocock section headings (`## What it does`, `## When to reach for it`, `## Common questions`, `## It's working if`). [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-002: `docs/user/skills/todo-status.{md,zh.md}` exists. The English page contains the four mattpocock section headings. [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-003: `docs/user/skills/verify-feature.{md,zh.md}` exists. The English page contains the four mattpocock section headings. [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-004: `docs/user/skills/grill-spec.{md,zh.md}` exists. The English page contains the four mattpocock section headings. [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-005: `docs/user/skills/handoff-spec.{md,zh.md}` exists. The English page contains the four mattpocock section headings. [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-006: `node lib/cli.js docs check --cwd .` reports 0 required issues for the new `docs/user/skills/**` pairs (the YAML record may be missing until `docs confirm` runs; missing YAML is `recommended`, not `required`). [surface=cli; moment=terminal; evidence=contract-integration]
- AC-DOCS-007: After `design-blueprint docs confirm` runs on each of the five `docs/user/skills/<name>.md` files, `node lib/cli.js docs check --cwd .` reports 0 required and 0 recommended issues for the Skill docs. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-BRIEF-001: `docs/user/features/agent-interface--skills-layer.{md,zh.md}` gains a `## Verified current behavior` subsection for sub-spec C listing at least AC-ADR-001, AC-OOS-001, AC-CONTEXT-001, and AC-DOCS-001 through AC-DOCS-007. [surface=repository; moment=static; evidence=static-unit]
- AC-FEATURE-001: `.blueprint/features/agent-interface--skills-layer.md` and `.blueprint/architecture/components/agent-interface-skills-layer.md` reference `.adr/0001-add-skills-layer.md`, `.out-of-scope/skills-not-rpc.md`, `CONTEXT.md`, and `docs/user/skills/<name>.md` under their respective Reference / Companion sections. [surface=repository; moment=static; evidence=static-unit]
- AC-SCAN-001: `node lib/cli.js scan --cwd .` reports 0 required issues after this Spec lands. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001: All 199 host tests continue to pass after this Spec lands. [surface=cli; moment=terminal; evidence=contract-integration]

## Verification

- AC-ADR-001: command `grep -E "Status: Accepted|## Context and problem statement|## Decision|## Consequences" .adr/0001-add-skills-layer.md` [surface=repository; moment=static; evidence=static-unit]
- AC-OOS-001: command `grep -E "not an RPC|never chains" .out-of-scope/skills-not-rpc.md` [surface=repository; moment=static; evidence=static-unit]
- AC-CONTEXT-001: command `grep -E "^Skill$|^Spec$|^Feature$|^ADR$|^Component$|^verification cycle$|^Scope$|^Acceptance criterion$|^evidence level$" CONTEXT.md` [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-001: command `test -f docs/user/skills/decompose-spec.md && test -f docs/user/skills/decompose-spec.zh.md && grep -E "## What it does|## When to reach for it|## Common questions|## It's working if" docs/user/skills/decompose-spec.md` [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-002: command `test -f docs/user/skills/todo-status.md && test -f docs/user/skills/todo-status.zh.md && grep -E "## What it does|## When to reach for it|## Common questions|## It's working if" docs/user/skills/todo-status.md` [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-003: command `test -f docs/user/skills/verify-feature.md && test -f docs/user/skills/verify-feature.zh.md && grep -E "## What it does|## When to reach for it|## Common questions|## It's working if" docs/user/skills/verify-feature.md` [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-004: command `test -f docs/user/skills/grill-spec.md && test -f docs/user/skills/grill-spec.zh.md && grep -E "## What it does|## When to reach for it|## Common questions|## It's working if" docs/user/skills/grill-spec.md` [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-005: command `test -f docs/user/skills/handoff-spec.md && test -f docs/user/skills/handoff-spec.zh.md && grep -E "## What it does|## When to reach for it|## Common questions|## It's working if" docs/user/skills/handoff-spec.md` [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-006: command `node lib/cli.js docs check --cwd .` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-DOCS-007: command `node lib/cli.js docs check --cwd .` after `design-blueprint docs confirm` runs on each Skill page [surface=cli; moment=terminal; evidence=contract-integration]
- AC-BRIEF-001: command `grep -E "sub-spec C|AC-ADR-001|AC-OOS-001|AC-CONTEXT-001|AC-DOCS-" docs/user/features/agent-interface--skills-layer.md` [surface=repository; moment=static; evidence=static-unit]
- AC-FEATURE-001: command `grep -E "0001-add-skills-layer|skills-not-rpc|CONTEXT.md|docs/user/skills" .blueprint/features/agent-interface--skills-layer.md .blueprint/architecture/components/agent-interface-skills-layer.md` [surface=repository; moment=static; evidence=static-unit]
- AC-SCAN-001: command `node lib/cli.js scan --cwd .` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001: command `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js" "tests/**/*.test.js"` [surface=cli; moment=terminal; evidence=contract-integration]

## Risks

- The ADR describes the rationale as understood at the time of authoring; if the rationale shifts later, the ADR is superseded by a new ADR rather than edited, so this Spec only writes the initial record.
- `docs confirm` records content identity, not translation quality. A person or capable AI reviews semantic equivalence before `docs confirm` runs. If the Chinese translation drifts, `docs check` will not catch it; this Spec trusts the human review step.
- `CONTEXT.md` is intentionally short. If contributors add terms that overlap with `docs/i18n/terminology.md`, the project ends up with two competing glossaries. This Spec keeps `CONTEXT.md` to plugin-internal terms only and points at `docs/i18n/terminology.md` for translation terms.

## Requirements

### REQ-DOCS-1 — ADR records WHY Skills layer was added

`.adr/0001-add-skills-layer.md` exists with `Status: Accepted`, `## Context and problem statement`, `## Decision`, `## Consequences`. The Decision section names the harness-neutral `SKILL.md` shape and `ctx.skills.registerProvider(...)` and explicitly notes that the implementation details live in sub-spec A and B, not in the ADR.

### REQ-DOCS-2 — Out-of-scope entry declares the boundary

`.out-of-scope/skills-not-rpc.md` declares two non-goals in the mattpocock convention: Skills are not an RPC over the CLI; a Skill never chains another Skill through the Skills registry. Complex multi-step work uses `blueprint_dispatch` or the CLI.

### REQ-DOCS-3 — Domain glossary at `CONTEXT.md`

`CONTEXT.md` lists the plugin's internal vocabulary (Skill, Spec, Feature, ADR, Component, verification cycle, Scope, Acceptance criterion, evidence level) with one-sentence definitions and pointers to the owning authority document.

### REQ-DOCS-4 — Five bilingual Skill pages exist

For each of `decompose-spec`, `todo-status`, `verify-feature`, `grill-spec`, `handoff-spec`, a `docs/user/skills/<name>.md` and `docs/user/skills/<name>.zh.md` pair exists with the four mattpocock sections (`What it does` / `When to reach for it` / `Common questions` / `It's working if`).

### REQ-DOCS-5 — `docs check` reports clean

After `docs confirm` runs on each Skill pair, `docs check` reports 0 required and 0 recommended issues for the new `docs/user/skills/**` content.

### REQ-DOCS-6 — Feature brief and Component reference the new docs

The Feature brief and the Component document list `.adr/0001-add-skills-layer.md`, `.out-of-scope/skills-not-rpc.md`, `CONTEXT.md`, and `docs/user/skills/<name>.md` alongside the existing references to sub-spec A and B.

## Scenarios

[scenario=adr-readable]
Given a fresh contributor opens `.adr/0001-add-skills-layer.md`,
When they read the file top to bottom,
Then they know why the Skills layer exists, what shape it takes, and that the implementation lives elsewhere.

[scenario=out-of-scope-readable]
Given a contributor is tempted to add a Skill that mutates state across Specs,
When they read `.out-of-scope/skills-not-rpc.md`,
Then they see the boundary written down and reach for `blueprint_dispatch` instead.

[scenario=context-glossary-readable]
Given a developer encounters the term `verification cycle` in a Spec,
When they open `CONTEXT.md`,
Then they find a one-sentence definition and a pointer to the owning authority.

[scenario=skill-doc-readable]
Given a developer wants to know how to invoke `grill-spec` from the chat box,
When they open `docs/user/skills/grill-spec.md`,
Then they see the four mattpocock sections and a link to the Skill's `SKILL.md` and backing module.

[scenario=docs-check-clean]
Given the five Skill pages and their `docs confirm` records,
When `node lib/cli.js docs check --cwd .` runs,
Then the output reports 0 required and 0 recommended issues for `docs/user/skills/**`.

## Assumptions

1. `.adr/0001-add-skills-layer.md` is the first ADR this repository writes; the directory does not yet exist and is created by this Spec.
2. `.out-of-scope/` is similarly new; it is created by this Spec.
3. `CONTEXT.md` at the repository root is new; nothing else in the repository owns that path.
4. `docs/user/skills/<name>.i18n.yaml` is created by `design-blueprint docs confirm <name>.md`, not authored in this Spec; the `deny:` rule prevents accidental hand-editing of those files.
5. `design-blueprint docs confirm` is run by the developer or a capable AI after reviewing semantic equivalence, per `docs/i18n/README.md`.

## Non-goals

- Translating any other Feature brief or reference document. The existing translation pair for the Feature brief at `docs/user/features/agent-interface--skills-layer.{md,zh.md}` is patched in place to add the sub-spec C section; the bulk of the existing content is not retranslated.
- Rewriting the Feature brief beyond adding the sub-spec C `## Verified current behavior` subsection.
- Adding new Skills. This Spec does not add a sixth Skill or modify the five existing Skills.
- Writing a `docs/i18n/terminology.md` entry for "Skill" or "ADR"; the project's translation glossary is owned by `docs/i18n/terminology.md` and edits there are a separate decision.

## Alternatives considered

**Use a single omnibus "Skills docs" page instead of five per-Skill pages.** Rejected because the Feature brief already lists `docs/user/skills/<name>.md` as the canonical format, and each Skill has different trigger phrasing, backing module, and failure modes. A single page would force the reader to scan past four unrelated Skills to find the one they care about.

**Translate `CONTEXT.md` to Chinese.** Rejected because `CONTEXT.md` is the plugin's internal English vocabulary source of truth and points at English authority documents. Translating it would invite drift between `CONTEXT.md` and the documents it points at.

**Skip `CONTEXT.md` entirely and rely on docs/AGENTS.md.** Rejected because `docs/AGENTS.md` is the docs placement standard, not a vocabulary reference. The Skills layer introduces plugin-specific terms (Skill body, backing module, BUNDLED_SKILL_RANK, invocation policy) that are out of scope for `docs/AGENTS.md`.

## Tasks

1. Author `.adr/0001-add-skills-layer.md` with the four MADR sections, `Status: Accepted`, and explicit pointers to sub-spec A and B for implementation details. REQ: REQ-DOCS-1. Scope: `.adr/0001-add-skills-layer.md`. AC: AC-ADR-001.
2. Author `.out-of-scope/skills-not-rpc.md` with the mattpocock-style declarations for the two non-goals. REQ: REQ-DOCS-2. Scope: `.out-of-scope/skills-not-rpc.md`. AC: AC-OOS-001.
3. Author `CONTEXT.md` at the repository root with the nine vocabulary entries and pointers. REQ: REQ-DOCS-3. Scope: `CONTEXT.md`. AC: AC-CONTEXT-001.
4. Author `docs/user/skills/<name>.md` and `<name>.zh.md` for each of the five Skills, following the mattpocock template. REQ: REQ-DOCS-4. Scope: `docs/user/skills/<name>.{md,zh.md}`. AC: AC-DOCS-001 through AC-DOCS-005.
5. Run `design-blueprint docs confirm <name>.md` on each of the five Skill pages so the framework records the Git blob hashes in the corresponding `.i18n.yaml` files. REQ: REQ-DOCS-5. Scope: `docs/user/skills/<name>.i18n.yaml` (created by framework, not authored). AC: AC-DOCS-006, AC-DOCS-007.
6. Patch `docs/user/features/agent-interface--skills-layer.{md,zh.md}` to add a `## Verified current behavior` subsection for sub-spec C listing the new ACs. REQ: REQ-DOCS-6. Scope: `docs/user/features/agent-interface--skills-layer.{md,zh.md}`. AC: AC-BRIEF-001.
7. Patch `.blueprint/features/agent-interface--skills-layer.md` and `.blueprint/architecture/components/agent-interface-skills-layer.md` to reference `.adr/0001-add-skills-layer.md`, `.out-of-scope/skills-not-rpc.md`, `CONTEXT.md`, and `docs/user/skills/<name>.md`. REQ: REQ-DOCS-6. Scope: `.blueprint/features/agent-interface--skills-layer.md`, `.blueprint/architecture/components/agent-interface-skills-layer.md`. AC: AC-FEATURE-001.
8. Run `node lib/cli.js scan --cwd .` and `node lib/cli.js docs check --cwd .` and the full host test suite. REQ: all. Scope: -. AC: AC-SCAN-001, AC-DOCS-006, AC-DOCS-007, AC-REGRESSION-001.

## Lifecycle

- Status: proposed
- Target status after approval: implemented (file moves to `.specs/implemented/agent-interface--skills-conventions.md`)

## Truth-delta

New facts added:
- `.adr/0001-add-skills-layer.md` exists and records the WHY for the Skills layer.
- `.out-of-scope/skills-not-rpc.md` declares that Skills are not an RPC over the CLI and that a Skill never chains another Skill.
- `CONTEXT.md` lists the plugin's domain vocabulary.
- Five bilingual Skill docs pages exist at `docs/user/skills/<name>.{md,zh.md}` and pass `docs check`.
- The Feature brief and Component document reference the new docs.

Existing facts preserved:
- Sub-spec A and B behavior unchanged.
- The existing `docs/user/features/agent-interface--skills-layer.md` content is patched in place; the bulk of the document is not retranslated.
- The five Skills are not modified; this Spec adds docs, not Skill code.
- `blueprint_dispatch` remains the authoritative Spec lifecycle tool.

## Traceability

REQ-DOCS-1 -> scenario[adr-readable] -> task 1 -> AC-ADR-001 -> verification grep Status/Context/Decision/Consequences
REQ-DOCS-2 -> scenario[out-of-scope-readable] -> task 2 -> AC-OOS-001 -> verification grep not an RPC / never chains
REQ-DOCS-3 -> scenario[context-glossary-readable] -> task 3 -> AC-CONTEXT-001 -> verification grep term list
REQ-DOCS-4 -> scenario[skill-doc-readable] -> task 4 -> AC-DOCS-001 through AC-DOCS-005 -> verification test -f and grep section headings
REQ-DOCS-5 -> scenario[docs-check-clean] -> task 5 -> AC-DOCS-006, AC-DOCS-007 -> verification docs check
REQ-DOCS-6 -> scenario[adr-readable] / [skill-doc-readable] -> task 6, 7 -> AC-BRIEF-001, AC-FEATURE-001 -> verification grep references

## Unresolved decisions

None. The four pieces (ADR, out-of-scope, glossary, per-Skill pages) are settled by the Feature brief and the mattpocock convention referenced from it.

## Quality checklist (self-attested)

- requirements complete: yes (6 REQs covering ADR, out-of-scope, glossary, Skill pages, docs check, Feature/Component reference)
- requirements unambiguous: yes (each REQ names the file and the contract)
- requirements bounded: yes (single Feature sub-spec C; no code changes; no new Skills)
- requirements failure-aware: yes (CI exit codes documented; ADR cannot be silently rewritten)
- requirements testable: yes (each AC maps to a verification command or test)
- requirements non-contradictory: yes (no AC says both "exists" and "absent" for the same file)

## Cross-artifact analysis

- requirements-to-scenarios: yes (all 6 REQs covered by 5 scenarios)
- requirements-to-impact: yes (all 6 REQs map to one or more files in ## Scope)
- requirements-to-tasks: yes (each task lists REQs)
- requirements-to-acceptance: yes (each AC names REQs)
- requirements-to-verification: yes (each AC names a verification command or test)
- tasks-to-scope: yes (each task names a Scope path)
- design-to-scope: not applicable (designRequired: false; this Spec is docs-only)
- scope-to-paths: yes (every Scope path matches a real path; deny rule on `.i18n.yaml` files makes the no-write contract explicit)

## Consequences

The ADR at `.adr/0001-add-skills-layer.md` is the durable record of WHY. The out-of-scope entry at `.out-of-scope/skills-not-rpc.md` is the durable record of NON-goals. The glossary at `CONTEXT.md` is the durable record of vocabulary. The five `docs/user/skills/<name>.md` pages are the durable record of how to use each Skill. Together they make the Skills layer legible to a fresh contributor without spelunking the source tree.

## Consequences

Blueprint completed this delivery automatically after requirement-linked verification.

- Verified snapshot: `git-index:272a65d3a86433a14e003df8a3109ee427ec621219ce80da331711ef6c16ad92`
- Verification attempt: `attempt-1`
- Conclusion: Sub-spec C lands the Skills conventions: ADR at .adr/0001-add-skills-layer.md, out-of-scope entry at .out-of-scope/skills-not-rpc.md, CONTEXT.md glossary, and 5 bilingual Skill docs pages at docs/user/skills/<name>.{md,zh.md}. docs check reports 0 required and 0 recommended issues for the new docs. scan reports 0 required issues.
- AC evidence: all 14 acceptance criteria passed.
- Check evidence: adr-content-repository (inspection), oos-content-repository (inspection), context-glossary-repository (inspection), skill-docs-repository (inspection), docs-check-cli-contract (command), scan-cli-hygiene (command), brief-sub-spec-c-section-repository (inspection), feature-and-component-reference-repository (inspection), regression-suite-cli-contract (command).
