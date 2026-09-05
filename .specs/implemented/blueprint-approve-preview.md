# Spec: Blueprint approve preview

Status: implemented
Feature: spec-governance

## Problem

`design-blueprint approve <feature-id> --spec-hash <hash> --yes` accepts a hash and writes the approval record, but the CLI never shows what is being approved. The developer must open the proposed Spec in another tool, compute its hash themselves, and reconcile the two by hand. The Web dashboard's `getBlueprintDashboard` already returns `artifacts.brief.{en,zh}.content` for every Feature, so the data exists; only the CLI render is missing. This Spec adds that render at the CLI level.

The same render is also useful on its own: a developer can review any proposed Spec via `design-blueprint spec show <path>` without going through the approval dance.

## Scope

### Allowed paths

- allow: `docs/user/features/blueprint-approve-preview.md`
- allow: `docs/user/features/blueprint-approve-preview.zh.md`
- allow: `docs/user/features/blueprint-approve-preview.i18n.yaml`

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
- deny: `lib/assistant-actions.js`
- deny: `lib/init.js`
- deny: `lib/project-root.js`
- deny: `lib/project-discovery.js`
- deny: `lib/invariant.js`
- deny: `.blueprint/approvals/**`
- deny: `.blueprint/verifications/**`
- deny: `.specs/**` outside this Spec pair
- deny: `docs/i18n/**`
- deny: `design-blueprint.json` default or authority sections

## Decision
### `spec show <path> [--no-line-numbers] [--json]`

Read a Spec file and print it to stdout with one-based line numbers in the left column. The print is suitable for piping into `less` or any pager.

`--no-line-numbers` strips the gutter for cases where the consumer wants a clean render (e.g., piping into a Markdown renderer).

`--json` emits a JSON object with `{ file, lineCount, byteCount, content }`. Useful for tooling.

The command is read-only and never touches the filesystem or any approval / verification record.

### `approve <feature-id> --spec-hash <hash> --yes --show`

Print the proposed Spec to stdout **before** writing the approval record. The hash, source file path, and a one-line summary appear in a header, followed by the full Spec body. The approval is recorded only after the Spec is fully printed, so a developer reading the output can abort (Ctrl-C) and leave the approval uncommitted.

The `--show` flag is independent of `--yes`. A developer can run `approve --show` without `--yes` to read the Spec without approving it; the existing `--yes` requirement stays in place for actual approval.

### Shared render helper

`lib/cli.js` gains a single internal helper `renderSpecForReview(filePath, options)` that both subcommands call. The helper resolves the file path, reads the content, computes line and byte counts, and emits the gutter-formatted text. There is no public export; both commands stay self-contained.

## Acceptance criteria

- AC-AP-001: `design-blueprint spec show --spec .specs/proposed/foo.md` prints the file content with line numbers; the first non-empty line is `# Spec: <title>`; the last line is a trailing newline. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-AP-002: `design-blueprint spec show --spec <missing>` exits non-zero with a clear "file not found" error pointing at the resolved path. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-AP-003: `design-blueprint spec show --spec <file> --no-line-numbers` prints the same content without a leading gutter column. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-AP-004: `design-blueprint spec show --spec <file> --json` emits valid JSON with `file`, `lineCount`, `byteCount`, and `content` fields. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-AP-005: `design-blueprint approve <feature-id> --spec-hash <hash> --show` prints the Spec source file path, the hash, a one-line summary, and the full Spec body to stdout; the approval is written only after the print completes. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-AP-006: `design-blueprint approve <feature-id> --spec-hash <hash> --show` without `--yes` prints the Spec but does not write the approval record. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-AP-007: `design-blueprint approve <feature-id> --spec-hash <hash> --yes` without `--show` does not print the Spec body, preserving the existing one-line approval output. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-AP-008: All existing tests in `tests/*.test.js` continue to pass after the change. [surface=cli; moment=terminal; evidence=contract-integration]

## Verification

