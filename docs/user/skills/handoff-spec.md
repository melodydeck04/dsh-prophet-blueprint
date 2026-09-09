# handoff-spec

English | [中文](handoff-spec.zh.md)

## Behavior

Reference for a temporary Spec snapshot. Writes a timestamped Markdown file in the OS temp directory containing Spec metadata, Requirements and up to 50 Acceptance section lines. The adapter does not collect verification attempts, TODO state or session segments. Missing files and temp write failures are reported; there is no automatic sandbox fallback. The output is a snapshot, not acceptance evidence.

## Entry

Invoke the available DSH Skill by name. DSH loads instructions; the optional adapter requires an available execution tool. See [Skill instructions](../../../skills/handoff-spec/SKILL.md).
