# Documentation standard

This file owns document placement and writing responsibilities for human-facing documentation.

## One home per fact

- Root `AGENTS.md`: standing development orders needed in every AI session.
- `DESIGN.md`: current architecture, component ownership, seams, and extension points.
- `.specs/`: decision rationale, trade-offs, acceptance criteria, and verification evidence.
- Package or feature README: public configuration, behavior, limitations, and extension points owned there.
- `docs/cookbook/`: ordered tutorials that lead a reader to an outcome.
- `docs/reference/`: lookup-oriented current behavior and definitions.
- `docs/user/`: product-facing guides.
- Project-local Skills under `.dsh/skills/`: reusable AI workflows, never product contracts.

Put each durable fact in the lowest document that owns it and link to that owner elsewhere. Describe current state rather than change history. Classify each human-facing page as tutorial or reference, keep relative links machine-checkable, and update an owning specification with every non-trivial change.

## Bilingual work

Follow `docs/i18n/README.md`, `docs/i18n/translation-rules.md`, and `docs/i18n/terminology.md`. Update both sides in one change and run `design-blueprint docs check`. Only run `design-blueprint docs confirm <file>` after a person or capable AI has reviewed semantic equivalence.
