# Spec: wire DSH `/compact` dispatch for auto-compact on Feature switch

Status: proposed
Feature: spec-governance
Parent: `.specs/implemented/auto-compact-on-unrelated-task-done.md` (the earlier predicate-and-CLI delivery)

> Companion: `.specs/implemented/todo-live-compact-hint.md` (the prior "print a hint" delivery, retired)
> Companion: `.specs/implemented/persistent-todo-list.md` (the `task/done` event source)
> Companion: `.specs/implemented/auto-compact-on-unrelated-task-done.md` (the predicate + CLI outcome lines; ships the `maybeAutoCompact` pure function reused here)

## Proposal

Wire the previously-stubbed dispatcher so the Feature-switch + 200 KiB trigger actually calls DSH's `/compact`. The CLI subprocess (`node lib/cli.js todo mark …`) cannot hold the host's cordis `ctx`, so the dispatch moves to a host-side session-file watcher that runs inside the plugin's own cordis fiber. The watcher holds `ctx.compaction` and the per-session `agent` / `AbortSignal` / `commandId` captured by the orchestrator on every `/blueprint` invocation. When a new `task/done` event arrives and the predicate says fire, the watcher invokes the same `ctx.compaction.compactNow(agent, signal, commandId)` call that `@deepseek-ai/dsh-command-compact` invokes when a human types `/compact`. No new permission, no parallel route, no private composer API.

## Problem

`.specs/implemented/auto-compact-on-unrelated-task-done.md` shipped a pure `maybeAutoCompact` that supports a `dispatch` callback parameter, but `lib/cli.js#emitAutoCompact` passes `dispatch: null`. The CLI subprocess has no handle on `ctx.compaction`, so the trigger reaches the predicate and then reports `no-dispatch-surface` to stdout. The host carries `ctx.compaction.compactNow(...)` but never invokes it.

Three dispatch paths were considered:

- `ctx.inputTriggers.dispatch` (from Skills sub-spec A) — verified to be a slash-autocomplete registry (`registerSource`), not a slash-command dispatch surface.
- `runSlashCommand` from `@deepseek-ai/dsh-client-ui-input-trigger` — verified absent; the package's `apply()` is empty and only the browser half ships.
- `ctx.compaction.compactNow(agent, signal, commandId)` — the canonical DSH API used internally by `@deepseek-ai/dsh-command-compact`. This is the documented path a human operator uses to invoke `/compact`.

The CLI is a Node subprocess. The DSH host is the parent. There is no in-process handle for the subprocess to call back into. The dispatcher therefore must live on the host side, react to `task/done` events the CLI writes to `session.jsonl`, and own the host's cordis context.

## Scope

### Allowed paths

- allow: `lib/auto-compact-watcher.js`
- allow: `lib/orchestration.js`
- allow: `lib/index.js`
- allow: `tests/{auto-compact-watcher,cli-todo,orchestration,orchestration-auto-compact,plugin}.test.js`
- allow: `docs/user/features/auto-compact-on-unrelated-task-done.{md,zh.md,i18n.yaml}`
- allow: `.blueprint/features/spec-governance.md`
- allow: `.specs/implemented/auto-compact-on-unrelated-task-done.md` (post-script `## Consequences` follow-up only)
- allow: `package.json`

### Denied paths

- deny: `lib/scan.js`
- deny: `lib/web-api.js`
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
- deny: `lib/spec-decomposition.js`
- deny: `lib/spec-todos.js`
- deny: `lib/todo-events.js`
- deny: `lib/todo-store.js`
- deny: `.blueprint/approvals/**`
- deny: `.blueprint/verifications/**`
- deny: `.specs/**` outside this Spec pair + the post-script `## Consequences` follow-up on `.specs/implemented/auto-compact-on-unrelated-task-done.md`
- deny: `docs/i18n/**`
- deny: `design-blueprint.json` default or authority sections

## Decision

### 1. Host-side session-file watcher

`lib/auto-compact-watcher.js` exports a single factory `createAutoCompactWatcher({ ctx, logger })`. The watcher:

1. Holds a `Map<sessionId, { agent, signal, commandId, lastSeenTaskDoneTime, lastSeenTaskDoneKey }>` that records the active session's runtime agent and the last `task/done` event already consumed.
2. Exposes `captureAgent(sessionId, capture)` — the orchestrator calls this on every `/blueprint` invocation to refresh the stash. The stash entry expires automatically when `lastSeenTaskDoneTime` matches the freshly-seen event: subsequent ticks for that exact event are no-ops.
3. Exposes `tick({ cwd, sessionId, nowMs })` — called by the orchestrator at the end of every `/blueprint` invocation. The tick:
   a. Reads `.dsh/sessions/<sessionId>/session.jsonl` (or `<cwd>/session.jsonl` fallback) via the existing `locateSessionPath` helper.
   b. Scans new lines for `task/done` events with `time > lastSeenTaskDoneTime` AND a stable key (`seq` OR `time+todoId`) different from `lastSeenTaskDoneKey`.
   c. For each new event (typically zero or one), calls `maybeAutoCompact(...)` with `currentTaskSpecPath` ← `event.data.spec` and a real `dispatch` callback that calls `ctx.compaction.compactNow(agent, signal, commandId)`. The dispatch is fire-and-forget: `tick()` returns immediately and logs the resolution without blocking the chat turn.
   d. Updates `lastSeenTaskDoneTime` and `lastSeenTaskDoneKey` from the consumed event.
4. Exposes `dispose()` to clear the stash when the plugin unloads.

The watcher is the **authoritative dispatcher**. The CLI's `emitAutoCompact` keeps its outcome-line printing (so the developer sees what happened) but its `dispatch` argument stays `null` — the CLI subprocess cannot host the real dispatcher, and the watcher picks up the same `task/done` event on the next `/blueprint` invocation.

### 2. Agent stash in the orchestrator

`lib/orchestration.js#createBlueprintOrchestrator` is extended to take an optional `watcher` dependency. When present, `dispatchCommand("blueprint", invocation)` performs three steps in this order:

1. Resolve `sessionId` from `invocation.agent`.
2. Call `watcher.captureAgent(sessionId, { agent: invocation.agent, signal: invocation.signal, commandId: invocation.commandId })`.
3. After the existing refinement-packet work, call `await watcher.tick({ cwd: cwdOf(invocation.agent), sessionId, nowMs: Date.now() })`. The tick's promise is awaited inside the orchestrator, but the inner `ctx.compaction.compactNow(...)` call is fired-and-forgotten, so a slow compaction does not stall the chat turn.

Tests inject a stub `watcher` that records `captureAgent` and `tick` calls. The orchestrator's `dispatchNatural` (used by the `blueprint_dispatch` tool) follows the same path.

### 3. Plugin entry wires the watcher

`lib/index.js#apply(ctx)` adds `"compaction"` to its `inject` array. Inside the existing `ctx.effect(function* () { ... })` block, after the Skills provider registration:

1. If `ctx.compaction?.compactNow` is a function, import `lib/auto-compact-watcher.js` and instantiate `createAutoCompactWatcher({ ctx, logger: <plugin logger> })`. Pass it to `createBlueprintOrchestrator(ctx, { watcher })`.
2. Otherwise, instantiate a no-op watcher that logs a single `info`-level "auto-compact: skipped (no DSH compaction service in this profile)" message and otherwise forwards to `maybeAutoCompact` with `dispatch: null`. This keeps the `lib/cli.js#emitAutoCompact` outcome lines meaningful in CI runs without DSH.
3. Register a `ctx.effect` disposer so `watcher.dispose()` runs when the plugin unloads.

The watcher import is a dynamic `await import(...)` inside the effect body, matching the existing Skills-loader pattern. This keeps the plugin loadable on DSH releases that predate `@deepseek-ai/dsh-compaction`.

### 4. CLI stays a printer, not a dispatcher

`lib/cli.js#emitAutoCompact` keeps its current shape: it imports `maybeAutoCompact`, passes `dispatch: null` (the CLI subprocess cannot call `ctx.compaction`), and prints one of the six existing outcome lines (`feature-switch`, `same-feature`, `under-threshold`, `no-previous-task`, `no-dispatch-surface`, `dispatch-failed`). The `no-dispatch-surface` line is unchanged. No new flag, no new line, no CLI dispatch.

The CLI test suite (`tests/cli-todo.test.js`) is extended with one new test that asserts:

