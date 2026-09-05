# `@dsh-plugins/design-blueprint`

English | [中文](README.zh.md)

Design Blueprint is a DSH plugin for one simple development loop:

`requirement → refined Spec → implementation → verification → current system map`

The developer stays in DSH's normal Chat. Blueprint grounds a request in repository facts, finds or proposes one owning Feature, turns ambiguity into explicit requirements and scenarios, implements the approved delta, verifies it, and updates a navigable Feature hierarchy. It borrows Spec Kit's clarification and consistency responsibilities and OpenSpec's separation between current truth and an active change, without copying either tool's multi-command ceremony.

## Developer experience

- Type a normal requirement or use `/blueprint <requirement>`. Both reach the same typed refinement contract.
- Use `@feature:<id>` when ownership must be explicit. Ambiguous ownership fails closed and shows at most three candidates.
- In DSH Web, Blueprint follows the current Session's owning workspace path automatically. `/blueprint-use <project-path>` is only a manual escape hatch for legacy, projectless, or intentionally cross-project Sessions where DSH exposes no usable workspace path or Session `cwd`.
- Blueprint decomposes actor and goal, entry point, normal flow, inputs and outputs, state, rules, failures, edge cases, permissions, persistence, compatibility, non-goals, and observable acceptance where relevant.
- Requirements use stable `REQ-*` ids and concrete Given/When/Then scenarios. A requirements checklist and cross-artifact analysis run before implementation.
- One schema-validated Change Package connects requirements, impact and proportional design, tasks, Scope, acceptance evidence, lifecycle state, and the Feature truth to publish.
- One refinement round asks at most three questions whose answers materially change behavior, data, compatibility, risk, or scope. Other uncertainty is recorded as an assumption.
- The current DSH Agent implements ordinary bounded work. A technical design or independent verifier is added only when risk justifies it.
- Every acceptance criterion has a delivery surface, observation moment, and minimum evidence level. Web UI claims require real-browser evidence; progressive behavior must be observed before and after its terminal event.
- Public progress is limited to `refining`, `ready`, `implementing`, `verifying`, `blocked`, and `completed`.

`/blueprint-status` returns the current Feature stages. `/blueprint-map` returns the Feature hierarchy. The Blueprint Web view adds search, stage filters, Feature details, bilingual current briefs, hierarchy, dependencies, code paths, contracts, tests, the active Change Package traceability/evidence plan, actionable status, and safe links to registered documents. Dashboard selection is view state only: it cannot authorize a write or silently retarget Chat.

## Current truth and changes

`.blueprint/features/*.md` owns stable Feature identity and product containment. Each Feature's bilingual brief under `docs/user/features/` describes current user-visible behavior. A Feature-linked proposed Spec describes only the active delta. Implemented and rejected Specs are immutable history.

The repository, not assistant prose or browser state, is durable authority. Exact developer approval is bound to the combined bilingual proposed-Spec hash. Verification is bound to the staged Git snapshot. Completion additionally requires scope, documentation, architecture, completion-hygiene, and scan gates to pass. Completion hygiene checks newly staged secret-like material and undeclared temporary/debug artifacts; explicit exceptions live in `completionHygiene.secretAllow` and `completionHygiene.temporaryAllow`.

`verifying` means a declared attempt is running or automatically collectible evidence remains with no known failed gate. A known failure becomes `blocked` and exposes a stable reason code, owning layer, concise evidence, and one recommended next action. Retry appends a new attempt instead of replacing prior evidence.

Feature parentage expresses product containment. Component ownership, contracts, deployment, and dependencies remain an advanced technical projection and do not form a second user-operated product hierarchy.

## DSH integration contract

This release targets the installed DSH Web profile contract exactly:

- DSH release: `0.1.1-rc.2`, official release revision `dsh-v0.1.1-rc.2 (b150a55)`
- Node.js verified version: `22.23.1`
- Host composition: Cordis function plugin
- Client composition: `conversation.view` through the rc.2 `slots.inject` / `slots.register` contract

The Host registers public command, system-prompt, Web-server, and tool services. It does not require DSH's Agent service or create a mandatory coordinator/architect/implementer/verifier family. The Client uses DSH's lazy module loader, public conversation-view slot, Session projection, DSH workspace-aware project resolution, and input-trigger source. It does not patch the shell, call private composer APIs, create Sessions, or own lifecycle authority.

The package remains an out-of-tree DSH bundle declared by `package.json` and `cordis.patch.yml`. Latest master documentation is useful migration guidance, but runtime code follows the exact installed release contract.

## Commands and API

- `/blueprint <requirement>` refines one requirement in the current Chat.
- `/blueprint-use <project-path>` records a manual fallback Blueprint project for projectless or legacy Sessions. Normal DSH Web workspaces are selected automatically from the current Session's owning workspace path, and the fallback never overrides a workspace path or a real Blueprint project discovered from Session `cwd`.
- `/blueprint-status` reports public Feature stages without a model turn.
- `/blueprint-map` prints the Feature hierarchy without a model turn.
- `design-blueprint init [--cwd <path>]` creates or upgrades a non-destructive governance baseline.
- `design-blueprint scan [--cwd <path>] [--all] [--json] [--severity required|recommended|all]` checks the exact Git index by default; `--all` checks the working tree.
- `design-blueprint docs list|check|confirm <file> [--cwd <path>]` manages bilingual document correspondence.
- `design-blueprint approve <feature-id> --spec-hash <sha256> --yes [--cwd <path>]` is the explicit CLI fallback for a developer-authorized exact-hash approval.
- `design-blueprint verification ...` exposes durable implementation and verification recovery operations.
- `design-blueprint install-hook [--local|--global] [--uninstall]` manages the Git gate.
- `design-blueprint stamp --verify|--refresh|--acknowledge [--force]` manages optional freshness stamps.

Programmatic exports include `./chat-commands`, `./orchestration`, `./project-binding`, `./web-api`, `./workflow`, `./verification`, `./features`, `./architecture`, `./reconciliation`, `./assistant-actions`, `./scan`, `./docs`, `./specs`, `./snapshot`, `./policy`, `./config`, `./init`, `./install-hook`, `./stamps`, and `./version`.

## Project authority

`design-blueprint.json` names standing instructions, architecture, public contracts, the Spec lifecycle, Feature/approval/verification roots, documentation policy, and change scope. Repository-relative paths use the supported `*`, `**`, and `?` glob vocabulary; absolute paths and parent traversal are rejected.

For every non-trivial change:

1. Create or update one proposed Spec with machine-readable Scope, stable `AC-*` acceptance ids, and matching verification entries.
2. Keep Product brief, Spec, architecture, implementation, tests, and public documentation consistent.
3. Obtain direct developer approval for the exact proposed bilingual hash when project policy requires it.
4. Implement only inside Scope and stage the intended snapshot.
5. Run relevant tests, `design-blueprint docs check`, and the staged `design-blueprint scan`.
6. Complete only from accepted evidence and current Host gates.

## Limits

Blueprint does not guarantee that an underspecified sentence has one correct interpretation. It exposes material ambiguity and assumptions. It does not infer Feature hierarchy from source directories, replace DSH Chat or permissions, execute arbitrary repository commands from the dashboard, treat manual fallbacks as stronger than DSH workspace or cwd discovery, or treat a passing model statement as completion authority.

This repository is private package source and requires Node.js `>=22.19`.



