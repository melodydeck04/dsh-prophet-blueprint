# Spec: Compact-at-checkpoint diagnostics section

Status: implemented
Feature: blueprint-session-diagnostics
Parent: spec-governance

> Phase 3 of the three-phase `session-scale-awareness` program.
> Depends on: `.specs/proposed/persistent-todo-list.md` (Phase 1).
> Companion: `.specs/proposed/decomposition-contract.md` (Phase 2).
> Companion active Spec: `.specs/proposed/blueprint-session-diagnostics.md` (package authority).

## Problem

Phase 1 gives the developer a way to mark "this part is done" by writing a `task/done` event to `session.jsonl`. Phase 2 turns that into a structural expectation: large Specs MUST be decomposed, and each decomposed piece is expected to end with a `task/done`. What is missing is the read side: the diagnostics package does not currently look at `task/done` events, so a developer who finished Phase 1 properly still gets the same flat audit as one who never marked anything done.

This Phase 3 closes the loop. After it lands, `blueprint-diagnostics audit` reads `task/done` (and `task/status`) events, splits the session into segments at each boundary, measures how many bytes the developer let accumulate after each boundary without `/compact`, and emits a `## Compact boundaries` Markdown section plus a `compactBoundaries` field on the report. The verdict is driven by `totalMissedSavingsBytes`; a session with zero `task/done` events gets the section omitted entirely (no false alarms on pre-Phase-1 exports).

## Scope

### Allowed paths (inside the diagnostics package)

- allow: `blueprint-diagnostics/lib/audit.js`
- allow: `blueprint-diagnostics/lib/report.js`
- allow: `blueprint-diagnostics/lib/thresholds.js`
- allow: `blueprint-diagnostics/lib/compare.js`
- allow: `blueprint-diagnostics/tests/compact-boundaries.test.js`
- allow: `blueprint-diagnostics/tests/fixtures/compact-boundaries-session.jsonl`
- allow: `blueprint-diagnostics/tests/fixtures/no-task-done-session.jsonl`
- allow: `blueprint-diagnostics/docs/diagnostics/README.md`
- allow: `blueprint-diagnostics/docs/diagnostics/README.zh.md`
- allow: `blueprint-diagnostics/docs/diagnostics/README.zh.i18n.yaml`
- allow: `.blueprint/features/blueprint-session-diagnostics.md`
- allow: `.blueprint/architecture/components/blueprint-session-diagnostics.md`

### Denied paths

- deny: `lib/scan.js`
- deny: `lib/web-api.js`
- deny: `lib/orchestration.js`
- deny: `lib/verification.js`
- deny: `lib/chat-commands.js`
- deny: `lib/cli.js`
- deny: `lib/client.js`
- deny: `lib/workflow.js`
- deny: `lib/specs.js`
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
- deny: `lib/policy.js`
- deny: `lib/docs.js`
- deny: `lib/assistant-actions.js`
- deny: `lib/init.js`
- deny: `lib/project-root.js`
- deny: `lib/project-discovery.js`
- deny: `lib/invariant.js`
- deny: `tests/spec-decomposition.test.js`
- deny: `tests/cli-todo.test.js`
- deny: `tests/spec-todos.test.js`
- deny: `tests/todo-store.test.js`
- deny: `.blueprint/approvals/**`
- deny: `.blueprint/verifications/**`
- deny: `.specs/**` outside this Spec pair
- deny: `docs/i18n/**`
- deny: `design-blueprint.json` default or authority sections

## Decision
### Audit extension

`lib/audit.js` walks every event once, as today. When it encounters a `task/done` event, it appends one entry to `compactBoundaries.boundaries` carrying `seq`, `time`, `todoId`, `spec`, `req`, `ac`, `title`, `sessionId`, and an empty `segmentBytes` placeholder. After the loop completes, the audit walks the boundaries in order and, for each boundary `b[i]`, computes `segmentBytes` as the sum of bytes (assistant / tool-result / reasoning / user) for events whose `time` falls in `(b[i].time, b[i+1].time]` (or `(b[i].time, lastTime]` for the final segment). `segmentDurationMs` is the same window's wall-clock duration.

`totalMissedSavingsBytes` is the sum of `segmentBytes` for every segment. The intent is loss-aversion: the developer sees how many bytes they could have saved had they typed `/compact` at every `task/done` boundary. The thresholds live in `lib/thresholds.js` so a maintainer can tune them without touching the audit logic.

