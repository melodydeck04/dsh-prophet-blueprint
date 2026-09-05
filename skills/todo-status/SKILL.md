---
name: todo-status
description: Return the current TODO list and verdict for a Spec without writing anything. Use when the user asks about Spec progress, mentions 'where are we?', 'what's done', 'TODO list', or asks how many AC pass for a Spec.
---

# todo-status

Read the referenced Spec's `.todos.yaml` sibling and the recent `task/done` events from the active session. Return a Markdown table of TODO entries plus a one-line verdict. Do not write to disk.

Steps:

1. Resolve the Spec path from the user message.
2. Call `todoStatus({ specPath, sessionPath })` from `lib/skills/backing-modules.js#todoStatus`. The function loads the YAML via `lib/spec-todos.js#loadTodosForSpec` and the events via `lib/todo-events.js#recentTaskDoneEvents(sessionPath, { limit: 5 })`.
3. Return the result as a Markdown table with columns `id`, `status`, `req`, `ac`, `title`. After the table, print `verdict: <text>`.
4. If the Spec has no `.todos.yaml` sibling yet, return `(no TODO list yet for this Spec)` and explain that the user can run `design-blueprint todo mark T1 done` once they have one.
5. If `sessionPath` is not provided, attempt to resolve it via `lib/todo-events.js#locateSessionPath()`. If that returns `null`, return the table without recent events and explain the omission.

Notes:

- Read-only. Never write to `.todos.yaml` or `session.jsonl`.
- The verdict text is a one-sentence summary (e.g., "3 of 5 ACs done, in-progress on T4"). Keep it under 120 characters.
- If the Spec is not in `proposed/` or `implemented/`, surface the path mismatch as a `verdict: <path not found>`.