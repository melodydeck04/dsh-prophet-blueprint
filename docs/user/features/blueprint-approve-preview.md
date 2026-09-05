# Blueprint approve preview

English | [中文](blueprint-approve-preview.zh.md)

## What it does

`design-blueprint approve <feature-id> --spec-hash <hash> --yes --show` now prints the proposed Spec to the terminal **before** writing the approval record, so a developer can read what they are approving without leaving the CLI. A second command, `design-blueprint spec show <path>`, prints any proposed Spec with one-based line numbers for quick review without going through the approval dance.

The render lives in `lib/cli.js` as a single helper, `renderSpecForReview(filePath, options)`. Both commands call it; both reuse the same line-number gutter and the same ESC-byte safety check (the renderer rejects content carrying `\u001b` unless `--json` is set, so a hostile Spec cannot clear the developer's terminal).

## Expected result

- `design-blueprint spec show --spec .specs/proposed/foo.md` prints the file content with one-based line numbers; the first non-empty line is `# Spec: <title>`; the last line ends with a newline.
- `design-blueprint spec show --spec .specs/proposed/foo.md --no-line-numbers` prints the same content without the gutter column.
- `design-blueprint spec show --spec .specs/proposed/foo.md --json` emits a JSON object with `file`, `lineCount`, `byteCount`, and `content` fields.
- `design-blueprint spec show --spec <missing>` exits non-zero with `spec file not found: <path>`.
- `design-blueprint approve <feature-id> --spec-hash <hash> --show` prints a header (feature id, source path, hash, line and byte counts) followed by the Spec body, and only writes the approval record when the developer also passes `--yes`.
- `design-blueprint approve <feature-id> --spec-hash <hash> --show --json` emits a single JSON envelope with the same data plus the full content field.

## How to use

1. Review a Spec without approving:
   ```bash
   design-blueprint spec show --spec .specs/proposed/foo.md
   ```
2. Approve a Spec and read what you approved on the way through:
   ```bash
   design-blueprint approve spec-governance \
     --spec-hash cd251b7f2c0fd87e0332401753a242c6d2357ff886bc52d96e195544be8d3d6e \
     --show --yes
   ```
3. Pipe the rendered Spec into `less` for long files:
   ```bash
   design-blueprint spec show --spec .specs/proposed/foo.md | less -R
   ```

## Companion

This Spec depends on Phase 1's persistent TODO list only insofar as the rest of the CLI does. It is the read-side companion to `design-blueprint approve <feature-id> --spec-hash <hash> --yes`: the developer can now see, not just sign, the exact bytes they are locking in.