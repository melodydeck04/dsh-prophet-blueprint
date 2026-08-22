# Spec: DSH-aligned document governance and translation

Status: implemented

## Problem

Blueprint initialization previously named a few authority files but did not establish a document-tier standard, project-local documentation skills, or a deterministic bilingual pairing gate. Its repository-level `README.i18n.yaml` also described ordinary SHA-1 values instead of the full Git blob hashes used by DSH, so that mechanism was not compatible with DSH's documentation workflow.

## Scope

- allow: `lib/init.js`
- allow: `lib/config.js`
- allow: `lib/docs.js`
- allow: `lib/scan.js`
- allow: `lib/cli.js`
- allow: `lib/index.js`
- allow: `lib/client.js`
- allow: `lib/web-api.js`
- allow: `tests/**`
- allow: `package.json`
- allow: `design-blueprint.json`
- allow: `AGENTS.md`
- allow: `DESIGN.md`
- allow: `README.md`
- allow: `README.zh.md`
- allow: `README.i18n.yaml`
- allow: `docs/**`
- allow: `.dsh/skills/**`
- allow: `.specs/**`

## Decision

Initialization creates a portable documentation-governance baseline without overwriting project prose. The baseline defines one owner for each durable fact, a bilingual pairing contract and terminology source, and two project-local DSH skills: one for document placement and one explicitly invoked extended translation workflow.

The configuration declares documentation roles and bilingual scope. The deterministic `design-blueprint docs` command lists, checks, and explicitly confirms pairs. Confirmation records full Git blob hashes and stores recoverable objects when Git is available. Checks reject incomplete established triplets, stale records, missing language switchers, and incompatible Markdown structure. Semantic equivalence remains a human or capable-AI review responsibility and cannot be certified by the mechanical gate.

Projects initialized around an existing unpaired README retain that file unchanged. The missing counterpart is reported as a recommended migration item until the pair is explicitly confirmed; confirmed or partially created triplets are required checks so established bilingual contracts fail closed.

## Alternatives considered

**Copy every DSH repository script and directory.** Rejected because many DSH document tiers and generated-reference gates are specific to the DeepSeek Harness monorepo and would create false requirements in unrelated projects.

**Put translation instructions only in `AGENTS.md`.** Rejected because prose alone cannot detect missing counterparts, stale confirmations, or structural drift.

**Generate translations during deterministic initialization.** Rejected because initialization has no reviewed semantic source and must not invent or overwrite a public contract.

## Verification

- AC-1: test: `tests/init.test.js` proves initialization creates document standards, translation policy, terminology, and project-local DSH skills without overwriting existing prose.
- AC-2: test: `tests/docs.test.js` proves the configuration exposes portable document roles and bilingual scope.
- AC-3: test: `tests/docs.test.js` proves Git blob identities and complete, missing, stale, switcher-invalid, and structurally incompatible pair states.
- AC-4: test: `tests/docs.test.js` proves explicit confirmation refuses structural drift and records synchronized edits.
- AC-5: test: `tests/docs.test.js` and `tests/web-api.test.js` cover normal scan and dashboard integration.
- AC-6: review: `README.md`, `README.zh.md`, and `DESIGN.md` describe roles, lightweight editing, explicit extended translation, and the semantic-review boundary.
- command: `npm test`
- command: `npm run lint:js`
- command: `node lib/cli.js docs check --cwd .`
- command: `node lib/cli.js scan --all --cwd .`
- command: `npm pack --dry-run`

## Consequences

Every newly initialized project receives the documentation rules, project-local DSH Skills, and deterministic gate needed to keep AI document work within declared roles. Older projects can rerun initialization to add the documentation configuration and missing managed templates without replacing existing public prose.

Markdown structure comparison proves only mechanically observable parity, not translation quality. A reviewer must still establish semantic equivalence before running pair confirmation. The portable Blueprint subset intentionally omits DSH-monorepo-specific generated-reference, type-equivalence, document-budget, and merge-driver policies unless a project chooses to add equivalents.
