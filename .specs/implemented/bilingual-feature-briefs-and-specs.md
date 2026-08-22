# Spec: Bilingual feature briefs and development specifications

Status: implemented

## Problem

Blueprint currently exposes the raw lifecycle specification as the first and only feature document. Historical specifications use different languages and sometimes mix Chinese product explanations with English machine-oriented headings. A developer therefore sees too much implementation detail before understanding the feature outcome, while the repository has no deterministic relationship between a concise product brief and the formal development specification.

The lifecycle loader also treats every Markdown file below `.specs` as an independent specification. A normal `.zh.md` counterpart would be misclassified as a second proposal, and the current approval hash would not become stale when only the translated counterpart changed.

## Scope

- allow: `AGENTS.md`
- allow: `lib/client.js`
- allow: `lib/index.js`
- allow: `lib/specs.js`
- allow: `lib/workflow.js`
- allow: `lib/web-api.js`
- allow: `lib/version.js`
- allow: `tests/**`
- allow: `package.json`
- allow: `DESIGN.md`
- allow: `README.md`
- allow: `README.zh.md`
- allow: `README.i18n.yaml`
- allow: `docs/user/features/**`
- allow: `.blueprint/features/web-dashboard.md`
- allow: `.specs/**`

## Decision

Define two ordered artifacts for every newly planned feature.

The first artifact is a README-like product brief at `docs/user/features/<feature-id>.md` with a Simplified Chinese counterpart at `docs/user/features/<feature-id>.zh.md` and the existing `.i18n.yaml` review record. Both files use the same four-section structure: what the feature does, the visible result, how to use it, and important usage notes. The Blueprint UI defaults to the Chinese brief and offers an explicit English switch.

The second artifact is the formal lifecycle specification. The English machine-parsed owner remains `.specs/<lifecycle>/<name>.md`; its Chinese counterpart is `.specs/<lifecycle>/<name>.zh.md`. The lifecycle loader ignores `.zh.md` as a second specification but attaches it to its owner. A specification review hash covers both exact files, so changing either language invalidates direct-developer approval. Existing unpaired historical specifications remain readable during migration.

The Optimize Spec workspace places Product brief before Development Spec and defaults to Chinese. It shows the language-specific path and a clear missing-counterpart state. The planning prompt creates the product brief pair before the proposed Spec pair and does not implement code. The independent assistant receives both language files and may update the current brief and proposed Spec pairs after explicit write authorization; it must keep each file single-language.

The plugin version becomes `0.12.0`.

## Alternatives considered

**Keep one bilingual specification file.** Rejected because product intent and engineering authority remain interleaved and the reading order stays noisy.

**Store only a Chinese specification.** Rejected because repositories may require English engineering authority and because the user explicitly requires separate corresponding language files.

**Treat both language files as independent lifecycle specifications.** Rejected because feature workflow selection and approval would become ambiguous.

## Verification

- AC-BILINGUAL-1: `tests/specs.test.js` verifies that `.zh.md` is attached and not parsed independently.
- AC-BILINGUAL-2: `tests/workflow.test.js` and `tests/web-api.test.js` verify the combined review hash and Chinese-only invalidation.
- AC-BILINGUAL-3: `tests/spec-workspace.test.js` and `tests/client.test.js` verify the brief-first planning boundary.
- AC-BILINGUAL-4: `tests/spec-workspace.test.js` verifies default Chinese Product brief and all document/language switches.
- AC-BILINGUAL-5: `tests/reviewer.test.js` verifies four-artifact context, single-language rules, and refresh behavior.
- AC-BILINGUAL-6: `tests/specs.test.js` and `tests/spec-workspace.test.js` verify migration loading and explicit missing-language states.
- AC-BILINGUAL-7: `tests/client.test.js` verifies version `0.12.0`; `node lib/cli.js docs check --cwd .` reports all 4 bilingual pairs confirmed.
- `npm.cmd test` passes 38 of 38 tests.
- `npm.cmd run lint:js` passes every declared JavaScript syntax check.
- `node lib/cli.js scan --all --cwd .` reports 0 required and 0 recommended issues before lifecycle archival.

## Consequences

Developers now read a concise Chinese Product brief before opening engineering detail, while each English and Chinese artifact remains a real independent file. The English lifecycle file remains the machine-parsed structural owner, and approval binds the combined bilingual review hash. Existing single-file specifications remain compatible but cannot gain a Chinese view until a counterpart is authored. Moving a Spec between lifecycle directories must move its `.zh.md` counterpart in the same change.
