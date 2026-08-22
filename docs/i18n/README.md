# Bilingual documentation

English | [中文](README.zh.md)

Every document selected by `documentation.i18n.include` in `design-blueprint.json` has equal-authority English and Simplified Chinese forms. A pair is three siblings: `foo.md`, `foo.zh.md`, and `foo.i18n.yaml`.

## Pairing contract

Either language may be authored first for an update. The counterpart must say the same thing, preserve the configured terminology, and retain the same Markdown structure. English places `English | [中文](foo.zh.md)` immediately after H1; Chinese places `[English](foo.md) | 中文` there.

The YAML record stores the full Git blob hash of both reviewed files. Run `design-blueprint docs check` to list violations and `design-blueprint docs confirm <foo.md>` only after semantic review. Confirmation records content identity; it does not translate text or prove its meaning.

For an existing pair, patch the counterpart from the edited side's smallest meaningful diff. Do not retranslate an untouched full document. The normal AI editing path follows this rule directly; the extended `blueprint-translate-docs` Skill runs only when explicitly requested.
