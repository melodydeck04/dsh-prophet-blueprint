# Spec: Deterministic workflow-stage work package

Status: implemented
Feature: workflow-stage-machine

## Problem

Blueprint persists lifecycle state, but the model still receives general guidance and can infer an invalid next action from long conversation history. The Host read model exposes a stage and one prose next action, not a machine-readable work package that bounds the current turn.

## Decision

Derive the current stage and finite permitted actions from existing Host records, then expose the same immutable work package to dispatch, continuation, and Web surfaces. Do not add a second lifecycle store or stage-specific Agent.

## Scope

- allow: `.specs/{proposed,implemented}/workflow-stage-machine*.md`
- allow: `.blueprint/features/workflow-stage-machine.md`
- allow: `.blueprint/architecture/components/session-driven-workflow-improvements.md`
- allow: `lib/workflow.js`
- allow: `lib/web-api.js`
- allow: `lib/orchestration.js`
- allow: `lib/index.js`
- allow: `lib/client.js`
- allow: `tests/*stage-machine*.test.js`
- allow: `DESIGN.md`
- allow: `docs/user/features/session-driven-workflow-improvements*`

## Proposal

The Host derives one immutable `workflowContext` for each selected Feature: `currentStage`, `allowedActions`, `nextRequiredAction`, and a bounded `workPackage` containing only the Feature id, exact active Spec hash, Scope, mapped tasks, verification state, and latest blocking evidence. The public state graph is:

`refining → ready → implementing → verifying → completed`, with `verifying → blocked → implementing` after a concrete repair.

`blueprint_dispatch` reads this context before every mutating action. It rejects actions absent from `allowedActions` before creating durable state, returns the context with every dispatch result, and injects the compact package into plugin-created continuation messages. The system prompt directs MiniMax M3 to use the package as the current-turn authority rather than infer a phase from conversation history. The Web view displays the current stage, allowed actions, and next required action from the same Host response.

This uses DSH's public model-facing tool mechanism and single current Agent. It does not add a mandatory subagent, custom Agent loop, or hidden prompt protocol. DSH documents subagents as an optional capability seam, and its tool catalog requires self-contained prompts because spawned children do not inherit conversation context. MiniMax's M-series guidance recommends concise, concrete steps and constrained output; the compact work package follows that guidance.

Sources: [DSH subagent subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subagent.md), [DSH tool catalog](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-catalog.md), and [MiniMax M-series prompting guidance](https://platform.minimax.io/docs/token-plan/prompting-best-practices), checked 2026-09-10.

## Alternatives considered

**Prompt-only phase instructions.** Rejected because they cannot reject invalid writes and grow with history.

**One dedicated Agent per lifecycle stage.** Rejected because ordinary development belongs in the existing DSH Chat and the state transition is Host-owned.

## Acceptance criteria

- AC-STAGE-001: The Host returns `workflowContext` with `currentStage`, a finite `allowedActions`, exactly one `nextRequiredAction` or `null` for completed, and a bounded work package for every Feature. [surface=api; moment=terminal; evidence=contract-integration]
- AC-STAGE-002: The graph permits only refining→ready→implementing→verifying→completed and verifying→blocked→implementing; no API or dispatch action can skip an invalid transition. [surface=api; moment=terminal; evidence=contract-integration]
- AC-STAGE-003: `blueprint_dispatch` rejects an action not listed in the current Feature's `allowedActions` before durable mutation and returns the Host-provided next action. [surface=tool; moment=terminal; evidence=contract-integration]
- AC-STAGE-004: A plugin-created continuation includes the compact work package for the exact Feature and current Spec hash, and does not include unbounded Session history. [surface=service-background; moment=terminal; evidence=contract-integration]
- AC-STAGE-005: Blueprint Web renders the Host-provided stage, allowed actions, and next required action; it does not derive them from local stage-name conditionals. [surface=web-ui; moment=progressive; evidence=user-visible]
- AC-STAGE-006: MiniMax M3 guidance tells the model to read the current work package and take only an allowed action. [surface=repository; moment=static; evidence=static-unit]

## Verification

- AC-STAGE-001: test: `tests/workflow-stage-machine.test.js`
- AC-STAGE-002: test: `tests/workflow-stage-machine.test.js`
- AC-STAGE-003: test: `tests/orchestration-stage-machine.test.js`
- AC-STAGE-004: test: `tests/orchestration-stage-machine.test.js`
- AC-STAGE-005: test: `tests/client-stage-machine.test.js`
- AC-STAGE-006: test: `tests/index-stage-machine.test.js`
- Regression: `npm test`, `node lib/cli.js docs check --cwd .`, and `node lib/cli.js scan --cwd .`.

## Consequences

The Host work package, dispatch allowlist, continuation context, Web rendering, and MiniMax guidance are implemented and covered by the declared tests.

## Risks

The public labels collapse internal verification states. The context must be derived from the existing Host records, never become a second mutable lifecycle store. The action allowlist is an authority boundary, so legacy action compatibility must be covered explicitly.

## Tasks

1. Derive and expose the immutable workflow context from existing workflow and verification records.
2. Gate dispatch actions against the context and return it in tool results and approval continuations.
3. Render the Host context in Blueprint Web and update MiniMax M3 guidance.
4. Add contract, dispatch, continuation, and client tests; synchronize architecture and bilingual documentation.

## Lifecycle

- Status: implemented
- Implementation status: delivered; Feature-level completion remains governed by verification.

## Non-goals

- Subagent depth, concurrency, spawn policy, retry fingerprinting, checkpoints, or Session rotation. Those are Phase 5 and require a separate Spec.
- SearXNG research or connectivity behavior.
- Replacing DSH's native tool or Agent loop.
