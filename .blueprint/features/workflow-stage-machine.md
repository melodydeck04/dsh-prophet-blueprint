# Feature: Workflow stage machine

Id: workflow-stage-machine
Parent: session-driven-workflow-improvements
Status: active

## Summary

Host-owned deterministic work packages for Blueprint lifecycle stages. The Feature turns the existing public lifecycle projection into an action allowlist and concise per-turn context for the current DSH Chat.

## Scope

- `lib/workflow.js`
- `lib/web-api.js`
- `lib/orchestration.js`
- `lib/index.js`
- `lib/client.js`
- `tests/*stage-machine*.test.js`

## Documents

- required: `AGENTS.md`
- required: `DESIGN.md`
- required: `README.md`
- required: `.specs/proposed/workflow-stage-machine.md`
- required: `.specs/proposed/workflow-stage-machine.zh.md`
