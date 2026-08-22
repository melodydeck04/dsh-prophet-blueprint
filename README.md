# `@dsh-plugins/design-blueprint`

English | [中文](README.zh.md)

Spec lifecycle, direct-developer approval, feature architecture, an architecture design workspace, document governance, and correspondence checks for DSH-assisted development. The plugin separates standing AI instructions, current architecture, public contracts, documentation roles, and lifecycle-managed design decisions, then checks that staged implementation changes remain inside one reviewed and explicitly approved feature specification.

The package is an out-of-tree DSH Bundle. Its host plugin contributes short spec-driven guidance to the assembled system prompt, registers a direct `/blueprint` command, and exposes a narrowly scoped dashboard API. Its DSH Web client adds a **Blueprint** conversation tab for the project feature tree, document satisfaction, audit details, architecture design, and safe feature editing. The dependency-free CLI initializes projects, validates the exact Git index, validates the working tree, manages optional content stamps, and installs a local pre-commit hook.

## Public API

- `design-blueprint init [--cwd <path>]` creates a structurally ready governance baseline: authority documents, lifecycle specs, the feature root, the architecture components directory, documentation standards, bilingual policy and terminology, and project-local DSH documentation Skills. Existing prose is never overwritten; an older Blueprint configuration is augmented only when its documentation or architecture section is absent.
- `design-blueprint scan [--cwd <path>] [--all] [--json] [--severity required|recommended|all]` validates the exact Git index by default. `--all` validates the working tree without applying staged-change scope policy and reports malformed or inconsistent architecture records.
- `design-blueprint docs list|check|confirm <file> [--cwd <path>]` lists pair state, enforces the bilingual contract, or explicitly records one semantically reviewed pair.
- `design-blueprint install-hook [--local|--global] [--uninstall]` installs a local hook by default. Global Git-template installation is explicit.
- `design-blueprint stamp --verify|--refresh|--acknowledge [--force]` retains the optional file-freshness mechanism. Stamp targets must resolve inside the project root.
- `/blueprint [all]` runs the same scanner from a DSH interactive command adapter. Bare `/blueprint` reads the staged snapshot; `all` reads the working tree. The command searches upward for `design-blueprint.json` and refuses to scan an unrelated fallback directory.
- The DSH Web **Blueprint** tab reads the current session workspace, opens a Chinese README-like Product brief before the formal Development Spec, switches between separate English and Chinese files, runs a streaming review assistant, exposes a separate feature tree, and offers an Architecture design workspace with a logical component graph, a proposed-change overlay, and an independent architecture assistant.
- Programmatic exports include `./scan`, `./architecture`, `./config`, `./docs`, `./workflow`, `./specs`, `./features`, `./policy`, `./snapshot`, `./project-root`, `./project-discovery`, `./web-api`, `./init`, `./install-hook`, and `./stamps`.

## Configuration

`design-blueprint.json` names each authority and the change policy:

```json
{
  "version": 1,
  "authority": {
    "instructions": ["AGENTS.md"],
    "architecture": ["DESIGN.md"],
    "publicContracts": ["README.md"],
    "specsRoot": ".specs"
  },
  "changePolicy": {
    "requireSpecFor": ["**"],
    "allowWithoutSpec": [
      ".specs/**",
      ".blueprint/approvals/**",
      ".blueprint/architecture/**",
      "design-blueprint.json",
      "README.i18n.yaml"
    ]
  },
  "features": {
    "root": ".blueprint/features",
    "approvalsRoot": ".blueprint/approvals"
  },
  "architecture": {
    "root": ".blueprint/architecture"
  },
  "documentation": {
    "standards": ["docs/AGENTS.md"],
    "roles": {
      "tutorials": "docs/cookbook/**",
      "references": "docs/reference/**",
      "productGuides": "docs/user/**",
      "decisions": ".specs/**"
    },
    "i18n": {
      "enabled": true,
      "include": ["README.md", "docs/**/*.md"],
      "exclude": [
        "docs/AGENTS.md",
        "docs/i18n/terminology.md",
        "docs/i18n/style-samples.md"
      ],
      "migrationSeverity": "recommended"
    }
  }
}
```

