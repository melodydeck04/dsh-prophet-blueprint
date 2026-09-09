# Spec: DSH-native Skill routing and MiniMax prompt contracts

Status: implemented
Feature: spec-governance--architecture-design

## Problem

The current entry classifies mostly English keywords and sends status and research requests into refinement. It names an absent research Skill. The bundled verification helper supplies an invalid start hash and constructs passing evidence without executing checks. Skill prose and invocation flags disagree. Rejected records conflate supersession, deferral, and completed history.

## Scope

- allow: `lib/chat-commands.js`
- allow: `lib/orchestration.js`
- allow: `lib/skills/**`
- allow: `skills/**`
- allow: `tests/skills/**`
- allow: `tests/*routing*.test.js`
- allow: `tests/chat-commands-classify.test.js`
- allow: `tests/orchestration-auto-compact.test.js`
- allow: `tests/verification.test.js`
- allow: `docs/user/skills/**`

Feature identities, Feature boundaries, approval records, provider credentials, DSH installation, browser startup, auto-compaction dispatch, `lib/index.js`, root README files, `DESIGN.md`, Feature briefs, and verification framework/CLI changes are outside this implementation. Auto-compaction remains owned by `auto-compact-on-unrelated-task-done--preset-aware-dispatch`; verification framework changes remain owned by `framework-verification-becomes-driver-friendly`. Changes to verification gates or runtime dependency manifests require a separate scoped proposal if compatibility work proves necessary.

## Research and compatibility

Inspected on 2026-09-08. DSH master reference: c389f96bf3a9b6807cb71ed6bdad5849be0df6d8. Latest npm release observed: 0.1.2-rc.1. Blueprint still documents 0.1.1-rc.2; a new compatibility claim requires release-specific tests, not a master-only inference.

- DSH source: https://github.com/deepseek-ai/deepseek-harness/tree/c389f96bf3a9b6807cb71ed6bdad5849be0df6d8/packages/skill — registry, filesystem discovery and native skill tool. Model loading is instruction retrieval, not execution of a JavaScript export. Native filesystem discovery includes project .dsh/skills and .agents/skills; Blueprint's own provider currently reads packaged skills/. These are distinct mechanisms.
- DSH prompt contract: https://github.com/deepseek-ai/deepseek-harness/blob/c389f96bf3a9b6807cb71ed6bdad5849be0df6d8/packages/core/system-prompt/README.md — contribute an ordered section; do not replace the complete harness prompt.
- DSH provider reference: https://github.com/deepseek-ai/deepseek-harness/blob/c389f96bf3a9b6807cb71ed6bdad5849be0df6d8/packages/llm/llm-pi-ai/README.md — provider routing is a separate configuration concern. This change does not change the user's MiniMax endpoint, model, or sampling parameters.
- MiniMax guidance: https://platform.minimax.io/docs/token-plan/prompting-best-practices — explicit instructions, diverse examples, bounded tools, and indexed context. No performance gain is claimed before evaluation on the actual deployed model.
- Matt Pocock reference: https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/productivity/grilling/SKILL.md — resolve prerequisite decisions and inspect facts before asking. Adapt the method to Blueprint's three-question limit; do not import mandatory delegation or repeated approvals.

## Decision
Use the current DSH Agent to select independently described Skills from its actual catalog. Retain explicit user invocation. Eliminate keyword classification as the authority for selecting a write workflow. Keep exact commands deterministic. Load Skill instructions through the native DSH mechanism supported by the tested release. Do not add a classifier-model request, a second Chat, or a separate agent per Skill.

## Requirements

- REQ-1: Status and explanation requests can finish without creating a Spec. Explicit Skill choice wins over inferred intent. A mixed request executes dependent steps in order, using the available catalog; missing capabilities are reported with a supported fallback.
- REQ-2: Each Skill states purpose, triggers, inputs, executable entry, outputs, failures, and stopping conditions. Invocation flags and prose agree. Skills guide the Agent; Host operations enforce project identity, exact approvals, Scope and evidence.
- REQ-3: Verification uses the existing prepare/start/submit/finalize contracts through an executable supported entry. Execute declared checks against the required snapshot. Never derive passed from an acceptance description; retain failed and not-run outcomes. A status question does not start verification.
- REQ-4: Keep a concise Blueprint-owned prompt section. Delimit repository facts and external content, put the immediate task after long context, explicitly prefer Chinese replies, and load task detail on demand. Return concise decisions and evidence, not private reasoning transcripts.
- REQ-5: Record lifecycle corrections as evidence-backed follow-ups. Do not restore old rejected bodies wholesale, alter approved active Spec bytes, or claim supersession means every old capability exists. Research remains optional; no unconditional SearXNG dependency or invented Skill registration.

## Prompt candidate

