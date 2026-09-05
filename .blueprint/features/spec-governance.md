# Feature: Spec-driven development governance

Id: spec-governance
Parent: none
Status: active

## Summary

Keeps project instructions, architecture, public contracts, lifecycle specifications, and staged implementation changes in explicit correspondence. The Feature owns the abstract governance model plus the spec-adjacent utility modules (decomposition detector, persistent TODO list, TODO event bus, refactor-time auto-decompose gate, compact-hint trigger, and the approval-preview render).

## Scope

- `lib/config.js`
- `lib/specs.js`
- `lib/policy.js`
- `lib/scan.js`
- `lib/spec-decomposition.js`
- `lib/spec-todos.js`
- `lib/todo-events.js`
- `lib/todo-store.js`
- `lib/assistant-actions.js`
- `lib/cli.js`
- `lib/todo-compact-trigger.js`
- `tests/**`

## Documents

- required: `AGENTS.md`
- required: `DESIGN.md`
- required: `README.md`
- required: `.specs/implemented/2026-08-20-spec-driven-blueprint.md`
- required: `.specs/implemented/blueprint-approve-preview.md`
- required: `.specs/implemented/blueprint-approve-preview.zh.md`
- required: `.specs/implemented/decomposition-contract.md`
- required: `.specs/implemented/decomposition-contract.zh.md`
- required: `.specs/implemented/persistent-todo-list.md`
- required: `.specs/implemented/persistent-todo-list.zh.md`
- required: `.specs/implemented/spec-auto-decompose-at-refine.md`
- required: `.specs/implemented/spec-auto-decompose-at-refine.zh.md`
- required: `.specs/implemented/todo-live-compact-hint.md`
- required: `.specs/implemented/todo-live-compact-hint.zh.md`
- required: `docs/user/features/blueprint-approve-preview.md`
- required: `docs/user/features/blueprint-approve-preview.zh.md`
- required: `docs/user/features/blueprint-approve-preview.i18n.yaml`
- required: `docs/user/features/spec-decomposition-contract.md`
- required: `docs/user/features/spec-decomposition-contract.zh.md`
- required: `docs/user/features/spec-decomposition-contract.i18n.yaml`
- required: `docs/user/features/persistent-todo-list.md`
- required: `docs/user/features/persistent-todo-list.zh.md`
- required: `docs/user/features/persistent-todo-list.i18n.yaml`
- required: `docs/user/features/spec-auto-decompose-at-refine.md`
- required: `docs/user/features/spec-auto-decompose-at-refine.zh.md`
- required: `docs/user/features/spec-auto-decompose-at-refine.i18n.yaml`
- required: `docs/user/features/todo-live-compact-hint.md`
- required: `docs/user/features/todo-live-compact-hint.zh.md`
- required: `docs/user/features/todo-live-compact-hint.i18n.yaml`
- required: `lib/spec-decomposition.js`
- required: `lib/spec-todos.js`
- required: `lib/todo-events.js`
- required: `lib/todo-store.js`
- required: `tests/spec-decomposition.test.js`
- required: `tests/spec-todos.test.js`
- required: `tests/todo-store.test.js`
- required: `tests/cli-todo.test.js`
- required: `tests/todo-compact-hint.test.js`
- required: `tests/todo-compact-trigger.test.js`
- required: `tests/cli-spec-show.test.js`
- required: `tests/cli-approve-preview.test.js`
- required: `tests/assistant-actions-decomposition.test.js`
- required: `lib/todo-compact-trigger.js`
- required: `docs/user/features/auto-compact-on-unrelated-task-done.md`
- required: `docs/user/features/auto-compact-on-unrelated-task-done.zh.md`
- required: `docs/user/features/auto-compact-on-unrelated-task-done.i18n.yaml`

## Acceptance

- A non-trivial staged change has exactly one eligible specification owner.
- Authority documents and lifecycle structure are checked from one snapshot.
- A proposed Spec whose REQ count, scope path count, or line count crosses the decomposition thresholds is rejected at refine time and at scan time before it can move to `.specs/implemented/`.
- A persistent TODO list is attached to every Spec that crosses the decomposition threshold, and the list is the authoritative source for the diagnostics package's compact-boundary audit.

## Notes

Semantic product approval remains a human responsibility; deterministic checks enforce structure and declared ownership.
