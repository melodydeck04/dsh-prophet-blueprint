# Spec: DSH-native spec-driven development and system map

Status: implemented
Feature: spec-governance--architecture-design

## Problem

Blueprint has evolved from a repository Spec tool into a visible orchestration system with separate coordinator, architecture, implementation, and verification roles; many lifecycle stages; Agent bindings; attempt records; and recovery controls. Those mechanisms address real safety problems, but they have become the product instead of supporting it. A developer who wants to describe a requirement, receive a good Spec, implement it, and understand the resulting system must first understand Blueprint's internal workflow.

The intended product is simpler. The developer should describe one requirement in normal DSH Chat. Blueprint should ground it in the repository, improve it into a complete and testable specification, ask only questions that materially change behavior, implement and verify the result, and update a navigable Feature map whose details describe the system as it now exists.

Spec quality is central. Copying a request into a Markdown template is insufficient. Blueprint needs the equivalent of Spec Kit's clarification, requirements-checklist, and cross-artifact analysis, combined with OpenSpec's distinction between current capability truth and an active change delta. These concepts must be presented through an opinionated DSH-native workflow rather than a collection of user-operated phases or assistants.

The implementation is an out-of-tree DSH plugin. The repository currently declares `0.1.1-rc.2` peer ranges while the official DSH master manuals and public package registry do not expose one identical contract set. Implementation therefore cannot guess a "latest" API. It must resolve and lock the exact target DSH profile first, use only that version's documented public extension points, and test the installed plugin against that real composition.

## Scope

### Allowed paths

- allow: `lib/index.js`
- allow: `lib/client.js`
- allow: `lib/web-api.js`
- allow: `lib/workflow.js`
- allow: `lib/specs.js`
- allow: `lib/features.js`
- allow: `lib/reconciliation.js`
- allow: `lib/scan.js`
- allow: `lib/docs.js`
- allow: `lib/artifacts.js`
- allow: `lib/assistant-actions.js`
- allow: `lib/orchestration.js`
- allow: `lib/verification.js`
- allow: `lib/chat-commands.js`
- allow: `lib/snapshot.js`
- allow: `lib/config.js`
- allow: `lib/cli.js`
- allow: `lib/project-binding.js`
- allow: `lib/version.js`
- allow: `tests/**`
- allow: `.blueprint/features/spec-governance--architecture-design.md`
- allow: `.blueprint/architecture/**`
- allow: `.specs/**`
- allow: `docs/user/features/spec-governance--architecture-design.md`
- allow: `docs/user/features/spec-governance--architecture-design.zh.md`
- allow: `docs/user/features/spec-governance--architecture-design.i18n.yaml`
- allow: `DESIGN.md`
- allow: `README.md`
- allow: `README.zh.md`
- allow: `README.i18n.yaml`
- allow: `design-blueprint.json`
- allow: `package.json`
- allow: `cordis.patch.yml`

### Denied paths

- deny: `.blueprint/approvals/**`
- deny: `docs/AGENTS.md`
- deny: `docs/i18n/**`
- deny: `.dsh/**`
- deny: `.specs/implemented/unified-blueprint-assistant-and-capability-bound-domain-tools.md`
- deny: `.specs/implemented/unified-blueprint-assistant-and-capability-bound-domain-tools.zh.md`

## Decision
### Product contract

1. DSH's normal Chat is the only conversational surface. The developer can type an ordinary requirement or select one leading-input `/blueprint ` command. Both produce the same typed request. `/blueprint-status` and `/blueprint-map` are deterministic convenience commands.
2. Blueprint Web is a system map and document viewer. It does not contain a second assistant, model prompt composer, role selector, Agent controls, approval capability, or client-owned workflow engine.
3. The ordinary user experience is `requirement → refinement → blocking clarification if needed → implementation → verification → current truth update`. Internal steps are visible as evidence when useful, not as mandatory user-operated stages.
4. User-visible status is limited to `refining`, `ready`, `implementing`, `verifying`, `blocked`, and `completed`. Detailed tool, retry, snapshot, or DSH diagnostic facts appear only when explaining a failure.
5. Blueprint follows the current DSH workspace automatically. A developer working in the Web workspace for project A must not need to run a Blueprint-specific project switch before `/blueprint`, ordinary requirement dispatch, `/blueprint-status`, `/blueprint-map`, or dashboard actions use project A.

