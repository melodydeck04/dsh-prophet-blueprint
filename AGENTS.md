# Project development instructions

This repository uses spec-driven development.

- Read `design-blueprint.json` and the authority documents it names before making changes.
- For every non-trivial change, create or update one specification under `.specs/` before implementation.
- Keep implementation changes inside the specification's machine-readable `## Scope`.
- Give every proposed acceptance criterion a stable `AC-*` id and a matching entry under `## Verification`.
- Do not claim completion until `design-blueprint scan` passes against the staged Git snapshot and the relevant tests pass.
- Move a specification between lifecycle directories only when its `Status:` and body describe that lifecycle.
- Update README behavior, DESIGN architecture, tests, and the owning specification in the same change when their facts change.
- Treat `.blueprint/features/*.md` as the developer-owned feature map. Do not infer or silently expand feature boundaries from the source tree.
- A feature planning request may create or update only the bilingual product brief under `docs/user/features/` and its reviewed pairing record, one Feature-linked proposed Spec and its `.zh.md` counterpart, and necessary feature-document references; it must stop before implementation. Keep each language in its own file.
- A Feature-linked proposed spec is not implementation authority until its exact hash has a current `.blueprint/approvals/<feature-id>.json` record created by a direct developer action. Blueprint Web is preferred; when Web is unavailable, the developer may explicitly authorize the hash-bound `design-blueprint approve` CLI fallback. AI must never hand-write or edit approval records, and may invoke the CLI fallback only in the same task as an explicit developer authorization to approve and continue.
- Do not encode any claim about an external tool, API, package, configuration value, or behavior without first source-verifying it. Verify by reading the authoritative source — the package's release documentation, the schema or config file, or the actual code — and cite that source in the owning Spec's body or a referenced research note. Unsourced claims become broken builds, unbootable hosts, and unverified documentation.
- For human-facing documentation, read `docs/AGENTS.md`, keep in-scope English and Chinese pairs synchronized, and run `design-blueprint docs check` before recording reviewed pair hashes.
