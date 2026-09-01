# Spec: Session project binding

Status: rejected — DSH workspace path must be the ordinary project selector, while manual binding is only an escape hatch.

## Problem

DSH Web can host many project workspaces at the same time. A Blueprint command, tool dispatch, or dashboard request belongs to the workspace of the current DSH Session, not necessarily to the directory where `dsh web` was launched. A design that asks the developer to run `/blueprint-use <project>` as the ordinary project-selection mechanism duplicates DSH workspace state and makes Blueprint feel detached from the active Web workspace.

## Scope

- allow: `.specs/rejected/session-project-binding.md`

## Proposal

The rejected proposal stored a persistent fallback from a non-project Session `cwd`, such as `C:\Users\Windows`, to a Blueprint project root. The fallback would survive DSH restarts and would be used when normal upward discovery from `cwd` could not find `design-blueprint.json`.

That proposal is insufficient because it still treats the DSH launch directory as the primary identity and requires manual switching when multiple DSH workspaces share the same non-project startup cwd. It solves restart persistence but not workspace correctness.

## Decision

Reject persistent manual binding as the ordinary Blueprint project-selection mechanism. Blueprint must instead resolve the effective project from the current interaction's DSH workspace. Manual `/blueprint-use <project-path>` may remain only for legacy, projectless, or intentionally cross-project Sessions where DSH exposes no usable workspace path.

## Replacement

The replacement design is part of the proposed DSH-native simplification spec: Blueprint resolves the effective project from the current DSH `sessionId` by consulting DSH workspace state first, then falling back to Session `cwd`, then plugin/process `cwd`, and only then to a manual fallback binding.

## Alternatives considered

**Keep persistent binding as the normal flow.** Rejected because it asks users to maintain plugin-local project state even though DSH already has workspace identity.

**Require developers to start `dsh web` from each repository.** Rejected because DSH Web is meant to keep many workspaces available from one browser session.

**Mutate DSH workspace or Session records from Blueprint.** Rejected because Blueprint should consume DSH workspace identity, not rewrite DSH's ownership model.

## Acceptance criteria

- AC-REJECT-001: The ordinary Blueprint path does not require `/blueprint-use` when the current DSH Session belongs to a workspace with a path.
- AC-REJECT-002: A saved fallback binding never outranks the active DSH workspace path or an explicit Blueprint project at the Session `cwd`.
- AC-REJECT-003: The UI labels manual binding as an escape hatch, not as normal project selection.

## Verification

- AC-REJECT-001: Covered by the replacement spec's DSH workspace resolution tests.
- AC-REJECT-002: Covered by fallback-priority tests in the replacement implementation.
- AC-REJECT-003: Covered by Client text tests after replacement implementation.