### Architecture boundaries and canonical change package

Blueprint has six internal boundaries behind the single visible workflow:

```text
DSH requirement
      |
      v
1. DSH adapter and project context
      |
      v
2. Repository facts and current Feature truth
      |
      v
3. Refinement, impact analysis, and proportional design
      |
      v
4. Current-Agent execution inside approved Scope
      |
      v
5. Surface-aware verification and atomic completion
      |
      +----> 6. Read-only Feature/system projection
```

1. `lib/orchestration.js`, `lib/project-binding.js`, and `lib/index.js` form the DSH adapter. They resolve the current Session, workspace, effective project root, and typed request. No lower layer may independently infer the active project from process state, Session titles, browser state, or prompt text.
2. `lib/features.js`, `lib/architecture.js`, `lib/reconciliation.js`, and `lib/specs.js` load repository facts: Feature containment, current briefs, Component ownership, active deltas, historical decisions, code paths, contracts, tests, and unknowns. This layer reports evidence and ambiguity; it does not invent a Feature boundary from directories.
3. `lib/chat-commands.js` and `lib/artifacts.js` own refinement and the canonical Change Package. Refinement may use the current Agent's reasoning, but its result must be a deterministic, schema-validated artifact rather than authority hidden in conversation prose.
4. The normal DSH Agent performs implementation. `lib/workflow.js` exposes only the accepted package, permitted paths, ordered tasks, and current progress; Blueprint does not own a second code-writing loop or a persistent Agent hierarchy.
5. `lib/verification.js`, `lib/snapshot.js`, `lib/scan.js`, and `lib/docs.js` classify acceptance surfaces, authenticate evidence against one staged snapshot, run completion hygiene, and publish the completed change transactionally.
6. `lib/web-api.js` projects repository state to `lib/client.js`. This projection is read-only except for bounded deterministic repository actions already authorized by the Host; it never becomes lifecycle authority.

One canonical Change Package crosses these boundaries. It contains:

- identity: change id, original request, owning Feature, and affected Features;
- intent: stable requirements, scenarios, assumptions, decisions, and non-goals;
- impact: affected Components, paths, contracts, data, dependencies, and structural-risk triggers;
- design: responsibility changes, interfaces, data/state flow, failure behavior, compatibility, migration, and alternatives when structural design is required;
- execution: dependency-ordered tasks, requirement coverage, and machine-readable allowed and denied Scope;
- verification: for every acceptance criterion, its delivery surface, entry point, trigger, observation moment, oracle, minimum evidence level, and mapped task/requirement ids;
- lifecycle: exact Spec hash, developer approval reference, staged snapshot identity, evidence records, public state, reason code, and next action;
- truth delta: the exact Feature brief and system-map facts to publish after completion.

The proposed Spec is the human-readable canonical representation. Small changes keep all sections in that one file. A structurally risky change adds a `Technical design` section to the same package; a separate registered design document is allowed only when the design would make the Spec difficult to review. Runtime caches and DSH conversation state may accelerate work but never replace the package.

### Current truth and active changes

1. The Feature record owns stable identity and parent-child placement. Its bilingual Feature brief is the current user-facing behavioral truth. Technical dependencies and code ownership are details attached to a Feature, not a second product hierarchy the developer must maintain.
2. An active proposed Spec is a change delta. It records the original request, owning Feature, refined requirements and scenarios, assumptions, non-goals, optional design, ordered tasks, scope, and verification plan. It does not pretend to be the complete description of the Feature.
3. Successful completion merges the accepted behavior into the Feature brief and archives the immutable implemented change with its verification evidence. Rejected or abandoned changes remain history and never become current truth.
4. Existing implemented Specs remain historical decisions. Brownfield adoption derives observed behavior from code, tests, UI, interfaces, and documentation, clearly separates facts from inference and unknowns, and asks the developer only when a product boundary cannot be established from evidence.

### Specification refinement engine

