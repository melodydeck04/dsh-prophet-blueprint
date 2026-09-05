# Refine-time Spec auto-decomposition gate

English | [中文](spec-auto-decompose-at-refine.zh.md)

## What it does

When the assistant's `applyAssistantSpecPatch` would produce an English Spec whose REQ count, scope-path count, or line count exceeds the same thresholds that `design-blueprint scan` enforces (`maxReq: 8`, `maxScopePaths: 5`, `maxLines: 1500`), the framework now refuses the patch **before** any temp-file rename and throws a structured `SPEC_TOO_BIG_FOR_REFINEMENT` error. The assistant is forced to re-draft a parent + sub-Specs patch instead of writing a single oversized draft.

The threshold values live in `design-blueprint.json` under `decomposition.{maxReq,maxScopePaths,maxLines}` so a maintainer can tune them once for refine, scan, and CLI.

## Expected result

- `applyAssistantSpecPatch` and `previewAssistantSpecPatch` both throw `Error` with `.code === "SPEC_TOO_BIG_FOR_REFINEMENT"` when the resulting English Spec crosses a threshold.
- The error carries `.thresholds`, `.observed`, `.suggestion`, and `.violations` so the assistant and the Web dashboard can both render a useful message.
- The throw happens before any temp-file rename in `applyAssistantSpecPatch`; the original Spec file on disk is unchanged.
- A Spec whose REQ count is exactly at `maxReq` passes the gate (the threshold is `>` not `>=`).

## How to use

This is a framework-level gate; the developer does not invoke it directly. After the gate fires, the assistant is expected to call `design-blueprint spec decompose <spec.md>` to inspect the suggested split, then re-draft the patch as a parent + sub-Specs set.

## Companion

- `lib/spec-decomposition.js` (Phase 2) provides the detector and template builder.
- `lib/spec-decomposition.js` and `design-blueprint scan --all` share the same `config.decomposition` thresholds, so a single `design-blueprint.json` edit retunes the whole pipeline.
- The Web dashboard's `assistant-spec-preview` action surfaces the structured fields when the gate fires, so the Web panel can render the message in the refine surface.