- After a successful CLI invocation that prints `Auto-compact: skipped (no DSH slash-command dispatch surface; manual /compact required).`, a stub watcher placed in the same session directory and ticked with the same `cwd` and `sessionId` fires its dispatch callback against the `task/done` event the CLI just wrote.

This locks the contract: the CLI prints, the host dispatches; the two paths do not race and do not duplicate.

### 5. Reused pure function

`lib/todo-compact-trigger.js#maybeAutoCompact` is unchanged. Its existing `dispatch` callback contract is the integration point: the watcher passes `async (cmd) => ctx.compaction.compactNow(agent, signal, commandId)`. The `compact/auto-fired` event write at the end of `maybeAutoCompact` (after a successful dispatch) is the diagnostics attribution that the prior Spec promised; it now lands from a real `/compact` call instead of a stub.

### 6. Bilingual user docs

`docs/user/features/auto-compact-on-unrelated-task-done.{md,zh.md,i18n.yaml}`:

- The English `## Common questions` section's last bullet ("What if my DSH profile does not expose a slash-command dispatch surface?") is rewritten to: "If the resolved DSH version exposes `ctx.compaction.compactNow` (the same API the human `/compact` slash command uses internally), the plugin's host-side watcher calls it directly when the trigger fires. There is no manual `/compact` step. If the resolved profile has no `ctx.compaction`, the trigger reduces to a no-op with a one-time boot warning, and the developer must upgrade the DSH baseline."
- The `## It's working if` section adds one observable: "After a successful fire, DSH's `/compact` slash command resolves the same way it does when typed manually — the context window shortens, a `compaction/start` and `compaction/end` event pair land in `session.jsonl`, and the framework's `compact/auto-fired` event is appended right after the `compaction/end` event with `previousFeatureId` / `currentFeatureId` / `bytesSincePreviousTaskDone`."

The Chinese mirror is updated in lock-step.

### 7. Owning Spec follow-up

`.specs/implemented/auto-compact-on-unrelated-task-done.md`'s `## Consequences` section gains a one-paragraph follow-up noting that the original "DSH dispatch surface is not wired" caveat has been resolved by this Spec; the historical record stays in place.

## Acceptance criteria

