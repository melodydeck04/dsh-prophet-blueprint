# Blueprint session diagnostics

`@dsh-plugins/design-blueprint-diagnostics` is an offline CLI that reads a DSH `session.jsonl` export and surfaces the dominant waste category: token, retry, compaction, tool-result, and reasoning mass.

## Install

The package ships as a sibling of `@dsh-plugins/design-blueprint`. From the design-blueprint repository:

```
node blueprint-diagnostics/bin/blueprint-diagnostics.js audit path/to/session.jsonl
```

You can also install the package into your `PATH` for convenience:

```
npm link blueprint-diagnostics/
```

## Commands

### `audit <session.jsonl> [--json <out>]`

Print a Markdown report describing one session. Optionally write the structured JSON sidecar to `<out>` for later comparison.

### `compare <a.jsonl> <b.jsonl> [--label-a <l>] [--label-b <l>]`

Print a Markdown table that diffs the two sessions turn-by-turn. Rows whose values diverge by more than 10% are marked with ⚠.

## Verdict colors

Every audit ends with one of three colors. Thresholds are encoded in `lib/thresholds.js`:

- 🟢 green — no observed dimension crossed the yellow line
- 🟡 yellow — at least one dimension crossed its yellow line
- 🔴 red — at least one dimension crossed its red line

The dominant line is the one whose red threshold is the largest, so a single red verdict on a big dimension outranks several yellow verdicts on small ones.

## Compact boundaries section

If the session contains one or more `task/done` events (typically written by `@dsh-plugins/design-blueprint todo mark ... done`), the report adds a `## Compact boundaries` section between `## Turn durations` and `## Top largest events`. The section lists each boundary with its segment byte totals and the duration the developer let accumulate without typing `/compact`. The `missed compact savings` summary at the top of the section is the total of those segments and contributes one extra verdict dimension (`compact-boundaries-missed`); defaults are `yellowAt: 1 MiB`, `redAt: 4 MiB`. Sessions with zero `task/done` events render the section as `(no task/done events in this session; nothing to bound)` so older exports stay cleanly auditable.

## What the audit does not do

The audit is read-only. It never opens a network socket, never reads files outside the JSONL argument, never writes except to the optional `--json` target, and never talks to the DSH runtime. Behaviour changes that the audit recommends belong in separate Feature proposals against the host plugin.