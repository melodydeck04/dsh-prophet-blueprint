# Feature: Architecture design workspace

Id: spec-governance--architecture-design
Parent: spec-governance
Status: planned

## Summary

Separates product capability placement from software component, dependency, deployment, and source-ownership design, then gives the developer a dedicated architecture workspace and grounded architecture assistant for reviewing proposed changes before implementation.

## Scope

- `lib/config.js`
- `lib/architecture.js`
- `lib/features.js`
- `lib/artifacts.js`
- `lib/workflow.js`
- `lib/scan.js`
- `lib/web-api.js`
- `lib/client.js`
- `lib/index.js`
- `lib/version.js`
- `tests/**`
- `.blueprint/architecture/**`
- `.blueprint/features/**`
- `.specs/**`
- `docs/user/features/**`
- `design-blueprint.json`
- `DESIGN.md`
- `README.md`
- `README.zh.md`
- `README.i18n.yaml`
- `package.json`

## Documents

- required: `DESIGN.md`
- required: `README.md`
- required: `docs/user/features/spec-governance--architecture-design.md`
- required: `docs/user/features/spec-governance--architecture-design.zh.md`
- required: `docs/user/features/spec-governance--architecture-design.i18n.yaml`
- required: `.specs/proposed/spec-governance--architecture-design.md`
- required: `.specs/proposed/spec-governance--architecture-design.zh.md`
- recommended: `README.zh.md`

## Acceptance

- Feature hierarchy represents product capability containment only; typed architecture relations represent component structure and runtime dependencies.
- Stable Feature and component identities do not change merely because a developer changes their parent or container.
- A dedicated architecture workspace shows the current model, a proposed before/after diff, impact, and an independent architecture assistant.
- Architecture proposals remain developer-reviewed planning artifacts and cannot approve themselves or modify implementation files.

## Notes

The architecture workspace extends the existing Blueprint plugin. A separate plugin is considered only when a component has an independently installable host-extension boundary; the initial feature does not create one.
