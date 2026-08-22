# Blueprint Spec workspace

English | [中文](web-dashboard.zh.md)

## What it does

The Blueprint workspace gives every feature one developer-confirmed identity before any AI planning begins. The developer enters a display name, selects the parent feature, and confirms a stable local key; the Host derives the canonical Feature id and every Product brief, Spec, and approval path. The AI supplies document content but never chooses, searches for, or attaches filenames.

## Expected result

New root features use the confirmed local key as their id; child features use `<parent-id>--<local-key>`, while hierarchy remains explicit `Parent` metadata in the flat feature catalog. The Host prepares and returns one artifact map containing the exact feature definition, English and Chinese Product briefs, English and Chinese proposed Spec, and approval location. The dashboard reads this map directly, so stray or similarly named files never become the current feature. Existing legacy ids remain readable and can be normalized only through an explicit migration preview.

## How to use

Create a feature by entering its name, choosing its parent, and confirming the suggested local key; a non-ASCII name requires a developer-supplied key instead of AI translation. Review the resulting id and artifact paths, then generate the development plan. Blueprint prepares the paired files before prompting the assistant, and plan completion is recognized only when those registered files are valid. Use the migration action when a legacy numeric or misleading id must change; review every affected path before confirming it.

## Usage notes

Feature ids are immutable after artifact preparation; renaming the display title does not rename files, and reparenting requires the same explicit migration workflow. Purely numeric new ids are rejected. Migration checks collisions, updates descendant identities plus Feature and Spec references recoverably, and invalidates previous approvals instead of carrying them forward. The English lifecycle Spec remains the machine-parsed structural owner, bilingual content still requires review, and implementation cannot start until the developer approves the exact current Spec pair. Blueprint Web is preferred; if it cannot be opened, the developer may explicitly run `design-blueprint approve <feature-id> --spec-hash <sha256> --yes`, which applies the same exact-hash validation and atomic approval write.
