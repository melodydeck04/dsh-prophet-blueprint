# Session-driven workflow improvements

English | [中文](session-driven-workflow-improvements.zh.md)

## What it does

Five focused improvements to the Blueprint refine flow, distilled from one real `session.jsonl` review:

1. **Intent classification on `/blueprint` input.** Before the existing refine pipeline runs, Blueprint classifies the input as one of `new-feature`, `fix`, `research`, `status`, or `unknown`. When the class is ambiguous, the classifier surfaces at most two focused questions before the existing refine three-question budget is consumed. Non-material uncertainty is recorded as an assumption. The classification is logged into the refinement packet so downstream diagnostics can read it.
2. **Approve and continue in the Blueprint Web tab.** When a Feature has an active proposed Spec in `refining` or `ready`, its detail view shows `批准并继续`. The exact-hash action records approval, starts the implementation cycle, applies the returned Dashboard immediately, and queues a plugin-attributed follow-up in the originating live DSH Chat. The receipt explicitly reports when that Chat is unavailable.
3. **Pre-refine research Skill.** A new `research-before-refine` DSH Skill invokes a local SearXNG HTTP service and returns a Markdown note block of the top five results. The agent auto-fires the Skill when `/blueprint` classifies the input as `research`, and folds the notes into the refinement packet. The Skill is `user-invocable: true` so a developer can also call it directly through the Skills menu.
4. **SearXNG connectivity check.** The same `probeSearxng` function backs three surfaces: (a) a pre-flight probe at the start of the `research-before-refine` Skill, so a SearXNG outage surfaces a `severity: required` finding instead of a silent timeout; (b) a new `research-connectivity-check` Skill reachable from the Skills menu; (c) a `SearXNG: ✓ reachable (Xms)` / `SearXNG: ✗ unreachable` indicator in the Blueprint Web tab Feature detail view, with a refresh button. The probe defaults to `http://localhost:8888`, honors `SEARXNG_BASE_URL`, and times out after 3 s.
5. **Deterministic stage work package.** The Host returns the current lifecycle stage, its permitted actions, one next required action, and a compact package of the active Spec hash, Scope, tasks, and latest verification evidence. The current Chat must follow that package; it cannot use a lifecycle action that the Host has not allowed.
6. **Execution budgeting and recovery.** A governance helper limits a parent turn to three direct, single-deliverable child requests, defaults to fresh context, classifies operational failures, and writes a compact checkpoint. A repeated equal failure fingerprint becomes a visible block instead of replaying the entire workflow.

The four changes are additive. The existing `/blueprint` refine flow, the `blueprint_dispatch` tool, and the CLI `design-blueprint approve` remain the canonical paths. The new Skill follows the documented Skills loader contract from [Agent interface Skills layer](agent-interface--skills-layer.md). The new button calls the same Host API the chat agent already calls.

## Expected result

A developer who types `/blueprint <text>` into a Blueprint project sees, in order: (1) a one-line classification header in the chat reply, (2) at most two clarifying questions when the class is ambiguous, (3) the existing refine packet, plus (4) — for the `research` class — a research note block in the packet. After the proposed Spec lands in `ready`, the developer clicks `批准并继续` in Blueprint Web. The Feature becomes `implementing`, the page updates from that action's response, and the originating Chat receives the next work turn when it remains live.

A developer who types `design-blueprint` slash input that looks like "what is the current Feature stage?" sees the classifier return `status` and the existing `/blueprint-status` flow short-circuit. A developer who types "how do I configure Docker mirrors in China?" sees the classifier return `research`; the chat-commands function emits a coordinator message instructing the agent to call the `research-before-refine` Skill; the Skill first calls `probeSearxng` and then POSTs to `${SEARXNG_BASE_URL:-http://localhost:8888}/search`; the response becomes `intent.researchNotes` in the refinement packet and the probe response becomes `intent.searxngStatus`.

## How to use

