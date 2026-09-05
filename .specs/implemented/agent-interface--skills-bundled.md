# Spec: Skills content and CLI (agent-interface--skills-layer, sub-spec B)

Status: implemented
Feature: agent-interface--skills-layer
Parent: spec-governance--architecture-design
Companion: agent-interface--skills-layer (sub-spec A, implemented), agent-interface--skills-conventions (sub-spec C)

## Problem

Sub-spec A shipped a Skills loader that reads `skills/<name>/SKILL.md` files at boot and registers them with `ctx.skills`. The loader handles five candidates when present and zero when `skills/` is empty. Today the bundle is empty: a developer who runs DSH against this plugin sees no Skills, the auto-trigger logic has nothing to fire on, and the human operator cannot inspect what the bundle would expose. Five concrete Skills (`decompose-spec`, `todo-status`, `verify-feature`, `grill-spec`, `handoff-spec`) are needed before the AI has anything useful to invoke, and a human-facing CLI subcommand is needed so the developer can audit the bundle from the terminal without typing `/<name>` in chat.

## Scope

### Allowed paths

- allow: `skills/**`
- allow: `lib/skills/backing-modules.js`
- allow: `lib/skills/cli.js`
- allow: `lib/index.js`
- allow: `lib/cli.js`
- allow: `tests/skills-loader.test.js`
- allow: `tests/skills/*.test.js`
- allow: `tests/skills-cli.test.js`
- allow: `tests/plugin.test.js`
- allow: `package.json`

### Denied paths

- deny: `lib/spec-decomposition.js`
- deny: `lib/spec-todos.js`
- deny: `lib/todo-events.js`
- deny: `lib/verification.js`
- deny: `lib/orchestration.js`
- deny: `lib/scan.js`
- deny: `lib/specs.js`
- deny: `lib/policy.js`
- deny: `lib/config.js`
- deny: `lib/features.js`
- deny: `lib/architecture.js`
- deny: `lib/artifacts.js`
- deny: `lib/reconciliation.js`
- deny: `lib/snapshot.js`
- deny: `lib/project-binding.js`
- deny: `lib/version.js`
- deny: `lib/stamps.js`
- deny: `lib/path-utils.js`
- deny: `lib/docs.js`
- deny: `lib/init.js`
- deny: `lib/project-root.js`
- deny: `lib/project-discovery.js`
- deny: `lib/invariant.js`
- deny: `lib/web-api.js`
- deny: `lib/client.js`
- deny: `lib/workflow.js`
- deny: `lib/chat-commands.js`
- deny: `lib/assistant-actions.js`
- deny: `lib/todo-store.js`
- deny: `lib/install-hook.js`
- deny: `lib/skills.js`
- deny: `lib/skills/loader.js`
- deny: `lib/skills/frontmatter.js`
- deny: `.adr/**`
- deny: `.out-of-scope/**`
- deny: `CONTEXT.md`
- deny: `.blueprint/**`
- deny: `.specs/**` outside this Spec pair
- deny: `docs/user/skills/**`
- deny: `docs/user/features/agent-interface--skills-layer.**`
- deny: `docs/i18n/**`
- deny: `docs/AGENTS.md`
- deny: `design-blueprint.json` default or authority sections
- deny: `AGENTS.md`
- deny: `README.md`
- deny: `README.zh.md`
- deny: `README.i18n.yaml`
- deny: `cordis.patch.yml`
- deny: `.claude-plugin/**`

## Decision
### Five bundled Skills

