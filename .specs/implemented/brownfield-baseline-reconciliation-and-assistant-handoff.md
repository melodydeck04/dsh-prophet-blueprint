# Spec: Brownfield baseline reconciliation and assistant handoff

Status: implemented
Feature: spec-governance--architecture-design

## Problem

Blueprint has a coherent path for a newly planned Feature after its product and architecture records already exist, but it does not provide an adoption path for a repository that contains undocumented capabilities, incomplete component allocations, or an implementation that differs from the developer's intended structure. The current architecture summary can report one structurally complete coarse component even when most product capabilities are not allocated, source ownership is incomplete, and Feature lifecycle metadata disagrees with implemented Specs.

The two embedded assistants also lack a deterministic handoff. The Spec reviewer can discuss requirements without knowing whether the selected Feature has an accepted component owner, while the architecture assistant can update a Component's `Supported features` list but cannot update the duplicate `## Components` list in the Feature file. The Spec workspace reads the Feature-side list, so a successfully applied architecture proposal can remain invisible to the planning and approval workflow. Developers must currently decide for themselves which assistant to use, whether an architecture review is finished, and whether an existing behavior is being documented or a new behavior is being proposed.

## Scope

- allow: `lib/reconciliation.js`
- deny: `.blueprint/approvals/**`
- deny: `LICENSE`

## Decision

### One current-state reconciliation model

Add a read-only reconciliation model derived from the same working-tree snapshot as the Feature catalog, architecture catalog, and lifecycle workflow. It reports current facts rather than inferring product intent or silently repairing files:

- every Feature without a non-deprecated Component owner;
- every Component that supports no Feature;
- stale or contradictory Feature/Component allocation declarations;
- Feature status and lifecycle workflow disagreements;
- repository files owned by zero or multiple Component path patterns, with bounded samples;
- document, architecture, and catalog issues already detected by their owning loaders.

The model exposes counts, per-Feature readiness, per-Component coverage, and actionable reconciliation items. Coverage is an adoption signal, not a new required scanner failure: an existing repository may establish a coarse truthful baseline before refining it. The architecture catalog always describes `as-is` reality. A desired `to-be` structure remains an assistant proposal until the developer previews, confirms, and implements it.

### One canonical executable allocation

A Component's `Supported features` list becomes the canonical executable Feature-to-Component allocation because architecture preview/apply can update that registered file safely. The Feature file's existing `## Components` section remains readable as a legacy or human-authored mirror, but dashboard readiness and selection highlights are derived from Component records. Disagreement is reported explicitly instead of making a confirmed architecture change invisible. No loader infers a Component from a source directory or silently rewrites either side.

A Feature is architecture-ready when at least one existing, non-deprecated Component explicitly supports it and the referenced component record is valid. The dashboard returns the derived component IDs and readiness details with the Feature. This same state is supplied to both assistants and is recomputed after every architecture apply.

### Brownfield and new-capability planning modes

The Spec workspace provides two explicit planning intents before a proposed Spec exists:

- **Plan new capability** is requirements-first. The Spec assistant establishes user-visible behavior and identifies unresolved business boundaries, then sends the developer to architecture review before proposal approval when component ownership is not ready.
- **Document existing capability** is evidence-first. The assistant reads observable UI, interfaces, tests, and current documentation; labels repository facts, unknowns, and inferred behavior; creates an adoption proposal without inventing historical intent; and preserves verified external behavior unless the developer explicitly requests a change.

Both intents use the existing Host-registered bilingual Product brief and proposed Spec paths. The planning prompt records the selected intent. It still stops before implementation and direct approval.

The Spec reviewer owns product purpose, actors, scenarios, scope, rules, failures, acceptance criteria, and verification. It receives the reconciliation result and confirmed Component owners. It may request architecture review, but it cannot create Components, choose deployment topology, or claim architecture readiness. Its proposed Spec incorporates confirmed architecture facts into Scope and verification without treating an assistant suggestion as authority.

When architecture review is needed, a finalized Spec-assistant response may include one delimited, current-schema handoff containing the Feature ID, the reason for review, confirmed product constraints, unresolved architecture questions, and a bounded evidence summary. Blueprint removes the machine block from visible Markdown and renders an **Start architecture review** card. The developer's click is the explicit dispatch boundary: Blueprint keeps the selected Feature, opens Architecture design, and sends the structured handoff plus fresh Host context to the independent architecture Session. The developer never has to restate the requirement, while no hidden assistant-to-assistant conversation starts without a visible action.

