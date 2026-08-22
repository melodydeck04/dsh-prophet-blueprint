# Feature: Web Blueprint dashboard

Id: web-dashboard
Parent: spec-governance
Status: active

## Summary

Provides a focused two-tab DSH Web workspace: live Spec optimization with the document and assistant side by side, plus a separate architecture/directory view for feature navigation and maintenance.

## Scope

- `lib/client.js`
- `lib/artifacts.js`
- `lib/cli.js`
- `lib/web-api.js`
- `lib/features.js`
- `lib/workflow.js`
- `lib/version.js`
- `lib/project-discovery.js`
- `lib/init.js`
- `.blueprint/features/**`

## Documents

- required: `DESIGN.md`
- required: `README.md`
- required: `docs/user/features/web-dashboard.md`
- required: `docs/user/features/web-dashboard.zh.md`
- required: `docs/user/features/web-dashboard.i18n.yaml`
- required: `.specs/implemented/2026-08-20-web-blueprint-dashboard.md`
- required: `.specs/implemented/2026-08-20-one-click-initialization.md`
- required: `.specs/implemented/feature-approval-workflow-and-diagram.md`
- required: `.specs/implemented/feature-approval-workflow-and-diagram.zh.md`
- required: `.specs/implemented/bilingual-feature-briefs-and-specs.md`
- required: `.specs/implemented/host-owned-feature-artifact-workflow.md`
- required: `.specs/implemented/host-owned-feature-artifact-workflow.zh.md`
- recommended: `README.zh.md`

## Acceptance

- The Blueprint tab uses the current DSH session's project path.
- Saving is restricted to validated feature files below the configured feature root.
- Concurrent edits are rejected instead of silently overwritten.
- An eligible unconfigured project can be initialized from the empty state without a terminal.
- Feature nodes render in an accessible top-down diagram with orthogonal connectors and select the canonical detail view.
- New Feature identity is Host-derived from a developer-confirmed ASCII local key and selected parent; the browser previews and consumes one canonical artifact descriptor without fuzzy path matching.
- AI planning first asks the Host to recoverably prepare the registered English/Chinese Product brief and Feature-linked proposed Spec skeletons, then fills only those paths and stops.
- Implementation remains blocked until the developer approves the combined Spec review hash in Blueprint Web or explicitly invokes the exact-hash CLI fallback when Web is unavailable.
- Legacy identity migration requires an exact developer-confirmed preview, updates descendant identities and references recoverably, and invalidates prior approvals.
- Starting development submits the approved Spec to the current DSH Session and requires verification before implemented archival.
- The heading exposes matching Host/client versions or a visible mismatch warning while retaining the current project root.
- The selected feature shows structured Chinese requirement facts and explicit unspecified fields.
- A dedicated DSH Session/Agent reviews the selected Spec in Chinese without inheriting the development conversation, using the DSH Chat session window and partial snapshot semantics for real-time output, errors, and cancellation.
- DSH-published reasoning summaries, tool and file activity, tasks, and subagents appear chronologically beside the streaming final answer; unknown activity never renders raw objects.
- A Spec edit refreshes the paired files without replacing the feature's review Session, while an explicit New conversation action preserves the old Session and starts cleanly.
- Review defaults to a product-facing Chinese mode that auto-polishes engineering detail, with an explicit technical-detail mode when requested.
- Assistant replies render through DSH's safe streaming Markdown primitive; the developer can authorize synchronized direct edits to the current brief and proposed Spec pairs and see refreshed content and hash without copy-paste.
- The default Optimize Spec tab opens the Chinese Product brief, switches between Product brief/Development Spec and Chinese/English files, and keeps the selected feature name, Spec lifecycle, workflow state, path, and rendered document visible beside the independent streaming assistant.
- The Project structure tab owns the architecture/directory switch and feature-definition details without repeating the Spec document or assistant.

## Notes

The browser bundle targets DSH 0.1.1-rc.2's dsh.client module-loader and conversation.view slot contracts. Review activity prefers the official `ConversationSnapshot.chat.legacy` nodes, partial blocks, and running calls, and retains a top-level snapshot fallback for migration safety.
