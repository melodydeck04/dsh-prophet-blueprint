# Feature: Spec-driven development governance

Id: spec-governance
Parent: none
Status: active

## Summary

Keeps project instructions, architecture, public contracts, lifecycle specifications, and staged implementation changes in explicit correspondence.

## Scope

- `lib/config.js`
- `lib/specs.js`
- `lib/policy.js`
- `lib/scan.js`
- `.specs/**`

## Documents

- required: `AGENTS.md`
- required: `DESIGN.md`
- required: `README.md`
- required: `.specs/implemented/2026-08-20-spec-driven-blueprint.md`

## Acceptance

- A non-trivial staged change has exactly one eligible specification owner.
- Authority documents and lifecycle structure are checked from one snapshot.

## Notes

Semantic product approval remains a human responsibility; deterministic checks enforce structure and declared ownership.
