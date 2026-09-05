# TODO 完成时的实时 compact 提醒

[English](todo-live-compact-hint.md) | 中文

## 实现什么

`design-blueprint todo mark <id> done --spec <spec.md>` 现在在写完 `task/done` 事件后,会立刻打印一行提醒,告诉开发者自上一条 `task/done`(或自 session 起始)以来累积了多少字节。字节总数越过 diagnostics 包所用的同一阈值时,该行会建议 `/compact`。

第二个子命令 `design-blueprint todo status --spec <spec.md>` 会读 `session.jsonl`,呈现最近的 `task/done` 事件、字节 delta、与 `compact-boundaries-missed` 对齐的结论 emoji。

## 最终效果

- `design-blueprint todo mark T1 done --spec .specs/proposed/foo.md` 写 `task/done` 事件,且当字节总数越过 1 MiB 时打印 `Compaction hint: <X> MiB accumulated since last task/done. Type /compact before continuing.`。
- 4 MiB 字节总数触发同一行并加 ` 🟡 Compact now.`。
- 低于阈值的字节总数不打印提醒行。
- 找不到 `session.jsonl` 时,在 stderr 打印 `Compaction hint: skipped (no session.jsonl at <path>).`。
- `design-blueprint todo status --spec <spec.md>` 打印:
  ```
  Spec: .specs/proposed/foo.md
  Counts: pending=0 in-progress=1 done=0
  Recent task/done events:
    - T3 AC-FOO-3 @ 2026-... Author foo
    - T2 AC-FOO-2 @ 2026-... Wire foo
  Segment bytes since prior task/done: 412.00 KiB 🟢 (green)
  ```
- `todo status --json` 以 JSON 对象返回同样的数据。

## 怎么使用

1. 标记任务 done 顺便看到提醒:
   ```bash
   design-blueprint todo mark T1 done --spec .specs/proposed/foo.md
   ```
2. 任何时候查看字节 delta:
   ```bash
   design-blueprint todo status --spec .specs/proposed/foo.md
   ```
3. 把 JSON 输出接进 watcher:
   ```bash
   design-blueprint todo status --spec .specs/proposed/foo.md --json | jq -r .verdict
   ```

## 配套

本规格依赖第 1 阶段的持久 TODO 列表(`lib/todo-store.js` 与 `lib/todo-events.js`)和 diagnostics 包的 `compact-boundaries-missed` 阈值(`blueprint-diagnostics/lib/thresholds.js`)。它是 diagnostics `## Compact boundaries` 段的实时兄弟:那一段是事后告诉,本规格在下一字节落地**之前**告诉你。