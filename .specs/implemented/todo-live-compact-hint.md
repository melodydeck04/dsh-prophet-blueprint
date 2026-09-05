# Spec: live compact reminder at TODO completion

Status: implemented
Feature: spec-governance

## Problem

`design-blueprint todo mark <id> done` writes one `task/done` event, but it stays silent about the byte delta that landed in the conversation since the previous `task/done`. The developer has to wait for the next `blueprint-diagnostics audit session.jsonl` run, which surfaces the byte total as a verdict under the `compact-boundaries-missed` rule. By the time the verdict is read, more bytes have already accumulated past the threshold. The reminder needs to fire **at the moment of `mark done`**, with the exact byte total, so the developer can decide whether to `/compact` before continuing.

`todo mark <id> done` already emits the `task/done` event; the framework has the bytes available in `session.jsonl`. The reminder just needs to read them.

## Scope

### Allowed paths

- allow: `docs/user/features/todo-live-compact-hint.md`
- allow: `docs/user/features/todo-live-compact-hint.zh.md`
- allow: `docs/user/features/todo-live-compact-hint.i18n.yaml`

### Denied paths

- deny: `lib/scan.js`
- deny: `lib/web-api.js`
- deny: `lib/orchestration.js`
- deny: `lib/verification.js`
- deny: `lib/chat-commands.js`
- deny: `lib/client.js`
- deny: `lib/workflow.js`
- deny: `lib/specs.js`
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
- deny: `lib/spec-decomposition.js`
- deny: `lib/todo-store.js`
- deny: `lib/spec-todos.js`
- deny: `lib/todo-events.js`
- deny: `blueprint-diagnostics/**`
- deny: `.blueprint/approvals/**`
- deny: `.blueprint/verifications/**`
- deny: `.specs/**` outside this Spec pair
- deny: `docs/i18n/**`
- deny: `design-blueprint.json` default or authority sections

## Decision
### `todo mark <id> done` auto-hint

When `runTodo(flags, positional)` writes a `task/done` event for a TODO, the CLI follows up by reading the bytes between the new event's `time` and the previous `task/done` event's `time` (or the session start, whichever is later) and printing a one-line reminder. The reminder format is fixed and machine-friendly:

```
Compaction hint: 1.42 MiB accumulated since last task/done. Type /compact before continuing.
```

The line is printed on a new line after the existing `Marked ... as done.` line. When the byte total is below the threshold of 1 MiB, the line is suppressed (the threshold matches `compact-boundaries-missed` yellowAt so the reminder only fires when `audit` would have flagged yellow).

The byte scan reads `session.jsonl` from `<cwd>/.dsh/sessions/<sessionId>/session.jsonl` if `sessionId` is on the CLI flag; otherwise it reads `<cwd>/session.jsonl`. If neither file exists, the reminder is suppressed and a debug line is logged via stderr:

```
Compaction hint: skipped (no session.jsonl at <path>).
```

If the file exists but contains no prior `task/done` event, the scan starts at the first byte of the file. If the new event's `time` is older than the prior event's `time` (clock skew), the scan covers the byte window `[prior, new]`.

### `todo status [--json]` query

A new `todo status` action under the `todo` subcommand. It prints a one-screen report covering:

- the Spec's TODO count (`pending | in-progress | done`),
- the most recent three `task/done` events (id, spec, req, ac, title, time, sessionId),
- the byte delta between the most recent `task/done` and the second most recent (or session start),
- a one-line verdict aligned with the `compact-boundaries-missed` thresholds (`🟢`, `🟡`, `🔴`).

`--json` returns the same data as a JSON object suitable for tool chaining.

`todo status` is read-only. It does not emit any `task/*` events, and it never writes to the TODO list or the approval record.

### Single helper, no new dependencies

`lib/cli.js` adds one helper, `readSessionSegmentBytes(sessionPath, lo, hi)`, that streams `session.jsonl` line-by-line, sums the byte lengths of records whose `time` falls in `[lo, hi]`, and returns the total. The helper lives next to `renderSpecForReview` and uses the same read pattern (`readFile` over a small `session.jsonl`, splitting by newline). No new packages.

## Acceptance criteria

- AC-LC-001: `design-blueprint todo mark T1 done --spec <spec.md>` writes the `task/done` event and prints `Compaction hint: <X> MiB accumulated since last task/done. Type /compact before continuing.` when the byte total exceeds the 1 MiB yellow threshold. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-LC-002: `design-blueprint todo mark T1 done --spec <spec.md>` does **not** print the reminder line when the byte total is under 1 MiB. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-LC-003: `design-blueprint todo mark T1 done --spec <spec.md>` writes the reminder only when the byte total crosses 1 MiB (yellowAt) and adds `🟡 Compact now.` when it crosses 4 MiB (redAt), matching the diagnostics thresholds. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-LC-004: `design-blueprint todo mark T1 done --spec <spec.md>` prints `Compaction hint: skipped (no session.jsonl at <path>).` on stderr when no session file is found. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-LC-005: `design-blueprint todo status --spec <spec.md>` prints the count summary, the recent `task/done` events, the byte delta, and a verdict emoji; `--json` returns a JSON object with the same fields. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-LC-006: `design-blueprint todo mark T1 done` without `--spec` exits non-zero (the existing required flag check) and does not print the reminder. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-LC-007: All existing tests in `tests/*.test.js` continue to pass after the change. [surface=cli; moment=terminal; evidence=contract-integration]

