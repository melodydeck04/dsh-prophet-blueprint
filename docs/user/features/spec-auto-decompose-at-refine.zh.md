# Refine 时强制 Spec 自动分解

[English](spec-auto-decompose-at-refine.md) | 中文

## 实现什么

当助手的 `applyAssistantSpecPatch` 即将产出的 English Spec 在 REQ 数、scope path 数或行数上越过 `design-blueprint scan` 强制阈值(`maxReq: 8`、`maxScopePaths: 5`、`maxLines: 1500`)时,框架现在在 **任何 temp-file rename 之前**就拒绝 patch,并抛结构化 `SPEC_TOO_BIG_FOR_REFINEMENT` 错误。助手必须重写一份 parent + sub-Specs 的 patch,而不是一份超大初稿。

阈值放在 `design-blueprint.json` 的 `decomposition.{maxReq,maxScopePaths,maxLines}` 下,让维护者一处调整,refine、scan、CLI 三处一起生效。

## 最终效果

- `applyAssistantSpecPatch` 和 `previewAssistantSpecPatch` 在结果 English Spec 越过阈值时都抛 `Error`,`.code === "SPEC_TOO_BIG_FOR_REFINEMENT"`。
- 错误携带 `.thresholds`、`.observed`、`.suggestion`、`.violations`,助手和 Web 面板都能渲染有用的提示。
- 抛错发生在 `applyAssistantSpecPatch` 的任何 temp-file rename 之前,原原 Spec文件保持不变。
- REQ 数恰好等于 `maxReq` 时通过闸(阈值用 `>` 不是 `>=`)。

## 怎么使用

这是框架层的闸,开发者不直接调用。闸触发后,助手应该调 `design-blueprint spec decompose <spec.md>` 查看建议的拆法,然后把 patch 重写为 parent + sub-Specs 一组。

## 配套

- 第 2 阶段的 `lib/spec-decomposition.js` 提供检测器和模板构造器。
- `lib/spec-decomposition.js` 和 `design-blueprint scan --all` 共享同一份 `config.decomposition` 阈值,所以改一次 `design-blueprint.json` 就能同步所有管道。
- Web 仪表盘的 `assistant-spec-preview` action 会在闸触发时把结构化字段透出,所以 Web 面板能在 refine 表面渲染消息。