- AC-WATCH-001: `createAutoCompactWatcher({ ctx })` returns an object with `captureAgent`, `tick`, and `dispose` methods. Calling `tick` with no prior `captureAgent` for that `sessionId` is a no-op (returns `{ skipped: 'no-agent' }`). [surface=api; moment=static; evidence=static-unit]
- AC-WATCH-002: After `captureAgent('s1', { agent: fake, signal, commandId })` and `tick({ cwd, sessionId: 's1' })`, when `session.jsonl` contains a fresh `task/done` event whose spec belongs to a different Feature than the immediately-previous `task/done` event and at least 200 KiB accumulated since that previous event, the watcher's `ctx.compaction.compactNow(agent, signal, commandId)` is called exactly once with the captured `agent`, `signal`, and `commandId`. [surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-003: After `captureAgent` and `tick`, when the predicate is `'same-feature'` or `'under-threshold'` or `'no-previous-task'`, `ctx.compaction.compactNow` is NOT called and `tick` returns `{ invoked: false, reason: <code> }`. [surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-004: Two consecutive `tick({ cwd, sessionId: 's1' })` calls with the same `session.jsonl` content invoke `ctx.compaction.compactNow` at most once for the same `task/done` event. The watcher's `lastSeenTaskDoneKey` dedup prevents replay. [surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-005: When `ctx.compaction.compactNow(agent, signal, commandId)` throws, `tick` catches the error, logs at warn, and returns `{ invoked: false, reason: 'dispatch-failed', error: <message> }`. The `task/done` event the CLI wrote remains in `session.jsonl`. [surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-006: `dispose()` clears the agent stash. A subsequent `tick` for any `sessionId` returns `{ skipped: 'no-agent' }`. [surface=api; moment=terminal; evidence=contract-integration]
- AC-INDEX-001: `lib/index.js#inject` includes `"compaction"` alongside the existing five services. [surface=repository; moment=static; evidence=static-unit]
- AC-INDEX-002: `lib/index.js#apply(ctx)` registers the watcher inside the existing `ctx.effect` block before the `commands` / `tools` / `webServer` registrations. When `ctx.compaction.compactNow` is unavailable, the no-op watcher path is taken. [surface=repository; moment=terminal; evidence=contract-integration]
- AC-INDEX-003: `lib/index.js#apply(ctx)` registers a `ctx.effect` disposer that calls `watcher.dispose()` on plugin unload. [surface=repository; moment=supporting; evidence=contract-integration]
- AC-ORCH-001: `createBlueprintOrchestrator(ctx, { watcher: stubWatcher })` with `stubWatcher.captureAgent` and `stubWatcher.tick` as recording stubs: after `dispatchCommand("blueprint", invocation)`, `stubWatcher.captureAgent` was called once with `(sessionId, { agent, signal, commandId })` and `stubWatcher.tick` was called once with `{ cwd, sessionId, nowMs }`. [surface=api; moment=terminal; evidence=contract-integration]
- AC-ORCH-002: The orchestrator passes its dependencies through: a test that constructs `createBlueprintOrchestrator(ctx, { watcher: null })` still works (the orchestrator tolerates a missing watcher; `dispatchCommand` does not call capture or tick). [surface=api; moment=terminal; evidence=contract-integration]
- AC-CLI-006: After `design-blueprint todo mark <id> --spec <path> done` writes a `task/done` event, the CLI prints one of the six outcome lines (existing) and a stub watcher ticked against the same `cwd` and `sessionId` sees the new event and dispatches via `ctx.compaction.compactNow`. The CLI's printed line is independent of the watcher's outcome (the watcher's fire is observable in a follow-up watcher tick). [surface=cli; moment=terminal; evidence=contract-integration]
- AC-DOCS-003: `docs/user/features/auto-compact-on-unrelated-task-done.md` and `.zh.md` exist; the English `## Common questions` section no longer states the "manual /compact required" caveat; it states the host-side watcher invokes `ctx.compaction.compactNow` directly. `node lib/cli.js docs check --cwd .` reports 0 required and 0 recommended issues after the new wording lands. [surface=cli; moment=static; evidence=completion-hygiene]
- AC-PARENT-001: `.specs/implemented/auto-compact-on-unrelated-task-done.md` has a one-paragraph `## Consequences` follow-up noting this Spec resolved the historical "DSH dispatch surface is not wired" caveat. [surface=repository; moment=static; evidence=static-unit]
- AC-SCAN-002: `node lib/cli.js scan --all --cwd .` reports 0 required and 0 recommended issues after this Spec lands. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-002: All 252 existing host tests continue to pass after the change, plus the new `tests/auto-compact-watcher.test.js` and the new orchestration / CLI tests. [surface=cli; moment=terminal; evidence=contract-integration]

## Verification

- AC-WATCH-001: test `tests/auto-compact-watcher.test.js` factory-shape case. [surface=api; moment=static; evidence=static-unit]
- AC-WATCH-002: test `tests/auto-compact-watcher.test.js` fire-on-Feature-switch case. [surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-003: test `tests/auto-compact-watcher.test.js` same-feature / under-threshold / no-prior-task cases. [surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-004: test `tests/auto-compact-watcher.test.js` dedup-replays case. [surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-005: test `tests/auto-compact-watcher.test.js` dispatch-failure case. [surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-006: test `tests/auto-compact-watcher.test.js` dispose case. [surface=api; moment=terminal; evidence=contract-integration]
- AC-INDEX-001: test `tests/plugin.test.js` inject-membership case. [surface=repository; moment=static; evidence=static-unit]
- AC-INDEX-002: test `tests/plugin.test.js` watcher-registration and no-compaction-fallback cases. [surface=repository; moment=terminal; evidence=contract-integration]
- AC-INDEX-003: test `tests/plugin.test.js` disposer-registration case. [surface=repository; moment=supporting; evidence=contract-integration]
- AC-ORCH-001: test `tests/orchestration-auto-compact.test.js` forward-to-watcher case. [surface=api; moment=terminal; evidence=contract-integration]
- AC-ORCH-002: test `tests/orchestration-auto-compact.test.js` watcher-null case. [surface=api; moment=terminal; evidence=contract-integration]
- AC-CLI-006: test `tests/cli-todo.test.js` cli-prints-and-host-dispatches case. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-DOCS-003: inspection of the two updated `docs/user/features/auto-compact-on-unrelated-task-done.{md,zh.md}` files plus command `node lib/cli.js docs check --cwd .`. [surface=cli; moment=static; evidence=completion-hygiene]
- AC-PARENT-001: inspection of `.specs/implemented/auto-compact-on-unrelated-task-done.md` after the one-paragraph `## Consequences` follow-up. [surface=repository; moment=static; evidence=static-unit]
- AC-SCAN-002: command `node lib/cli.js scan --all --cwd .`. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-002: command `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js" "tests/**/*.test.js"`. [surface=cli; moment=terminal; evidence=contract-integration]

## Risks

- The watcher is event-driven by the chat handler. There is a one-event latency between the CLI writing the `task/done` event and the next `/blueprint` invocation triggering the watcher. A developer who finishes a `task/done` and then immediately types a message other than `/blueprint` will see the auto-compact fire only on the next `/blueprint` invocation. This is acceptable: every DSH chat session eventually types `/blueprint`, and a slow compaction is fire-and-forget.
- The watcher holds `agent` references for the active session. If a session ends without the orchestrator's `dispatchCommand` running (e.g., the agent crashes mid-turn), the stash retains the `agent` until `dispose()`. The reference is harmless: `dispose()` clears it on plugin unload, and `tick()` no-ops when the `task/done` event is not new.
- `ctx.compaction.compactNow(agent, signal, commandId)` requires a `ManualCompactAgentContext`. The `agent` captured from `invocation.agent` is a DSH runtime agent and may not carry `runMaintenance` in every DSH profile. The watcher tolerates this: if `compactNow` throws, the watcher logs and falls back to the `dispatch-failed` outcome. The Spec documents the runtime assumption under `## Assumptions`.
- A future Spec may want a real timer-driven polling loop on top of the current chat-driven tick (for sessions that never invoke `/blueprint`). That Spec will register `ctx.interval(...)` with `inject: ['timer']`; this Spec does not introduce the dependency.

## Requirements

### REQ-WATCHER-1 — Pure factory

`createAutoCompactWatcher({ ctx, logger })` in `lib/auto-compact-watcher.js` returns an object with `captureAgent(sessionId, capture)`, `tick({ cwd, sessionId, nowMs })`, and `dispose()`. It must not read or mutate any filesystem outside `session.jsonl`, must not call `process.exit`, must not throw on any input.

### REQ-WATCHER-2 — Real dispatch via `ctx.compaction.compactNow`

`tick` calls `ctx.compaction.compactNow(agent, signal, commandId)` exactly once per new `task/done` event whose Feature switch + 200 KiB predicate says fire, with the `agent`, `signal`, and `commandId` captured by the most recent `captureAgent` for that `sessionId`. The dispatch is fire-and-forget: the call's promise is not awaited.

### REQ-WATCHER-3 — Dedup

`tick` consumes each `task/done` event at most once. Two ticks with the same `session.jsonl` content trigger at most one `compactNow` for the same event. The dedup key is `(event.seq ?? event.time+event.data.todoId)`.

### REQ-WATCHER-4 — Robust against missing agent

When `tick` is called for a `sessionId` that has no agent stash entry, it returns `{ skipped: 'no-agent' }` and does not invoke `compactNow`. This matches the CI / non-DSH path.

### REQ-WATCHER-5 — Robust against compaction failure

When `ctx.compaction.compactNow` throws or rejects, `tick` catches the error, logs at warn, and returns `{ invoked: false, reason: 'dispatch-failed', error: <message> }`. The CLI's `task/done` event is never rolled back.

### REQ-INDEX-1 — Inject `compaction`

`lib/index.js#inject` array adds `"compaction"` alongside the existing services. The plugin entry is loadable on DSH releases without `@deepseek-ai/dsh-compaction` (the existing pattern).

### REQ-INDEX-2 — Watcher registration

`lib/index.js#apply(ctx)` instantiates `createAutoCompactWatcher({ ctx, logger })` and threads it into `createBlueprintOrchestrator(ctx, { watcher })`. When `ctx.compaction.compactNow` is not a function, a no-op watcher is instantiated and a one-time `info` log is written.

### REQ-INDEX-3 — Disposer

The `ctx.effect` block that owns the watcher also registers a disposer (`yield async () => watcher.dispose()`) so the agent stash and dedup state are cleared on plugin unload.

### REQ-ORCH-1 — Orchestrator wires watcher

`lib/orchestration.js#createBlueprintOrchestrator(ctx, dependencies = {})` accepts `dependencies.watcher` and, when present, calls `watcher.captureAgent` and `watcher.tick` from `dispatchCommand`. The existing behavior (refinement packet, `agent.steer(...)`) is unchanged.

### REQ-ORCH-2 — Tolerates missing watcher

When `dependencies.watcher` is absent or `null`, `dispatchCommand` proceeds without error. The contract is: the orchestrator is still testable in isolation.

### REQ-CLI-1 — CLI prints, watcher dispatches

`lib/cli.js#emitAutoCompact` keeps its existing six outcome lines and `dispatch: null`. No CLI changes beyond what is already in `.specs/implemented/auto-compact-on-unrelated-task-done.md`.

### REQ-DOCS-1 — Update user docs

The English and Chinese `docs/user/features/auto-compact-on-unrelated-task-done.{md,zh.md}` pages update the `## Common questions` and `## It's working if` sections to reflect the host-side watcher dispatch.

### REQ-PARENT-1 — Post-script follow-up

`.specs/implemented/auto-compact-on-unrelated-task-done.md` `## Consequences` section gains a one-paragraph follow-up noting the original "DSH dispatch surface is not wired" caveat has been resolved by this Spec.

## Scenarios

[scenario=watcher-fires-compactNow-on-feature-switch]
Given a session with two consecutive `task/done` events on different Features and at least 200 KiB accumulated between them,
And a `captureAgent('s1', { agent: fakeAgent, signal: fakeSignal, commandId: 'blueprint-auto-compact' })` call before the second event,
When `tick({ cwd, sessionId: 's1', nowMs })` runs,
Then `ctx.compaction.compactNow(fakeAgent, fakeSignal, 'blueprint-auto-compact')` is invoked exactly once,
And `session.jsonl` gains one `compact/auto-fired` event with `reason: 'feature-switch'`.

[scenario=watcher-skips-on-same-feature]
Given a session with two consecutive `task/done` events on the same Feature,
When `tick` runs,
Then `ctx.compaction.compactNow` is NOT invoked,
And `tick` returns `{ invoked: false, reason: 'same-feature', bytesSincePreviousTaskDone: <n> }`.

[scenario=watcher-skips-on-under-threshold]
Given a session with two consecutive `task/done` events on different Features and less than 200 KiB accumulated between them,
When `tick` runs,
Then `ctx.compaction.compactNow` is NOT invoked,
And `tick` returns `{ invoked: false, reason: 'under-threshold', bytesSincePreviousTaskDone: <n> }`.

[scenario=watcher-skips-on-no-prior-task]
Given a fresh `session.jsonl` with a single `task/done` event,
When `tick` runs,
Then `ctx.compaction.compactNow` is NOT invoked,
And `tick` returns `{ invoked: false, reason: 'no-previous-task' }`.

[scenario=watcher-skips-on-no-agent]
Given no prior `captureAgent` call for the session,
When `tick` runs,
Then `ctx.compaction.compactNow` is NOT invoked,
And `tick` returns `{ skipped: 'no-agent' }`.

[scenario=watcher-dedups-replays]
Given one `task/done` event the watcher has already processed,
When `tick` runs again,
Then `ctx.compaction.compactNow` is NOT invoked again,
And `tick` returns `{ skipped: 'already-processed' }`.

[scenario=watcher-fails-gracefully-on-compaction-error]
Given `ctx.compaction.compactNow` rejects with `Error('busy')`,
When `tick` runs,
Then the rejection is caught and logged at warn,
And `tick` returns `{ invoked: false, reason: 'dispatch-failed', error: 'busy' }`,
And the `task/done` event the CLI wrote remains in `session.jsonl`.

[scenario=cli-does-not-dispatch-but-host-does]
Given a CLI run of `design-blueprint todo mark T1 done --spec .specs/proposed/foo.md` writes a `task/done` event to `session.jsonl`,
When the CLI prints `Auto-compact: skipped (no DSH slash-command dispatch surface; manual /compact required).`,
And the host watcher is then ticked with the same `cwd` and `sessionId`,
Then the host watcher invokes `ctx.compaction.compactNow` if the predicate fires,
And the CLI's printed outcome line is unchanged.

## Assumptions

1. The resolved DSH version exposes `ctx.compaction.compactNow(agent, signal, commandId)` as a documented public API. `@deepseek-ai/dsh-command-compact` uses this API internally; the watcher uses the same API.
2. `invocation.agent` carried into the orchestrator's `/blueprint` handler is a `ManualCompactAgentContext` (i.e. carries `session`, `options`, `runMaintenance`). DSH's command-adapter layer is responsible for this; the watcher only forwards what the orchestrator stashes.
3. The chat handler's `dispatchCommand` runs at least once per DSH session that uses `/blueprint`. If a developer never types `/blueprint`, the auto-compact will not fire for that session — this Spec does not introduce a timer to compensate.
4. `session.jsonl` lives at `<cwd>/.dsh/sessions/<sessionId>/session.jsonl` when the DSH session directory exists, otherwise at `<cwd>/session.jsonl`. This matches `lib/todo-compact-trigger.js#locateSessionPath`.

## Non-goals

- Replacing `blueprint_dispatch` as the authoritative Spec lifecycle tool.
- Adding a new DSH slash command for the developer to invoke manually. The action is the existing `/compact` slash command, called programmatically.
- Adding a timer-driven background sweep. The watcher is chat-driven. A future Spec may add `ctx.interval(...)` for non-chat sessions.
- Mocking DSH. The watcher accepts a real `ctx`; the no-op path exists for non-DSH runs (CI / lint).
- Modifying `lib/todo-compact-trigger.js`. The pure function is the integration point and is unchanged.
- Modifying the CLI's outcome-line text. The existing six lines are kept verbatim.
- Revising `.specs/implemented/auto-compact-on-unrelated-task-done.md` other than the one-paragraph `## Consequences` follow-up.

## Alternatives considered

**Wire `ctx.inputTriggers.registerSource` as a slash-command dispatch surface.** Rejected. `ctx.inputTriggers` is the input-autocomplete registry (per `@deepseek-ai/dsh-client-ui-input-trigger/lib/types/client/contract.d.ts`); `registerSource` adds a candidate list, not a slash-command executor.

**Use `runSlashCommand` from `@deepseek-ai/dsh-client-ui-input-trigger`.** Rejected. The package's `apply()` is empty (`lib/index.js`) and `runSlashCommand` is not exported.

**Have the CLI subprocess invoke `/compact` by shelling out to DSH.** Rejected. The CLI is a stateless Node binary; it has no IPC channel to the parent DSH process. A shell-out would re-enter DSH through a side door and produce an in-process child agent, not the user's active session.

**Move the predicate into the orchestrator's `dispatchCommand` and call `compactNow` synchronously on every `/blueprint` invocation.** Rejected. The chat handler runs before the CLI subprocess writes the `task/done` event, so it cannot see the new event on the same turn. The watcher pattern handles the one-event latency cleanly.

**Add a `ctx.interval(...)` polling loop.** Rejected for this Spec because (a) it adds `inject: ['timer']`, which broadens the plugin's dependency surface, and (b) the chat-driven tick already covers every session that uses `/blueprint`. A future Spec may add the timer-driven variant for sessions that never invoke `/blueprint`.

**Bypass DSH and write a parallel route (e.g. a file-system trigger that DSH polls).** Rejected. The product contract is to use the same documented DSH API a human operator uses; a parallel route drifts.

## Tasks

1. Author `lib/auto-compact-watcher.js` (covers REQ-WATCHER-1..5). Scope: `lib/auto-compact-watcher.js`. AC: AC-WATCH-001..006.
2. Update `lib/orchestration.js` to accept `dependencies.watcher` (REQ-ORCH-1..2). Scope: `lib/orchestration.js`. AC: AC-ORCH-001..002.
3. Update `lib/index.js` `inject` and `apply(ctx)` to register the watcher (REQ-INDEX-1..3). Scope: `lib/index.js`. AC: AC-INDEX-001..003.
4. Author `tests/auto-compact-watcher.test.js`. AC: AC-WATCH-001..006.
5. Author `tests/orchestration-auto-compact.test.js`. AC: AC-ORCH-001..002.
6. Extend `tests/plugin.test.js`. AC: AC-INDEX-001..003.
7. Extend `tests/cli-todo.test.js` (REQ-CLI-1). AC: AC-CLI-006.
8. Update user docs and run `docs confirm` (REQ-DOCS-1). AC: AC-DOCS-003.
9. Append `## Consequences` follow-up (REQ-PARENT-1). AC: AC-PARENT-001.
10. Update Feature brief, `package.json#lint:js`. AC: AC-SCAN-002.
11. Run `docs check`, `scan`, full test suite. AC: AC-DOCS-003, AC-SCAN-002, AC-REGRESSION-002.

## Lifecycle

- Status: proposed
- Target status after approval: implemented (file moves to `.specs/implemented/auto-compact-on-unrelated-task-done--dsh-dispatch-wired.md`)

## Truth-delta

New facts added:
- `lib/auto-compact-watcher.js` exists, exporting `createAutoCompactWatcher`.
- `lib/orchestration.js#createBlueprintOrchestrator` accepts `dependencies.watcher` and forwards `captureAgent` + `tick` from `dispatchCommand`.
- `lib/index.js#apply(ctx)` instantiates the watcher when `ctx.compaction.compactNow` is a function; falls back to a no-op watcher with a one-time `info` log otherwise.
- `tests/auto-compact-watcher.test.js` exists, covering six scenarios.
- `docs/user/features/auto-compact-on-unrelated-task-done.{md,zh.md}` no longer state the "manual /compact required" caveat.

Existing facts preserved:
- `lib/todo-compact-trigger.js#maybeAutoCompact` and `BYTE_THRESHOLD_BYTES = 200 * 1024` unchanged.
- `lib/cli.js#emitAutoCompact` keeps its six outcome lines and `dispatch: null`.
- All 252 existing host tests continue to pass; `node lib/cli.js scan --all --cwd .` and `node lib/cli.js docs check --cwd .` stay clean.

## Traceability

REQ-WATCHER-1..5 → scenarios in `## Scenarios` → task 1 → AC-WATCH-001..006 → tests/auto-compact-watcher.test.js
REQ-INDEX-1..3 → task 3 → AC-INDEX-001..003 → tests/plugin.test.js
REQ-ORCH-1..2 → task 2 → AC-ORCH-001..002 → tests/orchestration-auto-compact.test.js
REQ-CLI-1 → scenario[cli-does-not-dispatch-but-host-does] → task 7 → AC-CLI-006 → tests/cli-todo.test.js
REQ-DOCS-1 → task 8 → AC-DOCS-003 → user docs + docs check
REQ-PARENT-1 → task 9 → AC-PARENT-001 → inspection of .specs/implemented/auto-compact-on-unrelated-task-done.md

## Unresolved decisions

None. The four material questions are settled:
- The dispatcher lives on the host (CLI subprocess cannot call `ctx.compaction`).
- The dispatcher uses `ctx.compaction.compactNow(agent, signal, commandId)`, the same documented API `@deepseek-ai/dsh-command-compact` uses.
- The watcher's tick is chat-driven (called by the orchestrator on every `/blueprint` invocation), not timer-driven.
- Non-DSH runs (CI / lint) take a no-op watcher path with a one-time `info` log.

## Quality checklist (self-attested)

- requirements complete: yes (12 REQs covering watcher, orchestrator, plugin entry, CLI, docs, parent Spec follow-up)
- requirements unambiguous: yes (each REQ names the file and the contract)
- requirements bounded: yes (one Feature sub-spec; no new dependencies; no timer service)
- requirements failure-aware: yes (no-agent, no-prior-task, dispatch-failed all surface as outcomes)
- requirements testable: yes (each AC maps to a verification command or test)
- requirements non-contradictory: yes (no AC says both "fire" and "skip" for the same condition)

## Cross-artifact analysis

- requirements-to-scenarios: yes (all 12 REQs covered by 8 scenarios)
- requirements-to-impact: yes (all 12 REQs map to one or more files in ## Scope)
- requirements-to-tasks: yes (each task lists REQs)
- requirements-to-acceptance: yes (each AC names REQs)
- requirements-to-verification: yes (each AC names a verification command or test)
- tasks-to-scope: yes (each task names a Scope path)
- design-to-scope: not applicable (designRequired: false; the architecture fits in the Spec body and matches the existing Skills-loader pattern in `lib/index.js`)
- scope-to-paths: yes (every Scope path matches a real path)