### Architecture reconciliation and placement modes

The Architecture workspace presents the reconciliation summary before the graph. When the selected Feature has no confirmed Component owner, the primary action focuses the architecture assistant on current-state reconciliation. When ownership is already established, the assistant focuses on impact assessment for the proposed change. In both modes the assistant owns component placement, typed relations, interfaces, data and deployment boundaries, source ownership, compatibility, and migration impact.

For brownfield work, the assistant first describes the observable `as-is` structure, distinguishes repository facts from inferences, and proposes the smallest truthful catalog change. It never rewrites the current catalog directly into an idealized `to-be` graph. Existing one-component preview/apply remains the only executable mutation surface; multi-component adoption is presented as an ordered sequence of separately confirmed changes.

After a Component proposal that adds the selected Feature to `Supported features` is applied, the Host recomputes reconciliation and the Spec workspace becomes architecture-ready without editing the Feature file or copying chat text. Navigation actions preserve the selected Feature while moving between the Spec and Architecture workspaces.

The architecture assistant's durable result is the developer-confirmed Component model and Host-computed reconciliation state, not a transcript copied into another chat. On return, the Spec reviewer receives those fresh facts on its next submission and can finish the Development Spec. Assistant Sessions never call each other directly, cannot approve each other's work, and cannot create a background review loop.

### Workflow gates and recovery

Blueprint may prepare and review Product brief and Spec artifacts before architecture allocation is complete, but approval and Start development require architecture readiness. Both the Web action and the hash-bound CLI approval fallback enforce this Host-side; hiding a browser button is not the security boundary. A clear pending card explains why approval is unavailable and opens Architecture design with the same Feature selected.

If an approved Feature later loses every valid Component owner, Start development becomes unavailable until architecture reconciliation restores ownership. Changes to Component records do not change the Spec review hash, but readiness is always re-evaluated from the current snapshot. Existing implemented Features remain readable even when reconciliation reports drift; adoption does not fabricate or rewrite their historical approval records.

### Current repository reconciliation

The repository's own architecture Feature was updated from its stale planned/document state to active current behavior while retaining this enhancement. Its canonical component record is tracked and explicitly supports the existing Feature catalog so the project demonstrates the same handoff it enforces. Published Feature identity wording now describes shipped reality: hierarchical Feature identity changes still use the explicit migration workflow, while Component identity remains independent of `Container`. The older architecture decision's orphaned acceptance identifiers remain historical cleanup for a separately governed change rather than being made a second overlapping implementation owner in this snapshot.

Public documentation explains the normal new-capability route, the brownfield adoption route, the `as-is`/`to-be` distinction, assistant ownership, the architecture readiness gate, and the intentionally manual developer decisions.

## Alternatives considered

**Let both assistants inspect the repository and rely on their prompts to coordinate.** Rejected because two independent Sessions cannot create a durable, deterministic handoff from conversational inference alone.

**Treat the Feature-side `## Components` list as canonical.** Rejected because the architecture assistant's only safe executable surface writes Component records, so successful preview/apply would still require a second manual Feature edit.

**Automatically infer Features and Components from source paths.** Rejected because source layout is not product intent, and a misleading automatically generated architecture is worse than an explicit incomplete baseline.

**Block every scan until all files and Features are allocated.** Rejected because brownfield adoption must be incremental. Reconciliation coverage is visible and actionable, while implementation approval is gated only for the selected Feature.

**Generate retroactive implemented Specs for existing code.** Rejected because repository evidence can establish current behavior but cannot reconstruct the original intent, alternatives, or verification history honestly.

## Acceptance criteria