Paths and globs are repository-relative. The supported glob vocabulary is `*`, `**`, and `?`. Absolute paths and parent traversal are rejected.

The authority roles are intentionally distinct:

- `instructions` are standing orders loaded for AI development.
- `architecture` describes current composition and ownership.
- `publicContracts` describe consumer-visible behavior.
- `specsRoot` stores proposed, implemented, and rejected decisions.
- `features.root` stores developer-owned feature definitions used by the Web hierarchy and document-satisfaction view.
- `features.approvalsRoot` stores direct-developer approval records bound to exact proposed-spec hashes.
- `architecture.root` stores developer-owned architecture component records that separate product containment (`Parent`) from typed software composition, deployment, and runtime dependencies.
- `documentation.standards` identifies the document-role authority that AI reads before human-facing documentation work.
- `documentation.roles` assigns tutorials, references, product guides, and durable decisions to distinct homes.
- `documentation.i18n` defines bilingual scope, explicit exclusions, and the migration severity for a pre-existing unpaired owner document.

## Documentation governance and translation

Initialization creates `docs/AGENTS.md` as the role standard, `docs/i18n/README.md` as the pairing contract, `docs/i18n/translation-rules.md` as the translation method, `docs/i18n/terminology.md` as the terminology authority, and `docs/i18n/style-samples.md` for reviewed project voice. It also creates `.dsh/skills/blueprint-doc-standards/SKILL.md` and the explicitly invoked `.dsh/skills/blueprint-translate-docs/SKILL.md`, which DSH discovers as project-local Skills.

An in-scope pair consists of `foo.md`, `foo.zh.md`, and `foo.i18n.yaml`. Both languages have equal authority. The record contains full Git blob hashes, matching `git hash-object`, rather than ordinary file SHA-1 values. `docs check` rejects incomplete established triplets, stale hashes, missing H1 language switchers, and drift in heading levels, lists, table shapes, link targets, or fenced code. A lone document that predates adoption is a recommended migration item by default, so initialization does not invent a translation.

Mechanical equality is not semantic review. The normal AI path applies the smallest counterpart patch in the same change and preserves untouched prose. The extended translation Skill runs only when the user requests it. After a person or capable AI confirms that both sides mean the same thing, `docs confirm` rechecks structure, stores Git blobs when a repository is available, pins recoverable Blueprint snapshot refs, and writes the reviewed hashes.

## Feature catalog and Web dashboard

Feature files live directly under `.blueprint/features` by default. Each file records a stable lowercase ID, optional parent, lifecycle status, summary, implementation scope, required or recommended documents, acceptance notes, and free-form notes. File layout remains developer-owned intent; the plugin never guesses product features from source directories. The Web panel can switch between the compact directory and a top-down SVG architecture diagram whose uniform nodes and orthogonal connectors are derived from those same parent relationships.

The Blueprint heading reports the actual Host and browser-client package versions. A matching load is shown as one compact version; a mismatch shows both values and asks for a complete DSH Web restart. The project root remains directly below the heading so a stale plugin and a session opened in the wrong workspace are distinguishable.

The dashboard has three primary tabs. **Optimize Spec** is the default workspace: the left column opens the selected feature's Chinese **Product brief** first, with explicit **Product brief / Development Spec** and **Chinese / English** switches, the physical file path, feature name, Spec lifecycle, approval/development state, and rendered Markdown. The concise brief uses four matching sections—what it does, expected result, how to use, and usage notes—before the developer chooses the engineering-oriented Spec. The independent streaming assistant occupies the right column. **Project structure** contains the feature tree/directory switch, feature selection, compact audit totals, and feature-definition editing; it does not repeat the document or assistant. **Architecture design** is the third primary workspace: it shows the current logical component graph alongside a proposed-change overlay, exposes the canonical component detail (deployment unit, owned paths, provided contracts, supported Features, document state, validation issues), and runs an independent architecture assistant that returns a structured placement analysis instead of acting as a chat over the Feature hierarchy. Feature `Parent` means product capability containment only; calls, reuse, integration, and shared screens use typed architecture relations instead.

