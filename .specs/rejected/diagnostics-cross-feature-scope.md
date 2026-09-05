# Spec: Diagnostics cross-feature scope detection

Status: rejected — superseded by the three-phase `session-scale-awareness` program (persistent-todo-list, decomposition-contract, compact-at-checkpoint)
Feature: blueprint-session-diagnostics

> Reason: this Spec treated "cross-Feature session" as a passive warning surfaced after the fact. The correct architecture makes Feature decomposition a default output of refinement (with a persistent TODO list inside Blueprint), and uses TODO completion events as natural compact boundaries. Warning was the wrong instrument.

## Problem

A session.jsonl audit can read Feature ids from user / assistant / command events and warn the developer that the session spans multiple Features. The author of this Spec scoped that as a passive warning surfaced by `blueprint-diagnostics audit`, but the real architecture is to make Feature decomposition a first-class refinement output and to use TODO completion events as natural compact boundaries. The warning-only approach was rejected because it treats decomposition as a violation rather than a default.

## Proposal

Replace the warning-only approach with three artifacts:

1. `.specs/proposed/persistent-todo-list.md` (foundation) — every Spec carries a sibling `.todos.yaml`; `mark done` writes `task/done` to `session.jsonl`.
2. `.specs/proposed/decomposition-contract.md` (refinement-time) — `scan` flags Specs above the threshold and `spec decompose` writes parent + sub-Spec patches.
3. `.specs/proposed/compact-at-checkpoint.md` (diagnostics) — `audit` reads `task/done` events and emits a `## Compact boundaries` section with `totalMissedSavingsBytes` and a per-boundary table.

This Spec's content (cross-Feature id matching, `--features` CLI flag, etc.) is preserved as history; the three replacement Specs ship the actual behaviour.

## Identity

- Requirement id format: `REQ-DIAG-CFS-*`
- Owning Feature: blueprint-session-diagnostics
- Parent Feature: spec-governance
- Related Feature: spec-governance (companion Spec for scan-side granularity)
- Type: bounded change
- Design required: false
- Affected package: `@dsh-plugins/design-blueprint-diagnostics`
- Companion Spec: `.specs/proposed/scan-spec-granularity.md`

## Intent

Long DSH sessions frequently refine or implement several Features in sequence inside a single chat. The accumulated context drives retry storms and tokens that compound across turns. The diagnostics package currently reports per-event-kind byte totals, retry storms, compaction completeness, and per-turn durations, but it does not surface the fact that one session spans more than one Feature. A developer who has just finished a 240-hour, 5-Feature session reads the audit and still has to infer the cause from a 🔴 retry-rate verdict.

This Spec adds a `cross-feature-scope` dimension to the diagnostics audit: it scans `user/message`, `assistant/message`, and `command/run` events for Feature-id shaped strings, counts hits per id, and emits a new section in the Markdown report. The dimension contributes its own green / yellow / red verdict and, when at least two distinct Feature ids are detected, becomes a candidate for the dominant label.

The Feature-id catalog is parsed in-package from a directory of `*.md` files (default `.blueprint/features/`, override via CLI flag), keeping the diagnostics package free of any runtime dependency on the host plugin.

## Scope

### Allowed paths (within the diagnostics package)

- allow: `lib/feature-catalog.js` (new in-package parser, no host-plugin import)
- allow: `lib/audit.js` (extend to track Feature-id hits and emit `crossFeature`)
- allow: `lib/report.js` (render the new Markdown section)
- allow: `lib/thresholds.js` (add `cross-feature-scope` block)
- allow: `bin/blueprint-diagnostics.js` (accept `--features <dir>` flag, default `.blueprint/features/`)
- allow: `tests/feature-catalog.test.js` (new)
- allow: `tests/cross-feature.test.js` (new)
- allow: `docs/diagnostics/README.md` (document the new section and flag)
- allow: `docs/diagnostics/README.zh.md` (Chinese counterpart)

### Denied paths

- deny: any path under `@dsh-plugins/design-blueprint` host plugin (`lib/*`, `bin/*`, etc.)
- deny: `.blueprint/**`
- deny: `docs/i18n/**`
- deny: `.specs/**` outside this Spec pair

## Impact

### Files

[surface=repository; moment=static; evidence=static-unit]

