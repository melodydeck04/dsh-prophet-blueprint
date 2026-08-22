# Spec: One-click Blueprint initialization

Status: implemented

## Problem

When a DSH session pointed at a project without `design-blueprint.json`, the Blueprint view could only display an error instructing the user to run a CLI command. First use depended on an external developer or terminal and left the otherwise visual workflow incomplete.

## Scope

- allow: `lib/**`
- allow: `tests/**`
- allow: `.specs/**`
- allow: `.blueprint/**`
- allow: `AGENTS.md`
- allow: `DESIGN.md`
- allow: `README.md`
- allow: `README.zh.md`
- allow: `README.i18n.yaml`
- allow: `package.json`
- deny: `LICENSE`

## Decision

The Host now exposes a bounded discovery action before a Blueprint anchor exists. The current workspace is eligible when its containing Git root can be identified or it directly contains one of a small set of project markers. Discovery inspects at most 100 immediate child directories for hints but never recursively chooses one. An outer directory that merely contains projects is therefore not eligible for initialization.

The initialize action repeats discovery and accepts only its exact current candidate. It delegates to the same non-destructive `initBlueprint` function as the CLI. Initialization now creates missing `README.md` and `DESIGN.md` templates plus `.specs/implemented/blueprint-adoption.md`; the decision adopts governance only and explicitly makes no claim about product behavior. Every write remains create-if-missing.

The browser preserves API error codes. On `BLUEPRINT_PROJECT_NOT_FOUND`, it requests discovery and renders a setup state showing the current path, detected child hints, and **Initialize current project** only when the Host reports an eligible candidate. Successful initialization immediately adopts the returned dashboard.

## Alternatives considered

**Always initialize the session cwd.** Rejected because a session may point at a container holding backups, scratch data, and one or more real repositories.

**Search recursively and initialize the first Git repository.** Rejected because traversal order is not user intent and silently choosing among nested repositories creates a dangerous scope mismatch.

**Keep the CLI-only setup flow.** Rejected because setup is a core state of the visual product and can be implemented safely within its narrow write boundary.

## Verification

- AC-1: test: `tests/project-discovery.test.js`
- AC-2: test: `tests/project-discovery.test.js`; an actual outer workspace returns no candidate and one configured child-project hint
- AC-3: test: `tests/web-api.test.js`
- AC-4: test: `tests/init.test.js`; command: `node lib/cli.js scan --all`
- AC-5: test: `tests/client.test.js`; browser-loader factory smoke check
- Regression: command: `npm test` reports 16 passing tests; command: `npm run lint:js`
- Profile: the linked DSH Web profile resolves package version 0.5.1 and resolves `./client` to `lib/client.js`.

## Consequences

First-time setup for a correctly selected project is now one click and produces a structurally valid, honest governance baseline. Users who select an outer container still need to switch the DSH workspace to the real project; the setup page explains that distinction instead of offering a dangerous button. The CLI and Web flows share one non-overwriting initializer, so future scaffold changes require compatibility tests for both entry points.
