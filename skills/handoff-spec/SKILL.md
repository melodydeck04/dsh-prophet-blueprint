---
name: handoff-spec
description: Write a portable Markdown summary of the current Spec lifecycle state to the OS temp directory so a fresh agent can resume. Use when the user types `/handoff-spec` or asks for a handoff document.
user-invocable: true
---

# handoff-spec

Render a portable Markdown summary of the referenced Spec's lifecycle state to the OS temp directory. The summary is a self-contained document that a fresh agent (or human reviewer) can read to pick up where the current session left off. Do not write to the Spec itself or to the project's `.blueprint/` tree.

Steps:

1. Resolve the Spec path from the user message.
2. Call `writeHandoffDoc({ specPath })` from `lib/skills/backing-modules.js#writeHandoffDoc`. The function:
   - Reads the Spec via `lib/specs.js#loadSpecs`.
   - Resolves the segment path via `lib/todo-events.js#locateSessionPath` (handles the sandbox case by routing to `.blueprint-test-tmp`).
   - Writes `<tmpdir>/blueprint-handoff-<basename>-<iso>.md`. The filename is deterministic: same Spec, same day, same name.
   - The Markdown body contains: the REQ list, the AC list with one line per AC, the current `Status:`, the verification stage if any, the active TODO id if any, and the segment path if available.
3. Return the absolute path of the written file plus a one-line summary. The summary is the first heading of the file's contents.
4. If the Spec is not in `proposed/` or `implemented/`, refuse to write and explain the path mismatch.

Notes:

- The skill is read-mostly: it reads the Spec and writes one new file in `os.tmpdir()`. It does not modify the Spec, the approval record, or the verification record.
- The handoff file is portable. A consumer can `cat` it in a fresh session and resume without prior context.
- If `os.tmpdir()` is denied (sandbox case), `lib/todo-events.js#locateSessionPath` returns a writable path under `.blueprint-test-tmp`. The handoff still works; the path is reported verbatim.