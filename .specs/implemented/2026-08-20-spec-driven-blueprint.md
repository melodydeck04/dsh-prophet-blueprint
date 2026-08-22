# Spec: Spec-driven blueprint lifecycle

Status: implemented

## Problem

The original plugin checked a fixed approximation of DSH package formatting but did not represent which documents hold authority, the lifecycle of a proposed decision, the files one decision may change, or the evidence that makes the work complete.

## Scope

- allow: `**`
- deny: `LICENSE`

## Decision

The package is an out-of-tree DSH Bundle with a host function plugin and a dependency-free Node CLI. `design-blueprint.json` names instruction, architecture, public-contract, and specification authorities. Markdown specifications live under `.specs/proposed`, `.specs/implemented`, or `.specs/rejected`; their path, `Status:` line, required sections, machine-readable Scope, acceptance identifiers, and verification declarations are checked together.

The default scan reads the exact Git index and requires every configured staged change to be owned by one proposed specification or by one implemented specification updated in the same change. `--all` validates the working tree without inventing a staged change set. The DSH host plugin contributes a short system-prompt section and a direct `/blueprint [all]` status command.

## Alternatives considered

**Treat README as the complete specification.** Rejected because consumer documentation, standing AI instructions, architecture, proposal rationale, and verification evidence have different owners and lifecycles.

**Use whole-file hashes as the primary correspondence mechanism.** Rejected because unrelated edits invalidate the relationship while a refreshed hash proves freshness rather than semantic correctness. Stamps remain an optional low-level signal.

**Require one DSH-monorepo layout from every project.** Rejected because this plugin is intended for out-of-tree projects with different stacks. The authority and change policy are project configuration.

## Verification

- AC-1: test: `tests/specs.test.js`
- AC-2: test: `tests/staged-policy.test.js`
- AC-3: test: `tests/plugin.test.js`
- AC-4: command: `npm run lint:js`

## Consequences

Repositories gain a small amount of explicit process metadata and must update a specification when a non-trivial staged change expands its scope. The scanner can prove lifecycle structure, declared ownership, and declared evidence; it cannot decide whether natural-language product intent is semantically correct, so review remains the authority for that judgment.
