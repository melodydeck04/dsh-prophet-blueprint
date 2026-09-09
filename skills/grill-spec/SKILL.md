---
name: grill-spec
description: Review a Spec or clarify requested design decisions about defaults, persistence, surface, scope and risks. Supports model selection and explicit /grill-spec. Do not force interviews for status questions or settled decisions.
user-invocable: true
---

# grill-spec

Resolve the explicitly selected Spec or current Feature through Host context. Never choose the most recently modified file as authority. Inspect code and documents to answer factual questions yourself.

Track decisions and prerequisites. Ask at most three material questions whose prerequisites are settled, with a recommendation and tradeoff. Defer dependent questions and respect earlier answers. Reply in Chinese unless requested otherwise.

Cover defaults, persistence, surface, scope and risks only when relevant. The optional ../../lib/skills/backing-modules.js#grillSpecInterview helper returns five checklist gates; it is not a registered tool and does not mandate five questions or verbatim English prompts.

Return evidence-backed findings, decisions, assumptions and unresolved blockers. Review-only requests stop after findings. If planning is also requested, continue through blueprint_dispatch refine once material decisions are settled. Implementation requires current exact approval.

Adapted from mattpocock's prerequisite-based questioning, without mandatory delegation or extra approval rounds. Both model and user invocation are supported.