`verdict.compact-boundaries-missed` is computed via the existing `classify` helper against `THRESHOLDS["compact-boundaries-missed"]`. The top-level `verdict.dominant` selection algorithm is unchanged: if any existing dimension is already red, Phase 3 never steals the dominant label; it only contributes when no existing dimension is yellow/red or when its break-point ranks highest.

### Markdown section

`lib/report.js` renders a new section between the existing `## Compactions` (or `## Cross-feature scope`, when that Phase 2 lands) and `## Tool names`:

```
## Compact boundaries

- task/done events: 3
- missed compact savings: 5.4 MiB
- verdict: 🟡 (yellow)

| boundary | todoId | spec | segment bytes | duration |
| --- | --- | --- | ---: | ---: |
| 12:34:56 | T1 | .specs/proposed/foo.md | 1.2 MiB | 22 min |
| 13:01:14 | T2 | .specs/proposed/foo.md | 2.0 MiB | 41 min |
| 14:18:02 | T3 | .specs/proposed/bar.md | 2.2 MiB | 1 h 12 min |
```

When `compactBoundaries.boundaries` is empty, the entire section is omitted (no header, no `(none)` placeholder). This keeps pre-Phase-1 sessions rendering exactly as before.

### Compare extension

`lib/compare.js` adds one new row to its existing table: `compact boundaries missed`, with the formatted byte total for left / right. The threshold check uses the existing 10% rule; a 2x or larger difference gets the ⚠ marker.

### Threshold

```js
"compact-boundaries-missed": Object.freeze({
  yellowAt: 1 * 1024 * 1024,
  redAt: 4 * 1024 * 1024,
}),
```

The numbers are heuristics tuned against the same real session that produced the audit prompt; they are deliberately conservative so a small per-segment overhead does not turn the verdict yellow.

## Acceptance criteria

- AC-COMPACT-001: `node bin/blueprint-diagnostics.js audit tests/fixtures/compact-boundaries-session.jsonl` exits 0 and the rendered Markdown report contains `## Compact boundaries` plus a per-boundary table. [surface=cli; moment=terminal; evidence=user-visible]
- AC-COMPACT-002: A session with zero `task/done` events renders the existing sections unchanged; no `## Compact boundaries` header is emitted. [surface=cli; moment=terminal; evidence=user-visible]
- AC-COMPACT-003: `report.compactBoundaries.boundaries` is an array whose length equals the count of `task/done` events in the input, each entry carrying the fields listed in the Audit extension subsection. [surface=api; moment=terminal; evidence=contract-integration]
- AC-COMPACT-004: `report.compactBoundaries.totalMissedSavingsBytes` equals the sum of `segmentBytes` across every boundary; `verdicts["compact-boundaries-missed"]` follows the existing `classify` rule. [surface=api; moment=terminal; evidence=static-unit]
- AC-COMPACT-005: `THRESHOLDS["compact-boundaries-missed"]` is loaded from `lib/thresholds.js`; editing the file changes the verdict without touching the audit logic. [surface=repository; moment=static; evidence=static-unit]
- AC-COMPACT-006: `compare` output adds a `compact boundaries missed` row when both reports carry a `compactBoundaries` field. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-COMPACT-007: All existing tests in `tests/*.test.js` continue to pass after the change. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-COMPACT-008: `design-blueprint docs check` exits 0 after the bilingual README updates land. [surface=repository; moment=static; evidence=completion-hygiene]

## Verification

