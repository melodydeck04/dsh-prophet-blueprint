# `architect-feature`

[English](architect-feature.md) | 中文

在架构与 Feature 设计活动中自动触发。提议按模块对齐的 Spec 分解方案。**只读**。

## 它做什么

当开发者处于架构设计工作中——添加新 Feature、决定模块边界、把超预算 Spec 拆成子 Spec、修订结构接缝——Skill 通过 DSH 读工具直接读父 Feature brief、当前 active proposed Spec、以及 `.blueprint/features/**`,按实现模块族提议一份分解方案:

- **artifact I/O** —— `lib/specs.js`、`lib/features.js`、`lib/artifacts.js`、`lib/architecture.js`、`lib/docs.js` 加 `.specs/**`、`.blueprint/features/**`、`.blueprint/architecture/**`
- **refinement engine** —— `lib/orchestration.js`、`lib/workflow.js`、`lib/config.js`、`lib/assistant-actions.js`、`lib/chat-commands.js`
- **truth & verification** —— `lib/scan.js`、`lib/snapshot.js`、`lib/verification.js`、`lib/reconciliation.js`、`lib/project-binding.js`
- **surface & plugin entry** —— `lib/web-api.js`、`lib/client.js`、`lib/index.js`、`lib/version.js`、`design-blueprint.json`、`cordis.patch.yml`
- **user-facing docs** —— `DESIGN.md`、`README.md`、`README.zh.md`、`README.i18n.yaml`、`docs/user/features/<id>.{md,zh.md,i18n.yaml}`

输出是一份 Markdown 预览,列出提议的子 Spec 标题、Scope 路径列表、继承的 REQ 分布。Skill 不写任何文件到磁盘。开发者接受、修改或拒绝。

## 何时用它

- 开发者贴入超预算 Spec(Scope > 8 路径)并问"我应该怎么拆?"。
- 开发者正在决定模块边界、分解 Spec、或按实现模块命名子 Spec。
- 开发者正在提出新 Feature 层级,想要结构草图。
- 开发者敲 `/architect-feature` 强制做结构评审。

模型根据 `description:` 自动触发。运营者也可以敲 `/architect-feature` 强制触发。两个面都启用。

## 常见问题

**这个 Skill 是 model-invocable 吗?** 是。Skill 不带 `disable-model-invocation` 标志,runtime 目录把它暴露给模型。DSH agent 在开发者任务契合结构设计时机时自己触发。

**Skill 会写仓库吗?** 不写。Skill 输出 Markdown 提议。文件移动由开发者拥有。

**Skill 调 `blueprint_dispatch refine` 吗?** 不调。Refinement 是开发者在接受、修改或拒绝提议之后的决定。

**Skill 会串另一个 Skill 吗?** 不会。它不调 `grill-spec`、`decompose-spec` 或任何其他 Skill。它直接通过 DSH 读工具读文件。

**有 backing module 函数吗?** 没有。Skill 正文是唯一契约。没有 `lib/skills/backing-modules.js#architectFeature` 导出。模型在 Skill 正文里直接读仓库文件并推理。

**如果 active proposed Spec 已经在 8 路径阈值内呢?** Skill 说出来并建议收紧 Scope 而不是拆分。它不会在不需要的时候硬拆。

## 它在工作的标志

- 开发者提到模块边界、分解、或"我应该先规划吗?"时,Skill 在开发者不敲 `/architect-feature` 的情况下自动触发。
- Skill 在目录里以 `modelInvocable: true` 和 `userInvocable: true` 出现。
- 输出 Markdown 预览每个模块族列一个子 Spec,Scope 路径数不超过 8。
- 预览的子 Spec 标题遵循 `<parent-feature-id>--<module-family-slug>.md` 命名约定。
- 预览分别展示跨 Feature 影响,而不是静默虚构层级。
- Skill 不写任何文件。开发者决定写什么、在哪里调 `blueprint_dispatch refine`。

## 参考

- 源码:`skills/architect-feature/SKILL.md`
- Backing 模块:无(Skill 正文是契约)
- 审核:`design-blueprint skills info architect-feature`
- Feature brief:`docs/user/features/agent-interface--skills-layer.md`