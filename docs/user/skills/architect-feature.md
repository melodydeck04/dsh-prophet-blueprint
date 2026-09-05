# `architect-feature`

English | [中文](architect-feature.zh.md)

Auto-fire on architecture and Feature design activity. Proposes a module-aligned decomposition of an over-budget Spec. Read-only.

## What it does

When the developer is in the middle of designing architecture — adding a new Feature, deciding module boundaries, splitting an over-budget Spec into sub-specs, or revising structural seams — the Skill reads the parent Feature brief, the active proposed Spec, and `.blueprint/features/**` directly through DSH read tools and proposes one sub-spec per implementation module family:

- **artifact I/O** — `lib/specs.js`, `lib/features.js`, `lib/artifacts.js`, `lib/architecture.js`, `lib/docs.js` plus `.specs/**`, `.blueprint/features/**`, `.blueprint/architecture/**`
- **refinement engine** — `lib/orchestration.js`, `lib/workflow.js`, `lib/config.js`, `lib/assistant-actions.js`, `lib/chat-commands.js`
- **truth & verification** — `lib/scan.js`, `lib/snapshot.js`, `lib/verification.js`, `lib/reconciliation.js`, `lib/project-binding.js`
- **surface & plugin entry** — `lib/web-api.js`, `lib/client.js`, `lib/index.js`, `lib/version.js`, `design-blueprint.json`, `cordis.patch.yml`
- **user-facing docs** — `DESIGN.md`, `README.md`, `README.zh.md`, `README.i18n.yaml`, `docs/user/features/<id>.{md,zh.md,i18n.yaml}`

The output is a Markdown preview listing the proposed sub-spec titles, their Scope path lists, and the inherited REQ distribution. The Skill writes nothing to disk. The developer accepts, modifies, or rejects.

## When to reach for it

- The developer pastes an over-budget Spec (Scope > 8 paths) and asks "how should I split this?".
- The developer is deciding module boundaries, decomposing a Spec, or naming sub-specs by implementation module.
- The developer is proposing a new Feature hierarchy and wants a structural sketch.
- The developer types `/architect-feature` to force a structural review.

The model auto-fires the Skill based on the `description:`. The human operator may also type `/architect-feature` to force it. Both surfaces are active.

## Common questions

**Is this Skill model-invocable?** Yes. The Skill carries no `disable-model-invocation` flag, so the runtime catalog exposes it to the model. The DSH agent fires it on its own when the developer's task fits a structural design moment.

**Does the Skill write to the repo?** No. The Skill emits a Markdown proposal. The developer owns the file moves.

**Does the Skill call `blueprint_dispatch refine`?** No. Refinement is the developer's decision after they accept, modify, or reject the proposal.

**Does the Skill chain another Skill?** No. It does not call `grill-spec`, `decompose-spec`, or any other Skill. It reads files directly through DSH read tools.

**Is there a backing module function?** No. The Skill body is the sole contract. There is no `lib/skills/backing-modules.js#architectFeature` export. The model reads repository files and reasons about them inside the Skill body.

**What if the proposed Spec is already within the 8-path threshold?** The Skill says so and recommends tightening Scope instead of splitting. It does not invent a split where none is needed.

## It's working if

- The Skill fires automatically when the developer mentions module boundaries, decomposing, or "should I plan this first?" without the developer typing `/architect-feature`.
- The Skill appears in the catalog with `modelInvocable: true` and `userInvocable: true`.
- The output Markdown preview lists one sub-spec per module family whose Scope path count does not exceed 8.
- The preview's sub-spec titles follow the naming convention `<parent-feature-id>--<module-family-slug>.md`.
- The preview surfaces cross-Feature effects separately rather than silently inventing hierarchy.
- No file is written by the Skill. The developer decides what to author and where to call `blueprint_dispatch refine`.

## Reference

- Source: `skills/architect-feature/SKILL.md`
- Backing module: none (Skill body is the contract)
- Audit: `design-blueprint skills info architect-feature`
- Feature brief: `docs/user/features/agent-interface--skills-layer.md`