# Specifications

This directory is the lifecycle inventory for design decisions.

- `proposed/` contains reviewed intent before implementation.
- `implemented/` contains decisions that describe shipped reality.
- `rejected/` retains proposals whose rejection reason prevents a plausible mistake.

Every lifecycle document starts with `# Spec: <title>` and a matching `Status:` line. Proposed and implemented documents use `- allow:` and optional `- deny:` entries under `## Scope`. Proposed acceptance criteria use stable `AC-*` identifiers and matching verification entries.

Run `design-blueprint scan --all` to validate the working tree and `design-blueprint scan` to validate the exact staged Git snapshot.