1. Blueprint first grounds the request in repository facts: authority documents, Feature tree, current brief, active changes, relevant implemented decisions, code paths, interfaces, and tests. It selects or proposes one owning Feature and reports cross-Feature effects separately.
2. It decomposes the requirement into actor and goal, entry point, happy path, inputs and outputs, state transitions, business rules, failures, edge cases, permissions, persistence, compatibility, performance or reliability constraints when relevant, non-goals, and observable acceptance scenarios.
3. Requirements use stable `REQ-*` identifiers. Each scenario uses concrete preconditions/actions/outcomes, such as Given/When/Then, and every task and verification result traces to at least one requirement.
4. Material ambiguity means two or more plausible answers would cause meaningfully different behavior, data, compatibility, or scope. Blueprint asks at most three such questions in one round. Non-material uncertainty becomes an explicit assumption rather than an interview.
5. A requirements checklist evaluates completeness, clarity, boundary coverage, failure behavior, testability, and conflicts. Cross-artifact analysis then checks that the delta, optional design, tasks, path scope, and verification plan agree. Implementation cannot start while required checklist or consistency findings remain unresolved.
6. The refinement result shows a concise developer preview: goal, owning Feature, scenarios, assumptions, non-goals, affected paths or contracts, acceptance, and unresolved decisions. Advanced artifact content remains inspectable and editable.

### Decomposition and detailed design

1. Refinement runs five internal passes while remaining one user-visible `refining` stage: ground the request, decompose behavior, resolve material decisions, design and plan proportionally, then analyze the complete package.
2. Behavioral decomposition produces one or more independently observable user or system journeys. Each journey identifies actor, entry point, preconditions, trigger, progressive or terminal observations, state transitions, failures, recovery, and non-goals. Requirements are split only when they can fail, change, or be verified independently; formatting differences do not create artificial requirements.
3. Impact analysis walks from the owning Feature to affected Feature dependencies, Components, public contracts, persistence, deployment, permissions, migration, concurrency, and runtime integration. Every claimed impact cites repository evidence or is labeled an assumption or unknown.
4. Structural-risk triggers require detailed design. The design records current and proposed responsibility boundaries, interface changes, data and state ownership, synchronous and asynchronous flows, failure and retry semantics, compatibility and migration, security or permission effects, observability, rollout/rollback, and rejected alternatives. Non-applicable fields are marked not applicable with a reason rather than filled with generic prose.
5. Tasks are derived from the dependency graph: contract or schema work before consumers, core behavior before adapters, adapters before end-to-end proof, and truth-map publication last. Each task names its inputs, expected output, allowed paths, covered requirement ids, and verification target.
6. Cross-artifact analysis is a deterministic matrix over `REQ -> scenario -> impact/design -> task -> acceptance -> verification -> path`. A missing or contradictory edge blocks readiness and returns one concise finding with its owner and proposed repair.

### Acceptance surfaces and evidence

1. Every acceptance criterion declares one primary delivery surface: `repository`, `CLI`, `API`, `service/background`, `data/persistence`, `Web UI`, or `external integration`. It also declares an observation moment: `static`, `terminal`, `progressive`, or `persistent`.
2. Evidence is selected proportionally from five levels: static/unit, contract/integration, live runtime, user-visible behavior, and completion hygiene. Lower-level evidence can support a higher-level claim but cannot replace it. For example, an API SSE test proves the stream contract, not that a browser updates visibly while the request is still running.
3. `Web UI` acceptance requires a real browser engine or an equivalent end-to-end environment using the real page entry point. A fake DOM, source-text assertion, or isolated handler test is supporting evidence only.
4. A `progressive` criterion must capture at least one required observable state before the terminal event and the terminal state afterward. Streaming output therefore passes only when evidence shows content, counters, status, or another declared user-visible effect changing before the final result arrives.
5. Each evidence record contains the acceptance and requirement ids, staged snapshot identity, environment, entry point, action, observation timestamps or ordering, expected oracle, actual result, artifact or log references, and pass/fail outcome. Secrets and full sensitive payloads are redacted before evidence is persisted.
6. Completion hygiene checks newly introduced secret-like material, undeclared temporary/debug artifacts, Scope and translation violations, relevant regression results, staged diff integrity, and current Blueprint scan. Pre-existing unrelated dirty changes are reported and excluded from the completion claim rather than deleted or silently attributed to the change.

### State, failure, and recovery semantics

1. `verifying` means a declared verification attempt is running or automatically collectible required evidence is still pending, with no known failed gate. It is not a generic waiting state.
2. `blocked` means a known unmet condition prevents safe progress. Every blocked projection has a stable reason code, the owning layer (`spec`, `design`, `implementation`, `verification`, `authority`, or `environment`), concise evidence, and exactly one recommended next action. A failed verification leaves `verifying` and becomes `blocked`.
3. Retry creates a new append-only attempt linked to the same accepted Spec and a new staged snapshot when code changed. Prior failed evidence remains available for diagnosis and is never overwritten by a later pass.
4. `completed` is reachable only when all required acceptance evidence and Host gates pass, no completion-hygiene blocker remains, and current truth can be published atomically. A publication failure rolls back lifecycle and current-truth updates while retaining the successful evidence for an idempotent retry.

