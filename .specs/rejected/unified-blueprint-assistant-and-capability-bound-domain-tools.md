# Spec: Unified Blueprint assistant and capability-bound domain tools

Status: rejected — superseded by the Skills sub-specs A, B, C, D which own the lib/ subtree more narrowly
Feature: spec-governance--architecture-design

## Problem

Blueprint currently exposes a Spec review assistant in Optimize Spec and a separate architecture assistant in Architecture design. Their role separation is conceptually valid, but two visible conversations force the developer to choose an internal specialist, understand when to switch, and manage duplicated drafts, histories, focus, and handoff state. The latest handoff card reduces repeated context but does not remove that cognitive burden.

The two Sessions also rely on prompts rather than executable capability boundaries. The Spec reviewer says that it may edit only the current Product brief and proposed Spec, yet it still runs with the active DSH Agent tool surface. A broad request such as “fill the repository gaps” can therefore be interpreted as permission to edit Feature records or lifecycle files outside the selected proposal. The scanner compounds this ambiguity by recommending that Component allocations be copied back into a Feature-side legacy mirror even though Component `Supported features` is the declared canonical source. A failed lifecycle move can consequently leave source files truncated even though the requested cleanup should never have been a valid Spec-review action.

## Proposal

This Spec is rejected. The lib/ subtree is now owned more narrowly by the Skills sub-specs A, B, C, and D of `agent-interface--skills-layer`, which each claim a focused set of paths (loader, content + CLI, conventions, design-time auto-fire). Future re-implementations should author a new proposed Spec rather than resume this one.

## Scope

- allow: `lib/assistant-actions.js`
- allow: `lib/client.js`
- allow: `lib/web-api.js`
- allow: `lib/artifacts.js`
- allow: `lib/workflow.js`
- allow: `lib/specs.js`
- allow: `lib/scan.js`
- allow: `lib/index.js`
- allow: `lib/version.js`
- allow: `tests/**`
- allow: `.blueprint/features/spec-governance--architecture-design.md`
- allow: `.specs/**`
- allow: `docs/user/features/spec-governance--architecture-design.md`
- allow: `docs/user/features/spec-governance--architecture-design.zh.md`
- allow: `docs/user/features/spec-governance--architecture-design.i18n.yaml`
- allow: `DESIGN.md`
- allow: `README.md`
- allow: `README.zh.md`
- allow: `README.i18n.yaml`
- allow: `package.json`
- deny: `.blueprint/approvals/**`
- deny: `.specs/implemented/spec-governance--architecture-design.md`
- deny: `.specs/implemented/spec-governance--architecture-design.zh.md`
- deny: `LICENSE`

## Decision

### One visible assistant

Replace the two embedded assistant surfaces with one project-level **Blueprint assistant**. The Product brief and Spec document, Feature map, reconciliation baseline, component graph, and selected detail remain separate views of repository state, but they share one visible conversation panel, one draft, one streaming subscription, and one archived Host-born Session per project and assistant protocol. Changing the selected Feature, Component, or view does not create another assistant identity; every submission carries the fresh current focus and Host snapshot.

The assistant labels its current route as product/Spec, architecture, governance, or mixed work. The label explains what it is doing but is not a permission decision. Developers can ask in ordinary language without selecting a specialist. A mixed request is handled in one conversation: establish user-visible behavior, inspect or propose architecture through the architecture tool when needed, then incorporate confirmed facts into the Spec. No second Session, assistant-to-assistant transcript, background loop, or manual restatement is created.

Existing reviewer and architecture backing Sessions remain archived historical data and are not merged heuristically. The new protocol creates or recovers only the unified project Session. Cached visible history may be retained during an unavailable binding, but it never becomes authority for current repository facts.

### Host-owned context and routing contract

Every first submission and every context-changing submission carries delimited, untrusted current data: the selected Feature and registered artifacts, current Product brief and Spec presentations, workflow and approval state, reconciliation items with their owning domain, the complete Component catalog, selected Component, authority excerpts, and the developer message. The assistant must distinguish facts, inferences, unknowns, proposals, and developer decisions.

Reconciliation items gain an explicit owner and action kind. Product behavior, scope, acceptance, and verification route to the Spec domain. Component placement, supported Features, typed relations, contracts, deployment, source ownership, compatibility, and migration route to the architecture domain. Lifecycle inconsistencies and authority repair route to governance and remain read-only unless a dedicated Host operation supports the exact transition. When classification is uncertain or a change is irreversible, the assistant asks the developer rather than choosing a write surface by analogy.

The route may be model-selected, but the Host independently validates every proposed action against its schema, selected Feature, registered paths, current hashes, and lifecycle. A route label never grants filesystem access.

### Capability-bound proposal tools

The unified Session does not receive permission to mutate repository files through natural-language phrases such as “help me change” or “fill the gaps.” It produces at most one schema-bound action proposal in a finalized turn. Blueprint removes the machine block from visible Markdown and renders the matching preview card.

The Spec artifact action may target only the selected Feature's Host-registered English/Chinese Product brief and current Feature-linked proposed Spec pair. Preview rejects an unregistered path, missing expected hash, stale content, wrong language placement, a Spec that changes Feature identity or leaves `Status: proposed`, malformed Scope, missing stable AC/Verification correspondence, or structurally drifting Product brief languages. The card displays the exact registered-file diff and requires an explicit developer confirmation that the bilingual brief is semantically synchronized before atomic apply and pairing-record refresh. It cannot edit Feature definitions, implemented/rejected lifecycle records, architecture records, approvals, implementation files, or arbitrary documentation.

The architecture action reuses the existing one-Component preview/apply boundary. It may update canonical Component `Supported features` allocations but cannot write a Feature-side `## Components` mirror. Architecture initialization remains a Host action. Governance findings produce explanations and recovery guidance; they do not become general file or shell operations in the embedded assistant.

