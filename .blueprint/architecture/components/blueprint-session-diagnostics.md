# Component: @dsh-plugins/design-blueprint-diagnostics

Id: blueprint-session-diagnostics
Kind: internal
Container: design-blueprint
Deployment:
Status: active

## Summary

Standalone sibling CLI that reads DSH `session.jsonl` exports and surfaces token, retry, compaction, tool-result, and reasoning mass as a structured report. Ships its own `audit` and `compare` commands and never talks to the DSH runtime.

## Owned paths

- `blueprint-diagnostics/bin/blueprint-diagnostics.js`
- `blueprint-diagnostics/lib/audit.js`
- `blueprint-diagnostics/lib/compare.js`
- `blueprint-diagnostics/lib/report.js`
- `blueprint-diagnostics/lib/stream.js`
- `blueprint-diagnostics/lib/thresholds.js`
- `blueprint-diagnostics/tests/audit.test.js`
- `blueprint-diagnostics/tests/compare.test.js`
- `blueprint-diagnostics/tests/report.test.js`
- `blueprint-diagnostics/tests/stream.test.js`
- `blueprint-diagnostics/docs/diagnostics/README.md`
- `blueprint-diagnostics/docs/diagnostics/examples/basic-audit.md`
- `blueprint-diagnostics/package.json`

## Provided contracts

- `audit`
- `compare`

## Dependencies

- depends_on: design-blueprint

## Supported features

- `blueprint-session-diagnostics`

## Documents

- required: `blueprint-diagnostics/lib/audit.js`
- required: `blueprint-diagnostics/lib/compare.js`
- required: `blueprint-diagnostics/lib/report.js`
- required: `blueprint-diagnostics/lib/thresholds.js`
- required: `blueprint-diagnostics/docs/diagnostics/README.md`
- required: `blueprint-diagnostics/docs/diagnostics/README.zh.md`
- required: `blueprint-diagnostics/docs/diagnostics/README.zh.i18n.yaml`
- required: `blueprint-diagnostics/package.json`