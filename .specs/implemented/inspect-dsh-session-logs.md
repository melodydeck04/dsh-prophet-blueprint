# Spec: inspect local DSH session logs

Status: implemented

## Problem

The repository has small analyzers for plain `session.jsonl` files, but local DSH persistence stores session records in `~/.dsh/sessions/<project>/<session>/session.jsonl.zstd`. The in-progress `tools/peek-session.mjs` can decode zstd frames, yet it derives project paths from an ambiguous directory encoding and looks for a non-existent `parentSessionId` field. As a result, Windows project paths display as encoded names and subagent lineage cannot be inspected reliably.

## Proposal

Complete `tools/peek-session.mjs` as a read-only command-line inspector for local DSH zstd session logs. It will list and summarize persisted headers, render subagent ancestry, and expose bounded event inspection without modifying a running or archived DSH session. The tool remains outside the published Blueprint package and uses only Node.js built-ins.

## Research and compatibility

Inspected locally on 2026-09-09; this is a developer-only reader and does not load into the Blueprint plugin or change a DSH profile.

- Node.js `v22.23.1` exposes `node:zlib` `zstdDecompressSync`; live files below `C:/Users/Windows/.dsh/sessions/` begin with the zstd frame magic and contain newline-delimited JSON records after decompression.
- Installed DSH `0.1.2-rc.1` declares `SessionHeader` in `@deepseek-ai/dsh-commands/lib/typert.host.js`: `id`, optional `cwd`, optional `parentSession`, optional `origin: 'subagent'`, optional `delegationDepth`, and optional `agentPreset`.
- The installed session-controller schema uses `parentSession` in stored snapshots and derives its UI `parentSessionId` projection from it. `parentSessionId` is therefore not a persisted-header field for this tool to require.
- DSH's directory name is a storage key, not a reversible path representation: hyphens are both path separators and valid path characters. The persisted header's `cwd` is the authoritative display value whenever present.

## Scope

### Allowed paths

- allow: `tools/peek-session.mjs`
- allow: `tests/peek-session.test.js`
- allow: `docs/cookbook/inspect-dsh-session-logs.md`
- allow: `docs/cookbook/inspect-dsh-session-logs.zh.md`
- allow: `docs/cookbook/inspect-dsh-session-logs.i18n.yaml`
- allow: `README.md`
- allow: `README.zh.md`
- allow: `README.i18n.yaml`
- allow: `.specs/{proposed,implemented}/inspect-dsh-session-logs{,.zh}.md`

### Denied paths

- deny: `lib/**`
- deny: `cordis.patch.yml`
- deny: `package.json`
- deny: `.dsh/**`
- deny: `.blueprint/**`
- deny: `.specs/**` outside this Spec pair

## Decision

`tools/peek-session.mjs` remains a Node-only, read-only command. Its default root is the local DSH session directory; `DSH_SESSIONS_ROOT` supplies an alternate root for tests or an intentionally selected archive. It never starts DSH, opens a network connection, changes a session file, or sends log content elsewhere.

The reader scans concatenated zstd frames, decompresses each complete frame independently, and parses each non-empty line as JSON. A partial final frame is reported as a torn tail while all earlier complete records remain usable. A malformed complete frame or line becomes an explicit diagnostic record rather than silently changing the rest of the log.

The first persisted `type: "session"` record supplies `id`, `cwd`, `parentSession`, `origin`, `delegationDepth`, and `agentPreset`. Listing and summaries use that metadata; the encoded project directory is only a fallback label when `cwd` is unavailable. A tree joins a record with `parentSession` to any listed header with the matching `id`, marks `origin: "subagent"` children, and leaves a missing parent visible as an orphan instead of inventing a relationship.

The command supports list, tree, exact-session detail, summary, exact event-type filtering, a bounded tail, text filtering, and JSON output. Human-readable detail limits message previews; `--json` intentionally emits the stored records and is documented as sensitive local data.

## Requirements