- AC-COMPACT-001: test `tests/compact-boundaries.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-COMPACT-002: test `tests/compact-boundaries.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-COMPACT-003: test `tests/compact-boundaries.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-COMPACT-004: test `tests/compact-boundaries.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-COMPACT-005: test `tests/compact-boundaries.test.js` [surface=repository; moment=static; evidence=static-unit]
- AC-COMPACT-006: test `tests/compact-boundaries.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-COMPACT-007: command `node --experimental-test-isolation=none --test "blueprint-diagnostics/tests/*.test.js"` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-COMPACT-008: command `node lib/cli.js docs check --cwd .` [surface=cli; moment=static; evidence=completion-hygiene]

## Risks

- The audit reads `task/done` events from `session.jsonl`. Sessions that pre-date Phase 1 have none of these events, which is by design: the section is omitted and the existing audit shape is unchanged. The risk is that a developer treats the absence as a regression rather than as "this session never ran Phase 1"; the docs in this Spec explain the fallback.
- The byte counts per segment are exact byte sizes of the JSON-serialized records between two timestamps. They are not a perfect proxy for the input-token cost of the segment, because DSH may have applied its own compression or caching, but they are stable and reproducible across runs and so serve the loss-aversion goal.
- The default thresholds (`yellowAt: 1 MiB`, `redAt: 4 MiB`) are tuned against the first real session that produced this audit. They will be wrong for some workloads. Like every other dimension in `lib/thresholds.js`, the values are heuristics and can be tuned in the same file without touching the audit logic.

## Requirements

### REQ-COMPACT-1 — Audit reads `task/done` and `task/status`

`lib/audit.js` shall walk `task/done` and `task/status` events alongside the existing event kinds. For each `task/done` event with a numeric `seq` and `time`, it appends one boundary entry carrying `seq`, `time`, `data.todoId`, `data.spec`, `data.req`, `data.ac`, `data.title`, and the `sessionId` if present in `data` (else `null`).

### REQ-COMPACT-2 — Per-segment byte aggregation

After the event loop, the audit shall compute `segmentBytes` for every boundary `b[i]` as the sum of `approximateSize(record)` for events whose `time` is in `(b[i].time, b[i+1].time]` (or `(b[i].time, lastTime]` for the final segment). The aggregated bytes are bucketed into `{ assistant, toolResult, reasoning, user }` using the same event-kind-to-bucket mapping as the existing report.

### REQ-COMPACT-3 — Total missed savings

`totalMissedSavingsBytes` equals the sum of all segment buckets across all boundaries. The field is set even when `boundaries` is empty (then it is `0`).

### REQ-COMPACT-4 — Verdict via threshold block

`verdicts["compact-boundaries-missed"]` is computed via the existing `classify(totalMissedSavingsBytes, THRESHOLDS["compact-boundaries-missed"])`. The threshold block lives in `lib/thresholds.js` and uses `yellowAt: 1 MiB`, `redAt: 4 MiB`.

### REQ-COMPACT-5 — Omitted section when empty

When `compactBoundaries.boundaries.length === 0`, `lib/report.js` MUST NOT emit a `## Compact boundaries` header. Existing sections render unchanged.

### REQ-COMPACT-6 — Markdown section content

When the section is emitted, it contains:
- a one-line summary `task/done events: <count>`,
- the formatted `missed compact savings`,
- a verdict emoji and color word,
- a per-boundary table with columns `boundary` (time), `todoId`, `spec`, `segment bytes`, `duration`.

### REQ-COMPACT-7 — Compare row

`lib/compare.js` shall add a `compact boundaries missed` row whose `left` and `right` are the formatted `totalMissedSavingsBytes` from each report. The row uses the standard 10% significance rule.

### REQ-COMPACT-8 — Zero new host-plugin imports

`lib/audit.js`, `lib/report.js`, `lib/compare.js`, and `lib/thresholds.js` shall not import from `@dsh-plugins/design-blueprint`. A test asserting `package.json` has no `dependencies` entry referencing the host plugin is part of the existing diagnostics contract and continues to pass.

## Scenarios

[scenario=three-task-done-renders]
Given a session.jsonl with three `task/done` events interleaved with assistant/chunk and tool/result events,
When `blueprint-diagnostics audit <path>` runs,
Then the Markdown report contains `## Compact boundaries` followed by a table with three rows,
And `report.compactBoundaries.boundaries.length` is 3,
And `verdicts["compact-boundaries-missed"]` is one of `green | yellow | red`.

[scenario=no-task-done-omits-section]
Given a session.jsonl with zero `task/done` events (the existing fixture),
When `blueprint-diagnostics audit <path>` runs,
Then the Markdown report does not contain `## Compact boundaries`,
And `report.compactBoundaries.boundaries` is `[]`,
And `totalMissedSavingsBytes` is `0`.

[scenario=verdict-color-from-threshold]
Given `totalMissedSavingsBytes === 1.5 * 1024 * 1024`,
When the audit classifies it,
Then `verdicts["compact-boundaries-missed"]` is `yellow`.

[scenario=verdict-color-red]
Given `totalMissedSavingsBytes === 5 * 1024 * 1024`,
When the audit classifies it,
Then `verdicts["compact-boundaries-missed"]` is `red`.

