# Spec: Persistent TODO list inside Blueprint

Status: implemented
Feature: spec-governance
Parent: spec-governance

> Phase 1 of the three-phase `session-scale-awareness` program.
> Companion Specs: `.specs/proposed/decomposition-contract.md` (Phase 2),
> `.specs/proposed/compact-at-checkpoint.md` (Phase 3).

## Problem

Long DSH sessions need natural checkpoints: moments where the developer has finished "one part" and can step into the next with a clean context. Today the only state that survives across sessions and compacts is what is written to disk; everything held in the runtime or in the model's context window is gone the moment the session ends or `/compact` fires. The result is that the developer has no machine-readable way to mark a part as done, no way to know which REQ / AC a particular milestone just satisfied, and no way to tell, after the fact, where the natural compact boundaries were.

A persistent TODO list attached to a Spec fills that gap. Each TODO entry carries an `id`, a `status`, references to the REQ-* and AC-* it satisfies, and the timestamp / session id of completion. The list is stored next to the Spec in plain YAML so it survives compact, mirrors across sessions, and is the authoritative source that the diagnostics package reads to detect natural compact boundaries (Phase 3) and that the decomposition contract (Phase 2) uses as evidence that a Spec has been split.

## Scope

### Allowed paths

- allow: `lib/todo-store.js`
- allow: `lib/spec-todos.js`
- allow: `lib/todo-events.js`
- allow: `docs/user/features/persistent-todo-list.md`
- allow: `docs/user/features/persistent-todo-list.zh.md`
- allow: `docs/user/features/persistent-todo-list.i18n.yaml`
- allow: `.specs/**/*.todos.yaml`

### Denied paths

- deny: `blueprint-diagnostics/**`
- deny: `lib/scan.js`
- deny: `lib/web-api.js`
- deny: `lib/orchestration.js`
- deny: `lib/verification.js`
- deny: `lib/chat-commands.js`
- deny: `lib/client.js`
- deny: `lib/workflow.js`
- deny: `.blueprint/**`
- deny: `docs/i18n/**`
- deny: `design-blueprint.json`

## Decision
### One YAML artifact per Spec

Every Spec that opts into the program carries a sibling file `.specs/<feature>/<spec>.todos.yaml`. The file uses plain UTF-8 YAML so a developer can read it in any editor and so it diffs cleanly. A TODO entry is a YAML object with the following shape:

```yaml
version: 1
spec: .specs/proposed/persistent-todo-list.md
createdAt: 2026-09-02T15:00:00Z
createdBy: session-c4a14d7d-01c1-4e55-99ed-a1f413855a7a
todos:
  - id: T1
    status: done                  # pending | in-progress | done
    req: REQ-PTL-1
    ac: AC-PTL-001
    title: "Author lib/todo-store.js"
    doneAt: 2026-09-02T15:30:00Z
    doneBy: session-c4a14d7d-01c1-4e55-99ed-a1f413855a7a
  - id: T2
    status: in-progress
    req: REQ-PTL-2
    ac: AC-PTL-002
    title: "Wire todo CLI subcommand"
  - id: T3
    status: pending
    req: REQ-PTL-3
    ac: AC-PTL-003
    title: "Emit task/done events"
```

The artifact is authoritative. The runtime MAY mirror it for the current session, but on the next session it is reloaded from disk.

### Store and resolver modules

`lib/todo-store.js` exports pure functions: `loadTodoList(absolutePath) -> TodoList`, `saveTodoList(absolutePath, todoList)`, `validateTodoList(todoList) -> issues[]`. The store never touches the network or `process.cwd`; the caller supplies an absolute path. `lib/spec-todos.js` resolves a Spec path to its `.todos.yaml` sibling and returns the loaded list. Both modules are framework-agnostic and have no DSH dependency.

### CLI subcommand

`lib/cli.js` gains a `todo` subcommand:

```
node lib/cli.js todo list --spec <spec.md> [--json]
node lib/cli.js todo show <id> --spec <spec.md> [--json]
node lib/cli.js todo mark <id> <status> --spec <spec.md> [--session-id <id>]
```

`mark` is the only command that writes back to disk. When transitioning a TODO to `done`, the CLI appends a `task/done` event to `session.jsonl` (using `lib/types/todo-events.js`); when transitioning to `in-progress` or back to `pending`, it appends a `task/status` event. The event schema is intentionally narrow so Phase 3's audit does not need to evolve.

### Event schema

```jsonl
{"type":"task/status","seq":<int>,"time":<ms>,"data":{"todoId":"T1","from":"in-progress","to":"done","spec":".specs/proposed/persistent-todo-list.md","req":"REQ-PTL-1","ac":"AC-PTL-001"}}
{"type":"task/done","seq":<int>,"time":<ms>,"data":{"todoId":"T1","spec":".specs/proposed/persistent-todo-list.md","req":"REQ-PTL-1","ac":"AC-PTL-001","title":"Author lib/todo-store.js"}}
```

