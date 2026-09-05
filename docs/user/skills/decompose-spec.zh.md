# `decompose-spec`

[English](decompose-spec.md) | 中文

检测超出分解阈值的 Spec,返回违规列表和一行建议。**只读**。

## 它做什么

跑 `lib/skills/backing-modules.js#decomposeSpec` 上的 `decomposeSpec`,作用于引用的 Spec 路径,返回 `{ ok, violations, suggestion }`。不写盘,不拆 Spec,不新建 Spec。函数加载 Spec 内容,套用项目 `design-blueprint.json` 里的 `decomposition` 阈值,报告 Spec 违反哪条规则。

## 何时用它

- 用户问"这个 Spec 是不是太大了"、"这个 Spec 超预算了吗"、"这个 Spec 能装在一个 Feature 里吗"。
- 用户在 Spec 语境下提到 `decompose`,不是 feature 分解。
- 模型即将对一份可能违反框架 REQ / Scope path / 行数限制的 Spec 调 `blueprint_dispatch refine`,想先快速检查一下。
- 模型在审一份 Spec,想要阈值报告再推荐动作。
- 用户打 `/decompose-spec` 后跟一个 Spec 路径。

## 常见问题

**这个 Skill 是 model-invocable 吗?** 是。Skill 不带 `disable-model-invocation`,runtime 目录把它暴露给模型。DSH agent 在任务契合时可以自己触发(比如准备调 `blueprint_dispatch refine` 之前)。Skill 也 user-invocable:人可以打 `/decompose-spec`。

**`decompose-spec` 会改写 Spec 吗?** 不会。它返回一份结构化报告。用户拥有改写权;模型建议在哪里拆,用户决定。

**`suggestion` 长什么样?** 一行推荐,比如"在 REQ-X..REQ-Y 处把 Spec 拆成一个新的子 Spec"。当 `ok` 为 true,`violations` 为空,`suggestion` 为 null。

**检查哪些阈值?** 当前数字在 `design-blueprint.json#decomposition`。缺省值(万一这一节没有的话)是 8 REQ、5 scope path、1500 行。低于这些数就算过。

**Spec 路径错了怎么办?** Skill 正文告诉模型默认取最近被改过的 proposed Spec。如果模型选错文件,结果还是干净返回 `ok: false` 加 `path-not-found` 违规,不会抛错。

## 它在工作的标志

- 结果含 `ok`、`violations`、`suggestion` 三个键。
- `ok` 为 false 时,`violations` 列出 Spec 违反的每条规则(REQ 数、scope path 数、行数)。
- Spec 太大时,`suggestion` 点名要抽出的具体 REQ 范围。
- Skill 正文不写任何东西:`.specs/` 下没新文件,`.todos.yaml` 没改,verification 记录没动。
- 用户能直接读结果,决定是 refine Spec 还是拆 Spec。

## 参考

- 源码:`skills/decompose-spec/SKILL.md`
- Backing 模块:`lib/skills/backing-modules.js#decomposeSpec`
- 审核:`design-blueprint skills info decompose-spec`
- Feature brief:`docs/user/features/agent-interface--skills-layer.md`