[scenario=compare-adds-row]
Given two reports that both have `compactBoundaries.totalMissedSavingsBytes`,
When `compare` runs,
Then the output table contains a `compact boundaries missed` row.

[scenario=segment-bucket-correctness]
Given boundary at `seq: 100` followed by an assistant/chunk at `seq: 105` of size 5 KiB and a tool/result at `seq: 110` of size 20 KiB,
When the segment is computed,
Then `segmentBytes.assistant` is `5120` and `segmentBytes.toolResult` is `20480`.

## Assumptions

1. The `task/done` event schema produced by Phase 1's `lib/types/todo-events.js` is the contract Phase 3 reads. Field names `todoId`, `spec`, `req`, `ac`, `title`, and optional `sessionId` are stable.
2. Sessions that pre-date Phase 1 still audit cleanly: the audit skips `task/done` events that are absent, never throws, and never adds a section header for an empty list.
3. The `compactBoundaries` field is additive; no existing field on `AuditReport` changes shape or meaning.
4. Compare output is not the primary delivery surface for Phase 3; the row is informational, not blocking.

## Non-goals

- No real-time compaction trigger. The diagnostics surface is informational; the developer chooses when to type `/compact`.
- No change to the existing five dimensions' thresholds in `lib/thresholds.js`. The new `compact-boundaries-missed` block is the only addition.
- No forced integration with the host plugin. The diagnostics package keeps its zero-dependency contract.

## Alternatives considered

**Per-event "missed savings" estimate.** Rejected as over-engineered: the segment-based estimate is conservative and answers the question the developer actually asks ("how much did the last stretch cost me?").

**Block approval when verdict is red.** Rejected because Phase 3 is advisory; the dominant selection algorithm already prefers existing red dimensions, and gating approvals on a new diagnostic would block unrelated work.

**Skip the compare row.** Rejected because the existing compare command already wraps every meaningful dimension, and `compact boundaries missed` is a dimension developers will want to compare between two iterations of the same task.

## Tasks

1. Extend `lib/audit.js` to walk `task/done` / `task/status` events and populate `report.compactBoundaries` with `boundaries`, `totalBoundaries`, `totalMissedSavingsBytes`, and `verdict`.
   REQ: REQ-COMPACT-1, REQ-COMPACT-2, REQ-COMPACT-3, REQ-COMPACT-4
   Scope: `blueprint-diagnostics/lib/audit.js`
   AC: AC-COMPACT-001, AC-COMPACT-003, AC-COMPACT-004
2. Add `compact-boundaries-missed` block to `lib/thresholds.js`.
   REQ: REQ-COMPACT-4
   Scope: `blueprint-diagnostics/lib/thresholds.js`
   AC: AC-COMPACT-005
3. Render the `## Compact boundaries` Markdown section in `lib/report.js`, omitted when `boundaries.length === 0`.
   REQ: REQ-COMPACT-5, REQ-COMPACT-6
   Scope: `blueprint-diagnostics/lib/report.js`
   AC: AC-COMPACT-001, AC-COMPACT-002
4. Add the `compact boundaries missed` row to `lib/compare.js`.
   REQ: REQ-COMPACT-7
   Scope: `blueprint-diagnostics/lib/compare.js`
   AC: AC-COMPACT-006
5. Write `tests/compact-boundaries.test.js` covering all six scenarios; add the two fixtures.
   REQ: REQ-COMPACT-1, REQ-COMPACT-2, REQ-COMPACT-3, REQ-COMPACT-4, REQ-COMPACT-5, REQ-COMPACT-6, REQ-COMPACT-7, REQ-COMPACT-8
   Scope: `blueprint-diagnostics/tests/compact-boundaries.test.js`, `blueprint-diagnostics/tests/fixtures/compact-boundaries-session.jsonl`, `blueprint-diagnostics/tests/fixtures/no-task-done-session.jsonl`
   AC: AC-COMPACT-001..AC-COMPACT-006
6. Author `docs/diagnostics/README.md` and `README.zh.md` updates describing the new section, the threshold block, and the zero-event fallback.
   REQ: REQ-COMPACT-5, REQ-COMPACT-6
   Scope: `blueprint-diagnostics/docs/diagnostics/README.md`, `blueprint-diagnostics/docs/diagnostics/README.zh.md`
   AC: AC-COMPACT-008