- AC-BR-1: The Host returns a deterministic reconciliation model from one working-tree snapshot, including unmapped Features, Components without Features, lifecycle/status disagreements, allocation drift, and bounded unowned/ambiguous file coverage without inferring or writing product or architecture boundaries.
- AC-BR-2: Component `Supported features` records are the executable allocation source; the dashboard derives each Feature's component owners and architecture readiness from them, reports legacy Feature-side disagreement, and refreshes both workspaces immediately after an applied architecture proposal.
- AC-BR-3: A developer can choose **Plan new capability** or **Document existing capability** before artifact preparation; the latter uses evidence-first language, labels facts/inferences/unknowns, preserves verified behavior by default, and never fabricates historical design intent.
- AC-BR-4: The Spec assistant owns product behavior, scope, acceptance, and verification; it receives current reconciliation and confirmed component facts, identifies when architecture review is pending, and can emit at most one validated structured handoff without creating architecture records or claiming unconfirmed placement.
- AC-BR-5: The Architecture workspace shows the current baseline and keeps `as-is` facts separate from `to-be` proposals; its assistant owns placement, relations, contracts, deployment, path ownership, compatibility, and migration, and can reconcile an existing Feature through the current one-component preview/apply boundary.
- AC-BR-6: Proposal approval and Start development are unavailable unless the selected Feature has at least one valid non-deprecated Component owner; the Host enforces the same rule for Web and CLI approval, and a developer-confirmed handoff card opens Architecture design, preserves Feature selection, and automatically submits the validated Spec context without requiring the developer to repeat it.
- AC-BR-7: The repository's own Feature, Component, Product brief, architecture description, and public contract agree on current lifecycle, allocation, identity migration, assistant ownership, and brownfield workflow facts; no historical approval record is fabricated or hand-edited.
- AC-BR-8: Existing initialized repositories, implemented Features, legacy Feature `## Components` sections, DSH session recovery, optimistic concurrency, bilingual review hashing, and the one-component architecture proposal boundary remain compatible.
- AC-BR-9: All new reconciliation, prompt, handoff, gating, compatibility, and UI behavior has automated evidence, and the complete test, JavaScript syntax, bilingual documentation, working-tree scan, and staged-snapshot scan commands pass.

## Verification

- AC-BR-1: `tests/reconciliation.test.js`, `tests/web-api.test.js`
- AC-BR-2: `tests/reconciliation.test.js`, `tests/scan.test.js`, `tests/web-api.test.js`, `tests/client.test.js`
- AC-BR-3: `tests/spec-workspace.test.js`, `tests/reviewer.test.js`, `tests/artifacts.test.js`
- AC-BR-4: `tests/reviewer.test.js`, `tests/client-runtime.test.js`, `tests/spec-workspace.test.js`
- AC-BR-5: `tests/architecture-reviewer.test.js`, `tests/client.test.js`, `tests/web-api.test.js`
- AC-BR-6: `tests/workflow.test.js`, `tests/cli-approval.test.js`, `tests/web-api.test.js`, `tests/spec-workspace.test.js`, `tests/architecture-reviewer.test.js`
- AC-BR-7: `tests/scan.test.js`, command `node lib/cli.js docs check --cwd .`
- AC-BR-8: existing `tests/**/*.test.js`, with focused coverage in `tests/features.test.js`, `tests/workflow.test.js`, `tests/architecture.test.js`, and `tests/dsh-compatibility.test.js`
- AC-BR-9: commands `npm.cmd test`, `npm.cmd run lint:js`, `node lib/cli.js docs check --cwd .`, `node lib/cli.js scan --all --cwd .`, and staged `node lib/cli.js scan --cwd .`

## Consequences

- Path-pattern coverage can report intentionally unmanaged generated or governance files. It must remain a bounded advisory inventory and show its matching basis.
- Making Component records canonical for allocation changes the meaning of an existing duplicated field. Legacy Feature declarations must remain readable and disagreements must be visible during migration.
- Architecture gating can surprise existing users whose Feature catalog predates the component model. Implemented Features remain readable, while new approval attempts receive a direct recovery path rather than a generic failure.
- Evidence-first documentation can still overstate behavior if tests and public contracts are incomplete. Prompts and UI must label unknowns and require developer confirmation instead of presenting inference as fact.
- Automatic dispatch can become a hidden or looping multi-agent workflow if it is triggered from model text alone. Handoff parsing must be schema-bound, dispatch must require one visible developer click, and the architecture assistant cannot invoke a return dispatch by itself.
- `lib/client.js` remains a large browser bundle. The change should isolate pure reconciliation and readiness logic in Host code and avoid adding another independent chat surface.
