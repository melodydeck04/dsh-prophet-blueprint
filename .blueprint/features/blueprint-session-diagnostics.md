# Feature: Blueprint session diagnostics

Id: blueprint-session-diagnostics
Parent: spec-governance
Status: active
## Summary

Independent `@dsh-plugins/design-blueprint-diagnostics` package that audits DSH session JSONL exports to surface token usage, retry storms, compaction gaps, tool-result bloat, reasoning mass, and turn duration. The package ships an offline CLI and a small Node API so a developer can ask "is this session wasteful?" without inventing their own grep scripts each time, and so multi-session comparison becomes one structured diff instead of three PowerShell pipelines.

## Scope

- `blueprint-diagnostics/package.json`
- `blueprint-diagnostics/bin/blueprint-diagnostics.js`
- `blueprint-diagnostics/lib/audit.js`
- `blueprint-diagnostics/lib/compare.js`
- `blueprint-diagnostics/lib/report.js`
- `blueprint-diagnostics/lib/stream.js`
- `blueprint-diagnostics/lib/thresholds.js`
- `blueprint-diagnostics/tests/**` (inside the new package)
- `blueprint-diagnostics/docs/diagnostics/**`

## Components

- `blueprint-session-diagnostics`

## Documents

- required: `blueprint-diagnostics/package.json`
- required: `blueprint-diagnostics/bin/blueprint-diagnostics.js`
- required: `blueprint-diagnostics/lib/audit.js`
- required: `blueprint-diagnostics/lib/compare.js`
- required: `blueprint-diagnostics/lib/report.js`
- required: `blueprint-diagnostics/lib/stream.js`
- required: `blueprint-diagnostics/lib/thresholds.js`
- required: `blueprint-diagnostics/tests/audit.test.js`
- required: `blueprint-diagnostics/tests/compare.test.js`
- required: `blueprint-diagnostics/tests/report.test.js`
- required: `blueprint-diagnostics/tests/stream.test.js`
- required: `blueprint-diagnostics/tests/compact-boundaries.test.js`
- required: `blueprint-diagnostics/docs/diagnostics/README.md`
- required: `blueprint-diagnostics/docs/diagnostics/README.zh.md`
- required: `blueprint-diagnostics/docs/diagnostics/README.zh.i18n.yaml`
- required: `blueprint-diagnostics/docs/diagnostics/examples/basic-audit.md`
- required: `.specs/implemented/compact-at-checkpoint.md`
- required: `.specs/implemented/compact-at-checkpoint.zh.md`

## Acceptance

- The CLI parses any DSH `session.jsonl` (version 0 or 1) by line, never loads the full file into memory, and produces a structured report.
- The audit report identifies retry storms by grouping `llm/retry` events by turn and surfacing the dominant retry policy key.
- The audit report classifies compaction completeness (`start` vs `end` counts) and flags any turn whose compaction was interrupted.
- The audit report tracks per-event-kind byte totals, per-turn duration percentiles, and the largest single assistant message.
- The audit report walks `task/done` events emitted by the persistent TODO list, computes per-segment byte totals between consecutive `task/done` boundaries, and renders a `## Compact boundaries` Markdown section whose presence depends on whether any `task/done` events exist.
- The compare command diffs two sessions turn-by-turn and emits a Markdown table whose rows map to the comparison matrix in this proposal.
- The package has zero runtime dependency on the host plugin; `session.jsonl` parsing is its only input.
- The package reuses the same compact Node API as `design-blueprint` (`node:test`, ESM, no transpilation) so it ships in the same Developer Preview contract.

## Notes

The audit is read-only. It never writes session logs, never mutates session state, and never talks to the DSH runtime. Any behaviour change that the audit recommends (for example, capping reasoning length) belongs in a separate Feature proposal against the host plugin, not in this package.
