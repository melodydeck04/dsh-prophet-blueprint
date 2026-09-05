# `verify-feature`

[English](verify-feature.md) | 中文

对一个 Feature 跑 verification 流程,按 Feature 打印 AC 通过/失败。**写一条 verification 记录**。

## 它做什么

对一个 Feature id 跑三步 verification 流程:`startFeatureVerification` → `submitFeatureVerificationResult` → `completeVerifiedFeature`(对历史实现是 `requestLegacyFeatureVerification`)。Skill 调 `lib/skills/backing-modules.js#verifyFeature` 的 `verifyFeature`,再导出框架已有的 verification orchestration。Skill 在 `.blueprint/verifications/<feature-id>.json` 写恰好一条 verification 记录,返回 AC 通过/失败表。

## 何时用它

- 模型判定一份 Feature 的实现周期已经累积足够证据,想在推荐下一份 Spec 或下一个开发任务之前让框架评估它。
- 用户打 `/verify-feature` 加 Feature id。
- 用户问"这份 Feature 通过了吗"、"所有 AC 都绿吗"、"什么卡住这份 Feature"。
- 一份 Spec 的实现工作刚落地,人或 agent 想让框架评估一下。

## 常见问题

**这个 Skill 是 model-invocable 吗?** 是。Skill 不带 `disable-model-invocation`,runtime 目录把它暴露给模型。DSH agent 在任务契合时可以自己触发(比如实现完一份 Spec 后,推荐下一份之前)。Skill 也 user-invocable:人可以打 `/verify-feature`。"人在回路"的检查不由 Skill 的 invocation policy 强制;那是 agent 的责任 — 在宣告 Feature 完成前,把 `severity: required` 的 finding 转给用户看。

**backing module 实际写什么?** 一个文件:`.blueprint/verifications/<feature-id>.json`。Skill 正文不写别处。Skill 正文把这点写明,模型就能决定要不要调这个 Skill 或推荐别的动作。

**Feature 还没 approved Spec 怎么办?** 框架以 `feature '<id>' requires at least one valid non-deprecated Component owner before approval` 拒绝请求。Skill 正文原样转述这个错误,不瞎猜默认值。

**跑两次会怎样?** 框架的 verification 流程在 active cycle 上幂等。第二次调用看到记录里有上一次 attempt,如果上一次结果一致就直接 `idempotent: true`,不做新工作。

**历史 Feature(没有 active cycle)怎么办?** Skill 正文绕到 `requestLegacyFeatureVerification`,处理生命周期漂移的实现(它们的 Spec 状态是 `implemented` 但 verification 记录从来没开过)。对用户的输出一致。

## 它在工作的标志

- 一条 verification 记录出现在 `.blueprint/verifications/<feature-id>.json`,`stage: completed`。
- 结果按 Feature 打印 AC 通过/失败表,按 AC id 点名。
- `severity: required` 的 finding 原样给用户。
- 用户能立刻再打 `/verify-feature`,得到 `idempotent: true`(第二次没新工作)。
- 这份 Feature 的 `.blueprint/features/<feature-id>.md` 的 `Acceptance` 节跟 verification 记录的判定一致。

## 参考

- 源码:`skills/verify-feature/SKILL.md`
- Backing 模块:`lib/skills/backing-modules.js#verifyFeature`
- 审核:`design-blueprint skills info verify-feature`
- Feature brief:`docs/user/features/agent-interface--skills-layer.md`
