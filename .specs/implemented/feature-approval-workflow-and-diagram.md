# Spec: Feature approval workflow, hierarchy diagram, and review agent

Status: implemented
Feature: web-dashboard

## Problem

The feature catalog could store requirements, display a hierarchy, and bind a proposed Spec to developer approval, but the review experience still had two gaps. Product intent and engineering detail were mixed in long Markdown documents, and a developer who found ambiguity had to leave Blueprint and rebuild the context in the main development conversation. The dashboard needed a readable product-facing view and a dedicated Spec assistant without weakening direct developer approval.

## Scope

- allow: `lib/features.js`
- allow: `lib/specs.js`
- allow: `lib/workflow.js`
- allow: `lib/version.js`
- allow: `lib/policy.js`
- allow: `lib/scan.js`
- allow: `lib/web-api.js`
- allow: `lib/client.js`
- allow: `lib/index.js`
- allow: `tests/**`
- allow: `package.json`
- allow: `design-blueprint.json`
- allow: `cordis.patch.yml`
- allow: `AGENTS.md`
- allow: `DESIGN.md`
- allow: `README.md`
- allow: `README.zh.md`
- allow: `README.i18n.yaml`
- allow: `.blueprint/features/**`
- allow: `.specs/**`

## Decision

### Direct developer approval gate

A Feature-linked proposed Spec uses `Feature: <id>`. Blueprint derives the feature stage from repository artifacts: the lifecycle Spec, an explicit approval record, and the implemented state. Only the developer action in Blueprint Web may create `.blueprint/approvals/<feature-id>.json`; the record binds the feature ID, canonical Spec path, exact review hash, and approval time. Changing either language of a paired Spec invalidates the approval.

The staged policy does not let an unapproved Feature-linked proposal authorize implementation files. Planning may create a Product brief pair and one proposed Spec pair, but it stops before implementation or self-approval. Development begins only from the exact approved review hash, remains inside the Spec Scope, runs the declared verification, and moves both language files to `implemented` only after success.

### Product-facing requirement view

Blueprint presents navigation, states, actions, errors, and review guidance in Chinese by default. The selected feature separates a four-section Product brief from the formal Development Spec and offers physical Chinese and English files. Repository facts remain distinct from assistant suggestions; missing material is shown as unspecified instead of being invented by the browser.

The Blueprint heading displays the actual Host and Client plugin versions. Matching versions appear once; a mismatch displays both values and asks for a complete DSH Web restart. The resolved project root remains visible so a stale browser bundle can be distinguished from the wrong workspace.

### Independent Spec review agent

The Optimize Spec workspace places an independent DSH Session/Agent beside the selected document. The Session receives the current feature definition, both Product brief languages, both Spec languages, the presentation mode, and the current developer message. It does not inherit the main development conversation. The default Chinese simple mode silently completes repository-derived engineering detail and asks at most three questions that affect visible product behavior or business boundaries; technical mode exposes fields, configuration, acceptance IDs, and verification detail.

The role prompt forbids implementation, lifecycle archival, approval-record writes, and implementation-file edits. Repository text is delimited as untrusted review material. Explicit direct-write authorization permits synchronizing only the current Product brief and proposed Spec pairs, one language per file. The active DSH Agent composition still supplies the actual tool capability, so this is a prompt boundary rather than an operating-system sandbox.

The assistant uses one stable Session per project, feature, and review protocol. Spec edits refresh the document and latest context without making the conversation stale. A developer may explicitly start a new conversation, while the previous DSH Session remains available as history. The panel projects DSH-published reasoning summaries, tool and file activity, tasks and subagents, errors, cancellation, and streaming Markdown answer text; it never claims to expose hidden chain-of-thought.

### Feature hierarchy diagram

The Project structure workspace switches between a compact directory and a dependency-free React/SVG tree. The layout is top-down, uses uniform nodes and orthogonal connectors behind the nodes, and highlights only the current selection. Mouse and keyboard activation select the same canonical feature used by the document and assistant views.

## Alternatives considered

**Reuse the main development conversation.** Rejected because implementation history and review intent would be mixed and feature-specific review history would be unstable.

**Let the assistant approve its own edits.** Rejected because it would remove the direct developer decision boundary.

**Use a one-shot review summary.** Rejected because it cannot clarify product intent over multiple turns or directly maintain the paired files.

**Keep one mixed-language Spec.** Rejected because it forces product explanation, machine structure, Chinese, and English into one unreadable artifact.

**Infer features from source directories or render Mermaid text.** Rejected because source layout is not product authority and the dashboard requires selection, state, accessibility, and theme integration.

## Verification

- Approval and stale-hash behavior: `tests/workflow.test.js`, `tests/web-api.test.js`, `tests/staged-policy.test.js`.
- Product brief and Spec language switching: `tests/spec-workspace.test.js`, `tests/specs.test.js`.
- Stable independent Session, latest-context submission, activity projection, streaming, cancellation, and direct refresh: `tests/client-runtime.test.js`, `tests/dsh-compatibility.test.js`, `tests/reviewer.test.js`.
- Diagram, version display, planning boundary, and DSH loader contract: `tests/client.test.js`.
- Commands: `npm.cmd test`, `npm.cmd run lint:js`, `node lib/cli.js docs check --cwd .`, and `node lib/cli.js scan --all --cwd .`.

## Consequences

Developers can review product intent first, inspect formal engineering detail on demand, and continue one visible Spec-editing conversation while the repository remains the workflow authority. Direct edits invalidate approval but no longer invalidate the assistant conversation. The English lifecycle file remains the machine-parsed owner and the Chinese file is a first-class presentation counterpart.

The assistant still runs with the active DSH Agent tool surface. Prompt scoping, exact artifact context, explicit write authorization, hash-bound approval, and fail-closed scanning reduce normal workflow drift but do not form a capability sandbox. DSH preview contracts must be revalidated on upgrades, and very large feature trees may require scrolling.