New product briefs are stored as `docs/user/features/<feature-id>.md`, `docs/user/features/<feature-id>.zh.md`, and a reviewed `.i18n.yaml` pairing record. A Host-owned artifact resolver returns those exact paths together with the Feature definition, lifecycle Spec pair, approval path, existence state, and hashes; the browser renders this descriptor and never rebuilds or fuzzy-matches filenames. Formal lifecycle specifications use an English machine-parsed owner at `.specs/<lifecycle>/<name>.md` and a Chinese counterpart at `.specs/<lifecycle>/<name>.zh.md`. The Chinese file is attached to its owner instead of becoming a second lifecycle proposal. Existing unpaired specifications remain readable, and requesting an absent language produces an explicit missing-file notice instead of mixed-language fallback.

New Feature creation separates the editable display title from a developer-confirmed ASCII local key. Root ids equal the local key; child ids equal `<parent-id>--<local-key>`. Purely numeric new keys and automatic semantic translation of non-ASCII titles are rejected. The form previews the complete Host-owned artifact set before saving. Once artifacts are prepared, ordinary title edits do not rename identity and parent changes require the explicit **Normalize identity** preview. That recoverable migration lists every moved artifact, updated reference, descendant identity, collision, and invalidated approval before confirmation; legacy ids remain readable until the developer chooses migration.

New components live under `.blueprint/architecture/components/<id>.md` with a stable ASCII Id, Kind, optional Container, Deployment identifier, Status, owned source paths, provided contracts, typed dependencies (`depends_on`, `calls`, `publishes`, `consumes`, `exposes`, `extends`), supported Feature ids, and required/recommended documents. Component identity is decoupled from `Container`, so reparenting a component is a graph placement change and never renames the artifact path or its descendants. The graph view distinguishes containment edges from typed dependency edges; selecting a Feature highlights every allocated component and selecting a component highlights every supported Feature.

The dashboard computes satisfaction from the definition's summary and scope plus the existence of every required document. Recommended documents remain visible but do not reduce the percentage. Invalid parent links, cycles, missing required documents, malformed feature definitions, malformed component records, ambiguous owned paths, unsupported relation types, reused deployment or contract identifiers, and broken Feature allocations appear in the same audit-details surface. Architecture-only planning remains possible before implementation approval because `.blueprint/architecture/**` is excluded from `requireSpecFor` while approvals and Spec lifecycles remain governed.

The selected feature also has a structured Chinese requirement analysis. It separates repository facts into value, scenarios, in-scope and out-of-scope behavior, rules and lifecycle state, failure boundaries, acceptance criteria, risks, and open questions. Missing material is labeled as unspecified instead of being silently invented.

Editing is deliberately narrow: the HTTP endpoint accepts same-origin JSON, resolves only a directory anchored by `design-blueprint.json`, writes only `<features.root>/<validated-id>.md` or `<architecture.root>/components/<validated-id>.md`, limits request and document size, rejects parent traversal, and uses the loaded SHA-256 hash to reject stale updates. Architecture changes use a preview/apply boundary with optimistic concurrency: a preview enumerates added, updated, removed components, every typed edge change, deployment and contract effects, ambiguous path ownership, containment cycles, document effects, and approval invalidations; apply recomputes the same preview against the live snapshot, refuses stale or expanded diffs, and writes only the registered component file. It is not a general filesystem editor.

## Direct-developer feature workflow

A feature-linked specification adds `Feature: <id>` below its proposed status. Blueprint derives workflow state from repository artifacts rather than browser memory and follows this sequence:

- Save the feature definition.
- **Generate development plan** first asks the Host to recoverably prepare the registered English/Chinese Product brief triplet and Feature-linked proposed Spec pair. The workflow enters a visible prepared state, then the assistant fills only those existing paths and removes their skeleton markers. It explicitly forbids implementation or self-approval.
- The developer reads the Product brief and then the proposed Spec in **Optimize Spec**, then uses **Review and approve proposal**. The Host writes `.blueprint/approvals/<feature-id>.json` with the exact canonical Spec path and a review hash covering both Spec language files. If Blueprint Web cannot be opened, the developer may explicitly use `design-blueprint approve <feature-id> --spec-hash <sha256> --yes`; the CLI calls the same stale-hash check and atomic writer rather than accepting a name or selecting a proposal implicitly.
- **Start development** appears only while that approval still matches. It submits the approved spec path and hash to the same DSH Session.
- AI implements only the approved Scope and runs the declared checks. If the proposal changes, the hash mismatch removes its authority and requires another developer review.
- Only after verification passes may AI move the spec to `implemented` and describe the shipped decision, evidence, and consequences.

