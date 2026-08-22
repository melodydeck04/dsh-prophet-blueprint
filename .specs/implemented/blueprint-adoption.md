# Spec: Adopt Blueprint governance

Status: implemented

## Problem

The project needs an explicit, inspectable development-governance baseline before later product changes are proposed.

## Scope

- allow: `design-blueprint.json`
- allow: `AGENTS.md`
- allow: `DESIGN.md`
- allow: `README.md`
- allow: `.specs/**`
- allow: `.blueprint/**`
- allow: `.dsh/skills/**`
- allow: `docs/**`

## Decision

The project adopts Design Blueprint authority documents, lifecycle-managed specifications, and a developer-owned feature catalog. This decision describes governance only and makes no claim about existing product behavior.

## Alternatives considered

**Rely on informal chat instructions.** Rejected because they do not provide durable scope ownership or reviewable project authority.

## Verification

- command: `design-blueprint scan --all`

## Consequences

Future non-trivial changes establish or update a scoped specification before implementation. Product architecture and feature boundaries remain to be documented by their owners.
