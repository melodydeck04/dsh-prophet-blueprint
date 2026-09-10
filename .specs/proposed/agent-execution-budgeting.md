# Spec: Agent execution budgeting and recovery

Status: proposed
Feature: agent-execution-budgeting

## Problem

Long DSH development sessions can spend tokens repeatedly on the same failure, and delegated work can expand into nested subagents with unclear ownership. Existing verification records retain evidence, but they do not classify repeated operational failures, limit delegation for a turn, or create a reusable checkpoint before context grows stale.

## Scope

- allow: `.specs/{proposed,implemented}/agent-execution-budgeting*.md`
- allow: `.blueprint/features/agent-execution-budgeting.md`
- allow: `.blueprint/architecture/components/session-driven-workflow-improvements.md`
- allow: `lib/execution-governance.js`
- allow: `lib/orchestration.js`
- allow: `lib/index.js`
- allow: `lib/verification.js`
- allow: `tests/*execution-governance*.test.js`
- allow: `DESIGN.md`
- allow: `docs/user/features/session-driven-workflow-improvements*`

## Proposal

Add a Host-owned execution-governance module. It issues a per-turn delegation budget of at most three direct, fresh child requests; every request must have one declared deliverable, and child-originated delegation is denied. It records a normalized failure fingerprint for each verification or orchestration failure. A second consecutive identical fingerprint moves the Feature to `blocked` with the retained evidence and one repair action; rate-limit, server-529, missing-capability, and Spec/authority mismatches receive distinct recovery instructions and never trigger a blanket verification replay.

At lifecycle boundaries, the Host writes a compact checkpoint containing the completed and remaining tasks, approved file changes, check results, failure fingerprint when present, and next allowed action. The current Chat receives the checkpoint. A long-session recommendation may ask the developer to start a fresh Session with that checkpoint; it never automatically forks, resumes, or creates another Agent.

DSH describes subagents as an optional `ctx.subagents` seam; spawn children do not inherit parent conversation context, so fresh, self-contained single-deliverable prompts are the default. The DSH tool catalog documents background work and child control separately. MiniMax M-series prompting guidance favors short, concrete instructions and constrained output, which the checkpoint and child prompt schema enforce.

Sources: [DSH subagent subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subagent.md), [DSH tool catalog](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-catalog.md), and [MiniMax M-series prompting guidance](https://platform.minimax.io/docs/token-plan/prompting-best-practices), checked 2026-09-10.

## Alternatives considered

**Ban subagents globally.** Rejected because a bounded independent research or inspection task can reduce parent context use.

**Retry every failed verification.** Rejected because infrastructure and authority failures need a different recovery path from a code failure.

## Acceptance criteria

- AC-BUDGET-001: A parent turn can authorize at most three direct child requests, each with one required deliverable; child-originated delegation is rejected. [surface=service-background; moment=terminal; evidence=contract-integration]
- AC-BUDGET-002: The default child request is fresh and self-contained; fork is rejected unless an explicit `requiresParentHistory` reason is recorded. [surface=service-background; moment=terminal; evidence=contract-integration]
- AC-BUDGET-003: Two consecutive equal normalized fingerprints change the public Feature state to `blocked`, retain both observations, and provide one recovery action. [surface=api; moment=terminal; evidence=contract-integration]
- AC-BUDGET-004: `RATE_LIMIT`, `SERVER_529`, missing capability, and Spec/authority mismatch each yield distinct recovery guidance and do not automatically replay all verification checks. [surface=api; moment=terminal; evidence=contract-integration]
- AC-BUDGET-005: Each lifecycle boundary emits a durable compact checkpoint with completed work, remaining work, changed files, check result, failure evidence, and next action. [surface=repository; moment=terminal; evidence=contract-integration]
- AC-BUDGET-006: MiniMax M3 guidance requires one deliverable per child, bounded output, and checkpoint-first fresh-session handoff for a major direction change. [surface=repository; moment=static; evidence=static-unit]

## Verification

- AC-BUDGET-001: test: `tests/execution-governance.test.js`
- AC-BUDGET-002: test: `tests/execution-governance.test.js`
- AC-BUDGET-003: test: `tests/execution-governance.test.js`
- AC-BUDGET-004: test: `tests/execution-governance.test.js`
- AC-BUDGET-005: test: `tests/execution-governance.test.js`
- AC-BUDGET-006: test: `tests/execution-governance.test.js`

## Risks

The governance module must observe only public DSH services and cannot assume a particular subagent provider is installed. It must not convert a transient service failure into a code-failure repair task.

## Tasks

1. Add bounded child-request validation and failure fingerprint classification.
2. Integrate governance into dispatch and verification failure handling without adding another Agent loop.
3. Persist and surface lifecycle checkpoints; add MiniMax M3 guidance.
4. Add contract tests and synchronize design and bilingual documentation.

## Lifecycle

- Status: proposed
- Target status after verified implementation: implemented

## Non-goals

- Automatic Session creation, automatic fork/resume, or changing DSH provider configuration.
- Altering DSH's native subagent implementation or bypassing its tool permissions.
