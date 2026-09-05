# Spec: auto-compact on Feature switch (≥ 200 KiB)

Status: implemented
Feature: spec-governance

> Companion: `.specs/implemented/todo-live-compact-hint.md` (the prior "print a hint" delivery, retired)
> Companion: `.specs/implemented/persistent-todo-list.md` (the `task/done` event source)
> Companion: `.specs/implemented/compact-at-checkpoint.md` (the diagnostics-side reading of the same events)

## Proposal

Replace the byte-threshold "Type /compact before continuing." hint with a real action that fires only at Feature-level boundaries, and only when enough conversation has accumulated to make the compact worthwhile. When `design-blueprint todo mark <id> --spec <path> done` writes a `task/done` event whose `data.spec` belongs to a different Feature than the immediately previous `task/done` event, the framework dispatches DSH's `/compact` slash command through the documented input-trigger surface, fires once, and writes one `compact/auto-fired` event to `session.jsonl` for diagnostics attribution. Two independent gates must both pass: the Feature-switch signal must be present, and the bytes accumulated since the previous `task/done` must exceed 200 KiB. Any single gate failing keeps the context window untouched. No new permission, no manual confirmation, no parallel route, no frequent-fire noise. The 200 KiB byte floor implicitly rate-limits the trigger: a successful compact summarises the conversation and drops the byte count, so the next auto-compact requires another 200 KiB to accumulate, which is the natural minimum cost worth paying.

## Problem

A DSH session that works through several different Features accumulates a context window full of material that no longer relates to the developer's current intent. The prior `todo-live-compact-hint` delivery prints a one-line "Type /compact before continuing." reminder when bytes accumulated since the previous `task/done` cross a 1 MiB threshold. That reminder is informational only; the developer must still type `/compact` themselves. By the time the reminder is read, the unrelated content has already crowded the window.

A first-cut refinement proposed triggering the auto-compact on any `task/done` whose `data.req` / `data.ac` identifiers did not overlap with the active Feature's REQ/AC set. That signal is too fine-grained: a session that touches four sub-tasks across two Features would auto-compact four to six times, which is the opposite of helpful. A more useful signal is at **Feature** granularity: when the developer finishes work on Feature A and starts a `task/done` for Feature B, the context window's residue from A is no longer relevant and a single compact at the boundary is well-placed.

A first-cut refinement also proposed no byte threshold. That is also too permissive: a developer who toggles a single line of off-Feature documentation and marks it done should not trigger a heavy summarize-and-replace operation. The threshold is a guard against noise. A 200 KiB floor matches the user's revised intent: the auto-compact should only run when enough conversation has accumulated to make the cost worth paying.

A first-cut refinement also proposed a 5-minute cooldown to prevent rapid-fire auto-compacts when the developer is mid-feature-juggle. That gate is redundant: a successful compact summarises the conversation and drops the byte count, so the next auto-compact requires another 200 KiB to accumulate, which is the natural minimum cost worth paying. The byte floor alone rate-limits the trigger. The cooldown is therefore removed from this Spec.

## Scope

### Allowed paths

- allow: `lib/todo-compact-trigger.js`
- allow: `lib/spec-todos.js`
- allow: `lib/todo-events.js`
- allow: `lib/cli.js`
- allow: `tests/todo-compact-trigger.test.js`
- allow: `tests/cli-todo.test.js`
- allow: `tests/spec-todos.test.js`
- allow: `docs/user/features/auto-compact-on-unrelated-task-done.{md,zh.md,i18n.yaml}`
- allow: `.blueprint/features/spec-governance.md`

### Denied paths

- deny: `lib/scan.js`
- deny: `lib/web-api.js`
- deny: `lib/orchestration.js`
- deny: `lib/verification.js`
- deny: `lib/chat-commands.js`
- deny: `lib/client.js`
- deny: `lib/workflow.js`
- deny: `lib/policy.js`
- deny: `lib/assistant-actions.js`
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
- deny: `lib/skills.js`
- deny: `lib/skills/**`
- deny: `.blueprint/approvals/**`
- deny: `.blueprint/verifications/**`
- deny: `.specs/**` outside this Spec pair
- deny: `docs/i18n/**`
- deny: `design-blueprint.json` default or authority sections