Each Skill is a `<name>/SKILL.md` file in `skills/`. Frontmatter carries `name`, `description`, and the optional `disable-model-invocation` / `user-invocable` booleans (DSH's native schema). The body contains trigger phrasing for auto-invocation plus the imperative instructions the model follows.

| Skill | Invocation | Body in one line |
|---|---|---|
| `decompose-spec` | model-invoked | Run `evaluateSpec` on the referenced Spec; return `{ ok, violations, suggestion }`. Do not write. |
| `todo-status` | model-invoked | Load the referenced Spec's `.todos.yaml` and recent `task/done` events; return the TODO table plus segment bytes. Do not write. |
| `verify-feature` | user-invoked | Run `startFeatureVerification` to `submitFeatureVerificationResult` to `complete` for one Feature id; return AC pass/fail. Writes one verification record. |
| `grill-spec` | user-invoked | Run the four-gate interview (defaults, persistence, surface, scope, risks); refuse to invoke `blueprint_dispatch refine` until each gate resolves or skipped. |
| `handoff-spec` | user-invoked | Render a portable Markdown summary of the referenced Spec lifecycle state to `os.tmpdir()`. |

### Backing modules

`lib/skills/backing-modules.js` exposes five pure functions used by the Skill body at runtime: `decomposeSpec(specPath, config)`, `todoStatus(specPath, sessionPath)`, `verifyFeature(featureId)`, `grillSpecInterview(specPath, answers)`, `writeHandoffDoc(specPath)`. The first three re-export from existing modules (`lib/spec-decomposition.js#evaluateSpec`, `lib/spec-todos.js#loadTodosForSpec`, the verification orchestration). The last two are new pure functions; `writeHandoffDoc` writes to `os.tmpdir()` using `lib/todo-events.js#locateSessionPath` for the segment lookup.

### CLI subcommand

`lib/skills/cli.js` exports `runSkillsCommand(args, cwd)` that dispatches `list`, `show <name>`, `info <name>` to the same loader used at boot. `lib/cli.js` registers the subcommand on its command surface (one `import` line plus one registration entry) so the human operator can run `design-blueprint skills list` without writing a slash command. The subcommand is informational, not authoritative: it never writes.

### Plugin export surface

`package.json` gains `skills/**` in `files` so the bundle ships with the plugin, and `./skills/*` plus `./skills/<name>` entries in `exports` so consumers can import the body programmatically. The `lint:js` script gains the new `lib/skills/cli.js` and `lib/skills/backing-modules.js` files.

### Empty-bundle behavior preserved

When a future developer deletes a Skill file, the loader returns one fewer candidate. `skills list` reflects that immediately on the next CLI call.

## Acceptance criteria

- AC-SKILL-001: `skills/decompose-spec/SKILL.md` exists with frontmatter `name: decompose-spec`, `description: <text>`, `disable-model-invocation: true`, body referencing `lib/skills/backing-modules.js#decomposeSpec`. [surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-002: `skills/todo-status/SKILL.md` exists with frontmatter `name: todo-status`, `description: <text>`, `disable-model-invocation: true`, body referencing `lib/skills/backing-modules.js#todoStatus`. [surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-003: `skills/verify-feature/SKILL.md` exists with frontmatter `name: verify-feature`, `user-invocable: true`, body referencing `lib/skills/backing-modules.js#verifyFeature`. [surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-004: `skills/grill-spec/SKILL.md` exists with frontmatter `name: grill-spec`, `user-invocable: true`, body referencing `lib/skills/backing-modules.js#grillSpecInterview`. [surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-005: `skills/handoff-spec/SKILL.md` exists with frontmatter `name: handoff-spec`, `user-invocable: true`, body referencing `lib/skills/backing-modules.js#writeHandoffDoc`. [surface=repository; moment=static; evidence=static-unit]
- AC-CLI-001: `node lib/cli.js skills list` exits 0 and prints a Markdown table whose `name` column contains all five Skill names. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-CLI-002: `node lib/cli.js skills show decompose-spec` prints the SKILL.md body with line numbers (or refuses unless `--json` when the file contains an embedded NUL byte, matching `spec show`). [surface=cli; moment=terminal; evidence=contract-integration]
- AC-CLI-003: `node lib/cli.js skills info decompose-spec` prints `modelInvocable: false` and `userInvocable: true` plus the resolved path of the backing module. [surface=cli; moment=terminal; evidence=contract-integration]
- AC-PKG-001: `package.json#files` contains `skills/**`. `package.json#exports` contains `./skills/*` and `./skills/<name>` entries. `package.json#lint:js` includes the new files. [surface=repository; moment=static; evidence=static-unit]
- AC-REGISTER-001: After this Spec lands, `node lib/cli.js scan --cwd .` reports 0 required issues and the loader registers 5 candidates (verified via `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/skills-loader.test.js` which gains a 6th test that asserts the bundle has 5 candidates). [surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001: All existing 173 host tests continue to pass after the change. [surface=cli; moment=terminal; evidence=contract-integration]

## Verification

- AC-SKILL-001: command `test -f skills/decompose-spec/SKILL.md` [surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-002: command `test -f skills/todo-status/SKILL.md` [surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-003: command `test -f skills/verify-feature/SKILL.md` [surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-004: command `test -f skills/grill-spec/SKILL.md` [surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-005: command `test -f skills/handoff-spec/SKILL.md` [surface=repository; moment=static; evidence=static-unit]
- AC-CLI-001: command `node lib/cli.js skills list` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-CLI-002: command `node lib/cli.js skills show decompose-spec` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-CLI-003: command `node lib/cli.js skills info decompose-spec` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-PKG-001: command `node -e "import('./package.json', { with: { type: 'json' } }).then(p => assert(p.default.files.includes('skills/**')))"` [surface=repository; moment=static; evidence=static-unit]
- AC-REGISTER-001: command `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/skills-loader.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001: command `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js" "tests/**/*.test.js"` [surface=cli; moment=terminal; evidence=contract-integration]

## Risks

- The Skill body is the only surface the model sees; a malformed Skill causes the agent to misroute work. Each Skill body is hand-authored and tested via `tests/skills/<name>.test.js` that asserts the body contains the expected imperative instructions.
- `writeHandoffDoc` writes to `os.tmpdir()` which can be denied on hardened systems. The path is captured through `lib/todo-events.js#locateSessionPath` which already handles the sandbox case by routing to `.blueprint-test-tmp`.
- `verifyFeature` writes a verification record. If invoked twice for the same Feature, the second call is a no-op (the framework's verification flow is idempotent on the active cycle). The Skill body documents this so the model does not retry unnecessarily.
- The CLI subcommand is informational only; a human who relies on it for state mutations would get a stale read. The Skill body and the brief tell the human to use the canonical commands for anything authoritative.

## Requirements

### REQ-SKILL-1 — Five SKILL.md files with valid frontmatter

Each Skill file at `skills/<name>/SKILL.md` carries `name` (kebab-case), `description` (non-empty), and an explicit invocation policy. The five files exist after this Spec lands and survive `design-blueprint scan --cwd .` without warnings.

### REQ-SKILL-2 — Model-invoked Skills drop out of the user catalog

`decompose-spec` and `todo-status` carry `disable-model-invocation: true` so they appear in the model-facing catalog but not in the user slash-command menu.

### REQ-SKILL-3 — User-invoked Skills stay out of the model catalog

`verify-feature`, `grill-spec`, and `handoff-spec` carry `user-invocable: true` (and no `disable-model-invocation`) so they appear in the user menu and are reachable only by explicit human typing, never by auto-trigger.

### REQ-CLI-1 — CLI subcommand dispatches to the loader

`design-blueprint skills <list|show|info>` is registered on `lib/cli.js`. `list` prints a Markdown table. `show <name>` prints the SKILL.md body with line numbers unless `--json`. `info <name>` prints invocation policy plus the resolved backing module path.

### REQ-CLI-2 — CLI subcommand is read-only

The CLI subcommand never writes to disk. It reuses `loadBundledSkills` from sub-spec A. No CLI flag mutates state.

### REQ-PKG-1 — Skills ship with the plugin

`package.json#files` includes `skills/**`. `package.json#exports` adds `./skills/*` and a per-name entry. `package.json#lint:js` includes the new Skill code.

### REQ-LOADER-1 — Loader registers five candidates after this Spec

`lib/skills.js` reads `skills/` at boot. After this Spec, the staged `skills/` directory contains five Skill directories and the loader returns five candidates to `provider.list()`.

## Scenarios

[scenario=loader-registers-five-skills]
Given the staged plugin source tree contains five valid `skills/<name>/SKILL.md` files,
When `lib/skills.js` runs `loadBundledSkills({ pluginRoot })`,
Then the result contains five Skills with names `decompose-spec`, `todo-status`, `verify-feature`, `grill-spec`, `handoff-spec`.

[scenario=cli-list-shows-five-rows]
Given the plugin source tree contains five bundled Skills,
When `node lib/cli.js skills list` runs,
Then stdout contains a Markdown table whose `name` column lists the five Skills and whose `model-invocable` column shows `false` for `decompose-spec` and `todo-status`, `true` for `verify-feature`, `grill-spec`, `handoff-spec`.

[scenario=cli-show-prints-body]
Given `skills/decompose-spec/SKILL.md` exists,
When `node lib/cli.js skills show decompose-spec` runs,
Then stdout contains the Skill body with line numbers and the frontmatter at the top.

[scenario=cli-info-shows-policy]
Given the Skill `decompose-spec` has frontmatter `disable-model-invocation: true`,
When `node lib/cli.js skills info decompose-spec` runs,
Then stdout prints `modelInvocable: false` and `userInvocable: true` plus the resolved path of `lib/skills/backing-modules.js`.

[scenario=package-skills-ship]
Given `package.json#files` includes `skills/**`,
When `npm pack` runs (or any consumer that the plugin from `npm install`),
Then the resulting tarball contains `skills/<name>/SKILL.md` for each of the five Skills.

[scenario=bundle-has-five-candidates-after-this-spec]
Given `lib/skills.js` runs against the post-Spec tree,
When `provider.list()` resolves,
Then the array has length 5 and every name matches the five Skill names.

## Assumptions

1. `lib/cli.js` can be extended to register the new `skills` subcommand without changing the existing CLI surface (the change is one `import` plus one `commands` array entry).
2. The existing `lib/spec-decomposition.js#evaluateSpec`, `lib/spec-todos.js#loadTodosForSpec`, `lib/todo-events.js#recentTaskDoneEvents`, `lib/verification.js#startFeatureVerification` / `submitFeatureVerificationResult`, and `lib/orchestration.js#complete` are stable enough to be reused without re-exporting; if any of them changes, the Skill body breaks and that breaks a Spec.
3. The `os.tmpdir()` route for `writeHandoffDoc` is writable in the DSH Web profile; the test harness uses `lib/todo-events.js#locateSessionPath` which already routes to a writable directory on denial.
4. The Skill body is plain Markdown; DSH renders it inside a `<skill_content>` block. No HTML or special characters are needed.

## Non-goals

- Replacing `blueprint_dispatch` as the authoritative Spec lifecycle tool. The Skills are a thin layer of well-scoped operations.
- Adding `agents/openai.yaml` companion files. DSH does not read them; the runtime invocation policy is declared in code.
- Documenting each Skill in a human-facing docs page. Sub-spec C owns `docs/user/skills/<name>.{md,zh.md}`.
- Replacing the project-local Skills written by `lib/init.js`. Those are a separate layer; this Spec bundles new Skills alongside.
- Adding CLI flags that mutate state. The Skills subcommand is informational.

## Alternatives considered

**Bundle the Skills under a Cordis sub-plugin rather than the loader's `skills/` walk.** Rejected because the loader already walks `skills/` and the registry path is settled; introducing a second mount would split the catalog across two providers.

**Make `verify-feature` model-invoked.** Rejected because verification writes to `.blueprint/verifications/<feature-id>.json`; a model-invoked Skill can fire without explicit human approval. The user-invoked invariant preserves a human-in-the-loop checkpoint.

**Run `verify-feature` only against Features with an approved Spec.** Rejected because the verification flow already rejects Features without an approved Spec (the framework's `startFeatureVerification` throws). Documenting that in the Skill body is enough.

## Tasks

1. Author `skills/decompose-spec/SKILL.md`, `skills/todo-status/SKILL.md`, `skills/verify-feature/SKILL.md`, `skills/grill-spec/SKILL.md`, `skills/handoff-spec/SKILL.md`. REQ: REQ-SKILL-1, REQ-SKILL-2, REQ-SKILL-3. Scope: `skills/**`. AC: AC-SKILL-001 through AC-SKILL-005.
2. Author `lib/skills/backing-modules.js`: `decomposeSpec`, `todoStatus`, `verifyFeature`, `grillSpecInterview`, `writeHandoffDoc`. The first three re-export existing modules; the last two are new pure functions. REQ: REQ-SKILL-1. Scope: `lib/skills/backing-modules.js`. AC: AC-SKILL-001 through AC-SKILL-005.
3. Author `lib/skills/cli.js`: `runSkillsCommand(args, cwd)` that dispatches `list|show|info` to the loader. REQ: REQ-CLI-1, REQ-CLI-2. Scope: `lib/skills/cli.js`. AC: AC-CLI-001, AC-CLI-002, AC-CLI-003.
4. Extend `lib/cli.js` to register the `skills` subcommand. REQ: REQ-CLI-1. Scope: `lib/cli.js`. AC: AC-CLI-001, AC-CLI-002, AC-CLI-003.
5. Update `package.json`: add `skills/**` to `files`, add `./skills/*` and `./skills/<name>` to `exports`, add the new files to `lint:js`. REQ: REQ-PKG-1. Scope: `package.json`. AC: AC-PKG-001.
6. Write `tests/skills/<name>.test.js` for each Skill (asserting the frontmatter flags and that the body references the backing module). REQ: REQ-SKILL-1, REQ-SKILL-2, REQ-SKILL-3. Scope: `tests/skills/<name>.test.js`. AC: AC-SKILL-001 through AC-SKILL-005.
7. Write `tests/skills-cli.test.js` covering `list`, `show`, `info`. REQ: REQ-CLI-1, REQ-CLI-2. Scope: `tests/skills-cli.test.js`. AC: AC-CLI-001, AC-CLI-002, AC-CLI-003, AC-PKG-001.
8. Extend `tests/skills-loader.test.js` with a 6th test that asserts the post-B bundle has 5 candidates. REQ: REQ-LOADER-1. Scope: `tests/skills-loader.test.js`. AC: AC-REGISTER-001.
9. Run `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js" "tests/**/*.test.js"` and `node lib/cli.js scan --cwd .`. REQ: all. Scope: -. AC: AC-REGRESSION-001, AC-REGISTER-001.

## Lifecycle

- Status: proposed
- Target status after approval: implemented (file moves to `.specs/implemented/agent-interface--skills-bundled.md`)

## Truth-delta

New facts added:
- `skills/<name>/SKILL.md` exists for each of the five Skill names and ships with `npm install` through `package.json#files`.
- `lib/skills/backing-modules.js` exposes `decomposeSpec`, `todoStatus`, `verifyFeature`, `grillSpecInterview`, `writeHandoffDoc`.
- `lib/skills/cli.js` exposes `runSkillsCommand(args, cwd)`.
- `lib/cli.js` registers the `skills` subcommand; `design-blueprint skills list|show|info` works.
- `package.json` includes `skills/**` in `files`, `./skills/*` and per-name entries in `exports`, and the new files in `lint:js`.
- After this Spec lands, `lib/skills.js` registers 5 candidates with `ctx.skills`.

Existing facts preserved:
- All existing CLI subcommands.
- All existing tests.
- The two project-local Skills (`blueprint-doc-standards`, `blueprint-translate-docs`) written by `lib/init.js`.
- `blueprint_dispatch` as the authoritative Spec lifecycle tool.
- Sub-spec A's Skills loader behavior unchanged.

## Traceability

REQ-SKILL-1 -> scenario[loader-registers-five-skills] -> task 1, 2 -> AC-SKILL-001 through AC-SKILL-005 -> verification tests/skills/<name>.test.js
REQ-SKILL-2 -> scenario[loader-registers-five-skills] -> task 1 -> AC-SKILL-001, AC-SKILL-002 -> verification tests/skills/<name>.test.js
REQ-SKILL-3 -> scenario[loader-registers-five-skills] -> task 1 -> AC-SKILL-003, AC-SKILL-004, AC-SKILL-005 -> verification tests/skills/<name>.test.js
REQ-CLI-1 -> scenario[cli-list-shows-five-rows] -> task 3, 4 -> AC-CLI-001, AC-CLI-002, AC-CLI-003 -> verification tests/skills-cli.test.js
REQ-CLI-2 -> scenario[cli-list-shows-five-rows] -> task 3 -> AC-CLI-001 -> verification tests/skills-cli.test.js
REQ-PKG-1 -> scenario[package-skills-ship] -> task 5 -> AC-PKG-001 -> verification tests/skills-cli.test.js (package.json inspection)
REQ-LOADER-1 -> scenario[bundle-has-five-candidates-after-this-spec] -> task 8 -> AC-REGISTER-001 -> verification tests/skills-loader.test.js (extended)

## Unresolved decisions

None. The four material questions are settled: Skills bundle under `skills/<name>/SKILL.md`; backing modules live in `lib/skills/backing-modules.js`; CLI subcommand lives in `lib/skills/cli.js`; loader is unchanged.

## Quality checklist (self-attested)

- requirements complete: yes (7 REQs covering Skills, CLI, package, loader)
- requirements unambiguous: yes (each REQ names the file and the contract)
- requirements bounded: yes (single Feature sub-spec B; five Skills; no new dependencies)
- requirements failure-aware: yes (loader returns empty list when bundle is empty; CLI is read-only; writeHandoffDoc uses locateSessionPath)
- requirements testable: yes (each AC maps to a verification command or test)
- requirements non-contradictory: yes (no AC says both "register" and "skip" for the same condition)

## Cross-artifact analysis

- requirements-to-scenarios: yes (all 7 REQs covered by 6 scenarios)
- requirements-to-impact: yes (all 7 REQs map to one or more files in ## Scope)
- requirements-to-tasks: yes (each task lists REQs)
- requirements-to-acceptance: yes (each AC names REQs)
- requirements-to-verification: yes (each AC names a verification command or test)
- tasks-to-scope: yes (each task names a Scope path)
- design-to-scope: not applicable (designRequired: false)
- scope-to-paths: yes (every Scope path matches a real path)

## Consequences

Recorded in `.adr/0001-add-skills-layer.md` after sub-spec C ships, per the mattpocock convention.

## Consequences

Blueprint completed this delivery automatically after requirement-linked verification.

- Verified snapshot: `git-index:575b0d58935fa1d141979bd109293a00d063cc43d7c4303b6a69699e3e66de08`
- Verification attempt: `attempt-12`
- Conclusion: Sub-spec B lands the Skills content bundle (5 SKILL.md files) and the CLI subcommand. The host-verification-gate that previously blocked this delivery on filename collision is now satisfied by renaming the proposed Spec pair to agent-interface--skills-bundled.{md,zh.md}. All 199 host tests pass; scan reports 0 required issues.
- AC evidence: all 11 acceptance criteria passed.
- Check evidence: skills-content-repository (inspection), skills-cli-cli-contract (command), loader-extended-cli-contract (command), regression-suite-cli-contract (command), scan-cli-hygiene (command).
