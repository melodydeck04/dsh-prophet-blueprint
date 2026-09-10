# Component: session-driven-workflow-improvements

Id: session-driven-workflow-improvements
Kind: internal
Container: none
Deployment:
Status: active

## Summary

Capability Component that owns the Blueprint approval-continuation path and Host-derived deterministic work package: the `approve-and-begin` Host action in `lib/web-api.js`, lifecycle context in `lib/workflow.js`, dispatch gating in `lib/orchestration.js`, live-Agent continuation wiring in `lib/index.js`, and the responsive `批准并继续` client in `lib/client.js`. It does not introduce a deployable.

## Owned paths

- `lib/chat-commands.js` (only the `classifyIntent` function, the `probeSearxng` function, and their integration into `createRefinementPacket` / `coordinatorMessage`)
- `lib/orchestration.js` (only the registration call for the new Skills)
- `lib/web-api.js` (the `approve-and-begin` Host action and receipt)
- `lib/index.js` (the public live-Agent continuation hook)
- `lib/client.js` (the `批准并继续` button, response application, and visibility revalidation)
- `lib/specs.js` (read-only inspection)
- `.dsh/skills/research-before-refine/**`
- `.dsh/skills/research-connectivity-check/**`
- `tests/*approval*.test.js`
- `.blueprint/features/session-driven-workflow-improvements.md`
- `.specs/implemented/session-driven-workflow-improvements.{md,zh.md}`

## Provided contracts

No provided contracts declared. The new code paths reuse existing public functions from the two companion Features.

## Dependencies

- `spec-governance--architecture-design` — provides the chat-commands, web-api, and client modules this Component extends; provides the `approveFeatureProposal` function the Approve action calls.
- `agent-interface--skills-layer` — provides the Skills loader that registers the new Skill.

## Supported features

- `session-driven-workflow-improvements`
- `workflow-stage-machine`
- `agent-execution-budgeting`
- `verification-contract-regression-repair`

## Documents

- required: `AGENTS.md`
- required: `DESIGN.md`
- required: `README.md`
- required: `.blueprint/features/session-driven-workflow-improvements.md`
- required: `.specs/implemented/session-driven-workflow-improvements.md`
- required: `.specs/implemented/session-driven-workflow-improvements.zh.md`