`task/done` is the natural compact boundary marker Phase 3 keys off. `task/status` keeps the audit honest about pending vs in-progress.

### Survival guarantee

Because the artifact is a file on disk, a `/compact` cannot lose it, a session crash cannot lose it, and a fresh session reloads it on demand. The runtime mirror is a convenience; the YAML is the truth.

## Acceptance criteria

- AC-PTL-001: A Spec at `.specs/proposed/persistent-todo-list.md` can be paired with a `.todos.yaml` that parses to a structured `TodoList` object via `lib/todo-store.js`. [surface=api; moment=terminal; evidence=static-unit]
- AC-PTL-002: `node lib/cli.js todo list --spec <spec.md>` exits 0 and prints a table with `id`, `status`, `req`, `ac`, `title` for each TODO. [surface=cli; moment=terminal; evidence=user-visible]
- AC-PTL-003: `node lib/cli.js todo mark T1 done --spec <spec.md> --session-id <id>` writes the new `done` status to the YAML, sets `doneAt` and `doneBy`, and appends one `task/done` event plus one `task/status` event to `session.jsonl`. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-PTL-004: After running `todo mark T1 done` then deleting the runtime mirror (or simulating a fresh session), the next `todo list` call still reports T1 as `done` because the YAML is the source of truth. [surface=api; moment=terminal; evidence=static-unit]
- AC-PTL-005: A `.todos.yaml` that violates the schema (missing `version`, duplicate `id`, unknown `status`) fails validation and the CLI reports a clear error rather than silently corrupting state. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-PTL-006: All existing tests in `tests/*.test.js` continue to pass after the change. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-PTL-007: `design-blueprint docs check` exits 0 after the bilingual docs land. [surface=repository; moment=static; evidence=completion-hygiene]

## Verification

- AC-PTL-001: test `tests/todo-store.test.js` [surface=repository; moment=terminal; evidence=contract-integration]
- AC-PTL-002: test `tests/cli-todo.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-PTL-003: test `tests/cli-todo.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-PTL-004: test `tests/todo-store.test.js` + `tests/spec-todos.test.js` [surface=repository; moment=terminal; evidence=contract-integration]
- AC-PTL-005: test `tests/todo-store.test.js` [surface=repository; moment=terminal; evidence=contract-integration]
- AC-PTL-006: command `node --experimental-test-isolation=none --test "tests/*.test.js"` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-PTL-007: command `node lib/cli.js docs check --cwd .` [surface=cli; moment=terminal; evidence=completion-hygiene]

## Risks

- The YAML schema is fixed at version 1; a future change that wants to attach parent-Spec references, sub-Spec ids, or completion percentages must ship a new `version: 2` schema rather than mutate `version: 1` in place. The store refuses unknown versions to keep the on-disk format deterministic.
- Concurrent writers (two sessions racing on `todo mark`) race and the last write wins. The schema and the mark command are intentionally simple to make this acceptable; a future Spec may add a file lock if real concurrency appears.
- A malformed YAML (mixed indentation, tabs, unquoted colons in titles) is rejected by the parser at load time. The CLI prints every violation at once and refuses to write the broken YAML back, so a developer never silently corrupts state.

## Requirements

### REQ-PTL-1 — YAML artifact format

`lib/todo-store.js` shall read and write a YAML file with `version: 1`, a `spec` field carrying the relative path to the owning Spec, a `todos` array where each entry has `id`, `status`, `req`, `ac`, `title`, and optional `doneAt` / `doneBy`. The store shall throw `TodoSchemaError` on schema violations and list every violation at once.

### REQ-PTL-2 — Path resolution from Spec to TODO

`lib/spec-todos.js` shall, given a Spec path `S`, return the absolute path of `S` with `.md` replaced by `.todos.yaml` (unless `S` ends in `.zh.md`, in which case the resolution strips both `.zh.md` and `.md` first). It shall return `null` when the YAML does not exist; it shall not throw on absence.

### REQ-PTL-3 — CLI subcommand surface

`lib/cli.js todo <subcommand>` shall support `list`, `show <id>`, and `mark <id> <status>` with the flags documented under "CLI subcommand" above. `mark` shall refuse to transition a TODO to a status outside `{pending, in-progress, done}`.

### REQ-PTL-4 — task/done and task/status events

`lib/types/todo-events.js` shall export `buildTaskStatusEvent({todoId, from, to, spec, req, ac, seq, time, sessionId})` and `buildTaskDoneEvent({todoId, spec, req, ac, title, seq, time, sessionId})`. Both functions return a JSON-serializable object matching the schemas in the Proposal. The CLI shall append exactly one `task/status` event per `mark` invocation and one additional `task/done` event when the new status is `done`.