The staged policy excludes an unapproved Feature-linked proposal from implementation ownership even when its Scope matches a changed file. `.specs/**`, `.blueprint/approvals/**`, and `.blueprint/architecture/**` remain governance-only paths so planning, direct approval, and architecture planning can happen before implementation. The approval record is a strong workflow signal, not a cryptographic boundary against a hostile process with unrestricted workspace access.

### Independent architecture assistant

The Architecture design workspace opens an architecture assistant in the right column. It creates a dedicated Host-born DSH Session/Agent per project and protocol version, separate from both the development conversation and the Spec reviewer, but keeps the complete conversation embedded in Blueprint instead of handing the developer to another chat. Blueprint immediately archives this backing Session through DSH's Workspace API, so normal Workspace and Ungrouped groups do not show it while its durable history remains available to the embedded assistant. Existing unarchived architecture Sessions are migrated the next time Blueprint opens them. Finalized messages, streaming Markdown, reasoning and tool activity, errors, cancellation, cached recovery, and bottom-follow behavior use the same visible projection as the Spec reviewer. Every submission carries delimited current Feature records, component records, `DESIGN.md`, the relevant manifest, the public contract, the approved decision summary, the selected Feature or component, and the developer's proposal. Repository material is treated as untrusted context rather than instructions. The assistant separates repository facts, inferences, assumptions, and developer decisions; its response covers product placement, component allocation, typed relation changes, interface and data impact, deployment and plugin boundaries, source ownership, compatibility and migration impact, at least one viable alternative, and unresolved user-visible or business-boundary questions. It may recommend extending an existing component, adding an internal component, adding a peer service, or adding a plugin, but a page or dependency alone is not evidence for a plugin.

The assistant first produces a structured before/after proposal. Only an explicit developer action may apply the exact current proposal to the registered architecture records and synchronize the Feature-linked Product brief and proposed Spec pair. The architecture Session cannot edit implementation files, move lifecycle documents to `implemented`, write approval records, or approve its own result. Any applied Spec change invalidates an earlier approval through the existing exact-hash workflow.

### Independent Spec review assistant

The selected feature opens a dedicated assistant in the right side of **Optimize Spec**. Its first message creates a fresh Host-born DSH Session/Agent in the same workspace rather than copying the development conversation. Sessions are titled and recovered by project, review-protocol version, and feature id. Editing either Spec language refreshes the document but keeps the same conversation; **New conversation** explicitly archives the previous Session title and creates a clean one.

The reviewer speaks Chinese by default and checks six concerns: goals and actors, scope and non-goals, state/permission/data rules, failures and recovery, security/concurrency/compatibility, and observable acceptance evidence. Like DSH Chat, the panel opens the Session event window before prompting. On DSH 0.1.1-rc.2 it projects finalized nodes, partial blocks, and running calls from `ConversationSnapshot.chat.legacy`, with the former top-level fields retained only as a migration fallback. DSH-published reasoning summaries, tool and file activity, tasks and subagents appear as chronological running/completed/failed cards, while answer text continues through streaming `MarkdownText`. Unknown blocks are ignored safely, and the panel never claims to expose hidden chain-of-thought. Long histories scroll without compressing earlier turns; oversized message and activity bodies use bounded inner scrolling, and streaming follows the bottom only until the developer scrolls upward, with **Back to latest** restoring follow mode. It also reports Session errors and can stop generation. The role prompt forbids implementation, lifecycle archival, approval-record writes, and implementation-file edits. The independent session still uses the active DSH Agent composition, so OS-level capability isolation remains a future hardening boundary rather than a claim of this version.

