# Design Blueprint architecture

## Product boundary

Design Blueprint is a DSH-native Spec refinement and system-map plugin. Its ordinary path has one visible Agent and one visible conversation. The plugin supplies repository grounding, deterministic lifecycle gates, and a read-only system projection; it does not implement another Chat or make internal roles part of the product.

Three artifacts answer separate questions:

- A **Feature** and its bilingual brief say what the system does now and where a capability sits in the product hierarchy.
- A **Spec** says what one reviewed change adds, removes, or changes, which paths it may touch, and how it is accepted.
- A **Component** says which technical responsibility owns code paths, contracts, dependencies, and deployment.

Feature containment is the primary user-facing hierarchy. Component and dependency edges are supporting technical detail.

## Authority and data flow

```text
DSH Chat requirement
        |
        v
chat-commands.js ---- repository-grounded refinement packet
        |
        v
current DSH Agent --- requirements / scenarios / optional design / tasks
        |
        v
workflow.js --------- exact developer approval and lifecycle state
        |
        v
current DSH Agent --- implementation inside approved Scope
        |
        v
verification.js ----- staged snapshot, evidence, Host gates, completion
        |
        +----> Feature current brief and immutable Spec history
        |
        +----> web-api.js ----> client.js Feature tree and document viewer
```

`design-blueprint.json` indexes standing instructions, architecture, public contracts, Spec lifecycle, Feature records, approval and verification records, and documentation rules. `AGENTS.md` owns development orders. This file owns current architecture. README files own public behavior. `.specs/` owns change rationale and immutable decisions.

## Host modules

- `lib/project-binding.js` resolves the effective Blueprint project from the current DSH workspace path first, then Session `cwd`, then process `cwd`, and finally a manual fallback binding for legacy or projectless Sessions.
- `lib/chat-commands.js` resolves one owning Feature and creates the shared `/blueprint` and tool refinement packet. It defines decomposition dimensions, stable requirement/scenario formats, quality gates, the three-question cap, and structural-risk triggers.
- `lib/orchestration.js` is the single-Chat adapter. It steers the initiating Agent for slash input, exposes `/blueprint-use` only as a manual fallback escape hatch, and exposes one `blueprint_dispatch` tool with `refine`, `begin`, and `complete` actions. It does not create mandatory role Agents.
- `lib/workflow.js` joins proposed Specs, exact approvals, and verification state. Its public projection collapses internal states into six developer-facing stages.
- `lib/verification.js` binds delivery to an exact staged snapshot, records attempts and evidence, recomputes Host gates, and performs recoverable completion. Optional independent verification can reuse the retained read/test guard without changing the default path.
- `lib/features.js`, `lib/architecture.js`, and `lib/reconciliation.js` load the developer-owned Feature tree, advanced Component projection, and current coverage findings without inventing product boundaries from directories.
- `lib/web-api.js` exposes a bounded same-origin read model and deterministic actions. Document reads are restricted to paths already registered to the selected Feature.
- `lib/scan.js`, `lib/snapshot.js`, `lib/policy.js`, and `lib/docs.js` enforce exact snapshot scope, lifecycle, documentation, and bilingual correspondence.
- `lib/index.js` registers Cordis effects for commands, system prompt, model tool, and exact Web route. Every registration returns a disposer owned by plugin scope.

## Refinement contract

The original request is preserved. Resolution prefers one explicit `@feature:<id>`, then an exact caller id, a single known Feature, or an unambiguous repository-text match. Multiple explicit Features fail closed. An unresolved result contains no more than three candidates and cannot silently select a write target.

Refinement considers actor and goal, entry point, happy path, inputs and outputs, state, rules, failures, edges, permissions, persistence, compatibility and quality, non-goals, and observable acceptance. Requirements use `REQ-*`; scenarios use Given/When/Then. A requirements checklist and mappings from requirements to scenarios, tasks, verification, design, Scope, and paths are mandatory planning evidence. The current Agent asks no more than three material questions per round.

A separate technical design is proportional. It is required for module ownership, public contracts, persistence, deployment, permissions, migration, concurrency, or similar structural risk, not for every text or UI adjustment.

## Lifecycle and verification

Internal lifecycle records retain detailed approval, implementation, snapshot, attempt, repair, and completion states. The public read model exposes only `refining`, `ready`, `implementing`, `verifying`, `blocked`, and `completed`.

Approval binds the exact combined bilingual proposed-Spec hash. AI does not hand-write approval records. Implementation is restricted to the approved machine-readable Scope. Completion prepares an isolated representation of the staged snapshot, authenticates one attempt result, maps evidence to acceptance, reruns current Host gates, and atomically updates lifecycle artifacts. Failure stays durable and actionable; retry does not erase prior evidence.

The normal verifying Agent is the current DSH Agent. High-risk policy may add an independent read-only verifier. Agent identity, Session titles, browser storage, prompt markers, manual fallback bindings, and model prose never replace DSH workspace identity, repository authority, or Host checks.

## Web client boundary

The Web client is a searchable Feature hierarchy and detail/document viewer. A Feature detail projects current bilingual behavior, parent and children, dependencies, code paths, contracts, tests, documents, active Spec and exact hash, internal diagnostic state, and history available from registered artifacts. When the DSH Session `cwd` is not a Blueprint project, the setup state can bind the current Session to an existing Blueprint root supplied by the developer.

The client cannot execute shell commands, write arbitrary paths, create or resume Agents, submit fabricated verification, or change the Chat target through selection. Exact approval remains a deterministic developer action; after approval the developer continues in the same DSH Chat.

## DSH compatibility

The runtime baseline is DSH `0.1.1-rc.2` at official release revision `b150a55`, Cordis `4.0.1`, and Node.js `22.23.1`. The Host is a Cordis function plugin with declared `commands`, `systemPrompt`, `webServer`, and `tools` dependencies. The rc.2 Client uses `window.__ModuleLoader__.load`, the public `conversation.view` `slots.inject`/`slots.register` composition, Session projection, and input-trigger source contracts.

The current master Client slot API differs and is migration guidance only. Upgrading the DSH baseline requires updating the compatibility record, peer graph, implementation, and real-profile checks together. Private APIs are never used as cross-version substitutes.




