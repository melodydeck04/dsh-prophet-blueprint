# Feature 切换时自动 compact

[English](auto-compact-on-unrelated-task-done.md) | 中文

## 它做什么

框架代替开发者在 Feature 级别边界调度 DSH 的 `/compact` slash command。当 `design-blueprint todo mark <id> --spec <path> done` 写一条 `task/done` 事件,它的 `data.spec` 归属 Feature 与上一条 `task/done` 不同,且自上一条 `task/done` 以来累计字节 ≥ 200 KiB 时,框架触发一次 DSH `/compact`,并往 `session.jsonl` 写一条 `compact/auto-fired` 事件供 diagnostics 包归因。

200 KiB 字节下限天然限速:成功 compact 总结对话让字节归零,下一次自动 compact 又要再攒 200 KiB,这是天然最小成本底线。

调度走人手敲 `/compact` 的同一条文档化路径,fire-and-forget。框架不调私有 composer API,不走平行路由。

## 什么时候用它

你在一个 DSH session 里跨多个 Feature 工作,想让上下文窗口在跨 Feature 边界时自动重置,而不是每次手动敲 `/compact`。

触发器是事件驱动的(`task/done`);没有周期性后台扫,空闲时不 compact。

## 常见问题

**为什么不是每次 `task/done` 都触发?** 第一轮细化提议:任何 `task/done` 的 `data.req` / `data.ac` 跟当前 active Feature 的 REQ/AC 集合不重叠时,框架就替你 compact 一次。这个信号粒度太细:跨两个 Feature 干 4 个子任务就会 auto-compact 4-6 次,适得其反。**Feature** 级别的信号只在边界触发一次,不在每个子任务触发。

**为什么是 200 KiB 下限?** 开发者改一个文档 typo 顺手 mark done,不该触发重型 summarize-and-replace 操作。200 KiB 是最小成本底线。

**为什么没有冷却?** 200 KiB 字节下限天然限速。成功 compact 总结对话让字节归零,下一次 auto-compact 又要再攒 200 KiB。

**如果上一条 `task/done` 缺了或没 `data.spec` 呢?** 触发器是 no-op。框架绝不从缺失数据虚构 Feature。

**如果 DSH profile 没暴露 slash-command 调度面呢?** 框架在启动时打一次性 warn,本次 session 降级为 no-op。开发者必须升级 DSH baseline 或钉一个已知良好版本,本 Feature 才能发布。

## 它有效时你会看到

- 在 Feature 切换且累计 > 200 KiB 时,`design-blueprint todo mark <id> --spec <path> done` 在 stdout 打印 `Auto-compact: fired (feature-switch: <from> -> <to>, <n.n> MiB accumulated).`。
- 在同一 Spec 上 mark done 打印 `Auto-compact: skipped (same feature as previous: <featureId>).`。
- 在 Feature 切换但累计 < 200 KiB 时打印 `Auto-compact: skipped (under threshold: <n> bytes < 200 KiB).`。
- 在全新 `session.jsonl` 的第一条 `task/done` 打印 `Auto-compact: skipped (no previous task).`。
- 成功触发后,`session.jsonl` 出现一条 `compact/auto-fired` 事件,字段 `{ reason: "feature-switch", previousFeatureId, currentFeatureId, bytesSincePreviousTaskDone }`。
- 调度失败路径打印 `Auto-compact: failed (<message>).` 到 stdout,`task/done` 事件保留在 `session.jsonl`。
- 旧的 `Compaction hint: <n> MiB accumulated ...` 行不再由 `todo mark done` 发出。
