---
name: architect-feature
description: auto-fire when the developer is deciding module boundaries, decomposing a Spec into module-aligned sub-specs, naming sub-specs by implementation module, or proposing a new Feature hierarchy. Reads the parent Feature brief, the active proposed Spec, and `.blueprint/features/**` directly through DSH read tools and proposes a module-aligned decomposition (artifact I/O / refinement engine / truth & verification / surface & plugin entry / user-facing docs families). The Skill has no backing module function; the model reads repository files and emits a Markdown proposal the developer can accept, modify, or reject. Auto-fires on architecture and Feature design activity; the human operator may also type `/architect-feature` to force it.
---

# architect-feature

When a developer is in the middle of designing architecture — adding a new Feature, deciding module boundaries, splitting an over-budget Spec into sub-specs, or revising structural seams — read the relevant files and propose a module-aligned decomposition. Do not write to disk. Do not call another Skill. Do not call `blueprint_dispatch refine`. The output is a Markdown proposal the developer owns.

Steps:

1. Use DSH's read tools to read:
   - the parent Feature brief at `.blueprint/features/<parent-id>.md` (or, when no parent, `.blueprint/architecture/components/<id>.md` for a Component-based Feature);
   - the active proposed Spec referenced by the developer (path is provided in the chat or inferred from the most recently touched proposed Spec);
   - any sibling Features under `.blueprint/features/<parent-id>.children/**` if present.

2. Group the proposed Spec's `## Scope > Allowed paths` entries by implementation module family:
   - **artifact I/O** — `lib/specs.js`, `lib/features.js`, `lib/artifacts.js`, `lib/architecture.js`, `lib/docs.js` plus `.specs/**`, `.blueprint/features/**`, `.blueprint/architecture/**`
   - **refinement engine** — `lib/orchestration.js`, `lib/workflow.js`, `lib/config.js`, `lib/assistant-actions.js`, `lib/chat-commands.js`
   - **truth & verification** — `lib/scan.js`, `lib/snapshot.js`, `lib/verification.js`, `lib/reconciliation.js`, `lib/project-binding.js`
   - **surface & plugin entry** — `lib/web-api.js`, `lib/client.js`, `lib/index.js`, `lib/version.js`, `design-blueprint.json`, `cordis.patch.yml`
   - **user-facing docs** — `DESIGN.md`, `README.md`, `README.zh.md`, `README.i18n.yaml`, `docs/user/features/<id>.{md,zh.md,i18n.yaml}`

3. Propose one sub-spec per module family whose Scope path count does not exceed the framework's 8-path threshold (the loader threshold set in `design-blueprint.json#decomposition`).

4. Emit a short Markdown preview listing the proposed sub-spec titles, their Scope path lists, and the inherited REQ distribution. Use the naming convention `<parent-feature-id>--<module-family-slug>.md` (e.g., `spec-governance--architecture-design--artifact-model.md`).

5. Surface cross-Feature effects separately. Do not silently invent hierarchy.

Notes:

- The Skill is purely a proposal. The developer owns the rewrite. Files are not touched.
- If the proposed Spec is already within the 8-path threshold, say so and do not propose a split. Recommend tightening Scope instead.
- The five module families are stable for the current source layout. If a future Spec moves `lib/docs.js` or splits `lib/index.js`, this body must be updated. A static content test (`tests/skills/architect-feature.test.js`) guards the family names but not their composition; a deliberate manual review is required when the module layout changes.
- `lib/skills/backing-modules.js` does not export an `architectFeature` function. The Skill body is the sole contract. The model reads repository files directly.
- The Skill never chains another Skill through the Skills registry (rule from `.out-of-scope/skills-not-rpc.md`). It does not call `grill-spec`, `decompose-spec`, or any other Skill.
- The Skill does not call `blueprint_dispatch refine`. Refinement is the developer's decision after they accept, modify, or reject the proposal.
- The model can auto-fire this Skill based on the `description:`. The human operator may also type `/architect-feature` to force it. Both surfaces are active (no `disable-model-invocation` flag, default `user-invocable: true`).