- AC-AP-001: test `tests/cli-spec-show.test.js`
- AC-AP-002: test `tests/cli-spec-show.test.js`
- AC-AP-003: test `tests/cli-spec-show.test.js`
- AC-AP-004: test `tests/cli-spec-show.test.js`
- AC-AP-005: test `tests/cli-approve-preview.test.js`
- AC-AP-006: test `tests/cli-approve-preview.test.js`
- AC-AP-007: test `tests/cli-approve-preview.test.js`
- AC-AP-008: command `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js"`

## Risks

- The render dumps the raw Markdown of a proposed Spec into the developer's terminal. A malicious Spec could embed ANSI escapes (e.g., `\u001b[2J` to clear the screen) that confuse the developer. The render helper must therefore pass content through a minimal escape: strip CR (`\r`) to avoid log-injection, and reject content containing the ESC byte (`\u001b`) unless `--json` is set. The Spec language is Markdown, which has no legitimate use for ESC sequences.
- The `--show` print runs synchronously before the approval is written, so a long Spec (Phase 2's 12 000-character decomposition Spec is plausible) produces a long stream to stdout. The framework already streams via stdout; no buffering is added. A future Spec may add `--show | head -N` style paging hooks if real workloads need it.
- The implementation adds new subcommands (`spec show`) and a new flag (`--show` on `approve`). Both go through the same CLI parser, so an unknown-flag error path remains covered by the existing tests.

## Alternatives considered

**Just print via `cat` (or `Get-Content` on Windows).** Rejected because the gutter and the ESC-byte rejection must be uniform across all callers; an ad-hoc `cat` pipe gives no protection. A native render also lets the same helper power a future Web-panel preview without duplicating the safety rules.

**Add a `?show=1` query flag to the Web approval route and drop the CLI flag entirely.** Rejected because Blueprint Web is currently out of reach from this session and the developer has explicitly authorized the CLI fallback path for this work. The CLI flag is the present-day surface; the Web flag is a future Spec.

**Render into a temp file and `xdg-open` it.** Rejected because it introduces a tmp-file lifecycle (creation, deletion, error path) for a tiny UX improvement. A terminal render is enough.

## Tasks

1. Implement `lib/cli.js` `runSpecShow` subcommand plus `renderSpecForReview` helper; register the new `spec show` dispatch in `main()`. REQ: AC-AP-001..AC-AP-004. Scope: `tests/cli-spec-show.test.js`, `docs/user/features/blueprint-approve-preview.{md,zh.md,i18n.yaml}`.
2. Add the `--show` flag to `runApprove` in `lib/cli.js`; print the Spec before writing the approval record when set. REQ: AC-AP-005..AC-AP-007. Scope: `tests/cli-approve-preview.test.js`.
3. Extend `package.json` lint:js script to include the two new test files. REQ: AC-AP-008. Scope: `package.json`.
4. Author `docs/user/features/blueprint-approve-preview.md` + `.zh.md` + `.i18n.yaml`; run `node lib/cli.js docs confirm <owner>` after authoring. REQ: AC-AP-001..AC-AP-008. Scope: docs.
5. Run `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js"` and `node lib/cli.js scan --all --cwd .`; confirm scan reports `0 required` and the full test suite still passes. REQ: AC-AP-008. Scope: -

## Consequences

Blueprint completed this delivery automatically after requirement-linked verification.

- Verified snapshot: `git-index:089cc57b4dd1159998989b7e7eea5cfe0b56de48752e911fe03866f976a337d3`
- Verification attempt: `attempt-1`
- Conclusion: blueprint-approve-preview implementation complete. lib/cli.js adds spec show subcommand (with --no-line-numbers and --json options) and --show flag to approve. renderSpecForReview helper guards against ESC byte injection. 10 new tests pass; bilingual docs pair confirmed.
- AC evidence: all 8 acceptance criteria passed.
- Check evidence: spec-show-unit (command), approve-preview-unit (command), full-suite (command), docs-check (command).