## Verification

- AC-LC-001: test `tests/todo-compact-hint.test.js`
- AC-LC-002: test `tests/todo-compact-hint.test.js`
- AC-LC-003: test `tests/todo-compact-hint.test.js`
- AC-LC-004: test `tests/todo-compact-hint.test.js`
- AC-LC-005: test `tests/todo-compact-hint.test.js`
- AC-LC-006: test `tests/todo-compact-hint.test.js`
- AC-LC-007: command `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js"`

## Risks

- The byte scan reads `session.jsonl` synchronously, which is fine for a developer-driven `mark done` but would be slow on a multi-megabyte session. A future Spec may stream the file; the current Spec caps the read by scanning only the byte window and short-circuiting at the prior `task/done`.
- The reminder line uses `/compact` as the developer hint, which assumes a DSH `/compact` command is available. If a future DSH renames the command, the reminder text will lag. The reminder is intentionally short (one line) so the maintainer can update it without a Spec change.
- `todo status` reads the most recent three `task/done` events; sessions that have not yet recorded a single `task/done` print `none yet`. The byte delta collapses to the full session length, which is the safe default.
- `todo mark ... done` is the only transition that triggers the reminder. Other transitions (`pending`, `in-progress`) stay silent, matching Phase 1's rule that only `task/done` events signal a natural compact boundary.

## Alternatives considered

**Emit the reminder only on the next `audit` run.** Rejected because the developer's intent is to keep the conversation lean *during* the session, not after the fact. The reminder's value is in the immediate moment, not in a delayed report.

**Make the reminder a separate `todo hint` subcommand that the developer must invoke.** Rejected because that puts the burden on the developer to remember a step. The auto-decompose Spec at the framework layer made the refine-time check automatic; the compact reminder should follow the same principle.

**Read the byte total via the diagnostics package directly.** Rejected because `blueprint-diagnostics` is a separate package and the host plugin should not depend on it for a CLI-only behavior. A 30-line helper in `lib/cli.js` is enough; sharing the threshold constants in `design-blueprint.json` keeps them in sync.

## Tasks

1. Add `readSessionSegmentBytes(sessionPath, lo, hi)` to `lib/cli.js` next to `renderSpecForReview`. REQ: AC-LC-001, AC-LC-002, AC-LC-003. Scope: `tests/todo-compact-hint.test.js`, `docs/user/features/todo-live-compact-hint.{md,zh.md,i18n.yaml}`.
2. Modify `runTodo(flags, positional)` in `lib/cli.js` so the `done` branch reads `session.jsonl` after writing the `task/done` event and prints the reminder line when the byte total crosses 1 MiB; print the yellow / red verdict aligned with `compact-boundaries-missed` thresholds. REQ: AC-LC-001, AC-LC-002, AC-LC-003. Scope: `tests/todo-compact-hint.test.js`.
3. Add `runTodoStatus(flags, positional)` to `lib/cli.js`, registered as `status` under the `todo` subcommand, that prints the count summary and the recent `task/done` events. REQ: AC-LC-005. Scope: `tests/todo-compact-hint.test.js`.
4. Author `docs/user/features/todo-live-compact-hint.md` + `.zh.md` + `.i18n.yaml`; run `node lib/cli.js docs confirm <owner>`. REQ: AC-LC-001..AC-LC-007. Scope: docs.
5. Run `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js"` and `node lib/cli.js scan --all --cwd .`; confirm scan reports `0 required` and the full test suite still passes. REQ: AC-LC-007. Scope: -.

## Consequences

Blueprint completed this delivery automatically after requirement-linked verification.

- Verified snapshot: `git-index:e201532cf5487905cf00a9e417e5c11794b6f3d442607e173ac936a2cf9c207a`
- Verification attempt: `attempt-2`
- Conclusion: todo-live-compact-hint implementation complete. lib/cli.js adds readSessionSegmentBytes and emitCompactHint helpers; runTodo prints the compaction hint after marking a task done; todo status subcommand shows counts, recent events, byte delta, and verdict. 7 new tests pass; bilingual docs pair confirmed.
- AC evidence: all 7 acceptance criteria passed.
- Check evidence: compact-hint-yellow (command), compact-hint-red (command), full-suite (command), docs-check (command).