- `blueprint-diagnostics/lib/feature-catalog.js` (new): zero-dep Feature-id parser.
- `blueprint-diagnostics/lib/audit.js`: add a `crossFeature` field to `AuditReport` and per-event-id counters.
- `blueprint-diagnostics/lib/report.js`: add a `## Cross-feature scope` Markdown section.
- `blueprint-diagnostics/lib/thresholds.js`: add `cross-feature-scope` threshold block.
- `blueprint-diagnostics/bin/blueprint-diagnostics.js`: accept `--features <dir>` flag.
- `blueprint-diagnostics/tests/feature-catalog.test.js` (new): parser tests.
- `blueprint-diagnostics/tests/cross-feature.test.js` (new): audit + report tests for the new dimension.
- `blueprint-diagnostics/tests/fixtures/features/` (new): three stub Feature files for parser tests.
- `blueprint-diagnostics/tests/fixtures/cross-feature-session.jsonl` (new): a session with three Feature-id mentions.
- `blueprint-diagnostics/docs/diagnostics/README.md`: document the new section and flag.
- `blueprint-diagnostics/docs/diagnostics/README.zh.md`: Chinese counterpart.

### Public contracts

[surface=cli; moment=terminal; evidence=contract-integration]

- New CLI flag: `--features <dir>` (default `.blueprint/features/`).
- New audit report field: `report.crossFeature = { candidates: Array<{ id: string, hits: number }>, distinctCount: number, isCrossFeature: boolean, verdict: "green"|"yellow"|"red", source: "provided"|"default"|"none" }`.
- New verdict dimension key: `cross-feature-scope` in `report.verdicts`.
- New Markdown section: `## Cross-feature scope` rendered between `## Compactions` and `## Tool names`.

### Persistence

None. Read-only over the input `session.jsonl` and (optionally) a Feature catalog directory.

### Compatibility

- All existing audit fields, verdict colors, and CLI behaviour are preserved when `--features` is not used and the default directory does not exist.
- The `cross-feature-scope` verdict is computed independently of the existing five dimensions; it can become the dominant only when at least one of the existing dimensions is also yellow/red and it has the highest break-point among them.

### Risk

- The Feature-id regex may match unintended tokens (e.g., common English words that happen to be kebab-case). The audit surfaces raw hit counts so the reader can judge; no automatic suppression.
- Threshold values (1, 2-3, ≥4) are heuristics. They live in `lib/thresholds.js` and can be tuned without touching audit logic.

## Design

Not applicable. Bounded change with no module ownership change, no new persistence schema, and no concurrency boundary.

## Requirements

### REQ-DIAG-CFS-1 — Audit detects Feature-id mentions across event kinds

Given a session.jsonl whose `user/message`, `assistant/message`, and `command/run` events mention Feature ids from a configurable catalog,
When `blueprint-diagnostics audit <session.jsonl>` runs,
Then the report carries a `crossFeature.candidates` array with one entry per distinct Feature id, each carrying `id` and `hits`,
And the entries are sorted by `hits` descending,
And `crossFeature.distinctCount` equals the array length.

### REQ-DIAG-CFS-2 — Cross-Feature verdict thresholds

The audit shall classify the `cross-feature-scope` dimension as:
- `green` if `distinctCount <= 1` or no catalog is available,
- `yellow` if `distinctCount` is 2 or 3,
- `red` if `distinctCount >= 4`.

### REQ-DIAG-CFS-3 — Cross-Feature scope becomes a dominant candidate

When `cross-feature-scope` is yellow or red, the audit's top-level `verdict.dominant` shall name `cross-feature-scope` if no other dimension with the same color has a higher threshold break-point.

### REQ-DIAG-CFS-4 — Feature catalog parser is host-plugin-independent

`lib/feature-catalog.js` shall:
- read every `*.md` (excluding `*.zh.md`) under a configured directory,
- extract the Feature id from the first `# Feature: ...` heading line or from an `Id: <id>` line in the first 20 lines,
- return an array of strings (Feature ids, deduplicated, sorted ascending),
- throw nothing — a missing or empty directory yields `[]`.

### REQ-DIAG-CFS-5 — CLI flag and default catalog path