- REQ-LOG-1: Read concatenated zstd frames and retain records from complete frames when the file ends in an incomplete frame.
- REQ-LOG-2: Derive session identity, project display path, parent link, origin, delegation depth, and preset from the persisted session header where available.
- REQ-LOG-3: Show direct and nested subagent relationships, including orphaned children, without treating the ambiguous directory name as a decoded workspace path.
- REQ-CLI-1: Provide predictable read-only list, tree, detail, summary, JSON, type, tail, and text-filter operations with actionable invalid-input errors.
- REQ-DOCS-1: Document the local-only data boundary, supported commands, subagent semantics, and zstd/torn-tail behavior in a synchronized English/Chinese cookbook pair.

## Acceptance criteria

- AC-LOG-001: A fixture containing two concatenated zstd frames with newline-delimited JSON returns records from both frames in order. Appending an incomplete third frame reports `tornFrame: true` without losing the first two frames. [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOG-002: A listed fixture session with header `cwd`, `origin: "subagent"`, `parentSession`, `delegationDepth`, and `agentPreset` exposes exactly those values in its summary and uses `cwd` rather than the encoded directory label. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-LOG-003: `--tree` nests a child under its listed `parentSession`; a child whose parent is absent stays visible and is marked orphaned. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-CLI-001: `--list`, exact-session `--summary`, `--type`, `--last`, and `--json` produce deterministic output against a fixture root; an unknown session exits non-zero and names the searched root. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-CLI-002: The command does not write beneath `DSH_SESSIONS_ROOT`; a fixture directory snapshot is unchanged after list, tree, summary, and detail calls. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-DOCS-001: The cookbook pair and pairing record describe the final command contract with equivalent meaning. `node lib/cli.js docs check --cwd .` reports no required or recommended issues for the pair. [surface=cli; moment=static; evidence=completion-hygiene]
- AC-REGRESSION-001: `node --check tools/peek-session.mjs`, `node --test tests/peek-session.test.js`, relevant existing session analyzers, and the staged Blueprint scan pass. [surface=repository; moment=terminal; evidence=contract-integration]

## Verification

- AC-LOG-001: `node --test tests/peek-session.test.js` multi-frame and torn-tail cases.
- AC-LOG-002: `node --test tests/peek-session.test.js` header-metadata case.
- AC-LOG-003: `node --test tests/peek-session.test.js` tree and orphan cases.
- AC-CLI-001: `node --test tests/peek-session.test.js` command cases.
- AC-CLI-002: `node --test tests/peek-session.test.js` immutable-fixture case.
- AC-DOCS-001: `node lib/cli.js docs check --cwd .`.
- AC-REGRESSION-001: `node --check tools/peek-session.mjs`; `node --test tests/peek-session.test.js`; `node tools/summarize-session.cjs <fixture>`; `node tools/analyze-session.cjs <fixture>`; `node lib/cli.js scan --cwd .` against the staged snapshot.

## Tasks

1. Replace storage-name path inference with persisted-header metadata and add explicit zstd-frame diagnostics.
2. Add a tree projection and complete the CLI parser/output contract.
3. Add isolated compressed-log fixtures and command-level tests.
4. Publish the bilingual cookbook and concise README developer-tool link.

## Alternatives considered

**Decode the storage directory into a Windows path.** Rejected because DSH uses a hyphen in both its storage separator and valid directory names, so the mapping cannot recover every path. Persisted `cwd` is available in a normal header and is the correct source of truth.

**Add a DSH Web route or plugin service.** Rejected because session inspection is a developer diagnostic task. A plugin route would expand the host's security and compatibility surface, while the local command can operate on stopped DSH installations and archives.

**Fully decompress or repair the original file before analysis.** Rejected because a live writer can leave a final incomplete frame. Independent complete-frame reads preserve evidence and avoid mutating the source.

## Risks

Session records may contain sensitive prompt and tool data. The default human-readable output is compact, while `--json` deliberately remains complete for local diagnostics and is documented as sensitive. DSH's storage format may change in a future release; frame or header incompatibility must produce a clear read error rather than an inferred result. Listing a very large history reads each compressed log to obtain authoritative metadata, so operators should use `--project` when practical.

## Consequences

The repository now has a local-only session-log inspector that uses stored DSH header metadata for workspace display and subagent lineage. It makes no DSH runtime, profile, network, or source-log changes. The scoped zstd, metadata, tree, filter, missing-session, torn-tail, and zero-write tests passed; the synchronized cookbook and README pair passed the documentation check; the exact staged snapshot passed Blueprint scan.