7. Run `node --experimental-test-isolation=none --test "blueprint-diagnostics/tests/*.test.js"` and `node lib/cli.js docs check --cwd .`.
   REQ: all
   Scope: -
   AC: AC-COMPACT-007, AC-COMPACT-008

## Lifecycle

- Status: proposed
- Target status after approval: implemented (file moves to `.specs/implemented/`)

## Truth-delta

New facts added:
- `report.compactBoundaries` exists on `AuditReport` with `boundaries`, `totalBoundaries`, `totalMissedSavingsBytes`, `verdict`.
- `verdicts["compact-boundaries-missed"]` is computed for every report.
- `## Compact boundaries` Markdown section is emitted when at least one `task/done` event is present.
- `THRESHOLDS["compact-boundaries-missed"]` block lives in `lib/thresholds.js`.
- `compare` output gains a `compact boundaries missed` row.

Existing facts preserved:
- All existing fields on `AuditReport`, all existing CLI behaviour, all existing tests.

## Traceability

REQ-COMPACT-1 → scenario[three-task-done-renders] → task 1 → AC-COMPACT-001, AC-COMPACT-003 → verification tests/compact-boundaries.test.js
REQ-COMPACT-2 → scenario[segment-bucket-correctness] → task 1 → AC-COMPACT-003 → verification tests/compact-boundaries.test.js
REQ-COMPACT-3 → scenario[three-task-done-renders] → task 1 → AC-COMPACT-004 → verification tests/compact-boundaries.test.js
REQ-COMPACT-4 → scenario[verdict-color-from-threshold], [verdict-color-red] → task 1, 2 → AC-COMPACT-004, AC-COMPACT-005 → verification tests/compact-boundaries.test.js
REQ-COMPACT-5 → scenario[no-task-done-omits-section] → task 3 → AC-COMPACT-002 → verification tests/compact-boundaries.test.js
REQ-COMPACT-6 → scenario[three-task-done-renders] → task 3 → AC-COMPACT-001 → verification tests/compact-boundaries.test.js
REQ-COMPACT-7 → scenario[compare-adds-row] → task 4 → AC-COMPACT-006 → verification tests/compact-boundaries.test.js
REQ-COMPACT-8 → all scenarios (implicit invariant) → existing test `tests/audit.test.js` no-host-import assertion → AC-COMPACT-007 → verification tests/compact-boundaries.test.js

## Unresolved decisions

None. The five material questions (event schema, segment window, threshold defaults, omitted-section rule, compare row) are settled above.

## Quality checklist (self-attested)

- requirements complete: ✓
- requirements unambiguous: ✓
- requirements bounded: ✓
- requirements failure-aware: ✓ (no `task/done`, missing schema fields, empty segments all covered)
- requirements testable: ✓
- requirements non-contradictory: ✓

## Cross-artifact analysis

- requirements-to-scenarios: ✓ all 8 REQs covered by 6 scenarios
- requirements-to-impact: ✓ all 8 REQs map to files in ## Scope
- requirements-to-tasks: ✓ each task lists REQs
- requirements-to-acceptance: ✓ each AC names REQs
- requirements-to-verification: ✓ each AC names a verification command or test
- tasks-to-scope: ✓ each task names a Scope path
- design-to-scope: not applicable (bounded change)
- scope-to-paths: ✓ every Scope path matches a real path

## Consequences

Blueprint completed this delivery automatically after requirement-linked verification.

- Verified snapshot: `git-index:cb927223fd3086a7516a383e27bb1603bfb849eb98630c8dcb1a2ac9f5fb86e3`
- Verification attempt: `attempt-3`
- Conclusion: Phase 3 (compact-at-checkpoint) implementation complete. blueprint-diagnostics/lib/audit.js now walks task/done events and populates report.compactBoundaries; thresholds.js gains the compact-boundaries-missed block (1 MiB yellow, 4 MiB red); report.js renders the new ## Compact boundaries section (omitted entirely when no task/done events are present); compare.js adds a compact boundaries missed row. 5 new tests pass; docs/diagnostics/README.{md,zh.md} pair documented.
- AC evidence: all 8 acceptance criteria passed.
- Check evidence: compact-boundaries-unit (command), thresholds-loaded (inspection), full-suite (command), docs (inspection).