`blueprint-diagnostics audit <path>` shall accept an optional `--features <dir>` flag. The default is `.blueprint/features/` resolved relative to the current working directory. When the resolved directory does not exist or is empty, the audit proceeds with an empty catalog and a `green` verdict, and the report's `Cross-feature scope` section carries a `(no feature catalog provided)` note.

### REQ-DIAG-CFS-6 — Markdown section rendering

The Markdown report shall include a `## Cross-feature scope` section that:
- lists each candidate Feature id with its hit count in a two-column table,
- states the verdict emoji and color,
- names the source: `(provided via --features)`, `(default .blueprint/features/)`, or `(no feature catalog provided)`.

## Scenarios

[scenario=happy-cross-feature]
Given a session.jsonl whose three `user/message` events mention `judge-evaluation`, `judge-evaluation--evidence-workspace`, and `judge-evaluation--evidence-grounded-judgment`, and a Feature catalog containing those three ids,
When `blueprint-diagnostics audit <session.jsonl> --features tests/fixtures/features` runs,
Then the Markdown report contains `## Cross-feature scope` with three rows,
And `crossFeature.distinctCount` is 3,
And `verdicts["cross-feature-scope"]` is `yellow`.

[scenario=no-catalog-fallback]
Given a session.jsonl that mentions a Feature id, and no `--features` flag, and no `.blueprint/features/` directory next to the JSONL,
When the audit runs,
Then the report's `Cross-feature scope` section shows `(no feature catalog provided)`,
And `verdicts["cross-feature-scope"]` is `green`.

[scenario=single-feature-stays-green]
Given a session whose events mention only `judge-evaluation` and a catalog containing that id,
When the audit runs,
Then `crossFeature.distinctCount` is 1 and the verdict is `green`.

[scenario=four-features-red]
Given a session whose events mention four distinct Feature ids and a catalog containing all four,
When the audit runs,
Then `verdicts["cross-feature-scope"]` is `red`,
And `verdict.dominant` is `cross-feature-scope` (or another red dimension with higher break-point).

[scenario=zh-feature-excluded]
Given a Feature catalog directory containing `foo.md` with `Id: foo` and `foo.zh.md` with `Id: foo-zh`,
When `loadFeatureCatalog(dir)` is called,
Then the returned array contains `foo` exactly once and does not contain `foo-zh`.

## Acceptance criteria

- AC-DIAG-CFS-001: `node bin/blueprint-diagnostics.js audit tests/fixtures/cross-feature-session.jsonl --features tests/fixtures/features` exits 0 and emits a Markdown report that contains `## Cross-feature scope` plus a table with three Feature-id rows.
[surface=cli; moment=terminal; evidence=user-visible]
- AC-DIAG-CFS-002: When `--features` is not provided and `.blueprint/features/` does not exist relative to the JSONL's directory, the audit output's `cross-feature-scope` verdict is `green` and the section reads `(no feature catalog provided)`.
[surface=cli; moment=terminal; evidence=user-visible]
- AC-DIAG-CFS-003: `lib/audit.js`'s returned report carries a `crossFeature` object with `candidates`, `distinctCount`, `isCrossFeature`, `verdict`, and `source` fields, all matching REQ-DIAG-CFS-1 and REQ-DIAG-CFS-2 semantics.
[surface=api; moment=terminal; evidence=contract-integration]
- AC-DIAG-CFS-004: `lib/feature-catalog.js` exposes `loadFeatureCatalog(dir)` and `parseFeatureIdFromMarkdown(content)`; the parser extracts ids from both `# Feature: ...` heading and `Id: ...` line, and skips `*.zh.md`.
[surface=api; moment=terminal; evidence=static-unit]
- AC-DIAG-CFS-005: A session mentioning four distinct Feature ids yields `verdicts["cross-feature-scope"] === "red"`.
[surface=cli; moment=terminal; evidence=user-visible]
- AC-DIAG-CFS-006: `design-blueprint docs check` exits 0 after the bilingual README updates land.
[surface=repository; moment=static; evidence=completion-hygiene]
- AC-DIAG-CFS-007: All 21 existing audit / compare / stream tests and the new tests for this Spec continue to pass after the change.
[surface=cli; moment=terminal; evidence=contract-integration]

## Verification

