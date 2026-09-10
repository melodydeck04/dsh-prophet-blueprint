# Inspect local DSH session logs

English | [中文](inspect-dsh-session-logs.zh.md)

`tools/peek-session.mjs` is a read-only local utility for inspecting DSH session logs, including subagent sessions. It reads DSH's zstd-compressed JSONL files directly; it does not start DSH, change a session file, make a network request, or send log content anywhere.

## List sessions

Run the command from this repository:

```powershell
node tools/peek-session.mjs --list
```

The default root is `%USERPROFILE%\.dsh\sessions`. Each row shows the persisted workspace `cwd`, session id, compressed size, event count, preset, and subagent parent/delegation metadata when present.

Filter a large history by the workspace path or storage-directory text:

```powershell
node tools/peek-session.mjs --list --project design-blueprint
```

The stored project-directory name is not a reversible workspace path: a hyphen can be either a separator or part of a directory name. The command therefore uses the `cwd` in the persisted session header for display and uses the storage name only as a fallback label.

## Inspect subagent lineage

Render all matching sessions as a tree:

```powershell
node tools/peek-session.mjs --tree --project design-blueprint
```

DSH stores a subagent's `parentSession`, `origin: "subagent"`, and optional `delegationDepth` in its session header. The tree joins those headers by id. If the parent log is absent from the selected root, the child remains visible with an `orphan` marker; the utility never guesses a parent from a directory name.

## Inspect one session

Use an id from the list. A summary is the safest first view because it reports metadata, event counts, time bounds, compaction events, and direct child ids without printing every message:

```powershell
node tools/peek-session.mjs session-01234567-89ab-cdef-0123-456789abcdef --summary
```

Narrow an event stream before printing it:

```powershell
node tools/peek-session.mjs session-01234567-89ab-cdef-0123-456789abcdef --type tool/call --last 20
node tools/peek-session.mjs session-01234567-89ab-cdef-0123-456789abcdef --grep prepare --last 10
node tools/peek-session.mjs session-01234567-89ab-cdef-0123-456789abcdef --tool web_search --last 10
```

`--json` emits the complete matching persisted records. Session logs can contain prompts, tool arguments, tool results, paths, and credential-adjacent configuration. Keep JSON output local and redact it before sharing.

## Inspect an archive or a test fixture

Set `DSH_SESSIONS_ROOT` only for the command invocation:

```powershell
$env:DSH_SESSIONS_ROOT = 'D:\archive\dsh-sessions'
node tools/peek-session.mjs --tree
Remove-Item Env:DSH_SESSIONS_ROOT
```

The alternate root must contain the same `storage-project/storage-session/session.jsonl.zstd` layout as DSH's local session directory.

## Handle a live or incomplete log

DSH may still be appending a final zstd frame while a session is active. The reader keeps all earlier complete frames and marks the result with `torn-tail`. Rerun the same read after the writer has finished. Do not decompress, truncate, repair, or overwrite the original log to inspect it.
