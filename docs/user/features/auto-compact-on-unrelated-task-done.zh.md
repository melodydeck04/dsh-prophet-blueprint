# Feature 切换时自动 compact

[English](auto-compact-on-unrelated-task-done.md) | 中文

## 它做什么

框架在 Feature 级边界替开发者调起 DSH 的 `/compact` slash command。当 `design-blueprint todo mark <id> --spec <path> done` 写一条 `data.spec` 归属 Feature 与上一条 `task/done` 不同的 `task/done` 事件,且自上一条 `task/done` 以来累计字节 ≥ 200 KiB,框架调一次 DSH 的 `/compact`,并写一条 `compact/auto-fired` 事件到 `session.jsonl` 供 diagnostics 包归因。

200 KiB 字节下限天然限速。一次成功 compact 总结对话让字节归零,下一次 auto-compact 又要重新攒 200 KiB,这是天然最小成本底线。

调度是 fire-and-forget。CLI 子进程把 `task/done` 事件写到 `session.jsonl`;plugin cordis 入口装的 host-side watcher(`lib/auto-compact-watcher.js`)在下次 `/blueprint` 调用时观察新事件,跑判定,然后调 `ctx.compaction.compactNow(agent, signal, commandId)` —— 跟人类 `/compact` slash command 在内部用的是同一个 API。chat handler 不会被 compact 阻塞。

## 何时使用

你在同一个 DSH session 里跨多个 Feature 工作,想在 Feature 边界自动重置上下文窗口,不想每次都手动敲 `/compact`。

触发器是事件驱动的(`task/done`);没有周期性后台扫,空闲时也不 compact。watcher 的 tick 是 chat 驱动:每次 `/blueprint` 调用跑一次,拾起 CLI 在同一 session 早些时候写的事件。

## 常见问题

**为什么不在每次 `task/done` 上触发?** 第一轮细化提议:任何 `task/done` 的 `data.req` / `data.ac` 跟当前 active Feature 的 REQ/AC 集合不重叠时,框架就替你 compact 一次。这个信号粒度太细:一个 session 跨两个 Feature 干 4 个子任务就会 auto-compact 4-6 次,适得其反。Feature 级信号每个边界 fire 一次,不是每个子任务。

**为什么是 200 KiB 下限?** 开发者改一个文档 typo 顺手 mark done,不该触发 summarize-and-replace 这种重型操作。200 KiB 是值得花钱的最小成本。

**为什么没有冷却?** 200 KiB 字节下限天然限速触发器。成功 compact 之后字节归零;下一次 auto-compact 又要再攒 200 KiB。

**如果上一条 `task/done` 缺失或没有 `data.spec`?** 触发器是 no-op。框架绝不从缺失数据虚构 Feature。

**`/compact` 是怎么真的被调起来的?** Plugin 的 host-side watcher 调 `ctx.compaction.compactNow(agent, signal, commandId)` —— 跟人类 `/compact` slash command 在内部用的是同一个 API。开发者不需要手动 `/compact`。

**如果我的 DSH profile 没暴露 `ctx.compaction`?** host-side watcher 启动时打一次性 `info` 日志,本次 session 退化为 no-op。CLI 的 `todo mark done` 此时会打印 `Auto-compact: skipped (no DSH slash-command dispatch surface; manual /compact required).`,开发者可以手动敲 `/compact`。本 Feature 完整生效之前,开发者必须升级 DSH baseline 或钉一个已知良好版本。

## 工作判据

- `design-blueprint todo mark <id> --spec <path> done` 在 Feature 切换且 > 200 KiB 累计字节时,CLI 本地打印 `Auto-compact: skipped (no DSH slash-command dispatch surface; manual /compact required).`;下一次 `/blueprint ...` 触发 host-side watcher,用 active session 的 agent 调 `ctx.compaction.compactNow`。
- 同 Feature `task/done` 时,CLI 打印 `Auto-compact: skipped (same feature as previous: <featureId>).`。
- Feature 切换但 < 200 KiB 累计字节时,CLI 打印 `Auto-compact: skipped (under threshold: <n> bytes < 200 KiB).`。
- 全新 `session.jsonl` 的第一条 `task/done` 打印 `Auto-compact: skipped (no previous task).`。
- 一次成功 fire 之后,DSH 的 `/compact` slash command 像手动敲一样解析 —— 上下文窗口缩短,`session.jsonl` 里落一条 `compaction/start` 与一条 `compaction/end`,框架在 `compaction/end` 之后追加一条 `compact/auto-fired`,字段 `{ previousFeatureId, currentFeatureId, bytesSincePreviousTaskDone }`。
- 一次成功 fire 之后,`session.jsonl` 里出现一条 `compact/auto-fired` 事件,字段 `{ reason: "feature-switch", previousFeatureId, currentFeatureId, bytesSincePreviousTaskDone }`。
- 调度失败路径在 stdout 打印 `Auto-compact: failed (<message>).`,`task/done` 事件仍留在 `session.jsonl`。
- 旧 `Compaction hint: <n> MiB accumulated ...` 行不再由 `todo mark done` 发出。
