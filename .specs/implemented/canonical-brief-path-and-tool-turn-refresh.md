# Spec: Canonical brief path and tool-turn refresh

Status: implemented

## Problem

The Blueprint dashboard reads a selected feature's Product brief only from `docs/user/features/<feature-id>.md` and its `.zh.md` counterpart. When those files do not exist, however, the independent reviewer prompt labels their paths only as "not generated". A file-editing Agent can therefore invent a plausible filename that does not equal the current Feature id; the write succeeds, but the left document column cannot discover it.

The review panel also refreshes the dashboard only after it observes another finalized assistant text message. A successful tool-oriented turn may finish after file writes without publishing final assistant text. In that case the files exist at the correct path, but the left column remains stale until the developer manually refreshes the page.

## Scope

- allow: `lib/client.js`
- allow: `lib/version.js`
- allow: `tests/**`
- allow: `package.json`
- allow: `DESIGN.md`
- allow: `README.md`
- allow: `README.zh.md`
- allow: `README.i18n.yaml`
- allow: `.specs/**`

## Decision

Define one browser-client helper that derives the exact English and Chinese Product brief paths from the selected Feature id. Use those canonical paths in the reviewer context even while the files are missing, mark the content state separately, instruct the reviewer never to invent another name or location, and display the expected path in the left column's missing-file state.

Retain finalized-assistant detection as an early refresh signal, and additionally detect the Session transition from running to settled. If a submitted review turn is awaiting refresh, either signal reloads the dashboard exactly once. This covers tool-only successful turns while preserving ordinary text-answer behavior and the manual refresh recovery action.

Release the fix as `0.13.2` so package, Host, and browser versions reveal whether the corrected contract is loaded.

## Alternatives considered

**Move Product briefs beside Feature definitions or lifecycle Specs.** Rejected because `docs/user/features/` is the existing product-guide authority and the dashboard already reads that canonical location.

**Search the repository for similar filenames after every write.** Rejected because fuzzy discovery would hide naming errors and could attach the wrong document to a Feature.

**Refresh only on a timer.** Rejected because polling adds unnecessary requests and still does not define which file belongs to the selected Feature.

## Verification

- AC-PATH-1/2: `tests/client-runtime.test.js`, `tests/reviewer.test.js`, and `tests/spec-workspace.test.js` verify deterministic Feature-id-derived English/Chinese brief paths, missing-state path attributes, strict reviewer write instructions, and the exact expected path in the left column.
- AC-REFRESH-1/2: `tests/client-runtime.test.js` verifies the running-to-settled transition predicate; `tests/reviewer.test.js` and `tests/spec-workspace.test.js` pin the submitted-turn gate, shared exactly-once refresh helper, finalized-text signal, settled-Session signal, and manual recovery action.
- AC-VERSION-1: `tests/client.test.js` pins package and browser client `0.13.2`; `node lib/cli.js docs check --cwd .` confirms all 4 bilingual pairs after semantic review of the README changes.
- `npm.cmd test` passes 43 of 43 tests.
- `npm.cmd run lint:js` passes every declared JavaScript syntax check.
- `node lib/cli.js scan --all --cwd .` reports 0 required and 0 recommended issues against the working-tree snapshot before lifecycle archival.
- `npm.cmd pack --dry-run --json --cache <temporary-cache>` produces the `0.13.2` package manifest with the corrected client and lifecycle Spec pair.

## Consequences

Product briefs remain in the product-guide authority at `docs/user/features/`, but their identity is now explicit before creation and cannot drift from the selected Feature id without violating the reviewer prompt. Successful tool-only file turns update the left column without requiring an assistant summary or manual reload. Background Session reconnects cannot trigger this refresh because the running transition remains gated by a submitted turn awaiting refresh.
