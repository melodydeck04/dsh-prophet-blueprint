# Spec: Repository publication hygiene

Status: implemented

## Problem

The workspace was not a Git repository and had no ignore policy for local dependencies, build outputs, editor state, environment credentials, or operating-system artifacts. A small number of historical verification notes also recorded machine-specific absolute paths. Publishing the workspace without a reviewed boundary could disclose local computer information or accidentally add generated and secret-bearing files later.

## Scope

- allow: `.gitignore`
- deny: `.dsh/**`
- deny: `.blueprint/**`
- deny: `LICENSE`

## Decision

A conservative Node/DSH `.gitignore` excludes dependency trees, generated outputs, coverage, caches, logs, local environment and package-manager credentials, editor metadata, operating-system artifacts, temporary files, archives, and common private-key filenames. Project-owned `.dsh/skills`, Blueprint Feature/Spec records, documentation, source, and tests remain eligible for version control.

Machine-specific absolute paths in historical lifecycle evidence were replaced with equivalent repository-independent descriptions before Git history was created. The complete candidate text inventory was reviewed for home/workspace paths, common private-key headers, GitHub and service-token patterns, cloud access-key patterns, bearer credentials, and common personal-email providers. No matching personal or credential material remains in the candidate snapshot. Git uses a `main` branch and repository-local GitHub noreply author metadata instead of inheriting a potentially personal global email. The exact developer-provided SSH URL is the only `origin`; pushes must not use force and must stop when the remote is missing, inaccessible, or contains conflicting history.

## Alternatives considered

**Ignore the entire `.dsh` directory.** Rejected because this package intentionally ships project-local DSH Skills.

**Commit first and remove sensitive material later.** Rejected because deletion in a later commit would leave the original material in Git history.

**Use a force push without inspecting the remote.** Rejected because the remote may already contain developer-owned history.

## Verification

- AC-PUBLISH-1: `.gitignore` and the complete candidate Git file list were reviewed; product-owned `.dsh`, `.blueprint`, source, documentation, and tests remain included.
- AC-PUBLISH-2: the versioned-text privacy inventory reports no machine-specific home/workspace path, private key, access token, common cloud credential, bearer credential, or personal-email pattern.
- AC-PUBLISH-3: local Git configuration uses `main`, the exact SSH `origin`, and repository-local `melodydeck04@users.noreply.github.com` author metadata. A non-interactive read using the explicitly configured `melodydeck04` SSH identity successfully reached the remote and returned no refs, confirming an empty repository before the first push.

## Consequences

The first Git commit can be created without retaining the removed local paths in repository history, and common future local artifacts are excluded by default. The ignore policy deliberately does not hide project-owned DSH Skills or Blueprint governance records. GitHub access must continue to select the configured repository-specific SSH identity; the default SSH identity may address a different account. Tests, lint, and Blueprint scan remain developer-run because the developer explicitly requested that this publication task not execute them.
