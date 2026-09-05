# Spec decomposition contract

English | [中文](spec-decomposition-contract.zh.md)

## What it does

`design-blueprint spec explain <spec.md>` and `design-blueprint spec decompose <spec.md>` surface whether a proposed Spec is too coarse for one development session and, when it is, hand the developer a structural patch that splits the Spec into a parent plus N bounded sub-Specs.

The detector watches three signals:

| signal | source | default threshold | tunable via |
| --- | --- | --- | --- |
| `REQ-*` count | regex over the Spec body | > 8 | `decomposition.maxReq` in `design-blueprint.json` |
| `## Scope` allow-list size | sub-bullets under `### Allowed paths` | > 5 distinct globs | `decomposition.maxScopePaths` |
| line count | `content.split('\n').length` | > 1500 | `decomposition.maxLines` |

`design-blueprint scan --all` now also surfaces `decomposition-contract` issues for every proposed Spec that exceeds one of the thresholds. The check is `recommended` when a Spec is just above the threshold and `required` when it is more than double.

The decomposition template writes one `parent.md` and N `sub-N.md` files under `<spec>.decomposition/`. The parent keeps the full Scope and lists the sub-Specs; each sub-Spec carries a narrowed Scope, its REQ range, and stubs the developer fills in.

## Expected result

After running the new commands, a developer can:

- `design-blueprint spec explain --spec .specs/proposed/foo.md` — print a one-line summary, observed values, and the proposed decomposition.
- `design-blueprint spec decompose --spec .specs/proposed/foo.md [--out <dir>] [--force]` — write parent + N sub-Spec patches.
- `design-blueprint scan --all` — emit `decomposition-contract` issues for over-sized proposed Specs.

The new module lives at `lib/spec-decomposition.js` and is consumed by `lib/scan.js` and `lib/cli.js`. The package has zero new runtime dependencies.

## How to use

1. Inspect a suspect Spec:
   ```bash
   design-blueprint spec explain --spec .specs/proposed/auto-verification.md
   ```
2. Write the decomposition patch (default out dir is `<spec>.decomposition/`):
   ```bash
   design-blueprint spec decompose --spec .specs/proposed/auto-verification.md
   ```
3. Review the patches under `.specs/proposed/auto-verification.decomposition/`, merge them into the original Spec, and create sub-Spec files at the listed paths.

Tuning example in `design-blueprint.json`:

```json
{
  "decomposition": { "maxReq": 12, "maxScopePaths": 8, "maxLines": 2000 }
}
```

## Companion

This Spec depends on Phase 1's persistent TODO list: each sub-Spec the decomposition template emits carries a `TODO list: <parent>.todos.yaml` pointer, which the developer authors by hand the same way Phase 1 describes.
