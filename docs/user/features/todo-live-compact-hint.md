# Live compact reminder at TODO completion

English | [中文](todo-live-compact-hint.zh.md)

## What it does

`design-blueprint todo mark <id> done --spec <spec.md>` now prints a one-line reminder immediately after writing the `task/done` event, telling the developer how many bytes have accumulated since the previous `task/done` (or since the session start). When the byte total crosses the same thresholds the diagnostics package uses, the line suggests `/compact`.

A second subcommand, `design-blueprint todo status --spec <spec.md>`, reads `session.jsonl` to surface the recent `task/done` events, the byte delta, and a verdict emoji aligned with `compact-boundaries-missed`.

## Expected result

- `design-blueprint todo mark T1 done --spec .specs/proposed/foo.md` writes the `task/done` event and prints `Compaction hint: <X> MiB accumulated since last task/done. Type /compact before continuing.` when the byte total exceeds 1 MiB.
- A 4 MiB byte total triggers the same line plus ` 🟡 Compact now.`
- A sub-threshold byte total produces no reminder line.
- A missing `session.jsonl` prints `Compaction hint: skipped (no session.jsonl at <path>).` on stderr.
- `design-blueprint todo status --spec <spec.md>` prints:
  ```
  Spec: .specs/proposed/foo.md
  Counts: pending=0 in-progress=1 done=0
  Recent task/done events:
    - T3 AC-FOO-3 @ 2026-... Author foo
    - T2 AC-FOO-2 @ 2026-... Wire foo
  Segment bytes since prior task/done: 412.00 KiB 🟢 (green)
  ```
- `todo status --json` returns the same data as a JSON object.

## How to use

1. Mark a task done and watch the reminder:
   ```bash
   design-blueprint todo mark T1 done --spec .specs/proposed/foo.md
   ```
2. Probe the byte delta at any time:
   ```bash
   design-blueprint todo status --spec .specs/proposed/foo.md
   ```
3. Pipe the JSON output into a watcher:
   ```bash
   design-blueprint todo status --spec .specs/proposed/foo.md --json | jq -r .verdict
   ```

## Companion

This Spec depends on Phase 1's persistent TODO list (`lib/todo-store.js` and `lib/todo-events.js`) and on the diagnostics package's `compact-boundaries-missed` thresholds (`blueprint-diagnostics/lib/thresholds.js`). It is the live sibling of the diagnostics `## Compact boundaries` section: the section tells you after the fact, this Spec tells you **before** the next byte lands.