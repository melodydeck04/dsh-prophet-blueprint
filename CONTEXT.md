# CONTEXT

Domain glossary for `@dsh-plugins/design-blueprint`. This file lists the plugin's own vocabulary. Bilingual translation terms live in `docs/i18n/terminology.md`; this file does not redefine them.

| Term | Definition | Owner |
| --- | --- | --- |
| Acceptance criterion | One observable condition a Feature must satisfy; carries a stable `AC-*` id and a verification command. | `docs/AGENTS.md`, `.specs/**/*.md` |
| ADR | Architectural Decision Record; a short file at `.adr/<NNNN>-<slug>.md` recording one decision's Context, Decision, and Consequences. | `.adr/0001-add-skills-layer.md` (first instance in this repository) |
| Backing module | One pure function in `lib/skills/backing-modules.js` that a Skill body names and the runtime calls at invocation time. | `lib/skills/backing-modules.js` |
| BUNDLED_SKILL_RANK | The rank value (250) this plugin uses when registering Skills via `ctx.skills.registerProvider(...)`; project-local Skills at rank 100/200 lose name conflicts. | `@deepseek-ai/dsh-skill` |
| Component | One named deployment unit owned by this plugin, listed in `.blueprint/architecture/components/` with required documents and supported Features. | `.blueprint/architecture/components/agent-interface-skills-layer.md` |
| evidence level | One of `static-unit`, `contract-integration`, `live-runtime`, `user-visible`, `completion-hygiene`; ranks how deep a verification result goes. | `.specs/**/*.md` |
| Feature | One named unit of work linked to one or more Specs; tracked at `.blueprint/features/<feature-id>.md`. | `.blueprint/features/agent-interface--skills-layer.md` |
| Skill | A harness-neutral `SKILL.md` file bundled at `skills/<name>/SKILL.md`, with YAML frontmatter (`name`, `description`, optional invocation flags), registered through DSH's `ctx.skills` registry. | `.adr/0001-add-skills-layer.md`, `@deepseek-ai/dsh-skill` |
| Skill body | The Markdown content of a `SKILL.md` below the frontmatter; the imperative instructions the model follows at invocation time. | `skills/<name>/SKILL.md` |
| Spec | A lifecycle-managed development decision at `.specs/proposed/<name>.md` (or `.specs/implemented/<name>.md` after approval) covering one Feature's REQs, Scope, ACs, and verification plan. | `docs/AGENTS.md`, `.specs/**/*.md` |
| verification cycle | The bounded handoff from implementation Session to verification evidence, recorded at `.blueprint/verifications/<feature-id>.json`. | `lib/verification.js`, `.blueprint/verifications/<feature-id>.json` |
| Scope | The machine-readable allow/deny path list under a Spec's `## Scope` heading; implementation changes inside an approved Spec must stay inside the Scope. | `.specs/**/*.md` |

This file is intentionally short. If a term is canonical elsewhere (e.g., the spec-driven framework, DSH, the translation glossary), this file points at the owner rather than redefining it. Additions to this list should be plugin-internal vocabulary only.
