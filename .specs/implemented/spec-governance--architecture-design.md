# Spec: Architecture design workspace and model

Status: implemented
Feature: spec-governance--architecture-design

## Problem

Blueprint currently rendered the developer-owned Feature hierarchy as a project structure diagram, but that tree could express only one untyped `Parent` relationship. It could not distinguish product capability containment from software composition, runtime dependency, deployment, plugin boundaries, or source ownership. The current canonical Feature identity also embedded its parent, so reparenting could rename the Feature, descendants, briefs, Specs, and approval references even when only the conceptual placement changed. Adding an architecture-oriented chat beside that tree would have produced advice without a durable, reviewable model and would have continued conflating product and software structure.

## Scope

- allow: `lib/config.js`
- allow: `lib/architecture.js`
- allow: `lib/features.js`
- allow: `lib/artifacts.js`
- allow: `lib/workflow.js`
- allow: `lib/scan.js`
- allow: `lib/web-api.js`
- allow: `lib/client.js`
- allow: `lib/index.js`
- allow: `lib/version.js`
- allow: `tests/**`
- allow: `.blueprint/architecture/**`
- allow: `.blueprint/features/**`
- allow: `.specs/**`
- allow: `docs/user/features/**`
- allow: `design-blueprint.json`
- allow: `DESIGN.md`
- allow: `README.md`
- allow: `README.zh.md`
- allow: `README.i18n.yaml`
- allow: `package.json`
- deny: `.blueprint/approvals/**`
- deny: `LICENSE`

## Decision

### Separate authority models

The previous "Project structure" presentation is renamed the Feature map, and its `Parent` edge is limited to product capability containment. A new configured architecture root stores developer-owned component records that use stable IDs and declare component kind, optional container, deployment unit, owned source paths, provided contracts, typed dependencies, supported Feature IDs, required documents, and lifecycle status. Containment must be acyclic; references, relation types, Feature mappings, deployment identifiers, and source paths are validated. Feature-to-component allocation is many-to-many and does not change either identity.

`DESIGN.md` remains the human-readable current architecture and component-ownership authority. The machine-readable component catalog owns graph identity and topology; lifecycle Specs own change rationale and alternatives. The scanner checks correspondence without attempting to infer architecture or Feature boundaries from the source tree.

### Stable identity and mutable placement

For newly created Features and architecture components, stable identity is decoupled from hierarchy. A confirmed globally unique ASCII key becomes the immutable Feature ID, while `Parent` remains a separately mutable reference. Reparenting a stable Feature updates the relationship without renaming its artifact paths or descendants. Existing hierarchical and other legacy IDs remain readable and are never renamed automatically; any optional normalization continues to require a developer-confirmed preview and invalidates affected approvals. Component IDs follow the same stable rule, while `Container` changes only graph placement.

### Architecture design workspace

Architecture design is the third primary Blueprint workspace beside Optimize Spec and Feature map. Its initial supported views are the logical component graph and a proposed-change overlay. The graph distinguishes containment from typed dependency edges, selects canonical component details, and exposes deployment, provided contracts, source ownership, supported Features, document state, and validation issues. Selecting a Feature highlights every allocated component; selecting a component highlights every supported Feature.

Architecture changes use an optimistic-concurrency preview/apply boundary. A preview lists every component and Feature mapping addition, update, or removal; every changed typed edge; path ownership conflicts; affected interfaces and deployment units; legacy identity effects; document changes; and approval invalidation. Apply recomputes the preview and writes only registered Feature-planning and architecture artifacts. Stale sources, invalid references, collisions, ambiguous path ownership, cycles, or an expanded diff fail closed.

An empty architecture catalog is an actionable state rather than a file-system instruction. The logical component graph presents an `Initialize architecture model` action. The Host derives one repository-level starter component from the current project name, package manifest, published file boundary, and existing authority documents, then returns the exact ordinary architecture preview. The browser shows the proposed component identity, kind, and owned paths for developer confirmation before applying the preview hash. Initialization is idempotent and fails closed once any component exists; it establishes a coarse first boundary and does not claim to infer the project's internal architecture. The developer can then use the architecture assistant and normal component changes to refine it.

### Independent architecture assistant

A dedicated architecture-review Session is created per project and protocol, separate from both the development conversation and the Spec reviewer. Every submission carries delimited current Feature records, component records, `DESIGN.md`, relevant manifests, public contracts, approved decision summaries, the selected Feature or component, and the developer's proposal. Repository material is treated as untrusted context rather than instructions.

The separate Session is a persistence and isolation mechanism, not a separate user-facing chat destination. `ArchitectureAssistant` embeds the same finalized messages, streaming partial Markdown, reasoning summaries, tool activity, errors, cancellation, scroll pinning, and conversation recovery used by the Spec reviewer inside the Architecture design workspace. Creating or reopening the backing Session must not replace the Blueprint view or require the developer to continue in another chat. Because the current DSH create contract has no hidden or parent-session option, Blueprint immediately archives the backing Session through the official Workspace API. Archived backing Sessions keep their durable log and remain addressable by the embedded assistant, but are excluded from normal Workspace and Ungrouped grouping surfaces. Reopening a legacy unarchived architecture Session also archives it before use.

