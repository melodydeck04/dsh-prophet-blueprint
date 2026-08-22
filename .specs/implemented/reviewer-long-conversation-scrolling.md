# Spec: Reviewer long-conversation scrolling

Status: implemented

## Problem

The Spec assistant uses a bounded flex column for its conversation, but message turns and activity cards remain shrinkable flex children. As history grows, the browser may compress earlier entries to satisfy the panel height instead of preserving their readable height and scrolling the conversation viewport. Long message bodies also have no explicit inner overflow boundary, and unconditional streaming auto-scroll pulls a developer back to the bottom while they are reading older content.

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

Make the review panel a definite-height scroll container on desktop and a bounded-height container in the stacked layout. Prevent conversation entries from shrinking, constrain every message and activity surface to the available column width, and give oversized message bodies and activity details their own vertical and horizontal overflow behavior. Preserve wrapping for ordinary prose while allowing code and uninterrupted tokens to scroll without widening the panel.

Track whether the developer is near the bottom of the conversation. Continue following streaming output only while the view is pinned near the bottom; when the developer scrolls upward, preserve that reading position and offer an explicit control to return to the newest content.

Release the fix as `0.13.1` so the Host, browser client, and package version reveal whether the corrected stylesheet is loaded.

## Alternatives considered

**Remove the panel height limit.** Rejected because a long review conversation would make the entire Blueprint page grow without a stable composer or document comparison area.

**Always force the conversation to the newest item.** Rejected because it prevents reading earlier turns while an assistant response is still streaming.

**Truncate long messages.** Rejected because review details and generated specifications must remain available; bounded scrolling is preferable to data loss.

## Verification

- AC-SCROLL-1/2/4: `tests/reviewer.test.js` pins the definite desktop and responsive panel heights, non-shrinking message/activity entries, scrollable conversation viewport, bounded inner message/activity surfaces, width containment, and Markdown code/table overflow.
- AC-SCROLL-3: `tests/client-runtime.test.js` verifies the 48-pixel near-bottom threshold; `tests/reviewer.test.js` pins conditional streaming follow, manual scroll detection, and the **Back to latest** action.
- AC-VERSION-1: `tests/client.test.js` pins package and browser client `0.13.1`; `node lib/cli.js docs check --cwd .` confirms all 4 bilingual pairs after semantic review of the README change.
- `npm.cmd test` passes 42 of 42 tests.
- `npm.cmd run lint:js` passes every declared JavaScript syntax check.
- `node lib/cli.js scan --all --cwd .` reports 0 required and 0 recommended issues against the working-tree snapshot before lifecycle archival.
- `npm.cmd pack --dry-run --json --cache <temporary-cache>` produces the `0.13.1` package manifest with the corrected client and lifecycle Spec pair.
- Interactive browser verification was unavailable because this task environment exposed no browser-control connection; automated layout and runtime assertions cover the delivered invariants without claiming a manual visual pass.

## Consequences

Long review histories now retain readable turn and activity heights while the conversation viewport owns scrolling. Oversized message bodies, activity details, code blocks, and tables remain complete inside bounded inner scroll areas and cannot widen the review column. Streaming still follows naturally at the bottom, but manual upward scrolling preserves the developer's reading position until **Back to latest** is selected. Nested scrolling remains a deliberate trade-off for retaining complete long-form review content inside a stable Spec workspace.