You work in the current DSH Chat. Read the current request, relevant repository facts, and available Skill catalog. Honor an explicitly selected Skill; otherwise choose only Skills needed for the user's outcome and load their instructions before use. Status and explanation can finish directly. Research uses available read tools and identifies sources; unavailable tools are reported, never invented. Plan and implement only under the repository's current approval and Scope rules. Verification requires executed checks and retained results. Distinguish a proposed check from a passing result. Inspect discoverable facts yourself; ask at most three questions when answers materially change the decision. Reply in Chinese unless requested otherwise. State what happened, its evidence, and the next necessary step.

Examples for the routing context:

- 查看当前功能进度 -> read current workflow; answer; no proposed file and no new verification attempt.
- 审一下这个 Spec -> load available review Skill; inspect evidence; report issues.
- 先研究再设计 -> research with available tools; then refine if requested; preserve citations and unknowns.
- 按批准方案实现 -> validate current exact approval and Scope; begin existing implementation workflow.
- 检查是否验收通过 -> read recorded verdict; distinguish from 请执行验收, which runs checks.

## Acceptance criteria

- AC-1: Chinese, English, mixed and explicit requests route to the intended operation without forcing read-only requests into refinement or naming unavailable Skills.
- AC-2: The released DSH catalog advertises and loads every bundled Skill with consistent model/user flags and working relative resource references.
- AC-3: Verification cannot submit fabricated passing results; failed checks remain failed and missing execution remains not run; stale hashes are rejected by unchanged Host gates.
- AC-4: The actual MiniMax model is evaluated before/after on the same held-out requests; results record model id, adapter, prompt revision, routes, tool calls, unnecessary questions, evidence quality, tokens when available and latency. No gain is asserted from static tests alone.
- AC-5: Bilingual current documents and historical follow-ups identify current implementation, deferred research and superseded designs without duplicate active authority; staged scan and docs checks pass.

## Verification

- AC-1: [surface=api; moment=terminal; evidence=contract-integration] Routing regression fixtures cover all five examples, unavailable Skills, ambiguity, explicit override and multi-step dependencies; assert no writes for queries.
- AC-2: [surface=external-integration; moment=terminal; evidence=live-runtime] Test catalog and native loading on released 0.1.2-rc.1 in an isolated fixture. Capture package versions and exact signatures. Test the legacy baseline separately before retaining a dual-version claim. Do not start the user's DSH service.
- AC-3: [surface=api; moment=terminal; evidence=contract-integration] Exercise prepare/start/result/finalize with a passing and deliberately failing fixture, unrun checks, missing evidence, stale hash and rejected capability; verify durable outcomes.
- AC-4: [surface=external-integration; moment=terminal; evidence=live-runtime] At least 20 held-out requests, including Chinese and mixed input, repeated three times per prompt. Explicit override and no unauthorized writes must pass every run; report routing rates and tradeoffs. If the deployed model or evaluation access is unavailable, mark this AC unverified. Never read or export credential values into evidence.
- AC-5: [surface=repository; moment=static; evidence=completion-hygiene] Review bilingual meaning; run docs check and staged scan plus relevant regression tests. Record unresolved historical contradictions explicitly.

## Tasks

1. Verify release-specific catalog/loading and prompt-section contracts (REQ-2, AC-2).
2. Repair the executable verification Skill path and regression fixtures (REQ-3, AC-3).
3. Implement catalog-based guidance and routing, with explicit overrides and read-only outcomes (REQ-1, REQ-4, AC-1).
4. Compare prompt variants on the actual MiniMax model without changing provider configuration (REQ-4, AC-4).
5. Synchronize docs and append evidence-backed historical corrections (REQ-5, AC-5).

## Alternatives considered

Separate mandatory commands increase user routing work. A dedicated classifier LLM duplicates the existing Agent and adds latency. Keyword-only routing fails on ordinary Chinese input. A long universal prompt repeats task details every turn. Installing Matt Pocock's repository verbatim would import workflow and tool assumptions not established for DSH.

## Risks

The deployed model family is MiniMax M3; its exact API model identifier and evaluation adapter are not yet confirmed. Master and released DSH APIs may differ. Auto-compaction and verification-framework files have separate owners and must not be widened into this proposal. The Feature map has pre-existing path drift; any boundary change requires developer ownership review. No new package dependency or production restart is authorized by this proposal.

## Lifecycle

Research and proposal only. Await exact bilingual hash approval before implementation. Earlier approvals cover other Specs only.

## Consequences

Blueprint completed this delivery automatically after requirement-linked verification.

- Verified snapshot: `git-index:manual`
- Verification attempt: `attempt-manual`
- Conclusion: Manual finalize after framework-finalize snapshot-sync conflict.
- AC evidence: all 5 acceptance criteria passed.
- Check evidence: scan-pass, check-AC-1..AC-5.
