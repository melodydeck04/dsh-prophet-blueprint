# `handoff-spec`

English | [中文](handoff-spec.zh.md)

Write a portable Markdown summary of the current Spec lifecycle state so a fresh agent can resume. Writes one file.

## What it does

Renders a portable Markdown handoff document for the referenced Spec path and writes it to `os.tmpdir()` (or to `.blueprint-test-tmp` when the runtime resolves to a hardened filesystem). The Skill calls `writeHandoffDoc` from `lib/skills/backing-modules.js#writeHandoffDoc`. The output is one Markdown file that captures: the Spec's current `Status`, lifecycle stage, REQ list, Scope summary, AC table, latest attempt summary from `.blueprint/verifications/<feature-id>.json` (if any), and the next-action recommendation. A fresh agent can read the file and resume without needing the prior conversation history.

## When to reach for it

- The model is about to compact the conversation, end the session, or hand off to a fresh agent and wants a portable snapshot of the Spec's lifecycle state.
- The user types `/handoff-spec` followed by a Spec path.
- The user asks "write me a handoff", "give me something I can paste into a new agent", "I want a snapshot I can resume from".
- The session is about to compact or end and the user wants the next agent to pick up cleanly.

## Common questions

**Is this Skill model-invocable?** Yes. The Skill carries no `disable-model-invocation` flag, so the runtime catalog exposes it to the model. The DSH agent may fire it on its own when its task fits (for example, before recommending a session compact). The Skill is also user-invocable: the human can type `/handoff-spec` directly.

**Where does the file go?** `os.tmpdir()` under a stable filename: `<spec-basename>-handoff-<timestamp>.md`. The Skill body tells the model to print the absolute path so the user can copy it.

**Can the path be denied?** On hardened systems, `os.tmpdir()` may be read-only. The Skill routes to `.blueprint-test-tmp` via `lib/todo-events.js#locateSessionPath`, which already handles the sandbox case. The user sees the actual path either way.

**Does the handoff include the implementation?** No. The handoff covers the Spec lifecycle state only. Implementation files (`lib/`, `tests/`, etc.) live in the working tree and are not duplicated into the handoff. The handoff lists the Spec's Scope so a fresh agent knows where to look.

**Does the handoff replace the Spec?** No. The handoff is a snapshot, not a source of truth. The Spec at `.specs/proposed/<name>.md` (or `.specs/implemented/<name>.md`) remains the canonical artifact. The handoff's contents may lag if the Spec is edited after the handoff is written; re-run the Skill to refresh.

**Is the handoff auditable?** The handoff file is plain Markdown. The user can `cat` it, diff it, or `git add` it. It is not, by itself, part of the source tree; the runtime does not auto-stage it.

## It's working if

- One Markdown file appears at the printed absolute path.
- The file contains the Spec's current `Status`, REQ list, AC table, and any verification record summary.
- The file is small enough to paste into a new chat (a few screens, not the full source tree).
- The user can `cat` the file in another agent and resume work without further context.
- A re-run of `/handoff-spec` produces a new file (different timestamp) with refreshed contents.

## Reference

- Source: `skills/handoff-spec/SKILL.md`
- Backing module: `lib/skills/backing-modules.js#writeHandoffDoc`
- Audit: `design-blueprint skills info handoff-spec`
- Feature brief: `docs/user/features/agent-interface--skills-layer.md`