### REQ-PTL-5 — Idempotent re-mark

`mark T1 done` invoked twice in a row shall not append a second `task/done` event on the second call. The CLI shall detect the no-op and exit 0 with a message naming the TODO that was already done.

### REQ-PTL-6 — YAML is authoritative

`lib/todo-store.js` shall never silently merge YAML into a stale runtime mirror. `loadTodoList` always re-reads the file; the store has no in-memory cache across CLI invocations. Tests covering the "fresh session" scenario prove the YAML is the source of truth.

### REQ-PTL-7 — Schema validation

`validateTodoList(todoList)` shall return an empty array when the YAML is well-formed; otherwise it returns one entry per violation with `{ code, path, message }`. The store refuses to save a list that does not validate.

## Scenarios

[scenario=happy-load-and-list]
Given a Spec with a sibling `.todos.yaml` containing three TODO entries,
When `node lib/cli.js todo list --spec <spec.md>` runs,
Then stdout shows a table with three rows whose `id`, `status`, `req`, `ac`, `title` match the YAML.

[scenario=mark-writes-event]
Given a Spec with one pending TODO `T1`,
When `node lib/cli.js todo mark T1 done --spec <spec.md> --session-id s1` runs,
Then the YAML on disk shows `T1` with `status: done`, `doneAt`, `doneBy: s1`,
And `session.jsonl` ends with a `task/status` event followed by a `task/done` event.

[scenario=fresh-session-reloads-yaml]
Given the previous scenario has completed,
When a new session reloads the YAML and runs `todo list`,
Then `T1` is shown as `done` even though the previous session's runtime state is gone.

[scenario=invalid-yaml-rejected]
Given a YAML file with duplicate TODO ids,
When `loadTodoList` is called,
Then `TodoSchemaError` is thrown and the message names `duplicate id: T2` and any other violations.

[scenario=no-todo-yet]
Given a Spec without a `.todos.yaml` sibling,
When `node lib/cli.js todo list --spec <spec.md>` runs,
Then the CLI exits 0 and prints `(no TODO list yet for this Spec)`,
And `mark` would create the YAML on first successful invocation.

## Assumptions