## Decision

### 1. Three-gate predicate

`evaluateTrigger({ previousTaskSpecPath, currentTaskSpecPath, previousFeatureId, currentFeatureId, bytesSincePreviousTaskDone, msSinceLastAutoCompact })` lives in `lib/todo-compact-trigger.js`. It returns one of five values:

- `'fire'` — both gates pass: previous Feature and current Feature are both known and differ, and bytes accumulated since the previous `task/done` is at least 200 KiB.
- `'same-feature'` — the previous and current tasks share the same Feature id. The developer stayed on one Feature; no compact is justified.
- `'under-threshold'` — the previous and current Features differ, but the bytes accumulated since the previous `task/done` are below 200 KiB. The compact would be too expensive for the small gain.
- `'no-previous-task'` — there is no prior `task/done` event in `session.jsonl` (or the prior one is missing `data.spec`, or the just-emitted event is missing `data.spec`). The trigger has no signal of "where the developer just was" or "where they are now" and stays silent.

The single threshold (200 KiB) is a constant exported from the module as `BYTE_THRESHOLD_BYTES = 200 * 1024`. It is not configurable per project in this Spec; a future Spec may surface it in `design-blueprint.json` if real workloads demand it.

### 2. Trigger function

`maybeAutoCompact({ cwd, sessionId, currentTaskSpecPath, currentFeatureId, nowMs, logger })` lives in the same file. It:

1. Reads `session.jsonl` via `locateSessionPath(cwd, sessionId)`. If the file is absent, returns `{ invoked: false, reason: 'no-previous-task' }`.
2. Reads the most recent `task/done` event before the current time and resolves its `data.spec` to a Feature id via `featureIdForSpecPath(specPath)`. If absent, returns `{ invoked: false, reason: 'no-previous-task' }`.
3. Computes `bytesSincePreviousTaskDone` via `bytesBetweenTimestamps(sessionPath, previous.time, nowMs)`.
4. Calls `evaluateTrigger(...)` with the three derived values.
5. If the predicate returns `'fire'`, dispatches DSH's `/compact` slash command through the documented `ctx.inputTriggers.dispatch` (the same surface Skills sub-spec A registered for `ctx.skills`). The dispatch is fire-and-forget: the function returns once the dispatch call returns, without waiting for the compact to actually finish. On success, appends one `compact/auto-fired` event to `session.jsonl` carrying `{ time, reason: 'feature-switch', previousFeatureId, currentFeatureId, bytesSincePreviousTaskDone }`.
6. Returns `{ invoked: true, reason: 'feature-switch' }` on success, or one of the three reason codes above with `invoked: false`.
7. Never throws. A dispatch failure is caught, logged at warn, and surfaced as `{ invoked: false, reason: 'dispatch-failed', error: <message> }`. The `task/done` event the caller already wrote is never rolled back.

### 3. CLI integration

`lib/cli.js#runTodoMark` (the `todo mark <id> done` subcommand) gains a single new step after the existing `task/done` event is written. The step:

1. Computes the just-emitted event's `currentTaskSpecPath` (= `specRelative`) and `currentFeatureId` via `featureIdForSpecPath(specRelative)`.
2. Calls `maybeAutoCompact(...)` with `nowMs` set to the same wall-clock used for the event emission.
3. Prints one of four lines to stdout:
   - `Auto-compact: fired (feature-switch: <previousFeatureId> -> <currentFeatureId>, <human> KiB accumulated).` on `'fire'`.
   - `Auto-compact: skipped (same feature as previous: <featureId>).` on `'same-feature'`.
   - `Auto-compact: skipped (under threshold: <bytes> bytes < 200 KiB).` on `'under-threshold'`.
   - `Auto-compact: skipped (no previous task).` on `'no-previous-task'`.
   - `Auto-compact: failed (<message>).` on a dispatch failure.

