# Auto-compact on Feature switch

English | [中文](auto-compact-on-unrelated-task-done.zh.md)

## What it does

The framework dispatches DSH's `/compact` slash command on the developer's behalf at Feature-level boundaries. When `design-blueprint todo mark <id> --spec <path> done` writes a `task/done` event whose `data.spec` belongs to a different Feature than the immediately previous `task/done` event, and at least 200 KiB of conversation has accumulated since that previous `task/done`, the framework fires DSH's `/compact` once and writes one `compact/auto-fired` event to `session.jsonl` for diagnostics attribution.

The 200 KiB byte floor implicitly rate-limits the trigger. A successful compact summarises the conversation and drops the byte count, so the next auto-compact requires another 200 KiB to accumulate, which is the natural minimum cost worth paying.

The dispatch is fire-and-forget. The CLI subprocess writes the `task/done` event to `session.jsonl`; a host-side watcher (`lib/auto-compact-watcher.js`) installed by the plugin's Cordis entry observes the new event on the next `/blueprint` invocation, evaluates the trigger, resolves the active Agent's optional compaction engine through `ctx.agentPresets.serviceFor(agent, "compaction")`, and calls `engine.compactIfNeeded(agent, "context-overflow", signal)`. The chat handler does not block on the compact.

## When to reach for it

You work on multiple Features in a single DSH session and want the context window to reset when you cross a Feature boundary, without typing `/compact` manually each time.

The trigger is event-driven (`task/done`); there is no periodic background sweep and no compact on idle. The watcher's tick is chat-driven: it runs once per `/blueprint` invocation, picking up events the CLI wrote earlier in the same session.

## Common questions

**Why not on every `task/done`?** A first-cut refinement proposed triggering on any `task/done` whose `data.req` / `data.ac` did not overlap with the active Feature's REQ/AC set. That signal is too fine-grained: a session that touches four sub-tasks across two Features would auto-compact four to six times, which is the opposite of helpful. The Feature-level signal fires once per boundary, not once per sub-task.

**Why a 200 KiB floor?** A developer who toggles a single line of off-Feature documentation and marks it done should not trigger a heavy summarise-and-replace operation. 200 KiB is the minimum cost worth paying.

**Why no cooldown?** The 200 KiB byte floor implicitly rate-limits the trigger. After a successful compact the byte count resets to near zero; the next auto-compact requires another 200 KiB to accumulate.

**What if the prior `task/done` is missing or has no `data.spec`?** The trigger is a no-op. The framework never invents a Feature from absent data.

**How is compacting actually invoked?** The plugin's host-side watcher resolves the active Agent preset's optional `compaction` engine and calls `compactIfNeeded(agent, "context-overflow", signal)`. It does not require a host-level `/compact` command or host-plane `compaction` service.

**What if my Agent preset has no compaction engine?** The watcher logs one `info` message and skips auto-compact. The CLI still records the `task/done` event and prints its local dispatch outcome; no plugin startup dependency or DSH upgrade is required.

## It's working if

- `design-blueprint todo mark <id> --spec <path> done` on a Feature switch with > 200 KiB accumulated prints its local dispatch outcome, and the next `/blueprint ...` invocation triggers the host-side watcher, which resolves the active session's preset compaction engine.
- The same CLI command on the same Spec prints `Auto-compact: skipped (same feature as previous: <featureId>).`.
- The same CLI command on a Feature switch with < 200 KiB accumulated prints `Auto-compact: skipped (under threshold: <n> bytes < 200 KiB).`.
- The first `task/done` in a fresh `session.jsonl` prints `Auto-compact: skipped (no previous task).`.
- After a successful fire, DSH's `/compact` slash command resolves the same way it does when typed manually — the context window shortens, a `compaction/start` and `compaction/end` event pair land in `session.jsonl`, and the framework's `compact/auto-fired` event is appended right after the `compaction/end` event with `previousFeatureId` / `currentFeatureId` / `bytesSincePreviousTaskDone`.
- A `compact/auto-fired` event appears in `session.jsonl` after a successful fire, with `{ reason: "feature-switch", previousFeatureId, currentFeatureId, bytesSincePreviousTaskDone }`.
- The dispatch failure path prints `Auto-compact: failed (<message>).` to stdout and the `task/done` event remains in `session.jsonl`.
- The legacy `Compaction hint: <n> MiB accumulated ...` line is no longer emitted by `todo mark done`.