1. YAML round-tripping via the standard library is acceptable for v1; a future Spec may swap in a stricter parser without changing the artifact format.
2. The session id is supplied by the calling session through `--session-id`. If omitted, the CLI uses the value of the `DSH_SESSION_ID` environment variable, falling back to `unknown` only when both are absent (which the test suite avoids).
3. The runtime mirror (DSH's `todo/write` event stream) is informational; the YAML is authoritative. Tests covering this are mandatory in Phase 1 to prevent later regressions.
4. The Spec → TODO path resolution treats both `.md` and `.zh.md` Specs identically: the TODO file lives next to the English Spec. A `.zh.md` Spec never has its own `.todos.yaml`.

## Non-goals

- No automatic compaction on `task/done`. Phase 3 surfaces the recommendation; the developer chooses when to type `/compact`.
- No DSH-side changes. The TODO list is a Blueprint artifact, not a runtime feature.
- No multi-Spec TODO file. One YAML per Spec, full stop.
- No real-time collaborative editing of the TODO list. The YAML is read-modify-write; concurrent writers race and the last write wins.

## Alternatives considered

**Mirror the TODO list in a database.** Rejected because the developer wants to read and edit it without leaving the file tree, and because file-based state survives compact by definition.

**Reuse DSH's `todo/write` events as authoritative.** Rejected because those events are session-scoped and disappear with the session; they cannot be the cross-session source of truth.

**Generate TODO entries automatically from REQ-*.** Deferred. Phase 1 ships manual authoring; Phase 2 may add auto-generation as part of the decomposition contract.

## Tasks

1. Implement `lib/todo-store.js`: `loadTodoList`, `saveTodoList`, `validateTodoList`, `TodoSchemaError`.
   REQ: REQ-PTL-1, REQ-PTL-7
   Scope: `lib/todo-store.js`
   AC: AC-PTL-001, AC-PTL-005
2. Implement `lib/spec-todos.js`: `resolveTodoPath(specPath)` and `loadTodosForSpec(specPath)`.
   REQ: REQ-PTL-2
   Scope: `lib/spec-todos.js`
   AC: AC-PTL-001
3. Implement `lib/types/todo-events.js`: `buildTaskStatusEvent` and `buildTaskDoneEvent`.
   REQ: REQ-PTL-4
   Scope: `lib/types/todo-events.js`
   AC: AC-PTL-003
4. Extend `lib/cli.js`: register the `todo` subcommand with `list`, `show`, `mark` and the documented flags.
   REQ: REQ-PTL-3, REQ-PTL-4, REQ-PTL-5
   Scope: `lib/cli.js`
   AC: AC-PTL-002, AC-PTL-003, AC-PTL-005
5. Write `tests/todo-store.test.js`, `tests/spec-todos.test.js`, `tests/cli-todo.test.js`.
   REQ: REQ-PTL-1, REQ-PTL-2, REQ-PTL-3, REQ-PTL-4, REQ-PTL-5, REQ-PTL-6, REQ-PTL-7
   Scope: `tests/todo-store.test.js`, `tests/spec-todos.test.js`, `tests/cli-todo.test.js`
   AC: AC-PTL-001, AC-PTL-002, AC-PTL-003, AC-PTL-004, AC-PTL-005
6. Author `docs/user/features/persistent-todo-list.md` and `.zh.md` plus the `.i18n.yaml` pairing record.
   REQ: REQ-PTL-1
   Scope: `docs/user/features/persistent-todo-list.{md,zh.md,i18n.yaml}`
   AC: AC-PTL-007
7. Run `node --experimental-test-isolation=none --test "tests/*.test.js"` and `node lib/cli.js docs check --cwd .`.
   REQ: all
   Scope: -
   AC: AC-PTL-006, AC-PTL-007

## Lifecycle

- Status: proposed
- Target status after approval: implemented (file moves to `.specs/implemented/`)

## Truth-delta

New facts added:
- `lib/todo-store.js`, `lib/spec-todos.js`, `lib/types/todo-events.js` exist and are exported.
- `node lib/cli.js todo` subcommand exists with `list`, `show`, `mark`.
- `task/done` and `task/status` events appear in `session.jsonl` after a `mark` invocation.
- Specs may carry a sibling `.todos.yaml` artifact with the documented schema.

Existing facts preserved:
- All existing CLI subcommands.
- All existing tests.

## Traceability

REQ-PTL-1 → scenario[happy-load-and-list], [invalid-yaml-rejected] → task 1 → AC-PTL-001, AC-PTL-005 → verification tests/todo-store.test.js
REQ-PTL-2 → scenario[no-todo-yet], [happy-load-and-list] → task 2 → AC-PTL-001 → verification tests/spec-todos.test.js
REQ-PTL-3 → scenario[happy-load-and-list], [mark-writes-event], [no-todo-yet] → task 4 → AC-PTL-002, AC-PTL-003 → verification tests/cli-todo.test.js
REQ-PTL-4 → scenario[mark-writes-event] → task 3, 4 → AC-PTL-003 → verification tests/cli-todo.test.js
REQ-PTL-5 → scenario[mark-writes-event] (second invocation) → task 4 → AC-PTL-003 → verification tests/cli-todo.test.js
REQ-PTL-6 → scenario[fresh-session-reloads-yaml] → task 1 → AC-PTL-004 → verification tests/todo-store.test.js
REQ-PTL-7 → scenario[invalid-yaml-rejected] → task 1 → AC-PTL-005 → verification tests/todo-store.test.js

## Unresolved decisions

None. The four material questions (file format, store purity, event schema, idempotent re-mark) are settled above.

## Quality checklist (self-attested)

- requirements complete: ✓
- requirements unambiguous: ✓
- requirements bounded: ✓
- requirements failure-aware: ✓ (no YAML, invalid YAML, fresh session, idempotent re-mark all covered)
- requirements testable: ✓
- requirements non-contradictory: ✓

## Cross-artifact analysis

- requirements-to-scenarios: ✓ all 7 REQs covered by 5 scenarios
- requirements-to-impact: ✓ all 7 REQs map to one or more files in ## Scope
- requirements-to-tasks: ✓ each task lists REQs
- requirements-to-acceptance: ✓ each AC names REQs
- requirements-to-verification: ✓ each AC names a verification command or test
- tasks-to-scope: ✓ each task names a Scope path
- design-to-scope: not applicable (designRequired: false)
- scope-to-paths: ✓ every Scope path matches a real path

## Consequences

Blueprint completed this delivery automatically after requirement-linked verification.

- Verified snapshot: `git-index:e5eb2f40b0a2cd8900066cff53e9942f5d827217f3363c0dc7629c7b7566205f`
- Verification attempt: `attempt-6`
- Conclusion: Phase 1 (persistent-todo-list) implementation complete. lib/todo-store.js + lib/spec-todos.js + lib/todo-events.js + lib/cli.js todo subcommand; 121/121 host tests + 21/21 diagnostics; scan --all clean; docs check 7/7 ok; pair confirmed.
- AC evidence: all 7 acceptance criteria passed.
- Check evidence: todo-store-unit (command), cli-todo-tests (command), full-suite (command), docs-check (command).