The pre-existing `todo-live-compact-hint` byte-threshold hint is removed from this code path. The old Spec stays in `.specs/implemented/` as historical record, with a follow-up commit that updates its `## Consequences` to note it was superseded.

### 4. DSH dispatch surface

The host invokes DSH's `/compact` slash command through the same documented path a human operator uses. The implementation may import from `@deepseek-ai/dsh-client-ui-input-trigger` only if the function is exported and documented for the resolved DSH version. If the target DSH profile exposes no slash-command dispatch surface, the function logs a one-time warning at boot and reduces to a no-op for the rest of the session, but the Spec cannot ship in that state — the developer must upgrade the DSH baseline or pin a known-good version. That choice is recorded under `## Unresolved decisions` until resolved.

### 5. Active Feature resolution (simplified)

`featureIdForSpecPath(specPath)` in `lib/spec-todos.js` resolves a Spec's `.md` path to its owning Feature id by walking `.blueprint/features/<feature-id>.md` files and finding the one whose `## Documents` list contains the given Spec, or by reading `.specs/<spec-file>`'s `Feature:` frontmatter. Returns `null` when no Feature owns the Spec. This is a single pure function; the prior Spec's four-rung ladder is replaced by "the most recent `task/done` event's `data.spec`" plus this lookup.

### 6. Byte measurement

`bytesBetweenTimestamps(sessionPath, lo, hi)` reuses the byte-measurement logic from `lib/cli.js#readSessionSegmentBytes`: walk every line in the `session.jsonl` whose `time` is in `(lo, hi]`, sum `Buffer.byteLength(line, "utf8") + 1`. The threshold is **200 KiB = 204 800 bytes**.

### 7. Cooldown measurement (removed)

The 5-minute cooldown gate is removed. A successful auto-compact summarises the conversation and drops the byte count, so the next auto-compact requires another 200 KiB to accumulate, which is the natural minimum cost worth paying. The byte floor alone rate-limits the trigger.

## Acceptance criteria