- `/blueprint <text>` — same as today, with classification surfacing and (when class is `research`) the new Skill auto-fired.
- Skills menu → `research-before-refine` — explicit research invocation; identical to the auto-fired path. The Skill's body instructs the agent to POST to the local SearXNG service and return a Markdown note block.
- Blueprint Web Feature detail → `批准并继续` (visible only when the Spec is in `refining` or `ready` and the exact current hash has not yet been approved). It is one Host action that starts implementation and attempts same-Chat continuation.

`SEARXNG_BASE_URL` is read from the environment. The default is `http://localhost:8888`. The Skill refuses to start a `5xx`/`4xx` response silently: it surfaces a `severity: required` finding with the exact error string and the URL it tried.

## Compatibility

The classifier, the Web button, and the research Skill are additive. The existing `/blueprint` refine flow, the `blueprint_dispatch` tool, and the CLI `design-blueprint approve` remain the canonical paths. The new Skill follows the documented Skills loader contract; the new button calls the same Host API the chat agent calls. The companion Feature briefs for [Spec governance — architecture design](spec-governance--architecture-design.md) and [Agent interface Skills layer](agent-interface--skills-layer.md) document the existing seams this Feature composes against.

## Reference docs

- `.blueprint/features/session-driven-workflow-improvements.md` — owning Feature record.
- `.blueprint/features/spec-governance--architecture-design.md` — companion (owns `lib/chat-commands.js`, `lib/orchestration.js`, `lib/web-api.js`, `lib/client.js`).
- `.blueprint/features/agent-interface--skills-layer.md` — companion (owns the Skills loader used to register the new Skill).
- `.blueprint/architecture/components/session-driven-workflow-improvements.md` — Component ownership for the new code paths.
- `.specs/proposed/session-driven-workflow-improvements.md` — **current proposed** Spec (approval continuation and reactive state).
- `.specs/rejected/session-driven-workflow-improvements--research-and-connectivity.md` — rejected sub-spec B (research Skill + connectivity check); preserved as a follow-up reference.
- `.dsh/skills/research-before-refine/SKILL.md` — new Skill body (loaded by the existing Skills loader; ships with sub-spec A's research Skill, extended in sub-spec B).
- `DESIGN.md` — section on intent routing and the new Skill to be written when sub-spec A lands.

## Current proposal state

The Feature describes four additions. The framework allows only one current proposed Spec per Feature, so the change is delivered as two sub-Specs:

- **Sub-spec A (current proposed)**: input classification + Approve button. Ships first.
- **Sub-spec B (deferred to follow-up iteration)**: research Skill + SearXNG connectivity check. The full Spec is preserved as a rejected reference; once sub-spec A is approved, the developer can propose sub-spec B by changing the rejected file's Status to `proposed` and copying it back under `.specs/proposed/`.

## Verified current behavior

<!-- blueprint-current:session-driven-workflow-improvements.md -->

The acceptance criteria below are copied from the active proposed Spec. They become truth only after the developer approves the exact combined bilingual Spec hash and the implementation passes requirement-linked verification.

### Connectivity check

- AC-CONN-001: `probeSearxng({ baseUrl: 'http://localhost:8888', timeoutMs: 3000 })` returns `{ ok: true, baseUrl, statusCode: 200, latencyMs: <integer> }` when the local SearXNG is reachable. [surface=api; moment=terminal; evidence=contract-integration]
- AC-CONN-004: The `research-before-refine` Skill body calls `probeSearxng` before the search POST; when `ok === false`, the Skill surfaces a `severity: required` finding and skips the search POST. The probe response is appended to `intent.searxngStatus`. [surface=api; moment=terminal; evidence=contract-integration]
- AC-CONN-008: The Blueprint Web Feature detail renders a `SearXNG: ✓ reachable (Xms)` or `SearXNG: ✗ unreachable` indicator next to the existing workflow status block, plus a refresh button. The indicator is populated on page load and re-populated on refresh button click. [surface=web-ui; moment=terminal; evidence=user-visible]

### Intent classifier

- AC-CLASS-001: `classifyIntent({ text, features, source })` returns `{ class: 'research', confidence: 'high', evidence: ['searxng', 'mirrors'] }` for an input whose tokens match a research intent. [surface=api; moment=static; evidence=static-unit]
- AC-CLASS-002: `classifyIntent` returns `{ class: 'new-feature', confidence: 'high', evidence: ['add', 'feature'] }` for an input that describes a new Feature and contains no research signal. [surface=api; moment=static; evidence=static-unit]
- AC-CLASS-003: `classifyIntent` returns `{ class: 'unknown', ambiguous: true, clarifyingQuestions: [...] }` with the array length ≤ 2 when the input matches two intents with comparable score. [surface=api; moment=terminal; evidence=contract-integration]
- AC-CLASS-004: `createRefinementPacket` persists the classification under `intent.class`, `intent.confidence`, and `intent.evidence` for every successful packet. [surface=api; moment=terminal; evidence=contract-integration]
- AC-CLASS-005: When `intent.class === 'research'`, the coordinator message includes a one-line block `## Research notes — <topic>` instructing the agent to call the `research-before-refine` Skill before the existing refine dimensions. [surface=api; moment=terminal; evidence=contract-integration]

### Approve button

- AC-APPR-001: The Blueprint Web Feature detail renders an "Approve" button when `feature.workflow.stage ∈ {refining, ready}`, `feature.workflow.spec?.changePackage` is present, and `feature.workflow.approval?.specHash !== feature.workflow.spec.changePackage.lifecycle.specHash`. [surface=web-ui; moment=terminal; evidence=user-visible]
- AC-APPR-002: Clicking the Approve button calls `callApi({ action: 'approve', cwd, sessionId, dshWorkspacePath, dshWorkspaceTitle, featureId, specHash, yes: true })` with the exact current `specHash`. [surface=web-ui; moment=terminal; evidence=user-visible]
- AC-APPR-003: After a successful approve, `feature.workflow.approval.specHash` matches the new `feature.workflow.spec.changePackage.lifecycle.specHash` and the public stage becomes `implementing`. [surface=web-ui; moment=progressive; evidence=user-visible]
- AC-APPR-004: A failed approve surfaces the exact error message through the existing `setError` setter; the button does not silently retry. [surface=web-ui; moment=terminal; evidence=user-visible]
- AC-APPR-005: The Approve button is hidden when `feature.workflow.stage` is `draft`, `verification_required`, `rejected`, or already approved. [surface=web-ui; moment=static; evidence=static-unit]

### Pre-refine research Skill

- AC-RES-001: `.dsh/skills/research-before-refine/SKILL.md` exists with frontmatter `name: research-before-refine`, `description: <text>`, `user-invocable: true`, and no `disable-model-invocation: true`. [surface=repository; moment=static; evidence=static-unit]
- AC-RES-002: The Skill body instructs the agent to POST `${SEARXNG_BASE_URL:-http://localhost:8888}/search` with a JSON body and return a Markdown note block of the top five results. [surface=repository; moment=static; evidence=static-unit]
- AC-RES-003: A `5xx` or `4xx` HTTP response from SearXNG surfaces a `severity: required` finding with the exact error string and the URL. The Skill does not return a fabricated Markdown note block. [surface=api; moment=terminal; evidence=contract-integration]
- AC-RES-004: After a successful research, `refinement.intent.researchNotes` contains `{ topic, summary, sources: [{ title, url, snippet }] }`. [surface=api; moment=terminal; evidence=contract-integration]
- AC-RES-005: The Skill is registered by the existing Skills loader; `node lib/cli.js skills list` shows `research-before-refine` with `modelInvocable: true` and `userInvocable: true`. [surface=cli; moment=terminal; evidence=contract-integration]

### Cross-cutting

- AC-DOCS-001: `docs/user/features/session-driven-workflow-improvements.{md,zh.md,i18n.yaml}` exist and the English page describes the three additions. [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-002: `node lib/cli.js docs check --cwd .` reports 0 required and 0 recommended issues after the new docs land. [surface=cli; moment=static; evidence=completion-hygiene]
- AC-SCAN-001: `node lib/cli.js scan --all --cwd .` reports 0 required and 0 recommended issues after this Spec lands. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001: All existing host tests continue to pass after the change. [surface=cli; moment=terminal; evidence=contract-integration]

## Verified current behavior

<!-- blueprint-current:session-driven-workflow-improvements--input-classification-and-approval.md -->

### Session-driven workflow improvements — input classification and Approve button (sub-spec A)

- AC-CLASS-001: `classifyIntent({ text: 'how do I configure Docker mirrors in China?', features: [], source: 'command' })` returns `{ class: 'research', confidence: 'high', evidence: ['how', 'configure', 'mirrors'] }`. [surface=api; moment=static; evidence=static-unit]
- AC-CLASS-002: `classifyIntent({ text: 'add a new Approve button to the Blueprint tab', features: [], source: 'command' })` returns `{ class: 'new-feature', confidence: 'high', evidence: ['add', 'new', 'blueprint'] }`. [surface=api; moment=static; evidence=static-unit]
- AC-CLASS-003: `classifyIntent({ text: 'fix the broken Approve button', features: [], source: 'command' })` returns `{ class: 'fix', confidence: 'high', evidence: ['fix', 'broken'] }`. [surface=api; moment=static; evidence=static-unit]
- AC-CLASS-004: `classifyIntent` returns `{ class: 'unknown', ambiguous: true, clarifyingQuestions: [...] }` when the top two class scores are within 1 token, with the array length ≤ 2. [surface=api; moment=terminal; evidence=contract-integration]
- AC-CLASS-005: `classifyIntent` returns `{ class: 'status', confidence: 'high', evidence: ['what is', 'current', 'stage'] }` for an input that exactly matches the status signal. [surface=api; moment=static; evidence=static-unit]
- AC-CLASS-006: `createRefinementPacket({...})` persists the classification under `intent.class`, `intent.confidence`, `intent.evidence`, and (when ambiguous) `intent.clarifyingQuestions` for every successful packet. [surface=api; moment=terminal; evidence=contract-integration]
- AC-CLASS-007: The total clarifying questions in one round remain ≤ 3; the new `clarifyingQuestions` count as 1 or 2 of them and the existing refine questions count as the remainder. [surface=api; moment=terminal; evidence=contract-integration]
- AC-APPR-001: The Blueprint Web Feature detail renders an "Approve" button when `feature.workflow.stage ∈ {refining, ready}`, `feature.workflow.spec?.changePackage` is present, and `feature.workflow.approval?.specHash !== feature.workflow.spec.changePackage.lifecycle.specHash`. [surface=web-ui; moment=terminal; evidence=user-visible]
- AC-APPR-002: The button is hidden when `feature.workflow.stage` is `draft`, `verification_required`, `rejected`, or already approved. [surface=web-ui; moment=static; evidence=static-unit]
- AC-APPR-003: Clicking the Approve button calls `callApi({ action: 'approve', cwd, sessionId, dshWorkspacePath, dshWorkspaceTitle, featureId, specHash, yes: true })` with the exact current `specHash`. [surface=web-ui; moment=terminal; evidence=user-visible]
- AC-APPR-004: A failed approve surfaces the exact error message through the existing `setError` setter; the button does not silently retry and does not change its label. [surface=web-ui; moment=terminal; evidence=user-visible]
- AC-APPR-005: After a successful approve, `feature.workflow.approval.specHash` equals `feature.workflow.spec.changePackage.lifecycle.specHash` and the public stage becomes `implementing`. [surface=web-ui; moment=progressive; evidence=user-visible]
- AC-APPR-006: `lib/web-api.js` exposes an `approve` action that calls the existing `approveFeatureProposal({ cwd, featureId, specHash, yes })`; the action is read against the same exact-hash gate the CLI uses. [surface=api; moment=terminal; evidence=contract-integration]
