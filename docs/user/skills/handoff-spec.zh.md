# `handoff-spec`

[English](handoff-spec.md) | 中文

写一份 Spec 生命周期状态的可移植 Markdown 摘要,让一个新的 agent 能接手。**写一个文件**。

## 它做什么

把引用 Spec 路径的状态渲染成可移植 Markdown 交接文档,写到 `os.tmpdir()`(运行时解析到硬化文件系统时绕到 `.blueprint-test-tmp`)。Skill 调 `lib/skills/backing-modules.js#writeHandoffDoc` 的 `writeHandoffDoc`。产物是一份 Markdown 文件,包含:Spec 当前的 `Status`、生命周期阶段、REQ 列表、Scope 摘要、AC 表、`.blueprint/verifications/<feature-id>.json` 里的最近 attempt 摘要(若有)、下一步动作推荐。新 agent 读这份文件就能接手,不用看之前的对话历史。

## 何时用它

- 模型即将压缩会话、结束会话、或交给新 agent,想要 Spec 生命周期状态的可移植快照。
- 用户打 `/handoff-spec` 后跟 Spec 路径。
- 用户问"给我写份交接"、"给我能贴进新 agent 的东西"、"我要一份能接手的快照"。
- 会话快压缩或快结束,用户想让下一个 agent 干净地接手。

## 常见问题

**这个 Skill 是 model-invocable 吗?** 是。Skill 不带 `disable-model-invocation`,runtime 目录把它暴露给模型。DSH agent 在任务契合时可以自己触发(比如准备推荐会话压缩之前)。Skill 也 user-invocable:人可以打 `/handoff-spec`。

**文件去哪了?** `os.tmpdir()` 下用稳定文件名:`<spec-basename>-handoff-<timestamp>.md`。Skill 正文告诉模型把绝对路径打印出来,用户能直接复制。

**路径会被拒吗?** 硬化系统上 `os.tmpdir()` 可能只读。Skill 经 `lib/todo-events.js#locateSessionPath` 绕到 `.blueprint-test-tmp`,这个分支已处理沙箱情况。用户最终看到实际路径。

**交接含实现吗?** 不含。交接只覆盖 Spec 生命周期状态。实现文件(`lib/`、`tests/` 等)在工作树里,不被复制进交接。交接列出 Spec 的 Scope,让新 agent 知道去哪查。

**交接替代 Spec 吗?** 不替代。交接是快照,不是真理源。`.specs/proposed/<name>.md`(或 `.specs/implemented/<name>.md`)仍是规范 artifact。交接内容在 Spec 之后被编辑时会过时;重跑 Skill 刷新。

**交接可审计吗?** 交接文件是纯 Markdown。用户能 `cat`、diff、`git add`。它本身不在源树里;运行时不会自动 stage。

## 它在工作的标志

- 一份 Markdown 文件出现在打印的绝对路径。
- 文件含 Spec 当前的 `Status`、REQ 列表、AC 表,以及任何 verification 记录摘要。
- 文件足够小,能贴进新聊天(几屏,不是整个源树)。
- 用户能在另一个 agent 里 `cat` 文件,无需进一步上下文就能接着干。
- 重跑 `/handoff-spec` 产生新文件(时间戳不同),内容刷新。

## 参考

- 源码:`skills/handoff-spec/SKILL.md`
- Backing 模块:`lib/skills/backing-modules.js#writeHandoffDoc`
- 审核:`design-blueprint skills info handoff-spec`
- Feature brief:`docs/user/features/agent-interface--skills-layer.md`
