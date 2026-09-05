# 持久 TODO 列表

[English](persistent-todo-list.md) | 中文

## 实现什么

`@dsh-plugins/design-blueprint todo <list|show|mark>` 管理一份结构化 TODO 列表,以纯 YAML 形式挂在 Spec 旁边。YAML 是跨 session 与跨 compact 的事实源;每次 `mark done` 会写一条 `task/done` 事件到 `session.jsonl`,让其它工具(尤其是 `@dsh-plugins/design-blueprint-diagnostics audit`)能识别自然 compact 边界。

加入本程序的 Spec 携带一份兄弟文件 `.specs/<feature>/<spec>.todos.yaml`。文件起头由人手编写,后续 Spec 可以由 refinement packet 自动生成。YAML schema 固定为 `version: 1`,由 CLI 校验;任何违规都让操作失败,而不是静默损坏状态。

## 最终效果

跑完新命令后,开发者可以:

- `design-blueprint todo list --spec <spec.md>` — 打印一张 Markdown 表,列出每条 TODO 的 `id`、`status`、`req`、`ac`、`title`。
- `design-blueprint todo show <id> --spec <spec.md>` — 打印单条。
- `design-blueprint todo mark <id> done --spec <spec.md> --session-id <id>` — 把新状态写回 YAML,设置 `doneAt` / `doneBy`,追加一条 `task/status` 事件和一条 `task/done` 事件到 `session.jsonl`。

同一份 YAML 跨 session、跨 `/compact` 都能存活,因为它就是磁盘上的一个文件。运行期镜像只是信息提示,文件才是权威。

## 怎么使用

每个参与 Spec 一次性创建文件,然后用 CLI 管理:

1. 人手写第一份 YAML,例如:
   ```yaml
   version: 1
   spec: .specs/proposed/my-feature.md
   createdAt: 2026-09-02T15:00:00Z
   createdBy: session-abc
   todos:
     - id: T1
       status: pending
       req: REQ-MF-1
       ac: AC-MF-001
       title: implement the core (T1)
   ```
2. 标记进度:
   ```bash
   design-blueprint todo mark T1 in-progress --spec .specs/proposed/my-feature.md
   design-blueprint todo mark T1 done --spec .specs/proposed/my-feature.md --session-id $(cat .dsh/session-id)
   ```
3. 查看:
   ```bash
   design-blueprint todo list --spec .specs/proposed/my-feature.md
   ```

CLI 拒绝把 TODO 切到 `{pending, in-progress, done}` 之外的状态,也会拒绝重复 mark `done`(第二次调用是 no-op,不写事件)。校验失败时一次性列出所有违规。

## 配套诊断

`@dsh-plugins/design-blueprint-diagnostics audit <session.jsonl>` 读 `task/done` 事件,在 Markdown 报告里渲染 `## Compact boundaries` 段。该段会输出每次 session 的 `totalMissedSavingsBytes` 与逐边界表;完整字段见 `docs/diagnostics/README.md`。