### Proportional planning and implementation

1. A small bounded change may keep proposal, requirement delta, tasks, and verification in one compact proposed Spec. Blueprint adds technical-design content only when the change affects module ownership, public contracts, persistence, deployment, permissions, migration, concurrency, or another structural boundary; it remains in the canonical Change Package unless its size justifies a registered companion document.
2. Tasks are dependency ordered and small enough to verify. Every task identifies its requirement coverage and expected validation. Unmapped tasks, requirements without validation, and implementation paths outside Scope fail the analysis gate.
3. Clear bounded work can continue automatically after refinement according to project policy. A project may require one review before implementation, while a personal-project autopilot policy may continue unless a blocking question, destructive action, compatibility break, or high-risk boundary requires confirmation.
4. Implementation uses the normal DSH Agent and its existing permission system by default. Blueprint does not create a mandatory family of long-lived coordinator, architecture, implementer, and verifier Agents. A temporary structured Workflow or independent verifier is optional for complexity or risk and must remain an internal implementation choice.
5. Verification runs the requirement-linked evidence plan, relevant regression tests, documentation checks, Blueprint scan, and the minimum live or user-visible checks required by each declared delivery surface. A failure returns to the owning requirement, design, task, or implementation step with a reason code and one next action.
6. Completion is atomic from the repository's perspective: implementation and evidence match the accepted delta, the Feature brief and map reflect shipped behavior, the change becomes immutable history, and stale or partial current-truth updates are rolled back.

### System map

1. The main Blueprint view is a Feature hierarchy for the current system. It supports expansion, search, status filters, and direct navigation to Feature details.
2. A Feature detail shows summary, current behavior and scenarios, parent and children, dependencies, primary code paths, interfaces, tests, documents, active change, verification state, and completed change history. An active change also shows the Change Package traceability matrix, required evidence surfaces, current blocker or running verification, and recommended next action.
3. Feature containment and technical dependency are distinct. A dependency can cross tree branches without changing identity or parentage. Component-level information may remain as an advanced technical projection, but it is not required for ordinary Feature planning.
4. Dashboard selection is view state only. It cannot authorize repository mutation or silently change the DSH Chat target. A model action uses an explicit Feature id or an unambiguous repository-grounded selection.

### DSH-native plugin contract

1. Before implementation, record the exact target DSH profile, resolved package versions, official documentation revision or release, and supported Node version. All DSH peer packages used by Blueprint must resolve to a compatible contract set.
2. The Host remains a normal Cordis plugin with declared service dependencies. Commands register through the documented command service, model capabilities through the documented tool service, and every listener, registration, timer, or owned resource disposes with its plugin scope.
3. Host and Client remain separate. The browser obtains repository projections and deterministic actions through the documented typed Host API. UI composition uses the target version's official Client slot or view extension point; it does not patch the shell or call private composer APIs.
4. Project resolution is DSH workspace-aware. Given the current `sessionId`, Blueprint first resolves the owning DSH workspace and uses that workspace's path as the project-entry path. Only if DSH exposes no workspace path may Blueprint fall back to Session `cwd`, then plugin/process `cwd`, then an explicit manual fallback.
5. Manual `/blueprint-use <project-path>` is an escape hatch, not normal project selection. It may help legacy, projectless, or intentionally cross-project Sessions, but it never outranks an active DSH workspace path or a real Blueprint project discovered from Session `cwd`.
6. The effective project root is computed once per action from current DSH state and then passed to repository operations. Commands, ordinary tool dispatch, dashboard, document reads, approval, preparation, architecture actions, implementation, and verification all share the same resolver so they cannot disagree about the active project.
7. Blueprint Web shows the three identities separately when available: DSH workspace title/path, Session `cwd`, and effective Blueprint root. If a manual fallback is active, the UI labels it as fallback evidence and offers a clear way to replace or remove it.
8. Agent, Workflow, Session, goals, or Jobs APIs are used only when documented for the target version and only for their documented ownership and durability semantics. Session titles, prompt markers, latest-message scans, browser storage, and React effects never grant authority.
9. The package remains an installable DSH bundle declared by `package.json` and `cordis.patch.yml`. A compatibility fixture installs or links the package into the exact target profile, boots the real Host and Web Client, exercises commands/tools/dashboard registration, unloads the plugin, and asserts cleanup.
10. Latest master documentation may inform migration planning, but implementation follows the exact resolved target contract. If the desired public extension point is unavailable, the Spec returns for revision or the DSH baseline is explicitly upgraded; private API substitution is forbidden.
### Migration from the current proposal

