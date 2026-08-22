# Spec: Host-owned Feature artifact workflow

Status: implemented
Feature: web-dashboard

## Problem

Blueprint currently has deterministic read paths for Product briefs, but Feature creation accepts weak ids such as `1`, and planning prompts still ask a general DSH Agent to create or locate files. The model can invent a title-derived filename, create an unregistered sibling, or report success even though the dashboard's selected Feature points elsewhere. Prompt wording reduces the likelihood of drift but does not make artifact identity a product invariant.

Feature display names, parent relationships, canonical ids, file paths, bilingual counterparts, lifecycle Specs, and approval records also lack one shared resolver. The browser reconstructs some paths while workflow discovery infers others from file contents. A rename or reparent operation therefore has no single preview showing every affected artifact, and legacy numeric ids have no controlled normalization path.

## Scope

- allow: `lib/artifacts.js`
- allow: `lib/client.js`
- allow: `lib/cli.js`
- allow: `lib/web-api.js`
- allow: `lib/features.js`
- allow: `lib/specs.js`
- allow: `lib/workflow.js`
- allow: `lib/path-utils.js`
- allow: `lib/docs.js`
- allow: `lib/index.js`
- allow: `lib/init.js`
- allow: `lib/version.js`
- allow: `tests/**`
- allow: `package.json`
- allow: `AGENTS.md`
- allow: `DESIGN.md`
- allow: `README.md`
- allow: `README.zh.md`
- allow: `README.i18n.yaml`
- allow: `docs/user/features/**`
- allow: `.blueprint/features/**`
- allow: `.specs/**`

## Decision

### Stable Feature identity

New Feature creation uses three explicit inputs instead of a free-form id: display title, parent Feature, and local key. The Host may suggest a key only through deterministic ASCII slug normalization. A non-ASCII title has no automatic semantic translation; the developer must supply and confirm a lowercase ASCII key matching `[a-z][a-z0-9-]*`. Purely numeric new keys are invalid.

For a root Feature, the canonical id is its local key. For a child Feature, the canonical id is `<parent-id>--<local-key>`. The double-hyphen delimiter records creation ancestry without introducing nested directories, preserving the developer-owned flat `.blueprint/features` map and explicit `Parent:` relationship. The creation screen previews the id and every artifact path before save. After artifact preparation, the id is immutable; changing the display title does not rename files, and reparenting requires the migration workflow below.

### One Host-owned artifact resolver

`lib/artifacts.js` is the Host-side resolver and sole owner of Feature artifact identity. Given a canonical Feature id and workflow state, it returns a structured descriptor for:

- `.blueprint/features/<feature-id>.md`;
- `docs/user/features/<feature-id>.md`, `.zh.md`, and `.i18n.yaml`;
- `.specs/proposed/<feature-id>.md` and `.zh.md`, or the corresponding lifecycle location;
- `.blueprint/approvals/<feature-id>.json`.

The dashboard API returns this descriptor with existence, language, lifecycle, and current hash facts. Browser code renders the descriptor and never reconstructs, searches for, or fuzzy-matches paths. Workflow readiness and approval selection recognize only the registered descriptor files; similarly named stray files remain ordinary unlinked documents.

### Prepare before AI planning

`Generate development plan` first calls a same-origin Host action with the Feature id and expected Feature hash. The Host validates the current identity, checks every target for collisions, and creates the English/Chinese Product brief and proposed Spec skeletons as one recoverable operation. The English Spec skeleton contains `Status: proposed`, `Feature: <feature-id>`, machine-readable Scope, and stable acceptance/verification placeholders; language switchers and document headings are created by Blueprint, not the model. The action never creates or edits an approval record.

Only after preparation succeeds does Blueprint prompt the DSH Agent. The prompt supplies the immutable artifact descriptor and asks the model to fill the existing files, not select or create paths. Plan completion is derived from the registered files passing lifecycle, bilingual-structure, and content checks; an Agent message claiming completion or files written outside the descriptor cannot advance workflow state. The existing independent reviewer may edit only these registered proposed artifacts after explicit authorization. This establishes Host-owned identity even though the active DSH Agent still has its ordinary general-purpose tool surface.

### Hash-bound CLI approval fallback

Blueprint Web remains the preferred direct-developer approval surface. If the Web surface cannot be opened, `design-blueprint approve <feature-id> --spec-hash <sha256> --yes` exposes the same Host approval operation through the CLI. The command requires the developer to supply the exact visible combined bilingual review hash and an explicit confirmation flag; it rejects missing, malformed, stale, unknown, or ambiguous proposals and never selects a proposal by fuzzy name. It writes the same versioned approval record through the existing atomic writer. An AI may invoke this fallback only in the same task where the developer explicitly authorizes CLI approval and continuation; it may never synthesize, hand-write, or edit an approval record.

### Explicit legacy migration

Existing ids remain readable without automatic renaming. A `Normalize identity` action is offered for purely numeric or developer-selected legacy Features. The developer supplies or confirms the local key and target parent. Before mutation, the Host returns an exact migration preview listing the Feature definition, brief triplet, Spec pair and lifecycle location, child `Parent:` references, required document references, and approval impact.

Confirmation revalidates source hashes and target absence, then performs the path and reference update as one recoverable operation. Any failure leaves the original identity authoritative. Because Feature headers and combined Spec content change, migration invalidates the previous approval and never carries it forward silently. The developer must review and approve the migrated proposed Spec again. AI cannot initiate or confirm migration.

