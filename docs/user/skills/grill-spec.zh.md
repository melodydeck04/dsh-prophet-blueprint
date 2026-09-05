# `grill-spec`

[English](grill-spec.md) | 中文

在 `blueprint_dispatch refine` 被调之前,带开发者过一遍 Spec 细化问题。**有状态**。

## 它做什么

对引用的 Spec 路径跑四道门访谈(`lib/skills/backing-modules.js#grillSpecInterview` 的 `grillSpecInterview`)。Skill 在每个会话里带一份内存中的访谈状态:默认值、持久性、表面、Scope、风险。每道门解析为 `set` / `skip` / `default` 三种之一。在每道门都解析之前,Skill 拒绝调 `blueprint_dispatch refine`,或者开发者用 `skip` 显式跳过一道门并记下理由。

## 何时用它

- 模型即将对一份 Spec 调 `blueprint_dispatch refine`,想先把默认值、持久性、表面、Scope、风险定下来;Skill 充当结构化热身。
- 用户打 `/grill-spec` 后跟 Spec 路径(或不带路径,默认 grill 最近被改过的 proposed Spec)。
- 用户问"在我 refine 之前能不能带我过一遍问题"、"我想在细化这份 Spec 之前先想清楚"、"refine 之前我该先定什么"。
- 用户刚开一份新 proposed Spec,想在写正文之前确认默认值、持久性、表面、Scope、风险五道门都过了。

### 自动触发上下文(model-invocable)

Skill 在开发者处于设计工作中时也会自动触发,无需用户敲 `/grill-spec`。模型识别四种上下文:

1. 开发者说自己即将设计新 Feature、搭 Feature brief、或提出新子 Spec。
2. 开发者描述的变更触到架构边界(模块归属、公共契约、持久化、部署、权限、迁移、并发)。
3. 开发者贴入超预算 Spec 并问如何拆分。
4. 开发者问"我应该先规划吗?"或"scope 是什么?"在 refine 之前。

每种自动触发上下文里,模型都把四道门一次出一道,等开发者的回答。Skill 永远不自己瞎猜默认值。

## 常见问题

**这个 Skill 是 model-invocable 吗?** 是。Skill 不带 `disable-model-invocation`,runtime 目录把它暴露给模型。DSH agent 在任务契合时可以自己触发(比如准备推荐 `blueprint_dispatch refine` 之前)。Skill 也 user-invocable:人可以打 `/grill-spec`。访谈都等人输入;模型触发 Skill,但在继续前会等开发者的回答。

**模型触发的话,为什么 Skill 还要等人输入?** 因为访谈没有开发者的回答走不完。Skill 正文告诉模型把每道门一次出一道,等输入。跑 `grill-spec` 的模型必须把控制权交回给开发者答每道门;backing module 自己不瞎猜默认值。

**`set` vs `default` vs `skip` 是啥意思?** `set` 是开发者给了一个覆盖默认的值。`default` 是开发者接受了框架的默认值。`skip` 是开发者显式跳过这道门,Skill 把理由记进访谈状态。

**`set` 之后能重 grill 吗?** 能。访谈状态在会话里,开发者能重新打开任一道门、改答案、再跑。每次重 grill 写一次状态转换,带原答案和新答案。

**Skill 会写 Spec 吗?** 不写。Skill 只写访谈状态。实际的 Spec 编辑在 `blueprint_dispatch refine` 跑之后(或独立于它,以访谈状态作为指引)。

**`blueprint_dispatch refine` 看到什么?** 如果开发者把访谈状态挂到 Spec 上,它看到最近一份访谈状态。框架不强制开发者先用 `grill-spec`;Skill 是热身,不是门。

## 它在工作的标志

- Skill 一道门一道门打印(默认值、持久性、表面、Scope、风险),框架默认值可见。
- 每道门把开发者的答案(`set` / `default` / `skip`)记进会话内状态。
- 每道门都 `set` / `default` / 显式 `skip`(带理由)之前,Skill 拒绝调 `blueprint_dispatch refine`。
- 最终状态打印时,列出每道门的解析和所有 `skip` 的理由。
- 访谈过程中 Spec 本身没动过。
- Skill 在目录里以 `modelInvocable: true` 和 `userInvocable: true` 出现,模型在设计活动(新 Feature、架构边界、超预算 Spec 分解、"plan first" 问题)上自动触发,无需开发者敲 `/grill-spec`。

## 参考

- 源码:`skills/grill-spec/SKILL.md`
- Backing 模块:`lib/skills/backing-modules.js#grillSpecInterview`
- 审核:`design-blueprint skills info grill-spec`
- Feature brief:`docs/user/features/agent-interface--skills-layer.md`