1. The prior exact-hash approval and verification attempts belong to the superseded orchestration proposal. Editing this proposed Spec invalidates that approval; AI does not edit the approval record or treat earlier implementation as authorized under the new hash.
2. Existing staged code is preserved as pre-existing work, then reviewed against this new Scope after approval. Useful DSH command, repository scan, verification, and dashboard code may be retained; role machinery that does not serve the simplified product is removed or reduced.
3. Existing Feature identities, implemented Specs, bilingual documents, and scan behavior migrate without fabricated current truth. The migration produces a truthful Feature brief for each adopted capability before presenting the complete system map.

### Non-goals

- Reimplement DSH Chat, Agent loop, permission UI, terminal, browser, or Session viewer.
- Expose internal Agent topology, capability tokens, snapshot digests, or retry machinery as the normal product workflow.
- Require architecture review, multiple Agents, or independent browser verification for every small change.
- Infer product Feature hierarchy solely from source directories.
- Guarantee that an underspecified sentence has one correct interpretation without surfacing material ambiguity or assumptions.

## Alternatives considered

**Continue the Host-owned multi-role orchestration proposal.** Rejected as the default because it makes lifecycle safety machinery the developer experience. Some mechanisms may remain as optional high-risk verification internals.

**Clone Spec Kit's command sequence.** Rejected because requiring the developer to run specify, clarify, checklist, plan, tasks, analyze, implement, and converge separately recreates the complexity Blueprint is intended to remove. Blueprint adopts their quality responsibilities inside one guided flow.

**Clone OpenSpec's files and commands exactly.** Rejected because OpenSpec does not provide Blueprint's Feature hierarchy and system map, while this repository already has compatible Feature, bilingual brief, proposed, implemented, and rejected concepts. Blueprint adopts current-truth and delta semantics without unnecessary format churn.

**Generate code directly from the initial request.** Rejected because the user's central requirement is correct decomposition and improvement of the Spec; implementation before clarification and consistency checks would preserve ambiguity rather than solve it.

**Build a standalone Web application beside DSH.** Rejected because Blueprint is a DSH plugin. It must compose through the documented Host and Client extension points and reuse DSH Chat, permissions, Sessions, and runtime services.

## Acceptance criteria

