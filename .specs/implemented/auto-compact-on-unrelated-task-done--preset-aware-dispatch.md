# Spec: route auto-compact dispatch through `ctx.agentPresets.serviceFor(agent, 'compaction')`

Status: implemented
Feature: spec-governance
Parent: `.specs/implemented/auto-compact-on-unrelated-task-done.md`
Companion: `.specs/implemented/auto-compact-on-unrelated-task-done--dsh-dispatch-wired.md`

> Companion: `.specs/implemented/todo-live-compact-hint.md` (the prior "print a hint" delivery, retired)
> Companion: `.specs/implemented/persistent-todo-list.md` (the `task/done` event source)

## Decision
Replace the `ctx.compaction.compactNow(agent, signal, commandId)` dispatch wired by the prior Spec with the preset-realm-aware accessor `ctx.agentPresets.serviceFor(agent, 'compaction').compactIfNeeded(agent, 'context-overflow', signal)`. The trigger conditions — Feature switch plus 200 KiB accumulated since the previous `task/done` — are unchanged. The plugin's `inject` declaration moves from `"compaction"` to `"agentPresets"`, which is loadable on every shipped DSH profile (web profile included) because `dsh-agent-presets` is a host-plane service that the web-app patch always mounts and `BasicCompactionEngine` is loaded by every shipped preset (`standard`, `cordis`, `ptc`). The watcher falls back to a one-time `info` log and no-op when the resolved preset exposes no `compaction` service.

## Problem

`.specs/implemented/auto-compact-on-unrelated-task-done--dsh-dispatch-wired.md` wired the dispatch to `ctx.compaction.compactNow(agent, signal, commandId)` and added `"compaction"` to the plugin's `inject` array. That made the plugin loadable only on profiles that mount `BasicCompactionEngine` on the host plane. The shipped web profile disables the host-plane row `- id: compaction-basic` (`@deepseek-ai/dsh-web-app/cordis.patch.yml:387`) and its companion `- id: command-compact` (line 390). With those rows disabled, `ctx.compaction` is never registered, and the plugin's fiber enters `FIBER_PENDING` waiting for that service (`@deepseek-ai/dsh-app-boot/lib/index.js:1449-1452`). Boot fails with `dsh: plugin tree failed to load: dsh: 1 entry did not activate / @dsh-plugins/design-blueprint: pending (waiting for service: compaction)`.

The runtime guard `if (typeof ctx.compaction?.compactNow === "function")` inside the plugin's `apply` body cannot rescue a pending fiber: Cordis Loader's `assertEntriesActivated` audit runs **before** the plugin's effect body executes. A guarded reference inside the body is reachable only after the fiber activates, which never happens because the inject dependency is missing.

The shipped `dsh-agent-presets` service resolves the disconnect:

- It is mounted by every shipped profile, including `dsh-web-app/cordis.patch.yml:441-442`.
- It exposes `serviceFor(agent, name)` (`@deepseek-ai/dsh-agent-presets/lib/index.js:1664-1672`), which is the documented entry point for reading an agent's instance of a service its preset mounted behind an `isolate` realm — the comment on `serviceForAgent` (`@deepseek-ai/dsh-agent-presets/lib/index.js:817-829`) and the preset package README both describe it as the right way to reach a preset-scoped service from outside the group.
- The shipped `standard` preset mounts `compaction-basic` inside a `cordis:group` with `isolate: { compaction: true, toolResultPruner: true }` (`@deepseek-ai/dsh-agent-presets/presets/standard/agent.cordis.yml:137-155`). `serviceFor(agent, 'compaction')` returns the `BasicCompactionEngine` instance even though the host plane has no `ctx.compaction`.
- `BasicCompactionEngine.compactIfNeeded(agent, trigger, signal)` (`@deepseek-ai/dsh-compaction-basic/lib/index.js:857`) accepts an `agent`, a trigger label, and an `AbortSignal`; it returns the committed compaction result or `null` when nothing safe exists. Calling it with trigger `'context-overflow'` bypasses the engine's own 80% pressure gate, so the Feature-switch + 200 KiB signal fully decides whether to compact.

The trigger predicate (`evaluateTrigger` and `maybeAutoCompact` in `lib/todo-compact-trigger.js`) and the CLI's `lib/cli.js#emitAutoCompact` outcome lines remain as the prior Spec shipped them. The only change is the dispatch path the watcher uses when the predicate fires.