- AC-DIAG-CFS-001: test `tests/cross-feature.test.js`
- AC-DIAG-CFS-002: test `tests/cross-feature.test.js`
- AC-DIAG-CFS-003: test `tests/cross-feature.test.js`
- AC-DIAG-CFS-004: test `tests/feature-catalog.test.js`
- AC-DIAG-CFS-005: test `tests/cross-feature.test.js`
- AC-DIAG-CFS-006: command `node lib/cli.js docs check --cwd .`
- AC-DIAG-CFS-007: command `node --experimental-test-isolation=none --test "blueprint-diagnostics/tests/*.test.js"`

## Tasks

1. Implement `lib/feature-catalog.js`: parse a Feature-id from `# Feature: <id>` heading or `Id: <id>` line; load every `*.md` (skip `*.zh.md`) under `dir`; deduplicate and sort.
   REQ: REQ-DIAG-CFS-4
   Scope: `blueprint-diagnostics/lib/feature-catalog.js`
   AC: AC-DIAG-CFS-004
2. Extend `lib/audit.js` to accept an optional Feature catalog and compute `crossFeature` over `user/message`, `assistant/message`, and `command/run` events using the Feature-id regex `[a-z0-9]+(?:--[a-z0-9]+)*`.
   REQ: REQ-DIAG-CFS-1, REQ-DIAG-CFS-3
   Scope: `blueprint-diagnostics/lib/audit.js`
   AC: AC-DIAG-CFS-003
3. Add `cross-feature-scope` threshold block to `lib/thresholds.js`.
   REQ: REQ-DIAG-CFS-2
   Scope: `blueprint-diagnostics/lib/thresholds.js`
   AC: AC-DIAG-CFS-003
4. Render the `## Cross-feature scope` Markdown section in `lib/report.js`, between `## Compactions` and `## Tool names`.
   REQ: REQ-DIAG-CFS-6
   Scope: `blueprint-diagnostics/lib/report.js`
   AC: AC-DIAG-CFS-001, AC-DIAG-CFS-002, AC-DIAG-CFS-005
5. Wire `--features <dir>` CLI flag into `bin/blueprint-diagnostics.js`; default `.blueprint/features/`.
   REQ: REQ-DIAG-CFS-5
   Scope: `blueprint-diagnostics/bin/blueprint-diagnostics.js`
   AC: AC-DIAG-CFS-001, AC-DIAG-CFS-002
6. Write `tests/feature-catalog.test.js` covering heading + Id-line parsing, `*.zh.md` exclusion, empty/missing directory fallback, deduplication.
   REQ: REQ-DIAG-CFS-4
   Scope: `blueprint-diagnostics/tests/feature-catalog.test.js`
   AC: AC-DIAG-CFS-004
7. Write `tests/cross-feature.test.js` covering the three scenarios in REQ-DIAG-CFS-1 / 2 / 3 with the fixture sessions and Feature catalog directory.
   REQ: REQ-DIAG-CFS-1, REQ-DIAG-CFS-2, REQ-DIAG-CFS-3, REQ-DIAG-CFS-5
   Scope: `blueprint-diagnostics/tests/cross-feature.test.js`
   AC: AC-DIAG-CFS-001, AC-DIAG-CFS-002, AC-DIAG-CFS-003, AC-DIAG-CFS-005
8. Add `tests/fixtures/features/` (3 stub Feature files) and `tests/fixtures/cross-feature-session.jsonl`.
   REQ: REQ-DIAG-CFS-1
   Scope: `blueprint-diagnostics/tests/fixtures/features/**`, `blueprint-diagnostics/tests/fixtures/cross-feature-session.jsonl`
   AC: AC-DIAG-CFS-001
9. Author `docs/diagnostics/README.md` and `README.zh.md` updates describing the new section and `--features` flag; add brief before/after example.
   REQ: REQ-DIAG-CFS-5, REQ-DIAG-CFS-6
   Scope: `blueprint-diagnostics/docs/diagnostics/README.md`, `blueprint-diagnostics/docs/diagnostics/README.zh.md`
   AC: AC-DIAG-CFS-006
10. Run `node --experimental-test-isolation=none --test "blueprint-diagnostics/tests/*.test.js"` and `node lib/cli.js docs check --cwd .`.
    REQ: all
    Scope: -
    AC: AC-DIAG-CFS-006, AC-DIAG-CFS-007