- AC-SIMPLE-001: One ordinary DSH requirement or `/blueprint ` input creates the same typed Blueprint change request without opening another Chat or asking the developer to select an internal role.
- AC-SIMPLE-002: Blueprint grounds each change in authority, current Feature truth, relevant code and tests, selects one owning Feature, and presents cross-Feature effects without silently inventing hierarchy.
- AC-SIMPLE-003: The refinement engine produces stable requirements and concrete scenarios covering normal behavior, state, rules, failures, edge cases, compatibility, non-goals, and observable acceptance where relevant.
- AC-SIMPLE-004: Blueprint asks at most three material questions in one round, records non-material uncertainty as visible assumptions, and cannot implement while a blocking ambiguity remains.
- AC-SIMPLE-005: Requirements checklist and cross-artifact analysis reject unclear, contradictory, untestable, unmapped, out-of-Scope, or inconsistent change packages before implementation.
- AC-SIMPLE-006: Every task and verification result traces to stable requirements, and a technical design is required only for declared structural-risk triggers.
- AC-SIMPLE-007: The normal flow can implement and verify a clear bounded change without mandatory multi-Agent orchestration, while project policy can require review or independent verification for high-risk work.
- AC-SIMPLE-008: Successful completion atomically updates the Feature's current bilingual truth, archives immutable change evidence, and leaves rejected or abandoned changes out of current behavior.
- AC-SIMPLE-009: Blueprint Web renders a searchable Feature hierarchy and a detail view containing current behavior, hierarchy, dependencies, code paths, tests, documents, active change, status, and history without owning orchestration.
- AC-SIMPLE-010: User-visible workflow exposes only refining, ready, implementing, verifying, blocked, and completed, with internal DSH diagnostics available on demand rather than required for ordinary use.
- AC-SIMPLE-011: The plugin resolves and records one exact DSH target contract, uses only its public Host/Client/Cordis extension points, remains an installable bundle, and cleans up every registration on unload.
- AC-SIMPLE-012: A real target-profile compatibility scenario passes from requirement refinement through implementation, verification, current-truth update, system-map inspection, plugin unload, and restart recovery without DSH core patches or private Client APIs.
- AC-SIMPLE-013: In DSH Web with multiple workspaces, Blueprint automatically resolves the current interaction's project from the active Session's owning workspace path; `/blueprint-use` is required only when no DSH workspace path or usable Session cwd is available.
- AC-SIMPLE-014: One schema-validated Change Package carries identity, intent, impact/design, tasks, Scope, verification, lifecycle, and truth delta across explicit DSH-adapter, repository, refinement, execution, verification, and projection boundaries without relying on conversation or browser state as authority.
- AC-SIMPLE-015: Structural-risk changes contain an evidence-grounded technical design covering responsibility, contracts, data/state flow, failures, compatibility, migration, observability, and rollback, while bounded changes remain reviewable in one compact Spec.
- AC-SIMPLE-016: Every acceptance criterion declares a delivery surface, observation moment, oracle, and minimum evidence level; supporting unit or contract checks cannot satisfy a required runtime or user-visible claim by themselves.
- AC-SIMPLE-017: A progressive Web UI behavior, including streaming output, cannot pass until a real browser-level scenario observes the declared intermediate visible effect before the terminal result and then observes the correct terminal state.
- AC-SIMPLE-018: Completion blocks on newly introduced secret-like material, undeclared temporary/debug artifacts, Scope or documentation violations, missing required evidence, or failed Host gates, while preserving and reporting unrelated pre-existing work.
- AC-SIMPLE-019: `verifying` and `blocked` have mutually exclusive operational meanings; every blocked state exposes a stable reason, owning layer, evidence, and one recommended next action, and retry preserves prior attempts.

## Verification

- AC-SIMPLE-001: DSH integration tests compare ordinary tool dispatch and the leading-input command request, assert one normal Chat surface, and assert no role-selection or embedded composer UI.
- AC-SIMPLE-002: Repository fixtures cover exact Feature selection, new child proposals, cross-Feature dependencies, unknown boundaries, and brownfield evidence without directory-derived invention.
- AC-SIMPLE-003: Refinement fixtures cover UI, API, persistence, permission, failure, compatibility, and small bounded changes; snapshots assert stable requirements and scenario coverage appropriate to each request.
- AC-SIMPLE-004: Ambiguity tests distinguish material choices from assumptions, enforce the three-question cap, persist answers, and block implementation only for unresolved material decisions.
- AC-SIMPLE-005: Quality-gate tests inject unclear wording, contradictions, missing failure behavior, requirement/task gaps, missing verification, design conflict, and path Scope violations, then assert fail-closed remediation.
- AC-SIMPLE-006: Traceability tests map every task and check to requirements and verify that structural triggers create design content while simple changes do not.
- AC-SIMPLE-007: Policy tests exercise personal-project autopilot, review-required mode, destructive or compatibility-breaking confirmation, optional structured Workflow, and independent high-risk verification.
- AC-SIMPLE-008: Transaction tests inject failure at each implementation, evidence, brief merge, archive, and map update boundary; assert rollback, idempotent retry, bilingual synchronization, and immutable history.
- AC-SIMPLE-009: Client and real-browser tests navigate a multi-level Feature tree, search it, open details, inspect current and historical facts, and prove that page state cannot authorize Host mutation.
- AC-SIMPLE-010: UI projection tests assert the six public states and verify that attempts, capabilities, Session bindings, and snapshot diagnostics are collapsed unless a failure detail is opened.
- AC-SIMPLE-011: Contract tests resolve the active profile's exact package graph, validate peer alignment, exercise documented command/tool/API/slot registration, unload the plugin, and reject private or cross-version API use.
- AC-SIMPLE-012: Run the full Node suite, syntax checks, bilingual documentation checks, working-tree and staged Blueprint scans, then boot the exact DSH target profile and complete one real requirement-to-map scenario across a restart.
- AC-SIMPLE-013: Workspace fixtures create at least two DSH workspaces with different paths and Session ids, assert command/tool/dashboard actions select by current `sessionId`, assert Session `cwd` remains a fallback only, assert a manual binding never overrides workspace path, and assert restart recovery reuses DSH workspace state without requiring `/blueprint-use`.
- AC-SIMPLE-014: Schema and boundary tests serialize one Change Package through refine, approval, implementation, verification, completion, and Web projection; reject missing required fields, implicit project lookup below the adapter, and browser/conversation authority.
- AC-SIMPLE-015: Design fixtures cover a simple text change, API contract change, persistence migration, asynchronous stream, permission change, and deployment change; assert proportional design fields, repository evidence citations, dependency-ordered tasks, and explicit not-applicable reasons.
- AC-SIMPLE-016: Verification-plan fixtures cover repository, CLI, API, background service, persistence, Web UI, and external integration surfaces at static, terminal, progressive, and persistent moments; assert the minimum evidence level and reject weaker substitutions.
- AC-SIMPLE-017: A real-browser fixture starts the actual Web entry point, triggers a deliberately delayed stream, asserts that the declared DOM/status/counter effect changes while the terminal event is still withheld, releases the terminal event, and then asserts final content and state. A fake-DOM-only fixture must fail this acceptance gate.
- AC-SIMPLE-018: Completion fixtures introduce a secret-like value, debug output, undeclared temporary file, Scope violation, stale translation, failed regression, and unrelated pre-existing edit; assert that only in-scope blockers prevent completion and that no user file is deleted or misattributed.
- AC-SIMPLE-019: State-machine tests cover running verification, failed evidence, missing approval, blocked environment, repaired implementation, retry with a changed snapshot, and publication failure; assert public state, reason code, owning layer, single next action, append-only evidence, and idempotent recovery.

