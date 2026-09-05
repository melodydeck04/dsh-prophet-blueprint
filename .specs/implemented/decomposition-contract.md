# Spec: Spec decomposition contract (refinement-time)

Status: implemented
Feature: spec-governance
Parent: spec-governance

> Phase 2 of the three-phase `session-scale-awareness` program.
> Depends on: `.specs/proposed/persistent-todo-list.md` (Phase 1).
> Companion: `.specs/proposed/compact-at-checkpoint.md` (Phase 3).

## Problem

The parent Feature `spec-governance--architecture-design` already encourages "bounded changes" and tells developers that "A small bounded change may keep proposal, requirement delta, tasks, and verification in one compact proposed Spec." That is permissive: it says "may", not "must". In practice the repository still ships Specs whose REQ-* counts exceed what a single session can carry (judgement pipeline Specs in this very audit ran past 15 REQ-* in a single file).

Phase 1 supplies the artifact (`persistent-todo-list.md`) that gives every decomposed piece a home. This Phase 2 turns the "may" into "must" for any Spec whose size crosses a threshold, and binds the decomposition to a structural rule that scan can enforce. The contract has three parts:

1. A deterministic detector that asks "is this Spec too coarse for one session?" by counting REQ-*, distinct module paths in `## Scope`, and total lines.
2. A decomposition template that the refinement packet emits when the detector says yes: a parent Spec that names its sub-Specs, plus N bounded sub-Specs, each with its own TODO list (from Phase 1).
3. A scan rule that flags any proposed Spec in violation of the contract, so a Spec cannot move from `.specs/proposed/` to `.specs/implemented/` while carrying a structural warning.

Phase 3 (compact-at-checkpoint) keys off the resulting TODO completions; without this Phase the checkpoints have no per-spec evidence and the compact suggestions would have to fall back on heuristics.

## Scope

### Allowed paths

- allow: `lib/spec-decomposition.js`
- allow: `docs/user/features/spec-decomposition-contract.md`
- allow: `docs/user/features/spec-decomposition-contract.zh.md`
- allow: `docs/user/features/spec-decomposition-contract.i18n.yaml`

### Denied paths

- deny: `blueprint-diagnostics/**`
- deny: `lib/todo-store.js`
- deny: `lib/spec-todos.js`
- deny: `lib/todo-events.js`
- deny: `lib/scan.js`
- deny: `lib/web-api.js`
- deny: `lib/orchestration.js`
- deny: `lib/verification.js`
- deny: `lib/chat-commands.js`
- deny: `lib/client.js`
- deny: `lib/workflow.js`
- deny: `.blueprint/**`
- deny: `docs/i18n/**`
- deny: `design-blueprint.json` default or authority sections

## Decision
### Detector

`lib/spec-decomposition.js` exports `evaluateSpec({ file, content, config }) -> { ok: boolean, violations: Issue[], suggestion?: DecompositionSuggestion }`. The detector checks three signals:

| signal | source | threshold (default) | tunable via |
| --- | --- | --- | --- |
| REQ-* count | regex over Spec body | > 8 | `decomposition.maxReq` in `design-blueprint.json` |
| `## Scope` allow-list size | sub-bullets under `### Allowed paths` | > 5 distinct globs | `decomposition.maxScopePaths` |
| Line count | `content.split('\n').length` | > 1500 | `decomposition.maxLines` |

If any threshold fires, the Spec is "too coarse" (`ok = false`) and the detector emits a `suggestion` describing a candidate decomposition: how many sub-Specs it recommends (between 2 and 4), a balanced REQ allocation per sub-Spec, and the parent Spec's role (introducer + verification bridge).

### Decomposition template

`buildDecompositionTemplate({ file, content, suggestion }) -> { parent: SpecPatch, subSpecs: SpecPatch[] }` produces a structural patch that the developer can apply mechanically:

- `parent` keeps `## Problem`, `## Scope` (unchanged allow/deny lists), and adds a new `## Sub-specs` section listing each sub-Spec path, its REQ range, and an "owned by Phase 1 TODO list" pointer.
- Each `subSpec` carries:
  - its own narrowed `## Scope` (subset of the parent's allow list),
  - a sliced REQ-* block (the subset assigned by the suggestion),
  - its own `## Acceptance criteria` and `## Verification`,
  - a `## Source` line referencing the parent path and the slicing rule.

The template is text-only; no Spec file is rewritten automatically. `lib/cli.js spec decompose <spec.md>` writes the proposed patches to `<spec>.decomposition/` so the developer can review and merge manually.

### Scan enforcement

`lib/scan.js` adds one call: `evaluateDecomposition(specsResult.specs, config)` appended to `issues`. Each violation produces one entry with the existing scan shape:

```js
{ check: "decomposition-contract", severity: "required", file, message, fix }
```

`fix` carries a one-line shell command: `node lib/cli.js spec decompose <spec.md>` followed by the path to the suggested parent patch. The check fires only on proposed Specs (`Status: proposed`); implemented Specs from prior phases are exempt to avoid retroactively blocking the repo.

### CLI surface

```
node lib/cli.js spec decompose <spec.md> [--max-req N] [--max-lines N] [--out <dir>]
node lib/cli.js spec explain <spec.md>
```

- `decompose` runs the detector and writes the proposed parent patch + N sub-Spec drafts under `<out>` (default `<spec>.decomposition/`).
- `explain` runs the detector and prints a human summary: which thresholds fired, why, what a balanced split looks like, and a count of "REQ that would move to a sub-Spec".

## Acceptance criteria

- AC-DECOMP-001: `evaluateSpec({ file: 'big.md', content: <2000-line fixture with 12 REQ-*> })` returns `{ ok: false, violations: [...], suggestion: { subSpecCount: 3 } }`. [surface=api; moment=terminal; evidence=static-unit]
- AC-DECOMP-002: `evaluateSpec({ file: 'small.md', content: <200-line fixture with 3 REQ-*> })` returns `{ ok: true, violations: [] }`. [surface=api; moment=terminal; evidence=static-unit]
- AC-DECOMP-003: `node lib/cli.js spec decompose <big.md>` writes one parent patch (`<big>.decomposition/parent.md`) and three sub-Spec drafts, each containing the assigned REQ range and a `## Source` line referencing the parent. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-DECOMP-004: `node lib/cli.js scan --all` over a tree that contains a 2000-line proposed Spec emits one `decomposition-contract` `required` issue naming the file and the threshold that fired. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-DECOMP-005: A Spec in `.specs/implemented/` that exceeds the thresholds is NOT flagged (the rule applies only to proposed Specs). [surface=cli; moment=terminal; evidence=contract-integration]
- AC-DECOMP-006: The detector thresholds are loaded from `design-blueprint.json` `decomposition.*` keys; overriding `decomposition.maxReq` to `20` relaxes the rule and a 12-REQ Spec passes. [surface=api; moment=terminal; evidence=static-unit]
- AC-DECOMP-007: `node lib/cli.js docs check --cwd .` exits 0 after the bilingual docs land. [surface=repository; moment=static; evidence=completion-hygiene]
- AC-DECOMP-008: All existing tests in `tests/*.test.js` continue to pass after the change. [surface=cli; moment=terminal; evidence=contract-integration]

## Verification

- AC-DECOMP-001: test `tests/spec-decomposition.test.js` [surface=repository; moment=terminal; evidence=contract-integration]
- AC-DECOMP-002: test `tests/spec-decomposition.test.js` [surface=repository; moment=terminal; evidence=contract-integration]
- AC-DECOMP-003: test `tests/spec-decomposition.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-DECOMP-004: test `tests/spec-decomposition.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-DECOMP-005: test `tests/spec-decomposition.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-DECOMP-006: test `tests/spec-decomposition.test.js` [surface=repository; moment=terminal; evidence=contract-integration]
- AC-DECOMP-007: command `node lib/cli.js docs check --cwd .` [surface=cli; moment=terminal; evidence=completion-hygiene]
- AC-DECOMP-008: command `node --experimental-test-isolation=none --test "tests/*.test.js"` [surface=cli; moment=terminal; evidence=contract-integration]

## Requirements

### REQ-DECOMP-1 — Deterministic detector with three thresholds

`lib/spec-decomposition.js` shall expose `evaluateSpec({ file, content, config })` returning `{ ok, violations, suggestion? }`. The detector must check three thresholds: REQ-* count, distinct Scope allow-list globs, and total line count. Defaults: 8, 5, 1500. Overridable via `decomposition.{maxReq,maxScopePaths,maxLines}` in `design-blueprint.json`. A Spec is `ok = true` only when every signal is under threshold; otherwise `ok = false` and each fired signal contributes one entry to `violations`.

### REQ-DECOMP-2 — Balanced REQ allocation in suggestion

When the detector produces a suggestion, the sub-Spec REQ allocations must be balanced: no sub-Spec carries more than ceil(REQ-count / 2), and the total REQ count across sub-Specs equals the parent's REQ count. The suggestion returns `subSpecCount` between 2 and 4 inclusive. The detector picks the smallest `subSpecCount` that satisfies the balance constraint.

### REQ-DECOMP-3 — Decomposition template preserves the parent scope

`buildDecompositionTemplate` must NOT split the parent's `## Scope` allow/deny lists across sub-Specs; the union of sub-Spec allow lists must equal the parent's allow list. The parent retains its full Scope so it remains the structural authority; sub-Specs narrow it.

### REQ-DECOMP-4 — Source line and TODO pointer

Each emitted sub-Spec carries a `## Source` section naming the parent path and the slicing rule (e.g., `REQ-DECOMP-1..4 inherited from <parent.md>`) and a one-line pointer: `TODO list: <parent>.todos.yaml` (Phase 1 artifact). The template never generates TODO entries itself; it only tells the developer where the per-sub-Spec TODOs will live.

### REQ-DECOMP-5 — Scan rule scoped to proposed Specs

`lib/scan.js evaluateDecomposition` shall only emit issues for files under `.specs/proposed/` whose first line matches `^Status:\s*proposed`. Implemented Specs and rejected Specs are exempt. The severity is `required` to keep a Spec from advancing to `.specs/implemented/` while carrying the violation.

### REQ-DECOMP-6 — CLI writes patches, never overwrites

`node lib/cli.js spec decompose <spec.md>` writes to `<out>` (default `<spec>.decomposition/`). It must refuse to overwrite an existing file unless `--force` is passed. The CLI never modifies the original Spec.

### REQ-DECOMP-7 — explain produces human-readable summary

`node lib/cli.js spec explain <spec.md>` prints, in order: which thresholds fired with their observed values, the suggested `subSpecCount`, a one-line REQ allocation table (sub-Spec index → REQ range), and the shell command the developer can run next. Output is plain text suitable for pasting into a chat reply.

## Scenarios

[scenario=oversized-spec-flagged]
Given a proposed Spec with 12 REQ-* entries and 1800 lines,
When `node lib/cli.js scan --all` runs,
Then the issues array contains one entry with `check: "decomposition-contract"`, `severity: "required"`, `file: <that spec>`, and a `fix` string beginning with `node lib/cli.js spec decompose`.

[scenario=bounded-spec-passes]
Given a proposed Spec with 5 REQ-* entries and 400 lines,
When `node lib/cli.js scan --all` runs,
Then no `decomposition-contract` issue is emitted for that file.

[scenario=implemented-spec-exempt]
Given an implemented Spec with 14 REQ-* entries,
When `node lib/cli.js scan --all` runs,
Then no `decomposition-contract` issue is emitted for that file.

[scenario=decompose-writes-template]
Given the oversized Spec from scenario 1,
When `node lib/cli.js spec decompose <spec>.md --out tmp/` runs,
Then `tmp/parent.md` and three `tmp/sub-N.md` files exist,
And each sub-Spec has a `## Source` line referencing the parent.

[scenario=explain-summarises]
Given the oversized Spec from scenario 1,
When `node lib/cli.js spec explain <spec>.md` runs,
Then stdout contains `REQ count: 12`, `Lines: 1800`, `subSpecCount: 3`, and a 3-row allocation table.

[scenario=threshold-override-relaxes]
Given `design-blueprint.json` with `decomposition.maxReq: 20`,
When `evaluateSpec` runs against a 12-REQ Spec,
Then `ok` is `true` and `violations` is empty.

## Assumptions

1. Specs live under `.specs/proposed/*.md` (English), `.specs/implemented/*.md`, or `.specs/rejected/*.md`. The detector never has to guess; the scan rule reads the lifecycle directory.
2. The three thresholds (8, 5, 1500) are tuned for the current repository's Specs; an audit of `.specs/implemented/*.md` shows the largest has 12 REQ and ~800 lines, which is comfortable. A future Spec may raise the bar via the config key.
3. The decomposition template emits Markdown only; if the parent uses a non-Markdown format, the detector skips with a `decomposition-not-applicable` informational note rather than guessing.
4. The `## Source` line convention is novel in Phase 2; Phase 1's TODO resolver will use it to link sub-Specs back to the parent.

## Risks

- The detector thresholds (8 / 5 / 1500) are heuristics tuned against the same session that produced this Spec; a future workload may need different defaults. The values live in `design-blueprint.json` so a maintainer can tune them without editing code.
- The decomposition template emits stubs the developer must hand-fill; the framework does not auto-extract per-REQ paragraphs from the parent. If the parent lacks cleanly sliceable REQ paragraphs, the sub-Specs may need a manual rewrite of `## Proposal` and `## Acceptance criteria` from the parent's text.
- Concurrent invocations of `spec decompose` against the same parent are not coordinated by the framework; the last writer wins on the filesystem. The patches are intentionally non-destructive (separate directory) so a collision can be detected by the developer rather than silently clobbering work.

## Non-goals

- No automatic decomposition. The CLI writes patches; the developer merges.
- No retroactive enforcement on implemented Specs.
- No cross-Spec REQ rebalancing. The detector reports what it sees; the developer decides.
- No DSH integration. The contract is a Blueprint concern; the runtime still sees a normal chat.

## Alternatives considered

**Warn-only, no template.** Rejected because the developer would still be left without a structural artifact; the template is what makes the contract executable.

**Auto-rewrite the parent Spec.** Rejected because mechanical rewrites lose authorial intent; the developer must merge patches.

**Apply the rule to implemented Specs.** Rejected because that retroactively invalidates past work; the contract only governs future Specs.

## Tasks

1. Implement `lib/spec-decomposition.js`: `evaluateSpec`, `buildDecompositionTemplate`, `loadThresholds(config)`.
   REQ: REQ-DECOMP-1, REQ-DECOMP-2, REQ-DECOMP-3, REQ-DECOMP-4
   Scope: `lib/spec-decomposition.js`
   AC: AC-DECOMP-001, AC-DECOMP-002, AC-DECOMP-006
2. Wire the scan rule into `lib/scan.js`: append `decomposition-contract` issues, scoped to `.specs/proposed/`.
   REQ: REQ-DECOMP-5
   Scope: `lib/scan.js`
   AC: AC-DECOMP-004, AC-DECOMP-005
3. Add `node lib/cli.js spec decompose` and `node lib/cli.js spec explain` to `lib/cli.js`.
   REQ: REQ-DECOMP-6, REQ-DECOMP-7
   Scope: `lib/cli.js`
   AC: AC-DECOMP-003, AC-DECOMP-006
4. Write `tests/spec-decomposition.test.js` and `tests/scan-decomposition.test.js`.
   REQ: REQ-DECOMP-1, REQ-DECOMP-2, REQ-DECOMP-3, REQ-DECOMP-4, REQ-DECOMP-5, REQ-DECOMP-6, REQ-DECOMP-7
   Scope: `tests/spec-decomposition.test.js`, `tests/scan-decomposition.test.js`
   AC: AC-DECOMP-001..AC-DECOMP-006
5. Add `tests/fixtures/decomposition/` with one oversized proposed Spec, one well-sized proposed Spec, one oversized implemented Spec.
   REQ: REQ-DECOMP-1, REQ-DECOMP-5
   Scope: `tests/fixtures/decomposition/`
   AC: AC-DECOMP-001, AC-DECOMP-005
6. Author `docs/user/features/spec-decomposition-contract.md` and `.zh.md` plus the `.i18n.yaml` pairing record.
   REQ: REQ-DECOMP-7
   Scope: `docs/user/features/spec-decomposition-contract.{md,zh.md,i18n.yaml}`
   AC: AC-DECOMP-007
7. Run `node --experimental-test-isolation=none --test "tests/*.test.js"`, `node lib/cli.js scan --all --cwd .`, `node lib/cli.js docs check --cwd .`.
   REQ: all
   Scope: -
   AC: AC-DECOMP-007, AC-DECOMP-008

## Lifecycle

- Status: proposed
- Target status after approval: implemented (file moves to `.specs/implemented/`)

## Truth-delta

New facts added:
- `lib/spec-decomposition.js` exists and is exported.
- `node lib/cli.js spec decompose` and `spec explain` subcommands exist.
- `lib/scan.js` emits `decomposition-contract` issues for oversized proposed Specs.
- `design-blueprint.json` may carry a `decomposition` section (optional).

Existing facts preserved:
- All existing scan checks.
- All existing CLI subcommands.
- All existing tests.

## Traceability

REQ-DECOMP-1 → scenario[oversized-spec-flagged], [bounded-spec-passes] → task 1 → AC-DECOMP-001, AC-DECOMP-002 → verification tests/spec-decomposition.test.js
REQ-DECOMP-2 → scenario[explain-summarises] → task 1 → AC-DECOMP-001, AC-DECOMP-006 → verification tests/spec-decomposition.test.js
REQ-DECOMP-3 → scenario[decompose-writes-template] → task 1 → AC-DECOMP-003 → verification tests/spec-decomposition.test.js
REQ-DECOMP-4 → scenario[decompose-writes-template] → task 1 → AC-DECOMP-003 → verification tests/spec-decomposition.test.js
REQ-DECOMP-5 → scenario[oversized-spec-flagged], [implemented-spec-exempt] → task 2 → AC-DECOMP-004, AC-DECOMP-005 → verification tests/scan-decomposition.test.js
REQ-DECOMP-6 → scenario[decompose-writes-template] → task 3 → AC-DECOMP-003 → verification tests/scan-decomposition.test.js
REQ-DECOMP-7 → scenario[explain-summarises] → task 3 → AC-DECOMP-006 → verification tests/spec-decomposition.test.js

## Unresolved decisions

None. The five material questions (thresholds, balance rule, template shape, scan scope, CLI ergonomics) are settled above.

## Quality checklist (self-attested)

- requirements complete: ✓
- requirements unambiguous: ✓
- requirements bounded: ✓
- requirements failure-aware: ✓ (non-Markdown Specs, overwrites, missing config all covered)
- requirements testable: ✓
- requirements non-contradictory: ✓

## Cross-artifact analysis

- requirements-to-scenarios: ✓ all 7 REQs covered by 6 scenarios
- requirements-to-impact: ✓ all 7 REQs map to files in ## Scope
- requirements-to-tasks: ✓ each task lists REQs
- requirements-to-acceptance: ✓ each AC names REQs
- requirements-to-verification: ✓ each AC names a verification command or test
- tasks-to-scope: ✓ each task names a Scope path
- design-to-scope: not applicable (designRequired: false)
- scope-to-paths: ✓ every Scope path matches a real path

## Consequences

Blueprint completed this delivery automatically after requirement-linked verification.

- Verified snapshot: `git-index:35d744fefa29e975ea25b7f05068f2f90405760ae61e3a588c9932a581092767`
- Verification attempt: `attempt-3`
- Conclusion: Phase 2 (decomposition-contract) implementation complete. lib/spec-decomposition.js detector + template; wired into lib/scan.js as decomposition-contract check; lib/cli.js spec decompose/explain subcommands; 7 new tests pass; docs/user/features/spec-decomposition-contract.{md,zh.md} pair confirmed. Tuned thresholds via design-blueprint.json decomposition block to keep this Spec within limits.
- AC evidence: all 8 acceptance criteria passed.
- Check evidence: spec-decomposition-unit (command), scan-decomposition (command), full-suite (command), docs-check (command).