## Lifecycle

- Status: proposed
- Target status after approval: implemented (file moves to `.specs/implemented/`).

## Truth-delta

New facts added:
- `blueprint-diagnostics audit` emits a `## Cross-feature scope` Markdown section.
- `report.crossFeature` field exists on `AuditReport`.
- `--features <dir>` CLI flag exists on `audit`.
- `cross-feature-scope` threshold block exists in `lib/thresholds.js`.

Existing facts preserved:
- All existing fields on `AuditReport`, all existing CLI behaviour without `--features`, all existing tests.

## Traceability

REQ-DIAG-CFS-1 → scenario[happy-cross-feature] → task 2, 4 → AC-DIAG-CFS-001 → verification tests/cross-feature.test.js
REQ-DIAG-CFS-2 → scenario[happy-cross-feature], [no-catalog-fallback], [four-features-red] → task 3 → AC-DIAG-CFS-003, AC-DIAG-CFS-005 → verification tests/cross-feature.test.js
REQ-DIAG-CFS-3 → scenario[four-features-red] → task 2 → AC-DIAG-CFS-003 → verification tests/cross-feature.test.js
REQ-DIAG-CFS-4 → scenario[zh-feature-excluded] → task 1 → AC-DIAG-CFS-004 → verification tests/feature-catalog.test.js
REQ-DIAG-CFS-5 → scenario[no-catalog-fallback] → task 5 → AC-DIAG-CFS-002 → verification tests/cross-feature.test.js
REQ-DIAG-CFS-6 → scenario[happy-cross-feature] → task 4 → AC-DIAG-CFS-001 → verification tests/cross-feature.test.js

## Unresolved decisions

None. The three material questions (Feature-id regex, threshold values, dependency model) are settled in the Assumptions section.

## Assumptions

1. Feature ids match the regex `[a-z0-9]+(?:--[a-z0-9]+)*`. This covers every existing Feature id in `.blueprint/features/`.
2. The default Feature catalog path `.blueprint/features/` matches the host-plugin's catalog convention. When absent, the audit silently degrades to `green`.
3. The `cross-feature-scope` verdict joins the existing `verdicts` object but does not modify the existing five dimensions; its dominant eligibility only kicks in when other dimensions are also yellow/red and the break-point ordering picks it.

## Non-goals

- No real-time DSH integration (no command injection, no compaction hooks, no retry policy changes).
- No change to existing thresholds in `lib/thresholds.js` for retry, compaction, or top-N dimensions.
- No host-plugin import inside the diagnostics package.

## Alternatives considered

**Reuse the host plugin's Feature loader.** Rejected because it would break the diagnostics package's 0-dependency contract. The package must remain installable on a machine without DSH or `@dsh-plugins/design-blueprint`.

**Compute cross-Feature scope via Spec filename regex instead of catalog.** Rejected because Spec filenames are local to one repo, while Feature ids are the cross-project vocabulary.

**Emit cross-Feature scope as a separate CLI subcommand.** Rejected because the dimension composes naturally with the rest of the audit and belongs in the same Markdown report.

## Quality checklist (self-attested)

- requirements complete: ✓ (each REQ names actor, input, expected output)
- requirements unambiguous: ✓ (regex and thresholds specified as literals)
- requirements bounded: ✓ (only the listed files)
- requirements failure-aware: ✓ (missing catalog handled in REQ-DIAG-CFS-5 + Scenario no-catalog-fallback)
- requirements testable: ✓ (each REQ has a programmatic test or CLI check)
- requirements non-contradictory: ✓ (no REQ conflicts with another)

## Cross-artifact analysis

- requirements-to-scenarios: ✓ all 6 REQs covered by 5 scenarios
- requirements-to-impact: ✓ all 6 REQs map to one or more files in ## Impact
- requirements-to-tasks: ✓ each task lists REQs
- requirements-to-acceptance: ✓ each AC names REQs
- requirements-to-verification: ✓ each AC names a verification command or test
- tasks-to-scope: ✓ each task names a Scope path inside the diagnostics package
- design-to-scope: not applicable (designRequired: false)
- scope-to-paths: ✓ every Scope path matches a real file path
