# `todo-status`

[English](todo-status.md) | 中文

返回一份 Spec 的当前 TODO 列表和判定,不写任何东西。**只读**。

## 它做什么

加载引用 Spec 的 `.todos.yaml` 加当前会话最近的 `task` 和 `done` 事件,返回一份简短结构化摘要:TODO 表(id、摘要、状态)、判定(哪些 AC 通过、哪些失败、哪些待定)、segment 字节计数。不改 `.todos.yaml`,不发出事件,不动任何任务。函数是 `lib/skills/backing-modules.js#todoStatus` 的 `todoStatus`。

## 何时用它

- 用户问"到哪了"、"做完了什么"、"还有什么没做"、"这份 Spec 进度怎么样"。
- 用户提到 `TODO list`、`进度`、`AC 通过数`,或问一份 Spec 有多少 AC 通过了。
- 模型即将推荐一份 Spec 的下一步动作,想要当前快照而不是凭对话历史猜。
- 模型在审当前会话的 TODO 状态,想要和人类操作员看到一样的快照。
- 用户打 `/todo-status` 后跟一个 Spec 路径。

## 常见问题

**这个 Skill 是 model-invocable 吗?** 是。Skill 不带 `disable-model-invocation`,runtime 目录把它暴露给模型。DSH agent 在任务契合时可以自己触发(比如准备推荐下一个任务之前)。Skill 也 user-invocable:人可以打 `/todo-status`。

**`todo-status` 会把任务标完成吗?** 不会。它只读。标完成要走 `design-blueprint todo mark <spec> <task-id>`,或通过 `blueprint_dispatch` 触发工作流。

**"判定"是什么意思?** 判定是在已有证据链的 AC 上跑 `evaluateSpec` 的结果。没有证据的 AC 报为 `pending`。判定不走完整的 verification 流程,只是便宜读。

**Spec 还没建 `.todos.yaml` 怎么办?** Skill 返回空 TODO 表 + 全部 AC 判为 `pending`,加一行提示指向 `design-blueprint todo init <spec>`。不抛错。

**最近的 `task` 和 `done` 事件从哪来?** 从当前会话的事件流,通过 `lib/todo-events.js#locateSessionPath` 限定。路径不可写(硬化系统)时,harness 绕到 `.blueprint-test-tmp`;Skill 两种情况都处理。

## 它在工作的标志

- 结果含 TODO 表(空也行)、判定、segment 字节计数。
- 判定按 AC id 报每个 AC 的当前状态(`pass` / `fail` / `pending`)。
- 没发新事件;调用前后会话的事件计数没变。
- Skill 正文不写 `.todos.yaml` 也不写别处。
- 用户能反复打 `/todo-status`,中间没干活的话结果一致。

## 参考

- 源码:`skills/todo-status/SKILL.md`
- Backing 模块:`lib/skills/backing-modules.js#todoStatus`
- 审核:`design-blueprint skills info todo-status`
- Feature brief:`docs/user/features/agent-interface--skills-layer.md`