## Risks

- DSH is in developer preview and public npm versions may not match the current master manuals or an existing local profile. Version discovery and a real-profile contract fixture are mandatory before implementation planning becomes code authority.
- Automatically refining a Spec can hide assumptions if the preview is too terse. Material decisions, assumptions, non-goals, and requirement coverage must remain inspectable even when the default flow is concise.
- Treating the Feature brief as current truth requires safe bilingual merge and migration behavior. Historical decisions must not be rewritten to manufacture a clean present.
- A single Feature hierarchy cannot express every technical relationship. Dependencies and code ownership must remain separate edges, while the primary tree stays understandable to a developer.
- Removing mandatory independent roles reduces ceremony but can reduce assurance for risky changes. Project policy and explicit risk triggers must retain proportional review and verification.
- DSH may expose workspace context differently between the local storage file, Client Session projection, and public Host services. The implementation must prefer documented APIs when available, treat direct storage reads as compatibility fallback, and fail visibly rather than selecting the wrong project.
- The repository currently contains staged implementation from the superseded proposal. It must not be mistaken for implementation authorized by the new Spec hash.
- Browser-level evidence can be slower or unavailable in headless environments. The verification plan must declare the required environment before implementation and fail visibly when that environment is absent rather than downgrading a user-visible claim to a mock.
- Secret and temporary-artifact detection can produce false positives. Findings must identify the exact path and rule, support explicit repository policy exceptions, and never delete files automatically.

## Consequences

Blueprint completed this delivery automatically after requirement-linked verification.

- Verified snapshot: `git-index:9929ab061cb7f6321b95d17941071ba700fe49a6571047286e32d06984980cc9`
- Verification attempt: `attempt-3`
- Conclusion: Developer manually confirmed the required 3080 in-app browser behavior; automated command, docs, staged scan, Host API, workspace-context, verification schema, state semantics, and hygiene evidence passed for the staged snapshot.
- AC evidence: all 19 acceptance criteria passed.
- Check evidence: manual-3080-01 (command), manual-3080-02 (command), manual-3080-03 (command), manual-3080-04 (command), manual-3080-05 (command), manual-3080-06 (command), manual-3080-07 (command), manual-3080-08 (command), manual-3080-09 (browser), manual-3080-10 (command), manual-3080-11 (browser), manual-3080-12 (browser), manual-3080-13 (command), manual-3080-14 (browser), manual-3080-15 (command), manual-3080-16 (browser), manual-3080-17 (browser), manual-3080-18 (command), manual-3080-19 (command).
