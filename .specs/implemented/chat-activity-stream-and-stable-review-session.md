# Spec: Chat activity stream and stable review session

Status: implemented

## Problem

The Spec assistant currently flattens a DSH conversation into user text and assistant text. It streams only `kind: text` blocks, so the panel remains on a generic running label while DSH Chat is showing reasoning summaries, tool calls, file changes, and subagent activity. The review session key also includes the exact Spec hash. A successful direct edit therefore makes the assistant's own session immediately stale and the next message starts another review session.

The Web dashboard feature has an English Feature-linked lifecycle Spec but no Chinese counterpart. Although the new bilingual feature brief exists, the Development Spec language switch cannot display a Chinese file for the selected feature.

## Scope

- allow: `lib/client.js`
- allow: `lib/version.js`
- allow: `tests/**`
- allow: `package.json`
- allow: `DESIGN.md`
- allow: `README.md`
- allow: `README.zh.md`
- allow: `README.i18n.yaml`
- allow: `docs/user/features/**`
- allow: `.blueprint/features/web-dashboard.md`
- allow: `.specs/**`

## Decision

Project DSH's public conversation activity into the Spec assistant instead of discarding non-text blocks. Render DSH-exposed reasoning summaries, tool calls, file changes, and subagent or task activity as compact chronological activity cards, while continuing to stream final Markdown text with `MarkdownText`. Never fabricate or expose hidden chain-of-thought; only present fields already published by the DSH Session snapshot.

Make the review session identity stable for one project, feature, and review protocol. Do not include the mutable Spec review hash in the storage key or Session title. A direct edit then refreshes the document while the same conversation remains connected. Preserve an explicit reset path for starting a fresh assistant conversation, and update context on every submitted message so the reused Session sees the newest files.

Add a Chinese counterpart for the Web dashboard's existing Feature-linked implemented Spec so its Development Spec switch has real English and Chinese files. The plugin version becomes `0.13.0`.

## Alternatives considered

**Continue showing only a running label until answer text begins.** Rejected because it hides the exact activity that explains why the assistant is still working.

**Render raw snapshot JSON.** Rejected because it is unreadable, unstable, and may expose fields that DSH Chat does not treat as presentation content.

**Keep hash-addressed sessions and copy old messages into each new Session.** Rejected because it fragments one editing conversation and duplicates context already supplied with each message.

## Verification

- AC-ACTIVITY-1/2/3: `tests/dsh-compatibility.test.js` exercises finalized reasoning, streaming reasoning and text, file mutation, running subagent, and safe unknown-data behavior; `tests/reviewer.test.js` pins the activity UI.
- AC-SESSION-1/2: `tests/client-runtime.test.js` proves a changed Spec hash reuses one Session and submits the newest Spec content; `tests/reviewer.test.js` and `tests/spec-workspace.test.js` pin stable identity and explicit reset.
- AC-BILINGUAL-UI-1: `tests/specs.test.js` loads the actual Web dashboard Feature-linked English/Chinese Spec pair and verifies the English owner contains no Chinese prose.
- AC-VERSION-1: `tests/client.test.js` and `tests/dsh-compatibility.test.js` pin plugin `0.13.0` and DSH `0.1.1-rc.2`.
- `npm.cmd test` passes 40 of 40 tests.
- `npm.cmd run lint:js` passes every declared JavaScript syntax check.
- `node lib/cli.js docs check --cwd .` confirms all 4 bilingual documentation pairs.
- `node lib/cli.js scan --all --cwd .` reports 0 required and 0 recommended issues before lifecycle archival.
- `npm.cmd pack --dry-run --json --cache <temporary-cache>` includes the activity-aware client and both language files.

## Consequences

The Spec assistant now exposes useful progress instead of a generic running label, and a successful direct edit no longer fragments its own conversation. The page displays a real single-language English/Chinese Spec pair for the Web dashboard feature. DSH activity block shapes remain a preview contract, so projection is defensive and text-only fallback remains available. Stable Sessions can accumulate longer history; the explicit reset action provides a clean boundary when needed.
