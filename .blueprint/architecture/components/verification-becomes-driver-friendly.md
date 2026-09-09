# Component: @dsh-plugins/design-blueprint/verification-becomes-driver-friendly

Id: verification-becomes-driver-friendly
Kind: internal
Container: design-blueprint
Deployment:
Status: active

## Summary

Internal additions to the Blueprint verification framework that make programmatic completion workable: aggregate validation via `validateVerificationPayload`, snapshot refresh via `refreshVerificationSnapshot`, two CLI subcommands (`verification status`, `verification dry-run`), and session-id relaxation on submit. The session-id relaxation is attribution-only; the capability hash remains the security anchor.

## Owned paths

- `lib/verification.js`
- `lib/cli.js`
- `tests/verification-payload-validation.test.js`
- `tests/verification-snapshot-refresh.test.js`
- `tests/verification-cli-status.test.js`
- `tests/verification-cli-dry-run.test.js`
- `tests/verification-session-relaxation.test.js`
- `docs/user/features/verification-becomes-driver-friendly.md`
- `docs/user/features/verification-becomes-driver-friendly.zh.md`

## Provided contracts

- `validate-payload`
- `refresh-snapshot`
- `verification/status`
- `verification/dry-run`

## Dependencies

- depends_on: design-blueprint

## Supported features

- `verification-becomes-driver-friendly`

## Documents

- required: `lib/verification.js`
- required: `lib/cli.js`
- required: `tests/verification-payload-validation.test.js`
- required: `tests/verification-snapshot-refresh.test.js`
- required: `tests/verification-cli-status.test.js`
- required: `tests/verification-cli-dry-run.test.js`
- required: `tests/verification-session-relaxation.test.js`
- required: `docs/user/features/verification-becomes-driver-friendly.md`
- required: `docs/user/features/verification-becomes-driver-friendly.zh.md`
- required: `docs/user/features/verification-becomes-driver-friendly.i18n.yaml`