Preparation of skeleton artifacts remains recoverable and Host-owned. Planning buttons select requirements-first or evidence-first intent and submit it to the same unified conversation. Direct Spec optimization also uses the Spec artifact proposal card instead of authorizing the Agent's general file tools.

### Lifecycle and transaction protection

An implemented Spec remains an implemented historical decision when a later Spec supersedes or extends it. It must not be moved to `rejected`, whose meaning is that a proposal was not adopted. The staged scanner reports a required lifecycle-regression issue when one change attempts to replace an implemented Spec with a rejected record of the same identity, including rename and delete/add forms that can be determined from the staged change set.

Supported lifecycle transitions use exact source hashes, validate complete destination content before mutation, write the destination before removing the source, and restore the original state if any step fails. The embedded assistant cannot initiate lifecycle archival. Implementation completion remains governed by the approved development workflow, while rejection of a still-proposed Spec remains a direct developer decision.

### Component semantics and canonical allocation

The public UI presents Component as **Software component (code responsibility unit)** / **软件组件（代码责任单元）** and explains that a Feature describes what a user can do, a Spec describes a reviewed change and its acceptance, and a Component identifies the software responsibility that owns code, contracts, dependencies, deployment, and supported Features. A page or requirement is not automatically a Component.

Because Component `Supported features` is canonical, the scanner no longer recommends creating a missing Feature-side `## Components` mirror. A legacy mirror remains readable. If it is explicitly present and contains unknown or contradictory Component IDs, reconciliation can report it as legacy drift without suggesting that the duplicate field become mandatory. Architecture readiness and highlights continue to use only valid non-deprecated Component records.

### Unified workspace behavior

Optimize Spec, Project structure, and Architecture model remain navigation views, not separate assistant destinations. The single assistant panel stays mounted and visible alongside the active view. Its current route badge, selected Feature/Component context, conversation, streaming activity, proposal card, scroll position, and unsent draft persist across view switches. Selecting a graph node updates context for the next message without silently sending a turn.

The Architecture view continues to show reconciliation, graph, Component detail, preview, and apply results. The Spec view continues to show Product brief/Development Spec and language switches, workflow state, approval readiness, and preparation actions. Removing duplicate chat surfaces must not remove either domain's inspection or confirmation UI.

## Alternatives considered

**Keep two assistants and improve the handoff animation.** Rejected because the developer would still be responsible for selecting an internal role and maintaining two histories.

**Use one prompt with unrestricted file tools and stronger wording.** Rejected because the incident demonstrated that natural-language role boundaries are not executable authorization boundaries.

**Let the assistant apply every routed tool automatically.** Rejected because classification can be wrong and architecture, bilingual content, and lifecycle changes need visible developer review.

**Remove Component terminology and infer ownership from Feature paths.** Rejected because product capability and software responsibility are different many-to-many models; renaming the user-facing label is safer than discarding the architecture model.

**Synchronize every Feature `## Components` mirror automatically.** Rejected because it recreates duplicate canonical state and invites drift. Existing mirrors are compatibility input, not a required write target.

## Verification

Implemented and verified on 2026-08-25. The complete Node test suite passed 91/91, JavaScript lint passed, bilingual documentation checks passed, and both working-tree and staged Blueprint scans reported no required or recommended issues.

- AC-UA-1: `tests/unified-assistant.test.js`, `tests/client.test.js`, `tests/client-runtime.test.js`
- AC-UA-2: `tests/unified-assistant.test.js`, `tests/reviewer.test.js`, `tests/architecture-reviewer.test.js`
- AC-UA-3: `tests/unified-assistant.test.js`, `tests/assistant-actions.test.js`, `tests/web-api.test.js`
- AC-UA-4: `tests/assistant-actions.test.js`, `tests/artifacts.test.js`, `tests/web-api.test.js`, `tests/specs.test.js`
- AC-UA-5: `tests/scan.test.js`, `tests/reconciliation.test.js`, `tests/architecture-reviewer.test.js`, `tests/web-api.test.js`
- AC-UA-6: `tests/staged-policy.test.js`, `tests/specs.test.js`, `tests/assistant-actions.test.js`
- AC-UA-7: `tests/reconciliation.test.js`, `tests/unified-assistant.test.js`
- AC-UA-8: `tests/client.test.js`, `tests/architecture.test.js`, `tests/spec-workspace.test.js`
- AC-UA-9: existing `tests/**/*.test.js` and commands `npm.cmd test`, `npm.cmd run lint:js`, `node lib/cli.js docs check --cwd .`, `node lib/cli.js scan --all --cwd .`, and staged `node lib/cli.js scan --cwd .`

## Consequences

- A single long-lived conversation can accumulate stale assumptions. Fresh Host context, visible route/focus, and bounded context summaries must remain authoritative over conversation memory.
- Structured bilingual Spec patches can be large. Size limits, exact registered paths, safe JSON parsing, preview hashes, and bounded diff presentation are required.
- Developer confirmation of a bilingual patch is a semantic assertion, not machine translation proof. The card must say what is being confirmed and retain structural checks.
- Removing a recommended mirror warning changes scan output for legacy repositories. Unknown Feature-declared Components remain errors; only the reverse “missing duplicate mirror” advice is removed.
- Lifecycle regression detection based on staged changes must avoid confusing an unrelated rejected proposal with an implemented decision. Matching uses canonical Spec identity and paired rename/delete-add evidence, not title similarity alone.
- Consolidating Session recovery must not accidentally surface previously archived internal Sessions or merge unrelated histories. New protocol identity is project-scoped and leaves legacy Sessions untouched.