### Version and migration boundary

The workflow ships as `0.14.0`. Existing Feature files and historical Spec names remain compatible; deterministic naming applies to new Features and explicit migrations. Initialization templates and the Feature form explain the new title/parent/local-key contract without inventing product hierarchy for existing repositories.

## Alternatives considered

**Derive filenames directly from the display title on every load.** Rejected because titles are localized and editable; renaming a label would silently change identity.

**Let the LLM translate Chinese names into English slugs.** Rejected because model output is non-deterministic and makes file identity depend on prompt/model version.

**Use nested directories for hierarchy.** Rejected because the repository explicitly keeps Feature files directly under the configured feature root; `Parent:` remains the hierarchy authority.

**Search for similar filenames when the canonical file is missing.** Rejected because fuzzy attachment can associate unrelated content and hides incorrect writes.

**Automatically rename every legacy Feature on upgrade.** Rejected because path changes can affect links, child relationships, Specs, and approvals and therefore require an explicit developer-reviewed migration.

## Acceptance criteria

- AC-ID-1: New Feature creation requires title, parent, and developer-confirmed ASCII local key; pure numeric keys are rejected and non-ASCII titles are never semantically translated by AI.
- AC-ID-2: Root ids equal the local key, child ids equal `<parent-id>--<local-key>`, the complete path preview is shown before save, and prepared identities cannot change through ordinary title or parent editing.
- AC-ARTIFACT-1: One Host resolver returns the canonical Feature, Product brief triplet, lifecycle Spec pair, and approval paths with existence, language, lifecycle, and hash facts.
- AC-ARTIFACT-2: The browser and workflow consume the Host descriptor without client-side reconstruction or fuzzy search; stray similarly named files never satisfy the selected Feature.
- AC-PLAN-1: Generate plan atomically prepares the exact bilingual brief and Feature-linked proposed Spec skeletons before prompting the Agent and never writes an approval record.
- AC-PLAN-2: The Agent is asked only to fill registered files, and workflow advances only from validated registered artifacts rather than assistant claims or unregistered writes.
- AC-MIGRATE-1: Legacy ids remain compatible and can change only through a developer-confirmed preview that lists every affected artifact, reference, child, collision, and approval consequence.
- AC-MIGRATE-2: Migration revalidates hashes, is recoverable on failure, updates the complete identity set, and invalidates rather than transfers prior approval.
- AC-SAFETY-1: All artifact preparation and migration paths are repository-relative, remain below their configured roots, reject traversal and collisions, and use stale-write protection.
- AC-APPROVAL-1: When Web is unavailable, the CLI can approve only an explicitly supplied Feature id and exact current combined bilingual review hash with `--yes`, using the same atomic record and stale-hash rejection as Web.
- AC-DOCS-1: The bilingual Product brief, public documentation, architecture, Feature map, and tests describe the shipped identity and artifact workflow with separate language files.
- AC-VERSION-1: Package, Host, and browser client versions are `0.14.0`.

## Verification

- AC-ID-1: test: `tests/features.test.js`, `tests/spec-workspace.test.js`, `tests/client-runtime.test.js`
- AC-ID-2: test: `tests/features.test.js`, `tests/web-api.test.js`, `tests/spec-workspace.test.js`
- AC-ARTIFACT-1: test: `tests/artifacts.test.js`, `tests/web-api.test.js`, `tests/workflow.test.js`
- AC-ARTIFACT-2: test: `tests/artifacts.test.js`, `tests/spec-workspace.test.js`, `tests/workflow.test.js`
- AC-PLAN-1: test: `tests/web-api.test.js`, `tests/workflow.test.js`, `tests/specs.test.js`, `tests/docs.test.js`
- AC-PLAN-2: test: `tests/client-runtime.test.js`, `tests/workflow.test.js`, `tests/reviewer.test.js`
- AC-MIGRATE-1: test: `tests/artifacts.test.js`, `tests/web-api.test.js`, `tests/features.test.js`
- AC-MIGRATE-2: test: `tests/artifacts.test.js`, `tests/web-api.test.js`, `tests/workflow.test.js`
- AC-SAFETY-1: test: `tests/artifacts.test.js`, `tests/web-api.test.js`, `tests/project-root.test.js`
- AC-APPROVAL-1: test: `tests/workflow.test.js`, `tests/web-api.test.js`, `tests/cli-approval.test.js`
- AC-DOCS-1: command: `node lib/cli.js docs check --cwd .`, command: `node lib/cli.js scan --all --cwd .`
- AC-VERSION-1: test: `tests/client.test.js`, `tests/dsh-compatibility.test.js`
- command: `npm.cmd test`
- command: `npm.cmd run lint:js`
- command: `npm.cmd pack --dry-run --json --cache <temporary-cache>`

## Consequences

Encoding creation ancestry into an immutable flat id means later reparenting requires migration rather than a metadata-only edit. Host preparation creates visible skeleton files before AI content is ready, so the UI must distinguish `prepared` from `review-ready`. The general DSH Agent retains its normal tool capabilities; the security invariant is that only Host-registered artifacts can advance Blueprint workflow, not that the model process is filesystem-sandboxed. Atomic multi-file behavior on Windows must use recoverable staging and rollback without assuming POSIX rename semantics.
