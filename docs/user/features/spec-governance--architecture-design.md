# DSH-native spec-driven Blueprint

English | [中文](spec-governance--architecture-design.zh.md)

## What it does

Design Blueprint is a DSH plugin that turns one developer requirement into a refined specification, an implementation, verified evidence, and an updated map of the system. The developer works in DSH's normal Chat and does not choose a Spec assistant, architecture assistant, implementer, verifier, lifecycle stage, or repository file.

Blueprint combines three ideas in one opinionated workflow:

- Spec Kit-style refinement discovers ambiguity, decomposes user scenarios, checks requirement quality, and analyzes consistency before implementation.
- OpenSpec-style change deltas describe what is changing, while the Feature brief remains the current behavioral truth after a completed change is merged.
- Blueprint's Feature tree presents the current system as a navigable hierarchy whose nodes expose behavior, code ownership, dependencies, tests, active changes, and historical decisions.

The default path is intentionally small. A developer describes a requirement; Blueprint locates the owning Feature, reads the existing brief, code, tests, and relevant authority, drafts the change, asks only questions whose answers materially alter behavior, implements the accepted result, verifies it, and updates the current Feature truth. Advanced artifact and diagnostic details remain available without becoming required user workflow.

## Specification refinement

Blueprint must improve a requirement rather than copy it into Markdown. For every meaningful change it identifies the actor and goal, entry point, normal flow, inputs and outputs, state transitions, business rules, failures, edge cases, compatibility constraints, non-goals, and observable acceptance scenarios.

Material ambiguity produces at most three focused questions in one round. Non-material gaps become visible assumptions that can be corrected before or during implementation. Requirements use stable identifiers and concrete scenarios so every implementation task and verification result can trace back to an intended behavior.

Before implementation Blueprint performs three internal quality passes:

1. Clarification finds missing decisions and contradictory interpretations.
2. A requirements checklist tests whether the specification is complete, unambiguous, bounded, and verifiable.
3. Cross-artifact analysis checks that the requirement delta, optional technical design, tasks, code scope, and verification plan agree.

Simple changes may use a compact change document. A technical design is generated only when the work changes module ownership, a public contract, persistence, deployment, permissions, migration, or another structural boundary. The developer can inspect and edit every artifact, but does not have to drive each phase manually.

## Current truth and change history

The Feature map and its bilingual Feature brief describe what the system does now. An active change describes only the delta being considered or implemented. A completed change updates the owning Feature's current brief and moves its immutable change package into history. Rejected or abandoned changes never become current truth.

Each active change retains the original request, refined requirements and scenarios, explicit assumptions, optional design, ordered tasks, implementation progress, and verification evidence. This keeps the current system understandable without discarding why a behavior changed.

The Feature tree is the primary product hierarchy. Parent and child links express capability containment; dependencies and technical ownership are separate details rather than a second hierarchy the developer must maintain. Clicking a Feature shows its summary, current behavior, children, dependencies, primary code paths, tests, documents, active change, and completed change history.

## DSH plugin contract

DSH's normal Chat is the only conversational surface. Blueprint contributes one leading-input `/blueprint ` command and the equivalent model-facing tool; ordinary natural language may reach the same request contract. `/blueprint-status` and `/blueprint-map` are deterministic convenience commands. Blueprint Web is a dashboard and document viewer, not another Chat.

Implementation must target one exact DSH version resolved from the active profile. Host commands, model tools, services, Agent or Workflow continuation, typed Host APIs, Client slots, and cleanup must use only public extension points documented for that version. The plugin must not patch the DSH core, call private composer APIs, infer authority from Session titles or prompt markers, or mix APIs from current master documentation with an older installed package set.

The plugin remains a normal installable DSH bundle. Host and Client responsibilities stay separate, every registration is disposable with its Cordis scope, and compatibility tests boot the real target profile. Repository artifacts are durable authority; browser storage, React effects, process-local Jobs, and assistant prose are not.

## Developer experience

The ordinary interaction is: developer requirement → refine the specification → ask only blocking questions → implement → verify → update the Feature map and current brief.

User-visible progress is limited to `refining`, `ready`, `implementing`, `verifying`, `blocked`, and `completed`. Internal DSH turns, tool calls, snapshots, retries, and diagnostic records may exist, but they are shown only when needed to explain a failure.

Completion requires the declared tests and repository checks to pass and the Feature's current truth to match the shipped behavior. High-risk changes may require explicit review or an independent verification pass; ordinary bounded changes do not create a mandatory multi-Agent ceremony.
