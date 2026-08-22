# Spec: Starter workspace initialization

English | [简体中文](starter-workspace-initialization.zh.md)

Status: implemented

## Problem

Blueprint first-run discovery treats only a Git root or a short list of technology files as a project. A new project directory is often empty, and developers commonly begin with only `README.md` or `.gitignore`. In those valid workspaces, **Recheck** repeats the same unexplained result and the browser offers no way for the developer to declare that the exact DSH workspace is the intended project root.

## Scope

- allow: `lib/project-discovery.js`
- allow: `lib/web-api.js`
- allow: `lib/client.js`
- allow: `lib/version.js`
- allow: `tests/project-discovery.test.js`
- allow: `tests/web-api.test.js`
- allow: `tests/client.test.js`
- allow: `README.md`
- allow: `README.zh.md`
- allow: `README.i18n.yaml`
- allow: `DESIGN.md`
- allow: `package.json`
- allow: `.specs/proposed/starter-workspace-initialization.md`
- allow: `.specs/proposed/starter-workspace-initialization.zh.md`
- allow: `.specs/proposed/starter-workspace-initialization.i18n.yaml`
- allow: `.specs/implemented/starter-workspace-initialization.md`
- allow: `.specs/implemented/starter-workspace-initialization.zh.md`
- allow: `.specs/implemented/starter-workspace-initialization.i18n.yaml`

## Decision

Automatic recognition remains deterministic: Git roots and the existing technology markers are the only strong candidates. Discovery separately exposes the exact current DSH workspace as a developer-confirmable target whenever it is a real directory below a filesystem root. This fallback is never selected by the model or inferred from arbitrary filenames.

The browser distinguishes a recognized project from an unrecognized starter workspace. For the latter it explains the recognition result, shows any direct child project hints, and offers **Confirm this directory and initialize**. The action includes an explicit confirmation bit and a browser confirmation naming the exact path. The Host rediscovers the workspace and accepts the fallback only when the requested target is still the exact current workspace; filesystem roots are ineligible.

**Recheck** displays an in-progress state and replaces the setup result with a fresh discovery response, so an unchanged result is understandable rather than appearing inert.

## Alternatives considered

**Add `README.md` and `.gitignore` to the automatic marker list.** Rejected because those files are also common in directories that aggregate several projects and do not reliably identify a root.

**Treat every current directory as an automatic candidate.** Rejected because that removes the distinction between deterministic discovery and a developer-owned root decision.

**Keep requiring Git initialization or a technology manifest.** Rejected because it makes Blueprint setup depend on unrelated project bootstrapping and blocks legitimate empty workspaces.

## Verification

- AC-1: `tests/project-discovery.test.js` covers empty and generic starter workspaces as separate confirmation-required targets.
- AC-2: `tests/project-discovery.test.js` covers filesystem-root refusal and preservation of direct child hints.
- AC-3: `tests/web-api.test.js` covers the explicit confirmation bit, exact current path, and rejection of unconfirmed or different paths.
- AC-4: `tests/client.test.js` checks the confirmation payload, confirmation action, and visible recheck state in the browser bundle.
- AC-5: `npm.cmd test` reports 50 passing tests; `npm.cmd run lint:js` passes; `node lib/cli.js scan --all` passes after bilingual README confirmation.

## Consequences

Empty and early-stage workspaces no longer require unrelated Git or technology bootstrapping before Blueprint setup. The developer can explicitly choose a directory that contains unrelated content, so the product names the exact path, retains direct-child warnings, requires a separate confirmation bit, denies filesystem roots, rediscovers immediately before writes, and preserves the initializer's create-if-missing behavior.
