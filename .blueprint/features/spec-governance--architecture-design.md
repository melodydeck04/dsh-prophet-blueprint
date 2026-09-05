# Feature: Architecture design workspace

Id: spec-governance--architecture-design
Parent: spec-governance
Status: active

## Summary

Turns one requirement in the normal DSH Chat into a repository-grounded, decomposed and testable Spec, implements and verifies the approved delta with the current Agent by default, and exposes the resulting system through a searchable Feature hierarchy and safe document viewer.

## Scope

- `lib/config.js`
- `lib/architecture.js`
- `lib/assistant-actions.js`
- `lib/features.js`
- `lib/artifacts.js`
- `lib/chat-commands.js`
- `lib/orchestration.js`
- `lib/project-binding.js`
- `lib/specs.js`
- `lib/workflow.js`
- `lib/verification.js`
- `lib/snapshot.js`
- `lib/scan.js`
- `lib/docs.js`
- `lib/reconciliation.js`
- `lib/web-api.js`
- `lib/client.js`
- `lib/index.js`
- `lib/version.js`
- `tests/**`
- `.blueprint/architecture/**`
- `.blueprint/features/**`
- `.specs/**`
- `docs/user/features/**`
- `design-blueprint.json`
- `DESIGN.md`
- `README.md`
- `README.zh.md`
- `README.i18n.yaml`
- `package.json`

## Documents

- required: `DESIGN.md`
- required: `README.md`
- required: `docs/user/features/spec-governance--architecture-design.md`
- required: `docs/user/features/spec-governance--architecture-design.zh.md`
- required: `docs/user/features/spec-governance--architecture-design.i18n.yaml`
- required: `.specs/implemented/brownfield-baseline-reconciliation-and-assistant-handoff.md`
- required: `.specs/implemented/brownfield-baseline-reconciliation-and-assistant-handoff.zh.md`
- required: `.specs/implemented/automatic-verification-and-completion-loop.md`
- required: `.specs/implemented/automatic-verification-and-completion-loop.zh.md`
- recommended: `README.zh.md`

## Acceptance

- DSH's normal Chat is the only conversational interface; `/blueprint` and ordinary tool dispatch create the same typed refinement packet and never require role selection.
- Owning Feature resolution prefers an exact `@feature:<id>`, fails closed for multiple Features, and returns at most three candidates when repository evidence is ambiguous.
- Refinement covers the declared requirement dimensions, uses stable `REQ-*` and Given/When/Then formats, asks at most three material questions per round, and records other uncertainty as assumptions.
- Requirements checklist and cross-artifact analysis keep scenarios, tasks, verification, design, Scope, and paths mutually consistent before implementation.
- One schema-validated Change Package carries identity, intent, impact/design, tasks, Scope, verification targets, lifecycle, truth delta, and traceability across explicit internal boundaries.
- The current DSH Agent is the normal implementer and verifier; technical design and independent verification are proportional options for structural or high-risk work.
- Exact developer approval, machine-readable Scope, staged snapshot identity, acceptance-linked evidence, documentation checks, and Host scan remain completion gates.
- Every AC declares or receives a deterministic delivery surface, observation moment, and minimum evidence level; progressive Web behavior requires real-browser intermediate and terminal observations.
- Completion hygiene checks newly staged secret-like and undeclared temporary/debug material with explicit path exceptions, while preserving unrelated existing work.
- User-visible workflow is limited to refining, ready, implementing, verifying, blocked, and completed while detailed durable records remain available for diagnosis.
- Verifying has no known failed gate; blocked exposes a stable reason, owning layer, evidence, and one recommended next action, and retry preserves prior attempts.
- Blueprint Web contains no assistant composer or Session controls and renders a searchable Feature tree with current bilingual behavior, hierarchy, dependencies, paths, contracts, tests, active Spec, and registered documents.
- Dashboard selection is view-only, and document reads are restricted to paths already registered to the selected Feature.
- Feature containment stays distinct from technical Component ownership and dependency edges; source directories never silently create product hierarchy.
- The plugin targets exact DSH `0.1.1-rc.2` / Cordis `4.0.1` public Host and Client contracts, remains a bundle, and uses no private composer API.
- Existing scan, approval, bilingual artifact, architecture, reconciliation, staged snapshot, CLI, legacy lifecycle, and recovery contracts remain compatible.
## Notes

The architecture workspace extends the existing Blueprint plugin. A separate plugin is considered only when a component has an independently installable host-extension boundary; the initial feature does not create one.

## Components

- `design-blueprint`
