# Architecture design workspace

English | [中文](spec-governance--architecture-design.zh.md)

## What it does

The Architecture design workspace keeps the product Feature map separate from the software architecture model. It records stable components, containment, typed dependencies, deployment units, source ownership, and the many-to-many mapping between Features and components. A dedicated architecture assistant uses those repository facts to discuss where a proposed capability belongs instead of treating a Feature parent, source directory, or plugin boundary as the same decision.

## Expected result

When a developer proposes a capability, Blueprint presents product-placement and component-placement alternatives, highlights the recommended nodes and typed edges on a before/after diagram, and lists interface, deployment, file-ownership, compatibility, and migration impact. The architecture assistant's complete message history, streaming answer, and tool activity remain embedded in the Architecture design workspace. Its independent backing Session is archived immediately, keeping durable recovery without appearing in normal Workspace or Ungrouped chat groups; existing unarchived architecture Sessions are migrated when reopened. Feature and component identities remain stable when their parent or container changes, so an architecture discussion does not automatically rename documents, descendants, or approval identities. The developer chooses whether to extend an existing component, add an internal component, add a peer service, or introduce an independently installable plugin.

## How to use

Open Architecture design. If the logical component graph is empty, select **Initialize architecture model**, review the repository-level component ID, kind, and owned paths derived from the project manifest, and confirm creation. Select an existing Feature or describe a planned capability, then ask the architecture assistant to assess placement and refine that coarse initial boundary. Review the proposed Feature relationship, component allocation, dependencies, deployment boundary, affected paths, alternatives, and unresolved product decisions. Compare the current and proposed diagrams, then explicitly accept the architecture proposal before Blueprint synchronizes the registered architecture records and proposed Spec. Review and approve the resulting Spec through the existing exact-hash workflow before starting implementation.

## Usage notes

Feature `Parent` means product capability containment only; calls, reuse, integration, and shared screens use typed architecture relations instead. Source files follow component ownership rather than mirroring the Feature tree, and a Web page does not require a new plugin unless it has an independent installation, version, permission, or host-extension lifecycle. The architecture assistant is grounded in the current Feature catalog, component model, authority documents, manifests, and approved decisions. It distinguishes repository facts from assumptions, cannot approve its own proposal, and cannot modify implementation files during planning.