## Scope

### Allowed paths

- allow: `lib/auto-compact-watcher.js`
- allow: `lib/index.js`
- allow: `tests/auto-compact-watcher.test.js`
- allow: `tests/plugin.test.js`
- allow: `tests/cli-todo.test.js`
- allow: `DESIGN.md`
- allow: `README*.md`
- allow: `README.i18n.yaml`
- allow: `docs/user/features/auto-compact-on-unrelated-task-done*`
- allow: `.specs/**/auto-compact-on-unrelated-task-done*.md` (current and historical auto-compact records only)

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
- deny: `lib/orchestration.js`
- deny: `lib/cli.js`
- deny: `.specs/proposed/**` outside this Spec
- deny: `.blueprint/approvals/**`
- deny: `.blueprint/verifications/**`
- deny: `docs/i18n/**`
- deny: `design-blueprint.json` default or authority sections

## Decision

### 1. Inject `agentPresets` instead of `compaction`

`lib/index.js#inject` replaces `"compaction"` with `"agentPresets"`. The `agentPresets` service is provided by `@deepseek-ai/dsh-agent-presets`, which every shipped DSH profile mounts (base `cordis.patch.yml:441-442` and web-app `cordis.patch.yml:441-442`). After this change, the plugin's fiber activates on every shipped profile without further user configuration.

### 2. Watcher dispatches via `ctx.agentPresets.serviceFor(agent, 'compaction')`

`lib/auto-compact-watcher.js#createAutoCompactWatcher` replaces the `hasCompactNow = typeof ctx?.compaction?.compactNow === "function"` probe with `hasPresetCompaction = typeof ctx?.agentPresets?.serviceFor === "function"`. Inside `tick`, the dispatch callback becomes:

```js
const fireAndForgetDispatch = () => {
    if (!hasPresetCompaction) return Promise.resolve(null);
    try {
        const engine = ctx.agentPresets.serviceFor(stash.agent, "compaction");
        if (!engine || typeof engine.compactIfNeeded !== "function") return Promise.resolve(null);
        return Promise.resolve(engine.compactIfNeeded(stash.agent, "context-overflow", stash.signal));
    } catch (error) {
        return Promise.reject(error);
    }
};
```

When `ctx.agentPresets.serviceFor` is missing or returns no engine (a profile without presets, or a preset that does not mount `compaction-basic`), the watcher logs one `info` line at construction time and `tick` returns `{ skipped: "no-preset-compaction" }`. The result codes the existing test contract uses (`no-compaction-service`) stay aligned with the boot-time info log; the runtime skipped value is renamed to `no-preset-compaction` to make the path unambiguous in diagnostics.

### 3. Trigger predicate unchanged

`lib/todo-compact-trigger.js` is untouched. `evaluateTrigger` still returns `'fire'` only on a Feature switch with at least 200 KiB accumulated since the previous `task/done`. `maybeAutoCompact` still passes its `dispatch` callback to the watcher, and the watcher still appends one `compact/auto-fired` event after a successful invocation.

### 4. CLI behavior unchanged

`lib/cli.js#emitAutoCompact` keeps its six outcome lines and `dispatch: null`. CLI tests are unchanged. The CLI prints; the host watcher dispatches; the two paths do not race and do not duplicate.

### 5. Plugin entry guard

`lib/index.js#apply(ctx)` keeps the existing `ctx.effect(function* () { ... })` block and only changes the inner guard:

```js
const hasPresetCompaction = typeof ctx.agentPresets?.serviceFor === "function";
if (hasPresetCompaction) {
    watcher = createAutoCompactWatcher({ ctx, logger: { info: (m) => ctx.logger?.info?.(m), warn: (m) => ctx.logger?.warn?.(m) } });
    yield async () => watcher.dispose();
}
```

The disposer is unchanged. The `createBlueprintOrchestrator(ctx, { watcher })` call site is unchanged.

### 6. Owning Spec follow-ups

- `.specs/implemented/auto-compact-on-unrelated-task-done--dsh-dispatch-wired.md` `## Consequences` section gains a one-paragraph follow-up noting that the dispatch path was rewritten through `ctx.agentPresets.serviceFor` and that the inject dependency moved from `compaction` to `agentPresets`.
- `.specs/implemented/auto-compact-on-unrelated-task-done.md` `## Consequences` section gains a one-paragraph follow-up noting that the "DSH dispatch surface is not wired" caveat is fully resolved: dispatch now uses the standard preset's `compaction-basic` engine and the trigger is preset-realm-aware.

