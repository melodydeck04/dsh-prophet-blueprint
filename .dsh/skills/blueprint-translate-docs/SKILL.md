---
name: blueprint-translate-docs
description: Explicit extended workflow for creating, repairing, renaming, or deleting Blueprint bilingual document pairs.
disable-model-invocation: true
user-invocable: true
---

# Blueprint translation workflow

Use this Skill only when the user explicitly requests the extended translation workflow. Read `docs/i18n/README.md`, `docs/i18n/translation-rules.md`, `docs/i18n/terminology.md`, and the target pair before editing.

For an existing pair, compare the edited side with the content identified by its recorded Git blob hash and patch the counterpart at the smallest safely aligned region. Never retranslate an unchanged full document. For a new pair, translate the reviewed document once and add both switchers. Preserve headings, lists, tables, links, inline code, and fenced code exactly as required. Rename or delete all three artifacts together. Run `design-blueprint docs check`, review semantic equivalence, and only then run `design-blueprint docs confirm <file>`.