The assistant must distinguish repository facts, inferences, assumptions, and developer decisions. Its response covers product placement, component allocation, typed relation changes, interface and data impact, deployment and plugin boundaries, source ownership, compatibility and migration impact, at least one viable alternative, and unresolved user-visible or business-boundary questions. It may recommend extending an existing component, adding an internal component, adding a peer service, or adding a plugin, but a page or dependency alone is not evidence for a plugin.

The assistant first produces a structured before/after proposal. Only an explicit developer action may apply the exact current proposal to the registered architecture records and synchronize the Feature-linked Product brief and proposed Spec pair. It cannot edit implementation files, move lifecycle documents to implemented, write approval records, or approve its own result. Any applied Spec change invalidates an earlier approval through the existing exact-hash workflow.

### Current architecture and public contract

Implementation updates `DESIGN.md` with the resulting component ownership and authority boundaries, updates the bilingual README contract and Product brief pair, exports the architecture parser where appropriate, and keeps package contents and DSH client integration accurate. The feature remains part of the existing Design Blueprint plugin. Creating a separately installable plugin is outside this proposal unless a later reviewed design establishes an independent host-extension lifecycle.

## Alternatives considered

**Add an architecture chat to the existing Feature diagram without a new model.** Rejected because recommendations would have no stable component IDs, typed edges, source ownership, or deterministic before/after diff.

**Treat the Feature hierarchy as the software architecture.** Rejected because product containment is a tree while component allocation and runtime dependencies are typed many-to-many graphs.

**Parse `DESIGN.md` as the complete machine authority.** Rejected because free-form architectural rationale is valuable to people but is not a safe source for optimistic concurrency, graph validation, or exact mutation targets.

**Continue encoding the parent in every new Feature ID.** Rejected because a mutable product relationship should not force artifact and descendant identity migration.

**Create a separate architecture plugin immediately.** Rejected because the capability extends Blueprint's existing governance, Web client, Host API, and approval workflow; no independent installation or lifecycle boundary has been established.

## Acceptance criteria

- AC-ARCH-10: Creating or reopening an architecture-assistant Session keeps the Blueprint Architecture design workspace selected, renders the conversation only through the embedded assistant, and archives the backing Session so it does not remain in normal Workspace or Ungrouped chat groups while its durable history remains recoverable.
- AC-ARCH-11: An empty logical component graph offers an initialization button that previews and, after explicit confirmation, creates one manifest-grounded repository component through the existing hash-bound architecture apply path; initialization refuses to overwrite or append to a non-empty catalog.
- AC-ARCH-12: The Architecture design workspace keeps the graph and selected Feature/component detail together in the left column, with the detail directly below the graph, while the right column is reserved for the architecture assistant from its top edge.

## Verification

- AC-ARCH-1: `tests/architecture.test.js`, `tests/config.test.js`
- AC-ARCH-2: `tests/features.test.js`, `tests/artifacts.test.js`, `tests/workflow.test.js`
- AC-ARCH-3: `tests/client.test.js`, `tests/client-runtime.test.js`
- AC-ARCH-4: `tests/client.test.js`, `tests/architecture.test.js`
- AC-ARCH-5: `tests/web-api.test.js`, `tests/architecture.test.js`
- AC-ARCH-6: `tests/architecture-reviewer.test.js`, `tests/client-runtime.test.js`; embedded history, streaming Markdown, activity projection, scroll pinning, and no navigation handoff
- AC-ARCH-7: `tests/architecture-reviewer.test.js`, `tests/web-api.test.js`, `tests/staged-policy.test.js`
- AC-ARCH-8: `tests/scan.test.js`, `tests/staged-policy.test.js`, command `node lib/cli.js scan --all --cwd .`
- AC-ARCH-9: `tests/plugin.test.js`, command `node lib/cli.js docs check --cwd .`, command `npm.cmd test`, command `npm.cmd run lint:js`
- AC-ARCH-10: `tests/architecture-reviewer.test.js`; newly created and recovered backing Sessions are archived through the injected DSH Workspace service before use
- AC-ARCH-11: `tests/architecture.test.js`, `tests/web-api.test.js`, `tests/client.test.js`; deterministic starter derivation, preview/apply concurrency, non-empty refusal, button and confirmation flow
- AC-ARCH-12: `tests/client.test.js`; architecture-column structure and detail-before-assistant placement

## Consequences

Developers can now distinguish product capability placement from software component, dependency, deployment, and source-ownership design through one stable, audit-able model. The Feature map and the Architecture design workspace share a stable component and Feature identity that survives `Parent` and `Container` changes, so reparenting discussions do not rename documents, descendants, or approvals. The architecture assistant grounds placement analysis in the current repository facts, keeps its complete conversation visibly embedded in the architecture workspace while retaining an archived independent backing Session outside normal Workspace and Ungrouped groupings, and cannot approve its own result; every architecture change still requires a developer action and the same exact-hash approval workflow that protects Spec lifecycles.

The proposed surface was large enough that staged internal milestones may follow, but any scope split or behavior reduction requires updating and reapproving this Spec. The architecture Session remains prompt-constrained within the active DSH Agent capability surface, so exact write endpoints, optimistic concurrency, approval invalidation, and scanner enforcement remain necessary. A dense component graph can become unreadable without filtering and bounded layout, and typed path ownership may reveal existing overlaps that require an adoption policy rather than automatic repair.
