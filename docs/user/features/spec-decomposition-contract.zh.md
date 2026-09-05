# Spec 分解契约

[English](spec-decomposition-contract.md) | 中文

## 实现什么

`design-blueprint spec explain <spec.md>` 与 `design-blueprint spec decompose <spec.md>` 判断一份 proposed Spec 是否对单个开发 session 来说过粗，并在确认后给开发者一份结构 patch，把 Spec 拆成一份 parent 加 N 份 bounded sub-Spec。

检测器观察三个信号：

| 信号 | 来源 | 默认阈值 | 可调字段 |
| --- | --- | --- | --- |
| `REQ-*` 数量 | Spec body 上的正则 | > 8 | `design-blueprint.json` 的 `decomposition.maxReq` |
| `## Scope` allow-list 大小 | `### Allowed paths` 下的子条目 | > 5 个独立 glob | `decomposition.maxScopePaths` |
| 行数 | `content.split('\n').length` | > 1500 | `decomposition.maxLines` |

`design-blueprint scan --all` 现在也会对每一份超出阈值的 proposed Spec 输出 `decomposition-contract` issue。略超阈值是 `recommended`，翻倍以上是 `required`。

分解模板在 `<spec>.decomposition/` 下写一份 `parent.md` 加 N 份 `sub-N.md`。parent 保留完整 Scope 并列出所有 sub-Spec；每份 sub-Spec 自带收窄后的 Scope、自己的 REQ 范围、留给开发者填的占位结构。

## 最终效果

跑完新命令后，开发者可以：

- `design-blueprint spec explain --spec .specs/proposed/foo.md` — 打印一行摘要、观测值、提议分解。
- `design-blueprint spec decompose --spec .specs/proposed/foo.md [--out <dir>] [--force]` — 写出 parent + N 份 sub-Spec patch。
- `design-blueprint scan --all` — 对超大的 proposed Spec 输出 `decomposition-contract` issue。

新模块位于 `lib/spec-decomposition.js`，被 `lib/scan.js` 与 `lib/cli.js` 消费。本包没有新增运行期依赖。

## 怎么使用

1. 检查可疑 Spec：
   ```bash
   design-blueprint spec explain --spec .specs/proposed/auto-verification.md
   ```
2. 写出分解 patch（默认输出目录为 `<spec>.decomposition/`）：
   ```bash
   design-blueprint spec decompose --spec .specs/proposed/auto-verification.md
   ```
3. 审阅 `.specs/proposed/auto-verification.decomposition/` 下的 patch，把它们合并回原 Spec 并按列出的路径创建 sub-Spec 文件。

`design-blueprint.json` 里的调优示例：

```json
{
  "decomposition": { "maxReq": 12, "maxScopePaths": 8, "maxLines": 2000 }
}
```

## 配套

本 Spec 依赖第 1 阶段的持久 TODO 列表：分解模板产出的每份 sub-Spec 都带一个 `TODO list: <parent>.todos.yaml` 指针，由开发者按第 1 阶段同样的方式人手创建。
