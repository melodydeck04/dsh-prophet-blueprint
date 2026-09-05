# Blueprint 会话诊断

[English](README.md) | 中文

`@dsh-plugins/design-blueprint-diagnostics` 是一个离线 CLI，读取 DSH `session.jsonl` 导出，呈现主要浪费类别：token、retry、compaction、tool-result、reasoning 体量。

## 安装

包以 `@dsh-plugins/design-blueprint` 的同级包形式发布。在 design-blueprint 仓库内：

```
node blueprint-diagnostics/bin/blueprint-diagnostics.js audit path/to/session.jsonl
```

也可以装到 `PATH` 方便使用：

```
npm link blueprint-diagnostics/
```

## 命令

### `audit <session.jsonl> [--json <out>]`

打印一份 Markdown 报告描述一个 session。可选地把结构化 JSON sidecar 写到 `<out>`，方便后续对比。

### `compare <a.jsonl> <b.jsonl> [--label-a <l>] [--label-b <l>]`

打印一份 Markdown 表，逐 turn 对比两份 session。差异超过 10% 的行用 ⚠ 标记。

## 结论色

每次审计以三色之一结尾。阈值编码在 `lib/thresholds.js`：

- 🟢 绿 — 没有观测维度越过黄线
- 🟡 黄 — 至少一个维度越过它的黄线
- 🔴 红 — 至少一个维度越过它的红线

主因线是红线阈值最大的那条，因此一个大维度上的单个红色结论压过几个小维度上的黄色结论。

## Compact boundaries 段

如果 session 含至少一条 `task/done` 事件（通常由 `@dsh-plugins/design-blueprint todo mark ... done` 写入），报告会在 `## Turn durations` 与 `## Top largest events` 之间追加 `## Compact boundaries` 段。该段列出每个边界及其段字节总数，以及开发者在没敲 `/compact` 之前累积的持续时间。段首的 `missed compact savings` 是这些段的总和，作为额外一个结论维度（`compact-boundaries-missed`）；默认阈值 `yellowAt: 1 MiB`、`redAt: 4 MiB`。零 `task/done` 事件的 session 渲染该段为 `(no task/done events in this session; nothing to bound)`，保证老导出仍可干净审计。

## 审计不做的事

审计是只读的。它从不打开网络套接字，从不读取 JSONL 参数以外的文件，从不写（可选的 `--json` 目标除外），也从不与 DSH 运行期通信。审计推荐的改动属于独立的 host plugin Feature 提案。
