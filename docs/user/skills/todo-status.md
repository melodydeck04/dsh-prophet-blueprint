# todo-status

English | [中文](todo-status.zh.md)

## Behavior

Read-only reference for Spec task progress. Reports TODO entries and counts; task completion does not establish an AC verdict. Recent events require an explicit session id. Missing TODO data remains empty, and missing Spec data is reported. No task is advanced and no verification starts.

## Entry

Invoke the available DSH Skill by name. DSH loads instructions; the optional adapter requires an available execution tool. See [Skill instructions](../../../skills/todo-status/SKILL.md).
