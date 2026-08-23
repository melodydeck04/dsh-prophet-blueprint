# Architecture design workspace

English | [中文](spec-governance--architecture-design.zh.md)

## What it does

The Architecture design workspace keeps the product Feature map separate from the software architecture model. It records stable components, containment, typed dependencies, deployment units, source ownership, and the many-to-many mapping between Features and components. A dedicated architecture assistant uses those repository facts to discuss where a proposed capability belongs instead of treating a Feature parent, source directory, or plugin boundary as the same decision.

## Expected result

When a developer proposes a capability, Blueprint presents product-placement and component-placement alternatives and lists interface, deployment, file-ownership, compatibility, and migration impact. The architecture assistant's complete message history, streaming answer, and tool activity remain embedded in the Architecture design workspace. Its independent backing Session is archived immediately, keeping durable recovery without appearing in normal Workspace or Ungrouped chat groups; existing unarchived architecture Sessions are migrated when reopened. When the recommendation is exactly one supported component change, the answer includes an embedded proposal card with a Host-computed preview and a separate developer-confirmed apply action. Feature and component identities remain stable when their parent or container changes, so an architecture discussion does not automatically rename documents, descendants, or approval identities.

After the workspace is opened once, moving between Blueprint tabs does not reset the assistant. Its current conversation, streaming state, proposal card, scroll position, and unsent draft remain available on return. Draft text and the archived backing Session identity are also restored after a remount for the same project and selected focus.

## How to use

Open Architecture design. If the logical component graph is empty, select **Initialize architecture model**, review the repository-level component ID, kind, and owned paths derived from the project manifest, and confirm creation. Select an existing Feature or describe a planned capability, then ask the architecture assistant to assess placement and refine that coarse initial boundary. Review the proposed product relationship, component allocation, dependencies, deployment boundary, affected paths, alternatives, and unresolved decisions. For a supported one-component proposal, select **Generate change preview**, inspect the exact Host delta, and then select **Confirm and apply**. Blueprint applies the preview hash and refreshes the graph. If implementation or Feature planning documents must also change, use their separate Spec workflow before development.

You may switch to Optimize Spec or Project structure while composing or while the assistant is responding, then return to Architecture design without starting a new conversation. Changing the selected Feature or component intentionally changes the architecture focus and may therefore open that focus's own saved draft and Session.

## Usage notes

Feature `Parent` means product capability containment only; calls, reuse, integration, and shared screens may be architecture concerns, but the current proposal card applies only the registered Component-to-Component relation types. It does not provide a Component tab, a generic Relationships panel, Feature hierarchy edits, Feature-to-Feature relation writes, structured contract metadata, or multi-component transactions. Source files follow component ownership rather than mirroring the Feature tree, and a Web page does not require a new plugin unless it has an independent installation, version, permission, or host-extension lifecycle. The architecture assistant is grounded in the current Feature catalog, component model, authority documents, manifests, and approved decisions. It distinguishes repository facts from assumptions and cannot apply or approve its own proposal.