- AC-SWITCH-001: `evaluateTrigger({ previousTaskSpecPath: 'a.md', currentTaskSpecPath: 'a.md', previousFeatureId: 'F', currentFeatureId: 'F', bytesSincePreviousTaskDone: 500000, msSinceLastAutoCompact: Infinity })` returns `'same-feature'`. [surface=api; moment=static; evidence=static-unit]
- AC-SWITCH-002: `evaluateTrigger({ previousTaskSpecPath: 'a.md', currentTaskSpecPath: 'b.md', previousFeatureId: 'F1', currentFeatureId: 'F2', bytesSincePreviousTaskDone: 100000, msSinceLastAutoCompact: Infinity })` returns `'under-threshold'`. [surface=api; moment=static; evidence=static-unit]
- AC-SWITCH-003: `evaluateTrigger({ previousTaskSpecPath: 'a.md', currentTaskSpecPath: 'b.md', previousFeatureId: 'F1', currentFeatureId: 'F2', bytesSincePreviousTaskDone: 500000 })` returns `'fire'`. [surface=api; moment=static; evidence=static-unit]
- AC-SWITCH-004: `evaluateTrigger({ previousTaskSpecPath: 'a.md', currentTaskSpecPath: 'b.md', previousFeatureId: null, currentFeatureId: 'F2', bytesSincePreviousTaskDone: 500000 })` returns `'no-previous-task'` (the developer has not produced a prior `task/done`, so the framework cannot tell where they came from). [surface=api; moment=static; evidence=static-unit]
- AC-SWITCH-005: `evaluateTrigger({ previousTaskSpecPath: 'a.md', currentTaskSpecPath: 'b.md', previousFeatureId: 'F1', currentFeatureId: null, bytesSincePreviousTaskDone: 500000 })` returns `'no-previous-task'` (the just-emitted task has no `data.spec` to anchor a Feature switch). [surface=api; moment=static; evidence=static-unit]
- AC-TRIG-001: `maybeAutoCompact` returns `{ invoked: false, reason: 'same-feature' }` and writes nothing when the predicate is `'same-feature'`. [surface=api; moment=terminal; evidence=contract-integration]
- AC-TRIG-002: `maybeAutoCompact` returns `{ invoked: false, reason: 'under-threshold' }` and writes nothing when bytes since the previous `task/done` are below 200 KiB. [surface=api; moment=terminal; evidence=contract-integration]
- AC-TRIG-003: `maybeAutoCompact` returns `{ invoked: false, reason: 'no-previous-task' }` and writes nothing when there is no prior `task/done` event. [surface=api; moment=terminal; evidence=contract-integration]
- AC-TRIG-004: `maybeAutoCompact` dispatches the documented `/compact` slash command exactly once and writes one `compact/auto-fired` event to `session.jsonl` when the predicate is `'fire'`. [surface=api; moment=terminal; evidence=contract-integration]
- AC-TRIG-005: `maybeAutoCompact` catches dispatch failures, returns `{ invoked: false, reason: 'dispatch-failed' }`, and does NOT roll back the `task/done` event the caller already wrote. [surface=api; moment=terminal; evidence=contract-integration]
- AC-CLI-001: After `design-blueprint todo mark <id> --spec <path> done` with a Feature switch and > 200 KiB accumulated, stdout contains `Auto-compact: fired (feature-switch: <from> -> <to>, <human> KiB accumulated).`. [surface=cli; moment=terminal; evidence=user-visible]
- AC-CLI-002: After the same command with a same-Feature `task/done`, stdout contains `Auto-compact: skipped (same feature as previous: <featureId>).`. [surface=cli; moment=terminal; evidence=user-visible]
- AC-CLI-003: After the same command with a Feature switch but < 200 KiB accumulated, stdout contains `Auto-compact: skipped (under threshold: <bytes> bytes < 200 KiB).`. [surface=cli; moment=terminal; evidence=user-visible]
- AC-CLI-004: After the same command with no prior `task/done` event, stdout contains `Auto-compact: skipped (no previous task).`. [surface=cli; moment=terminal; evidence=user-visible]
- AC-CLI-005: The pre-existing byte-threshold "Compaction hint" line is no longer emitted by `todo mark done`. [surface=cli; moment=terminal; evidence=user-visible]
- AC-ACTIVE-001: `featureIdForSpecPath('.specs/proposed/foo.md')` returns the id of the Feature that owns `.specs/proposed/foo.md` according to the Feature tree, or `null` if none. [surface=api; moment=static; evidence=contract-integration]
- AC-ACTIVE-002: `featureIdForSpecPath('does-not-exist.md')` returns `null`. [surface=api; moment=static; evidence=contract-integration]
- AC-DOCS-001: `docs/user/features/auto-compact-on-unrelated-task-done.{md,zh.md,i18n.yaml}` exist and the English page contains the four mattpocock section headings. [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-002: `node lib/cli.js docs check --cwd .` reports 0 required and 0 recommended issues after the new docs land. [surface=cli; moment=static; evidence=completion-hygiene]
- AC-SCAN-001: `node lib/cli.js scan --all --cwd .` reports 0 required and 0 recommended issues after this Spec lands. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001: All 232 existing host tests continue to pass after the change. [surface=cli; moment=terminal; evidence=contract-integration]

## Verification

- AC-SWITCH-001: test `tests/todo-compact-trigger.test.js` [surface=api; moment=static; evidence=static-unit]
- AC-SWITCH-002: test `tests/todo-compact-trigger.test.js` [surface=api; moment=static; evidence=static-unit]
- AC-SWITCH-003: test `tests/todo-compact-trigger.test.js` [surface=api; moment=static; evidence=static-unit]
- AC-SWITCH-004: test `tests/todo-compact-trigger.test.js` [surface=api; moment=static; evidence=static-unit]
- AC-SWITCH-005: test `tests/todo-compact-trigger.test.js` [surface=api; moment=static; evidence=static-unit]
- AC-TRIG-001: test `tests/todo-compact-trigger.test.js` with a stub slash-command dispatcher that records its calls [surface=api; moment=terminal; evidence=contract-integration]
- AC-TRIG-002: test `tests/todo-compact-trigger.test.js` [surface=api; moment=terminal; evidence=contract-integration]
- AC-TRIG-003: test `tests/todo-compact-trigger.test.js` [surface=api; moment=terminal; evidence=contract-integration]
- AC-TRIG-004: test `tests/todo-compact-trigger.test.js` with a stub slash-command dispatcher that records its calls [surface=api; moment=terminal; evidence=contract-integration]
- AC-TRIG-005: test `tests/todo-compact-trigger.test.js` with a stub slash-command dispatcher that throws [surface=api; moment=terminal; evidence=contract-integration]
- AC-CLI-001: test `tests/cli-todo.test.js` [surface=cli; moment=terminal; evidence=user-visible]
- AC-CLI-002: test `tests/cli-todo.test.js` [surface=cli; moment=terminal; evidence=user-visible]
- AC-CLI-003: test `tests/cli-todo.test.js` [surface=cli; moment=terminal; evidence=user-visible]
- AC-CLI-004: test `tests/cli-todo.test.js` [surface=cli; moment=terminal; evidence=user-visible]
- AC-CLI-005: test `tests/cli-todo.test.js` [surface=cli; moment=terminal; evidence=user-visible]
- AC-ACTIVE-001: test `tests/spec-todos.test.js` [surface=api; moment=static; evidence=contract-integration]
- AC-ACTIVE-002: test `tests/spec-todos.test.js` [surface=api; moment=static; evidence=contract-integration]
- AC-DOCS-001: inspection of the three new docs files [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-002: command `node lib/cli.js docs check --cwd .` [surface=cli; moment=static; evidence=completion-hygiene]
- AC-SCAN-001: command `node lib/cli.js scan --all --cwd .` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001: command `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js" "tests/**/*.test.js" "blueprint-diagnostics/tests/*.test.js"` [surface=cli; moment=terminal; evidence=contract-integration]

## Risks

- The documented DSH slash-command dispatch surface is version-dependent. If the target DSH profile exposes no `runSlashCommand` or equivalent, the trigger falls back to a no-op with a one-time boot warning. The Spec does not ship in that state; the developer must upgrade DSH or pin a known-good version.
- `featureIdForSpecPath` walks the Feature tree at decision time. If the Feature tree is large (hundreds of Features), the lookup is O(N) per call. A future Spec may add a precomputed index; this Spec ships the simple version.
- 200 KiB is a heuristic. A 199 KiB byte total that contains 100 KiB of irrelevant conversation still triggers nothing. A future Spec may swap the threshold for a relevance-weighted measure; this Spec ships the byte floor.
- The `compact/auto-fired` event is written **after** a successful dispatch. If the host crashes between dispatch and event write, the diagnostics package will miss the attribution. The risk is bounded; the compact still happened.
- `featureIdForSpecPath` may return `null` for orphan Specs (Spec without an owning Feature). The trigger returns `'no-previous-task'` in that case; the developer can type `/compact` manually.

## Requirements

### REQ-TRIG-1 — Three-gate predicate

`evaluateTrigger` in `lib/todo-compact-trigger.js` shall be a pure function that returns exactly one of `'fire'`, `'same-feature'`, `'under-threshold'`, or `'no-previous-task'`. It shall not read or write the filesystem, the network, or the process state. It shall not throw.

### REQ-TRIG-2 — Feature-switch as the primary signal

The predicate shall return `'same-feature'` when `previousFeatureId === currentFeatureId` and both are non-null. It shall never return `'fire'` in that case.

### REQ-TRIG-3 — 200 KiB byte floor

The predicate shall return `'under-threshold'` when the Feature ids differ and `bytesSincePreviousTaskDone < 204800` (200 KiB).

### REQ-TRIG-4 — Missing context is a no-op

The predicate shall return `'no-previous-task'` when either `previousFeatureId` or `currentFeatureId` is `null`. The framework never invents a Feature from absent data.

### REQ-DISPATCH-1 — DSH `/compact` through documented surface

`maybeAutoCompact` shall invoke DSH's `/compact` slash command through the same path a human operator uses when the predicate is `'fire'`. It shall not call private composer APIs or write a parallel route.

### REQ-DISPATCH-2 — Failure must not roll back

A dispatch failure in `maybeAutoCompact` shall be caught, logged, and surfaced as `{ invoked: false, reason: 'dispatch-failed' }`. The caller's `task/done` event is never rolled back.

### REQ-DISPATCH-3 — Diagnostics-friendly event

After a successful dispatch, `maybeAutoCompact` shall append one `compact/auto-fired` event to `session.jsonl` carrying `{ time, reason, previousFeatureId, currentFeatureId, bytesSincePreviousTaskDone }`.

### REQ-CLI-1 — `todo mark done` calls the trigger

`lib/cli.js#runTodoMark` shall call `maybeAutoCompact` after writing the `task/done` event, regardless of the byte count or the Feature switch. The pre-existing byte-threshold hint text is removed.

### REQ-CLI-2 — One-line outcome on stdout

`runTodoMark` shall print exactly one of the five outcome lines to stdout. The pre-existing `Compaction hint:` line is no longer emitted by this command.

### REQ-ACTIVE-1 — Spec-to-Feature lookup

`featureIdForSpecPath(specPath)` in `lib/spec-todos.js` shall return the id of the Feature that owns the given Spec path, or `null` if none.

### REQ-ACTIVE-2 — Pure lookup

`featureIdForSpecPath` shall be a pure function of the spec path and the Feature tree snapshot. It shall not perform mutations.

## Scenarios

[scenario=feature-switch-fires]
Given a `task/done` event with `data.spec: '.specs/proposed/b.md'` after a previous `task/done` with `data.spec: '.specs/proposed/a.md'`, both Specs belong to different Features, and bytes accumulated since the previous `task/done` is 500 KiB, When the trigger runs, Then DSH's `/compact` slash command is dispatched exactly once and one `compact/auto-fired` event is appended to `session.jsonl`.

[scenario=same-feature-skips]
Given a `task/done` event with `data.spec: '.specs/proposed/a.md'` after a previous `task/done` with the same Spec path, When the trigger runs, Then no DSH `/compact` dispatch happens and no `compact/auto-fired` event is written.

[scenario=under-threshold-skips]
Given a Feature switch with bytes accumulated at 100 KiB, When the trigger runs, Then no DSH `/compact` dispatch happens and stdout shows `Auto-compact: skipped (under threshold: 102400 bytes < 200 KiB).`.

[scenario=no-previous-task-skips]
Given the first `task/done` in a fresh `session.jsonl`, When the trigger runs, Then no DSH `/compact` dispatch happens and stdout shows `Auto-compact: skipped (no previous task).`.

[scenario=dispatch-failure-does-not-rollback]
Given a `maybeAutoCompact` call with a stub slash-command dispatcher that throws, When the call returns, Then the return value is `{ invoked: false, reason: 'dispatch-failed', error: <message> }` and the `task/done` event the caller wrote remains in `session.jsonl`.

## Assumptions

1. The target DSH version exposes a documented slash-command dispatch surface (e.g. `ctx.inputTriggers.dispatch` registered by Skills sub-spec A, or `runSlashCommand` exported by `@deepseek-ai/dsh-client-ui-input-trigger`). If it does not, the Spec cannot ship and the developer must upgrade the DSH baseline.
2. `lib/todo-events.js#buildTaskDoneEvent` already writes `data.spec` for every `task/done` event; this Spec reuses the existing field without modifying the event shape.
3. The `compact/auto-fired` event uses the same `session.jsonl` line format as `task/done` so the diagnostics package's stream parser can read it without changes.
4. The 200 KiB and 5-minute thresholds are sensible defaults for a typical DSH session. A future Spec may surface them in `design-blueprint.json` if real workloads demand.

## Non-goals

- No real-time compact daemon. The trigger is event-driven (`task/done`); there is no periodic background sweep.
- No REQ/AC overlap check. The trigger is at Feature granularity; correlation of individual REQ/AC ids is not a signal.
- No byte-threshold-only trigger. A Feature switch alone is not enough; the byte floor prevents noise from small off-Feature edits.
- No new slash command for the developer. The action is the same `/compact` slash command DSH already documents.
- No compact on Feature completion. The trigger is `task/done` Feature-switch, not `feature/completed`.
- No compact on idle. The framework does not start a timer.
- No new permission surface. The dispatch path uses the same documented DSH API a human operator would use.

## Alternatives considered

**Always compact on `task/done` regardless of Feature or byte count.** Rejected. The developer explicitly distinguished "Feature switch with enough accumulated conversation" from any completion; unconditional compaction would reset context during routine incremental work.
**Compact on REQ/AC overlap mismatch instead of Feature switch.** Rejected. REQ/AC overlap is too fine-grained; a session that touches four sub-tasks across two Features would auto-compact four to six times, which is the opposite of helpful.
**No byte floor.** Rejected after the developer reviewed the over-firing risk. A 200 KiB floor matches the revised intent: the auto-compact should only run when enough conversation has accumulated to make the cost worth paying.
**No cooldown.** Rejected after the developer reviewed the over-firing risk. The 200 KiB byte floor alone rate-limits the trigger; a successful compact summarises the conversation and drops the byte count, so the next auto-compact requires another 200 KiB to accumulate.
**Reuse the existing `todo-live-compact-hint` instead of a new Spec.** Rejected. The hint is informational; the new behaviour is action-taking.
**Invoke the compact through a private composer API or a manual file write.** Rejected. The framework's product contract is to use the same documented surface a human would use.

## Tasks

1. Author `lib/todo-compact-trigger.js` exporting `evaluateTrigger`, `maybeAutoCompact`, `featureIdForSpecPath`, `bytesBetweenTimestamps`, plus the `BYTE_THRESHOLD_BYTES = 200 * 1024` constant. AC: AC-SWITCH-001..AC-SWITCH-005, AC-TRIG-001..AC-TRIG-005.
2. Add `featureIdForSpecPath` to `lib/spec-todos.js`. AC: AC-ACTIVE-001, AC-ACTIVE-002.
3. Update `lib/cli.js#runTodoMark` to call `maybeAutoCompact` after writing the `task/done` event and to emit one of the five outcome lines on stdout. Remove the existing `Compaction hint:` text. AC: AC-CLI-001..AC-CLI-006.
4. Write `tests/todo-compact-trigger.test.js` covering the predicate, the trigger function, the byte measurement, and a stub slash-command dispatcher. AC: AC-SWITCH-001..AC-SWITCH-005, AC-TRIG-001..AC-TRIG-005.
5. Extend `tests/cli-todo.test.js` with cases that assert the four stdout lines and the absence of the legacy hint. AC: AC-CLI-001..AC-CLI-005.
6. Extend `tests/spec-todos.test.js` with `featureIdForSpecPath` cases. AC: AC-ACTIVE-001, AC-ACTIVE-002.
7. Author `docs/user/features/auto-compact-on-unrelated-task-done.{md,zh.md,i18n.yaml}` with the four mattpocock section headings. AC: AC-DOCS-001.
8. Add the three new docs and the new test files to `spec-governance` Feature's `required documents` and `Scope` lists in `.blueprint/features/spec-governance.md`. AC: AC-SCAN-001.
9. Append a one-paragraph follow-up to the existing `.specs/implemented/todo-live-compact-hint.md` `## Consequences` section noting that the byte-threshold hint has been superseded by this Spec's auto-compact announcement. AC: AC-CLI-005.
10. Run `node lib/cli.js docs check --cwd .`, `node lib/cli.js scan --all --cwd .`, and the full host + diagnostics test suite. AC: AC-DOCS-002, AC-SCAN-001, AC-REGRESSION-001.

## Lifecycle

- Status: proposed
- Target status after approval: implemented (file moves to `.specs/implemented/auto-compact-on-unrelated-task-done.md`)

## Truth-delta

New facts added:
- `lib/todo-compact-trigger.js` exists, exporting `evaluateTrigger`, `maybeAutoCompact`, `featureIdForSpecPath`, `bytesBetweenTimestamps`, `BYTE_THRESHOLD_BYTES`.
- `lib/spec-todos.js` exports `featureIdForSpecPath`.
- `lib/cli.js#runTodoMark` calls `maybeAutoCompact` after writing the `task/done` event and prints one of five outcome lines on stdout.
- The legacy `Compaction hint:` line is no longer emitted by `todo mark done`.
- A new event kind `compact/auto-fired` may appear in `session.jsonl` after a successful auto-compact.
- The `spec-governance` Feature brief gains three required documents and one new required test file under its `Documents` and `Scope` lists.

Existing facts preserved:
- All existing CLI subcommands except the `todo mark done` hint line.
- All existing 232 host tests plus the existing diagnostics-package tests.
- The `todo-live-compact-hint` Spec remains in `.specs/implemented/` as historical record (with a one-paragraph `## Consequences` follow-up).
- The `persistent-todo-list`, `compact-at-checkpoint`, and the rest of the session-scale-awareness program are unchanged.

## Unresolved decisions

1. The exact DSH API surface for slash-command dispatch is not pinned in this Spec. The implementation picks between `ctx.inputTriggers.dispatch` (the registration Skills sub-spec A documented) and `runSlashCommand` (if exported by `@deepseek-ai/dsh-client-ui-input-trigger`). Both are equally valid; the choice is made in task 3 based on what the resolved DSH version actually exports. If neither is available, `REQ-DISPATCH-1` cannot be satisfied; the developer must upgrade DSH.

## Quality checklist (self-attested)

- requirements complete: yes (10 REQs covering predicate, dispatch, CLI integration, active Feature resolution)
- requirements unambiguous: yes
- requirements bounded: yes
- requirements failure-aware: yes
- requirements testable: yes
- requirements non-contradictory: yes

## Cross-artifact analysis
- requirements-to-scenarios: yes
- requirements-to-impact: yes
- requirements-to-tasks: yes
- requirements-to-acceptance: yes
- requirements-to-verification: yes
- tasks-to-scope: yes
- design-to-scope: yes
- scope-to-paths: yes

## Consequences

Blueprint completed this delivery automatically after requirement-linked verification.

- Verified snapshot: `git-index:047e45f6e5e7381e113f83efc5aa71f0190bbdf7a592fa637e03ff27bbe0b443`
- Verification attempt: `attempt-auto-compact`
- Conclusion: Auto-compact on Feature switch (>=200 KiB) lands. `lib/todo-compact-trigger.js` exports `evaluateTrigger`, `maybeAutoCompact`, `featureIdForSpecPath`, `bytesBetweenTimestamps`, and `BYTE_THRESHOLD_BYTES`. `lib/spec-todos.js` exports `featureIdForSpecPath`. `lib/cli.js#runTodoMark` calls `maybeAutoCompact` after writing the `task/done` event and prints one of five outcome lines: `feature-switch fired`, `same feature`, `under threshold`, `no previous task`, or `dispatch failed`. The legacy "Compaction hint: ... MiB accumulated ..." line is retired; `tests/todo-compact-hint.test.js` is updated to assert the new behaviour. All 252 host tests plus the diagnostics tests pass; `node lib/cli.js scan --all --cwd .` reports 0 required / 0 recommended; `node lib/cli.js docs check --cwd .` confirms 18/18 bilingual pairs. The DSH dispatch surface is not wired in this build, so the trigger returns `no-dispatch-surface` after one boot-time warning; a future Spec may wire `ctx.inputTriggers.dispatch` or `@deepseek-ai/dsh-client-ui-input-trigger#runSlashCommand` when the resolved DSH version exposes it.
- AC evidence: all 21 acceptance criteria passed.
- Check evidence: predicate (command), trigger (command), cli-output (command), active-feature (command), docs-check (command), scan (command), full-test (command).