The assistant defaults to **Simple mode**: the developer supplies a Chinese product-level framework, while the reviewer silently normalizes sections, engineering constraints, acceptance identifiers, verification details, and repository-derived choices. It asks at most three plain-language questions only when a choice changes visible behavior or a business boundary. **Technical details** mode exposes fields, configuration, acceptance IDs, and test concerns on demand. Assistant replies use DSH's untrusted-output `MarkdownText` renderer for safe incremental Markdown. Every submission carries the latest contents of both Product brief files and both Spec files, even when the Session is reused. When a proposed Spec exists, **Optimize and write Spec directly** explicitly authorizes the Agent to synchronize only those current paired artifacts, with one language per file. A finalized assistant reply or the Session settling after a tool-only turn automatically reloads the dashboard exactly once, so the left document, lifecycle state, and new bilingual review hash appear without copy-paste; **Refresh results** remains available as a recovery action.

### One-click initialization

When the current workspace is an unconfigured Git root or contains a recognized technology marker, the empty Blueprint view offers **Initialize current project**. An empty or otherwise unrecognized starter workspace instead explains the automatic recognition conditions and offers **Confirm this directory and initialize**. That fallback is an explicit developer decision about the exact DSH workspace path; it is not a filename guess made by the model. Filesystem roots remain ineligible.

The Host rediscovers the target before writing. A strong candidate must still match discovery, while an unrecognized workspace must carry the explicit confirmation bit and still equal the current workspace exactly. Both paths delegate to the same non-destructive initializer as the CLI. The resulting baseline includes document roles and translation tooling but deliberately says that product architecture and feature boundaries remain undocumented; setup never fabricates product intent or translates existing prose without review. **Recheck** visibly runs fresh discovery and states the deterministic Git/marker conditions when they remain unmet.

An already configured project can use **Update governance standard** in the Blueprint header. It reruns the same idempotent initializer, adding newly managed templates and the absent documentation configuration while leaving existing prose and configuration keys intact.

A directory that merely contains repositories, backups, or scratch folders is never automatically selected. The setup view lists direct child project hints and warns again before an explicit current-directory confirmation. The plugin never recursively chooses and initializes the first directory it happens to find.

## Specification lifecycle

A proposed specification is reviewed intent before implementation:

```markdown
# Spec: Staged Git snapshot

Status: proposed

## Problem
## Scope
- allow: `lib/**`
- deny: `lib/generated/**`
## Proposal
## Alternatives considered
## Acceptance criteria
- AC-1: The scanner reads staged content.
## Verification
- AC-1: test: `tests/staged-policy.test.js`
## Risks
```

An implemented specification replaces `Proposal`, `Acceptance criteria`, and `Risks` with `Decision`, shipped `Verification`, and `Consequences`. A rejected specification keeps its proposal and records `Status: rejected — <reason>`.

The lifecycle directory and `Status:` must agree. Proposed scopes are eligible for staged implementation. An implemented spec is eligible only when it is updated in the same staged change. A file covered by zero or multiple eligible specs blocks the scan.

## Git and verification semantics

The default scanner uses `git diff --cached --name-status -z` for the change set, `git ls-files -z --cached` for snapshot identity, and `git show :<path>` for content. Checks therefore evaluate what Git will commit, not unrelated unstaged edits.

The scanner proves structural facts: authority presence, lifecycle format, scope ownership, stable AC identifiers, and declared verification. It does not claim that natural-language product intent is semantically correct. Human review and the referenced tests remain authoritative for that judgment.

The local hook can be bypassed with `git commit --no-verify`; CI should run the same staged or repository policy before merging when enforcement is mandatory.

## DSH composition

The manifest declares `dsh.bundle.patch` and `dsh.client`. `cordis.patch.yml` inserts the host function plugin. The DSH Web profile supplies `commands`, `systemPrompt`, and `webServer`; the client declaration loads after `dsh-client-runtime` and `dsh-client-ui-conversation`, then registers a `conversation.view` entry named `blueprint`.

Install the package into a DSH profile through the current `dsh plugin --profile <name> add <package>` flow, include `@dsh-plugins/design-blueprint` in that profile's bundle list, then inspect the effective composition:

```sh
dsh --profile web --dump-config
```

After changing a linked development copy, fully restart DSH Web so its browser module graph is rebuilt. Select a session whose workspace contains `design-blueprint.json`, then choose the **Blueprint** tab beside the normal conversation views.

## Model Experience

### Spec-driven development guidance

#### What the model sees

Every assembled prompt receives one order-90 section telling the model to read `design-blueprint.json`, its authority documents, and the relevant lifecycle specification before modifying files; keep work inside Scope; pair `AC-*` criteria with evidence; and update the specification before expanding behavior or file scope.

##### Verbatim guidance

```markdown
## Spec-driven development

Before modifying workspace files, read design-blueprint.json, every authority document it names, and the relevant lifecycle specification under .specs/.
For non-trivial work, establish or update the specification before implementation. Keep changes inside its machine-readable Scope, satisfy each AC-* acceptance criterion with declared verification evidence, and update the public contract and architecture owners when their facts change.
For feature-catalog work, a planning request may fill only the Host-registered bilingual Product brief and proposed Spec artifacts and must then stop. Never invent or fuzzy-match artifact paths, and never hand-write or edit .blueprint/approvals. Direct developer approval normally comes from Blueprint Web; when Web is unavailable, the hash-bound design-blueprint approve CLI fallback may be invoked only after explicit developer authorization in the same task. Do not implement a Feature-linked proposal unless its exact current bilingual hash is approved; changing the proposal invalidates approval and requires another developer review.
For human-facing documentation, also read the configured documentation standard. Put each fact in its owning document tier, update every in-scope English/Chinese pair together, and never confirm a translation pair until semantic equivalence has been reviewed.
Do not treat a passing test alone as authority to expand scope. If implementation requires an unplanned file or behavior, update the specification and obtain review before continuing.
```

#### Token effect

One fixed section is repeated in every model request while the plugin is mounted. Specifications themselves are not copied into the prompt; the agent reads the relevant files through its ordinary workspace capabilities.

#### KV Cache effect

The section is prefix-stable while its text and order remain unchanged. Editing the guidance or changing its registration order may invalidate reuse from that prompt position.

### Direct `/blueprint` status

#### What the model sees

Nothing directly. The command executes in DSH's human command plane and returns its report to the interactive adapter without creating a model message.

#### Token effect

Zero direct tokens.

#### KV Cache effect

No effect; command metadata, input, and output stay outside model requests.

## Known Limitations and Deferred Work

- **Semantic review remains reviewer-owned** — the scanner validates declared correspondence and Markdown structure, not whether prose or a translation accurately captures product intent.
- **Verification declarations are not executed by `scan`** — tests and commands are recorded as evidence references; project CI or a future explicit runner executes them.
- **One small glob dialect** — brace expansion, extglobs, negated patterns, and `.gitignore` semantics are intentionally absent.
- **No automatic lifecycle transition** — moving proposed to implemented changes the meaning of the document and remains an explicit reviewed edit.
- **Feature Markdown is intentionally structured** — the visual form owns the canonical format; hand edits must retain its headings and metadata.
- **Architecture components live under one configured root** — `.blueprint/architecture/components/` is the only supported location for component files; cross-root or split catalogs require a developer-reviewed configuration update.
- **The architecture graph is logical, not a runtime topology probe** — typed dependency edges come from developer-owned declarations; Blueprint does not crawl source code or container manifests to infer architecture boundaries.
- **The review and architecture Agents are prompt-constrained, not sandbox-isolated** — they receive independent Sessions and narrow role/context prompts, but use the active DSH Agent composition and tool surface.
- **A dense component graph can become unreadable** — large catalogs rely on the focused selection and the audit panel; bounded highlight overlays and node sizing remain a future ergonomics layer.
- **Typed path ownership may reveal existing overlaps** — Blueprint reports ambiguous patterns as required issues but never repairs them automatically; adoption is a developer decision.
- **DSH is still a developer preview** — peer versions should be pinned and tested against the profile that consumes this out-of-tree Bundle.

## Development

```sh
npm test
npm run lint:js
node lib/cli.js scan --all
```

See [DESIGN.md](DESIGN.md) for component ownership and [the implemented specification](.specs/implemented/2026-08-20-spec-driven-blueprint.md) for the decision and trade-offs.
