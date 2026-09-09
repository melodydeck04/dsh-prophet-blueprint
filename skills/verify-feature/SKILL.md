---
name: verify-feature
description: Execute requested Feature acceptance checks with real snapshot evidence. For existing verification status, read the record instead. Supports explicit /verify-feature and model selection after a request to execute checks.
user-invocable: true
---

# verify-feature

Loading this Skill supplies instructions, not permission or executable code. Reply in Chinese unless requested otherwise.

1. Resolve the selected Feature and current approval through Host context. Status-only questions read existing results and stop; completed Features return existing evidence.
2. For requested execution, use Host verification-request, verification-prepare and verification-start. Pass the exact record hash, prepared workspace, preparation capability and current Session id. Keep capability-bearing operations in the supported Host context.
3. Execute declared checks in the prepared snapshot using available tools. Retain command, actual output, exit code and required browser observations. A procedure is not evidence. Report unrun checks explicitly; never mark them passed.
4. Submit through verification-result with the current record hash, attempt id and result capability. Use verification-finalize only after acceptance. Failures remain failures. Inspect durable state before recovery; never hand-write records or blindly retry.

Programmatic adapter: ../../lib/skills/backing-modules.js#verifyFeature requires verification_ready and an explicit runChecks callback. It prepares, starts, invokes the runner in the snapshot, submits real evidence and finalizes only if accepted. This export is not a registered model tool; use a supported executable Host/API entry or report its absence.

Return per-AC status, evidence and remaining blockers. Both model and user invocation are allowed; Host approval and validation remain mandatory.
