# Translation rules

English | [中文](translation-rules.zh.md)

## Fidelity

Add and remove no claims. Translate the idea rather than the idiom, keep the target language natural, preserve modality and warnings, and use `terminology.md` as the terminology authority.

## Structure

Preserve heading depths and order, list kinds and item counts, ordered-list starts, table shapes, link targets, and fenced-code info strings and bodies. Keep inline code and identifiers verbatim. The language switcher is the only language-specific link target.

## Update method

For a new pair, translate the complete reviewed source once. For an existing pair, recover the last confirmed state from the YAML hashes, identify the edited side's smallest meaningful change, and patch only the counterpart region. Move, rename, and delete all three pair artifacts together.

Chinese prose uses full-width Chinese punctuation and a half-width space between Chinese characters and adjacent Latin text or numerals where natural.
