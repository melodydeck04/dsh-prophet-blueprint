# Spec: Web Blueprint dashboard

Status: implemented

## Problem

The `/blueprint` command only returned a text audit and silently treated an unrelated DSH startup directory as the project root. Users could not see the feature hierarchy, understand which documents make a feature complete, or safely edit a feature definition from DSH Web.

## Scope

- allow: `lib/**`
- allow: `tests/**`
- allow: `.blueprint/**`
- allow: `.specs/**`
- allow: `AGENTS.md`
- allow: `DESIGN.md`
- allow: `README.md`
- allow: `README.zh.md`
- allow: `README.i18n.yaml`
- allow: `design-blueprint.json`
- allow: `cordis.patch.yml`
- allow: `package.json`
- deny: `LICENSE`

## Decision

The scanner now searches upward for `design-blueprint.json` before taking any snapshot and rejects an unrelated directory without walking it. A 200,000-file working-tree ceiling is the final safeguard. The feature catalog lives under the configured `.blueprint/features` root; canonical Markdown records each feature's identity, parent, state, summary, scope, documents, acceptance notes, and notes. The catalog validates filename correspondence, unique identity, existing acyclic parents, project-relative paths, and required-document satisfaction.

The package declares the rc.7 `dsh.client` contract and ships a lazy browser-loader bundle. It contributes a session-scoped `blueprint` entry to `conversation.view`, reads the DSH session workspace, and displays project identity, audit totals, a feature tree, per-feature satisfaction, details, and create/edit forms.

The Host registers one exact JSON route. It recognizes only anchored Blueprint projects and writes only `<features.root>/<validated-id>.md`. Same-origin checks, request and feature size limits, parent/path validation, and an expected SHA-256 protect the write path from cross-origin use, traversal, excessive input, invalid hierarchy, and silent concurrent overwrite.

## Alternatives considered

**Keep `/blueprint` as the only interface.** Rejected because a flat text result cannot make the project feature structure or per-feature document ownership easy to inspect and maintain.

**Treat every directory or source file as a feature automatically.** Rejected because filesystem layout is not reliable product intent; the developer remains the authority for feature boundaries and relationships.

**Use generated Typert remotes from this out-of-tree package.** Rejected for this version because DSH's strict remote generation is owned by the composing monorepo. A fixed, narrow Host route preserves the standalone Bundle boundary without copying the generated-remotes exception.

**Expose unrestricted filesystem read/write routes.** Rejected because a visual editor must not become an arbitrary local-file mutation surface.

## Verification

- AC-1: test: `tests/project-root.test.js`
- AC-2: test: `tests/features.test.js`
- AC-3: test: `tests/client.test.js`; browser-loader factory smoke check
- AC-4: test: `tests/web-api.test.js`
- AC-5: test: `tests/plugin.test.js`; test: `tests/staged-policy.test.js`; command: `npm test`; command: `npm run lint:js`
- Package: `npm pack --dry-run --json` includes `lib/client.js`, host modules, feature examples, and both implemented specifications.
- Profile: Node resolution from the linked DSH Web profile resolves both the package root and `./client` to the 0.5.0 workspace and reads its `dsh.client` declaration.

## Consequences

Developers gain a visible, explicitly authored feature model without confusing source layout for product intent. The selected DSH session must point into a configured project; an unconfigured home-directory session now fails clearly. The Web editor deliberately owns only feature definitions, while source code, authority documents, and lifecycle specs remain edited through the normal development workflow. Because DSH is in developer preview, the browser loader and slot contract must be revalidated on DSH upgrades.
