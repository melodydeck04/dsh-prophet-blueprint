# verify-feature

English | [中文](verify-feature.zh.md)

## Behavior

Execute requested acceptance checks using the Host-prepared snapshot. Status-only questions read recorded outcomes and do not start attempts. Both native model selection and explicit invocation are supported. The helper requires a runChecks callback; it never derives passing evidence from Spec text. Use prepare/start/result/finalize with exact hashes and capabilities. Check failures and interruptions remain visible; no automatic success or unconditional retry is promised.

## Entry

Load `verify-feature` from the DSH Skill catalog. Loading instructions is not execution or authorization. See `skills/verify-feature/SKILL.md`.