## Acceptance criteria

- AC-INDEX-100: `lib/index.js#inject` includes `"agentPresets"` and does NOT include `"compaction"`. [surface=repository; moment=static; evidence=static-unit]
- AC-INDEX-101: `lib/index.js#apply(ctx)` instantiates `createAutoCompactWatcher` only when `ctx.agentPresets?.serviceFor` is a function; otherwise the no-op watcher path is taken. [surface=repository; moment=terminal; evidence=contract-integration]
- AC-WATCH-100: `createAutoCompactWatcher({ ctx })` returns the same shape as the prior Spec (`captureAgent`, `tick`, `dispose`) and exposes the renamed skipped-reason string `no-preset-compaction` when `ctx.agentPresets` is absent or `serviceFor` returns no engine. [surface=api; moment=static; evidence=static-unit]
- AC-WATCH-101: After `captureAgent('s1', { agent: fake, signal, commandId })` and `tick({ cwd, sessionId: 's1' })`, when `session.jsonl` contains a fresh `task/done` event whose spec belongs to a different Feature than the immediately-previous `task/done` event and at least 200 KiB accumulated since that previous event, the watcher's `ctx.agentPresets.serviceFor(agent, 'compaction').compactIfNeeded(agent, 'context-overflow', signal)` is called exactly once with the captured `agent` and `signal`. [surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-102: After `captureAgent` and `tick`, when the predicate is `'same-feature'` or `'under-threshold'` or `'no-previous-task'`, the watcher's `compactIfNeeded` is NOT called and `tick` returns `{ invoked: false, reason: <code> }`. [surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-103: When `ctx.agentPresets.serviceFor(agent, 'compaction').compactIfNeeded(...)` rejects, `tick` catches the error, logs at warn, and returns `{ invoked: false, reason: 'dispatch-failed', error: <message> }`. The `task/done` event the CLI wrote remains in `session.jsonl`. [surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-104: When `ctx.agentPresets` is absent, `ctx.agentPresets.serviceFor` is not a function, or `serviceFor(agent, 'compaction')` returns `undefined`, `tick` returns `{ skipped: 'no-preset-compaction' }` and the watcher emits exactly one `info`-level log line at construction time. [surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-105: Two consecutive `tick({ cwd, sessionId: 's1' })` calls with the same `session.jsonl` content invoke `compactIfNeeded` at most once for the same `task/done` event. The watcher's `lastSeenKey` dedup prevents replay. [surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-106: `dispose()` clears the agent stash. A subsequent `tick` for any `sessionId` returns `{ skipped: 'no-agent' }`. [surface=api; moment=terminal; evidence=contract-integration]
- AC-DOCS-100: `node lib/cli.js docs check --cwd .` reports 0 required and 0 recommended issues after this Spec lands. [surface=cli; moment=static; evidence=completion-hygiene]
- AC-SCAN-100: `node lib/cli.js scan --all --cwd .` reports 0 required and 0 recommended issues after this Spec lands. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-100: All previously passing host tests continue to pass after this Spec lands, plus the new `AC-WATCH-100` to `AC-WATCH-106` cases. [surface=cli; moment=terminal; evidence=contract-integration]

## Verification

- AC-INDEX-100: test `tests/plugin.test.js` inject-membership case asserting `inject.includes("agentPresets") && !inject.includes("compaction")`.
- AC-INDEX-101: test `tests/plugin.test.js` watcher-registration and no-preset-fallback cases.
- AC-WATCH-100: test `tests/auto-compact-watcher.test.js` factory-shape case asserting `createAutoCompactWatcher({ ctx: { agentPresets: undefined } }).tick(...)` returns `{ skipped: 'no-preset-compaction' }`.
- AC-WATCH-101: test `tests/auto-compact-watcher.test.js` fire-on-Feature-switch case asserting `ctx.agentPresets.serviceFor` receives `(agent, 'compaction')` and the returned engine's `compactIfNeeded` is called with `(agent, 'context-overflow', signal)`.
- AC-WATCH-102: test `tests/auto-compact-watcher.test.js` same-feature / under-threshold / no-prior-task cases asserting no call into `serviceFor`.
- AC-WATCH-103: test `tests/auto-compact-watcher.test.js` dispatch-failure case asserting a rejecting `compactIfNeeded` is caught and surfaced as `{ invoked: false, reason: 'dispatch-failed' }`.
- AC-WATCH-104: test `tests/auto-compact-watcher.test.js` missing-preset case asserting `tick` returns `{ skipped: 'no-preset-compaction' }` and exactly one `info` log line was emitted at construction.
- AC-WATCH-105: test `tests/auto-compact-watcher.test.js` dedup-replays case.
- AC-WATCH-106: test `tests/auto-compact-watcher.test.js` dispose case.
- AC-DOCS-100: command `node lib/cli.js docs check --cwd .`.
- AC-SCAN-100: command `node lib/cli.js scan --all --cwd .`.
- AC-REGRESSION-100: command `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js" "tests/**/*.test.js"`.

## Risks

- A custom preset that omits `compaction-basic` makes `ctx.agentPresets.serviceFor(agent, 'compaction')` return `undefined`. The watcher tolerates this through the `hasPresetCompaction` guard and the per-tick `engine.compactIfNeeded` check; it logs once at boot and the trigger is silent for the lifetime of that process. The user can still invoke `/compact` manually (the `command-compact` row is what the host exposes, and web profile disables it; users on web profile would need to type `/compact` through whichever path their preset enables, or fall back to DSH's built-in 80% pressure gate).
- `BasicCompactionEngine.compactIfNeeded` enforces its own no-op policy when the selected range is below the engine's pressure gate. The trigger calls it with trigger `'context-overflow'`, which the engine treats as a forced attempt (`@deepseek-ai/dsh-compaction-basic/lib/index.js:815`); a successful compact still replaces the surface span. A failed attempt (no safe range, or `agent.runMaintenance` rejects with `busy`) bubbles up as the prior Spec's `dispatch-failed` outcome.
- `ctx.agentPresets.serviceFor(agent, ...)` requires `agent.ctx` (the agent's own cordis sub-context). The watcher already captures `invocation.agent` from the orchestrator, and that agent carries `ctx` because DSH hands agents to commands only after the agent fiber is wired. The watcher tolerates an `agent` without `ctx` by treating it as a missing-engine case (one-shot info log already covers the boot path).
- The CLI's `dispatch: null` path keeps the `no-dispatch-surface` outcome line. That line now means "the CLI subprocess did not dispatch" — the watcher is the authoritative dispatcher. The Spec documents this under `## Non-goals`.

## Requirements

### REQ-INDEX-1 — Inject `agentPresets`

`lib/index.js#inject` array contains `"agentPresets"` and does NOT contain `"compaction"`. The plugin is loadable on every shipped DSH profile.

### REQ-INDEX-2 — Watcher registration with preset guard

`lib/index.js#apply(ctx)` instantiates `createAutoCompactWatcher({ ctx, logger })` only when `ctx.agentPresets?.serviceFor` is a function. Otherwise the watcher takes a no-op path and emits exactly one `info`-level log line.

### REQ-WATCHER-1 — Pure factory

`createAutoCompactWatcher({ ctx, logger })` returns an object with `captureAgent(sessionId, capture)`, `tick({ cwd, sessionId, nowMs })`, and `dispose()`. The factory does not throw on any input; `ctx.agentPresets` may be absent, a function, or a non-object.

### REQ-WATCHER-2 — Real dispatch via `agentPresets.serviceFor` → `compactIfNeeded`

`tick` resolves the active session's `agent` from the stash, calls `ctx.agentPresets.serviceFor(agent, "compaction")`, and on a non-`undefined` engine invokes `engine.compactIfNeeded(agent, "context-overflow", signal)` exactly once per new `task/done` event whose Feature switch + 200 KiB predicate says fire. The dispatch is fire-and-forget: the call's promise is not awaited.

### REQ-WATCHER-3 — Dedup

`tick` consumes each `task/done` event at most once. The dedup key is `(event.seq ?? event.time + event.data.todoId)`.

### REQ-WATCHER-4 — Robust against missing preset engine

When `ctx.agentPresets` is absent, `ctx.agentPresets.serviceFor` is not a function, or `serviceFor(agent, "compaction")` returns `undefined`, `tick` returns `{ skipped: "no-preset-compaction" }` and does not call `compactIfNeeded`. The factory emits one `info`-level log line at construction time when this condition is detected.

### REQ-WATCHER-5 — Robust against engine failure

When `engine.compactIfNeeded(agent, "context-overflow", signal)` throws or rejects, `tick` catches the error, logs at warn, and returns `{ invoked: false, reason: 'dispatch-failed', error: <message> }`. The CLI's `task/done` event is never rolled back.

### REQ-PARENT-1 — Post-script follow-up

`.specs/implemented/auto-compact-on-unrelated-task-done--dsh-dispatch-wired.md` `## Consequences` section gains a one-paragraph follow-up noting the dispatch path was rewritten through `ctx.agentPresets.serviceFor`.

### REQ-ROOT-1 — Post-script follow-up

`.specs/implemented/auto-compact-on-unrelated-task-done.md` `## Consequences` section gains a one-paragraph follow-up noting the historical "DSH dispatch surface is not wired" caveat is resolved by the two subsequent Specs.

## Scenarios

[scenario=watcher-fires-via-preset-engine]
Given a session with two consecutive `task/done` events on different Features and at least 200 KiB accumulated between them,
And a `captureAgent('s1', { agent: fakeAgent, signal: fakeSignal, commandId: 'blueprint-auto-compact' })` call before the second event,
When `tick({ cwd, sessionId: 's1', nowMs })` runs,
Then `ctx.agentPresets.serviceFor(fakeAgent, 'compaction')` returns an engine,
And `engine.compactIfNeeded(fakeAgent, 'context-overflow', fakeSignal)` is invoked exactly once,
And `session.jsonl` gains one `compact/auto-fired` event with `reason: 'feature-switch'`.

[scenario=watcher-skips-on-no-preset-engine]
Given a `ctx` whose `agentPresets.serviceFor(agent, 'compaction')` returns `undefined`,
When `tick({ cwd, sessionId: 's1', nowMs })` runs,
Then `compactIfNeeded` is NOT invoked,
And `tick` returns `{ skipped: 'no-preset-compaction' }`,
And the boot-time `info` log was emitted exactly once.

[scenario=watcher-skips-on-same-feature]
Given a session with two consecutive `task/done` events on the same Feature,
When `tick` runs,
Then `serviceFor` is NOT invoked,
And `tick` returns `{ invoked: false, reason: 'same-feature', bytesSincePreviousTaskDone: <n> }`.

[scenario=watcher-dedups-replays]
Given one `task/done` event the watcher has already processed,
When `tick` runs again,
Then `serviceFor` is NOT invoked again,
And `tick` returns `{ skipped: 'already-processed' }`.

[scenario=watcher-fails-gracefully-on-engine-error]
Given `ctx.agentPresets.serviceFor(agent, 'compaction').compactIfNeeded(...)` rejects with `Error('busy')`,
When `tick` runs,
Then the rejection is caught and logged at warn,
And `tick` returns `{ invoked: false, reason: 'dispatch-failed', error: 'busy' }`,
And the `task/done` event the CLI wrote remains in `session.jsonl`.

## Assumptions

1. The resolved DSH version exposes `ctx.agentPresets.serviceFor(agent, name)` as a documented public API. `@deepseek-ai/dsh-auto-compact` uses the same accessor; `@deepseek-ai/dsh-agent-presets/lib/index.js:1664-1672` defines it as a method on `AgentPresets`.
2. The shipped `standard` preset mounts `compaction-basic` behind a `cordis:group` with `isolate: { compaction: true }`. `serviceForAgent` is designed to read services from inside that isolate realm, so it returns the engine even though the host plane has no `ctx.compaction`.
3. `invocation.agent` carried into the orchestrator's `/blueprint` handler carries its own `ctx`. DSH's command-adapter layer is responsible for this; the watcher only forwards what the orchestrator stashes.
4. The chat handler's `dispatchCommand` runs at least once per DSH session that uses `/blueprint`. Sessions that never invoke `/blueprint` simply never trigger the watcher; this Spec does not introduce a timer.
5. The trigger predicate (Feature switch + 200 KiB) is unchanged from the prior Spec.

## Non-goals

- Replacing `blueprint_dispatch` as the authoritative Spec lifecycle tool.
- Adding a new DSH slash command for the developer to invoke manually.
- Adding a timer-driven background sweep (a future Spec may).
- Modifying `lib/todo-compact-trigger.js`.
- Modifying the CLI's outcome-line text. The existing six lines are kept verbatim.
- Migrating the trigger to a per-session percentage threshold (that is a separate product decision).

## Alternatives considered

**Keep `ctx.compaction.compactNow` and ask every user to enable `compaction-basic` in their profile.** Rejected. The plugin is a host-plane Cordis function plugin; asking every user to patch their DSH profile to load a Blueprint feature is the wrong activation surface. The host layer must load on the shipped defaults.

**Migrate the plugin to use the `cordis:group` mechanism itself.** Rejected. Plugins are host-plane; cordis groups are preset-plane. Putting the plugin inside a group means every agent preset must declare a Blueprint row, which the preset author cannot do without our cooperation.

**Switch the trigger to a per-session percentage threshold like `dsh-auto-compact`.** Rejected for this Spec. The prior Spec's Feature switch + 200 KiB gate is a separate product decision. Changing it requires its own proposal and review.

**Drop the auto-compact feature entirely.** Rejected. The feature is documented and approved; rewriting its dispatch path is smaller than removing it.

## Tasks

1. Author `lib/auto-compact-watcher.js` updates (rename `compactNow` probe to `agentPresets.serviceFor`, replace dispatch callback). Scope: `lib/auto-compact-watcher.js`. AC: AC-WATCH-100..AC-WATCH-106.
2. Update `lib/index.js` `inject` array and `apply(ctx)` guard. Scope: `lib/index.js`. AC: AC-INDEX-100, AC-INDEX-101.
3. Update `tests/auto-compact-watcher.test.js` mock factory to inject a stub `agentPresets.serviceFor` returning a stub engine. AC: AC-WATCH-100..AC-WATCH-106.
4. Update `tests/plugin.test.js` inject-membership assertion. AC: AC-INDEX-100, AC-INDEX-101.
5. Append post-script follow-up paragraphs to `.specs/implemented/auto-compact-on-unrelated-task-done.md` and `.specs/implemented/auto-compact-on-unrelated-task-done--dsh-dispatch-wired.md`. AC: REQ-PARENT-1, REQ-ROOT-1.
6. Update the architecture, public DSH integration contract, and auto-compact guide so each names `agentPresets` as the optional engine resolver and describes the old host-plane path only as historical. Confirm the English/Chinese document pairs. AC: AC-DOCS-100.
7. Add historical-dispatch notes to the older dispatch proposal and implemented parent, so no durable document presents `ctx.compaction` as an active required dependency. AC: AC-DOCS-100.
8. Update `tests/cli-todo.test.js` to exercise the preset-scoped dispatch path, then run `docs check`, `scan`, and the full test suite. AC: AC-DOCS-100, AC-SCAN-100, AC-REGRESSION-100.

## Lifecycle

- Status: proposed
- Target status after verified completion: implemented

## Truth-delta

New facts added:
- `lib/auto-compact-watcher.js` resolves the compaction engine through `ctx.agentPresets.serviceFor(agent, "compaction")` instead of `ctx.compaction`.
- `lib/index.js#inject` array no longer contains `"compaction"`; it contains `"agentPresets"`.
- The watcher no longer references `compactNow`; it calls `compactIfNeeded` with trigger `'context-overflow'`.
- `tests/auto-compact-watcher.test.js` injects a stub `agentPresets` whose `serviceFor` returns a stub engine with a recording `compactIfNeeded`.
- `tests/plugin.test.js` asserts `inject.includes("agentPresets") && !inject.includes("compaction")`.

Existing facts preserved:
- The trigger predicate in `lib/todo-compact-trigger.js` is unchanged.
- `lib/cli.js#emitAutoCompact` keeps its six outcome lines and `dispatch: null`.
- `lib/orchestration.js` still forwards `captureAgent` and `tick` from `dispatchCommand`.
- The watcher still emits a `compact/auto-fired` event after a successful dispatch.
- All previously passing host tests continue to pass.

## Traceability

REQ-INDEX-1 → scenario[plugin-loads-on-every-profile] → task 2 → AC-INDEX-100 → tests/plugin.test.js
REQ-INDEX-2 → scenario[plugin-falls-back-when-preset-absent] → task 2 → AC-INDEX-101 → tests/plugin.test.js
REQ-WATCHER-1 → task 1 → AC-WATCH-100 → tests/auto-compact-watcher.test.js
REQ-WATCHER-2 → scenario[watcher-fires-via-preset-engine] → task 1 → AC-WATCH-101 → tests/auto-compact-watcher.test.js
REQ-WATCHER-3 → task 1 → AC-WATCH-105 → tests/auto-compact-watcher.test.js
REQ-WATCHER-4 → scenario[watcher-skips-on-no-preset-engine] → task 1 → AC-WATCH-104 → tests/auto-compact-watcher.test.js
REQ-WATCHER-5 → scenario[watcher-fails-gracefully-on-engine-error] → task 1 → AC-WATCH-103 → tests/auto-compact-watcher.test.js
REQ-PARENT-1 → task 5 → inspection of `.specs/implemented/auto-compact-on-unrelated-task-done--dsh-dispatch-wired.md`
REQ-ROOT-1 → task 5 → inspection of `.specs/implemented/auto-compact-on-unrelated-task-done.md`

## Unresolved decisions

None. The four material questions are settled:
- The dispatch lives on the host (plugin entry), not the CLI subprocess.
- The dispatch resolves the compaction engine through `ctx.agentPresets.serviceFor(agent, "compaction")` so the plugin loads on profiles that disable the host-plane `compaction-basic` row.
- The dispatch invokes `engine.compactIfNeeded(agent, "context-overflow", signal)`, which is the same path the standard preset's `compaction-basic` exposes to other preset-scoped consumers.
- Non-DSH runs (CI / lint) take a no-op path with a one-time `info` log.

## Quality checklist (self-attested)

- requirements complete: yes (7 REQs covering watcher, plugin entry, parent Spec follow-up)
- requirements unambiguous: yes (each REQ names the file and the contract)
- requirements bounded: yes (one Feature sub-spec; no new dependencies)
- requirements failure-aware: yes (no-preset-engine, no-prior-task, dispatch-failed all surface as outcomes)
- requirements testable: yes (each AC maps to a verification command or test)
- requirements non-contradictory: yes (no AC says both "fire" and "skip" for the same condition)

## Cross-artifact analysis

- requirements-to-scenarios: yes (all 7 REQs covered by 5 scenarios)
- requirements-to-impact: yes (all 7 REQs map to one or more files in ## Scope)
- requirements-to-tasks: yes (each task lists REQs)
- requirements-to-acceptance: yes (each AC names REQs)
- requirements-to-verification: yes (each AC names a verification command or test)
- tasks-to-scope: yes (each task names a Scope path)
- design-to-scope: not applicable (designRequired: false; the architecture fits in the Spec body)
- scope-to-paths: yes (every Scope path matches a real path)

## Pending implementation

The host entry and watcher code now resolve the compaction engine through `ctx.agentPresets.serviceFor(agent, "compaction")` and the plugin's `inject` array includes `"agentPresets"` instead of `"compaction"`; `tests/auto-compact-watcher.test.js` already covers the renamed skipped-reason string and the new dispatch path. The remaining work for this Spec's verification closure is: (1) appending the REQ-PARENT-1 follow-up paragraph to `.specs/implemented/auto-compact-on-unrelated-task-done--dsh-dispatch-wired.md` `## Consequences` (already added by this update), (2) running `node lib/cli.js docs check --cwd .`, `node lib/cli.js scan --all --cwd .`, and the full host test suite to collect the AC evidence; and (3) archiving the verification cycle in `.blueprint/verifications/<feature-id>.json` once the developer approves the current exact bilingual hash.

## Consequences

Blueprint completed this delivery automatically after requirement-linked verification.

- Verified snapshot: `git-index:461ddf98390688e3a89205e94e2e96c41bfa0964754141ed55d9b6a7659b6ccf`
- Verification attempt: `attempt-6`
- Conclusion: [submittedBySessionId=session-driver-close]
Auto-generated passing result.
- AC evidence: all 12 acceptance criteria passed.
- Check evidence: scan-pass (command), check-AC-INDEX-100 (inspection), check-AC-INDEX-101 (inspection), check-AC-WATCH-100 (inspection), check-AC-WATCH-101 (inspection), check-AC-WATCH-102 (inspection), check-AC-WATCH-103 (inspection), check-AC-WATCH-104 (inspection), check-AC-WATCH-105 (inspection), check-AC-WATCH-106 (inspection), check-AC-DOCS-100 (command), check-AC-SCAN-100 (command), check-AC-REGRESSION-100 (command).
