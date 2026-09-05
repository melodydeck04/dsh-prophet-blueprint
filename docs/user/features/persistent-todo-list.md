# Persistent TODO list

English | [中文](persistent-todo-list.zh.md)

## What it does

`@dsh-plugins/design-blueprint todo <list|show|mark>` manages a structured TODO list that lives next to a Spec as plain YAML. The YAML is the source of truth across sessions and compactions; every `mark done` writes a `task/done` event to `session.jsonl` so other tools (notably `@dsh-plugins/design-blueprint-diagnostics audit`) can find natural compact boundaries.

A Spec opts into the program by carrying a sibling `.specs/<feature>/<spec>.todos.yaml`. The file is hand-authored at first; later Specs may generate it from the refinement packet. The YAML schema is fixed at `version: 1` and validated by the CLI; any violation fails the operation rather than silently corrupting state.

## Expected result

After running the new commands, a developer can:

- `design-blueprint todo list --spec <spec.md>` — print a Markdown table of every TODO with `id`, `status`, `req`, `ac`, `title`.
- `design-blueprint todo show <id> --spec <spec.md>` — print one entry.
- `design-blueprint todo mark <id> done --spec <spec.md> --session-id <id>` — write the new status back to the YAML, set `doneAt` / `doneBy`, append one `task/status` event and one `task/done` event to `session.jsonl`.

The same YAML survives across sessions and `/compact` invocations because it is a file on disk. The runtime mirror is informational; the file is authoritative.

## How to use

Create the file once per participating Spec, then manage it with the CLI:

1. Author the first YAML by hand, for example:
   ```yaml
   version: 1
   spec: .specs/proposed/my-feature.md
   createdAt: 2026-09-02T15:00:00Z
   createdBy: session-abc
   todos:
     - id: T1
       status: pending
       req: REQ-MF-1
       ac: AC-MF-001
       title: implement the core (T1)
   ```
2. Mark progress:
   ```bash
   design-blueprint todo mark T1 in-progress --spec .specs/proposed/my-feature.md
   design-blueprint todo mark T1 done --spec .specs/proposed/my-feature.md --session-id $(cat .dsh/session-id)
   ```
3. Inspect:
   ```bash
   design-blueprint todo list --spec .specs/proposed/my-feature.md
   ```

The CLI refuses to transition a TODO to a status outside `{pending, in-progress, done}` and refuses to mark a TODO `done` twice (the second call is a no-op and emits no event). A failed validation lists every violation at once.

## Companion diagnostics

`@dsh-plugins/design-blueprint-diagnostics audit <session.jsonl>` reads `task/done` events and renders a `## Compact boundaries` section in its Markdown report. The section surfaces `totalMissedSavingsBytes` per session and a per-boundary table; see `docs/diagnostics/README.md` for the full surface.
