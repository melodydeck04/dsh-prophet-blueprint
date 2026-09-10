# 规格：确定性工作流阶段工作包

状态：已实现
Feature：workflow-stage-machine

## 问题

Blueprint 会持久化生命周期状态，但模型目前仍只收到通用指引，可能从很长的对话历史中推断出错误的下一步。Host 读取模型只暴露阶段和一条自然语言下一步建议，尚未提供能够约束当前轮次的机器可读工作包。

## 决策

从既有 Host 记录推导当前阶段和有限允许动作，再把同一份不可变工作包暴露给 dispatch、续接和 Web。不得新增第二个生命周期存储或按阶段划分的 Agent。

## 范围

- allow: `.specs/{proposed,implemented}/workflow-stage-machine*.md`
- allow: `.blueprint/features/workflow-stage-machine.md`
- allow: `.blueprint/architecture/components/session-driven-workflow-improvements.md`
- allow: `lib/workflow.js`
- allow: `lib/web-api.js`
- allow: `lib/orchestration.js`
- allow: `lib/index.js`
- allow: `lib/client.js`
- allow: `tests/*stage-machine*.test.js`
- allow: `DESIGN.md`
- allow: `docs/user/features/session-driven-workflow-improvements*`

## 方案

Host 为每个选中的 Feature 推导一份不可变 `workflowContext`：`currentStage`、`allowedActions`、`nextRequiredAction` 和有边界的 `workPackage`。工作包只包含 Feature id、精确活动 Spec 哈希、Scope、映射任务、验证状态和最新阻塞证据。公开状态图为：

`refining → ready → implementing → verifying → completed`，并且在明确修复后允许 `verifying → blocked → implementing`。

`blueprint_dispatch` 在每个会产生写入的动作前读取此上下文；对不在 `allowedActions` 内的动作，在创建持久状态之前拒绝，并在每个结果中返回上下文。插件创建的续接消息会注入精简工作包。系统提示词要求 MiniMax M3 将该工作包作为当前轮权威，而不是根据历史对话猜测阶段。Web 使用同一个 Host 响应展示当前阶段、允许动作和下一必需动作。

该方案使用 DSH 公开的模型工具机制和现有单一 Agent，不增加强制子代理、自定义 Agent loop 或隐藏提示协议。DSH 将子代理定义为可选能力接口；工具目录要求子代理提示词必须自包含，因为 spawn 子代理不继承对话上下文。MiniMax M 系列指南建议提示词使用简短、具体的步骤和受限输出；精简工作包符合该建议。

来源：[DSH 子代理子系统](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subagent.md)、[DSH 工具目录](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-catalog.md)、[MiniMax M 系列提示词指南](https://platform.minimax.io/docs/token-plan/prompting-best-practices)，均于 2026-09-10 核查。

## 备选方案

**只在提示词中说明阶段。** 不采用，因为它无法拒绝无效写入，且会随历史增长。

**每个生命周期阶段使用一个专属 Agent。** 不采用，因为普通开发应留在现有 DSH Chat，状态迁移应由 Host 管理。

## 验收条件

- AC-STAGE-001：Host 为每个 Feature 返回包含 `currentStage`、有限 `allowedActions`、恰好一个 `nextRequiredAction`（completed 为 `null`）和有边界工作包的 `workflowContext`。[surface=api; moment=terminal; evidence=contract-integration]
- AC-STAGE-002：状态图只允许 refining→ready→implementing→verifying→completed 以及 verifying→blocked→implementing；任何 API 或 dispatch 动作都不能跳过无效迁移。[surface=api; moment=terminal; evidence=contract-integration]
- AC-STAGE-003：`blueprint_dispatch` 在持久写入前拒绝未列在当前 Feature `allowedActions` 中的动作，并返回 Host 给出的下一动作。[surface=tool; moment=terminal; evidence=contract-integration]
- AC-STAGE-004：插件创建的续接包含精简工作包中的精确 Feature 和当前 Spec 哈希，且不包含无边界的 Session 历史。[surface=service-background; moment=terminal; evidence=contract-integration]
- AC-STAGE-005：Blueprint Web 渲染 Host 提供的阶段、允许动作和下一必需动作，不从本地阶段名称条件分支推导它们。[surface=web-ui; moment=progressive; evidence=user-visible]
- AC-STAGE-006：MiniMax M3 指引要求模型读取当前工作包并且只执行允许动作。[surface=repository; moment=static; evidence=static-unit]

## 验证

- AC-STAGE-001: test: `tests/workflow-stage-machine.test.js`
- AC-STAGE-002: test: `tests/workflow-stage-machine.test.js`
- AC-STAGE-003: test: `tests/orchestration-stage-machine.test.js`
- AC-STAGE-004: test: `tests/orchestration-stage-machine.test.js`
- AC-STAGE-005: test: `tests/client-stage-machine.test.js`
- AC-STAGE-006: test: `tests/index-stage-machine.test.js`
- 回归：`npm test`、`node lib/cli.js docs check --cwd .`、`node lib/cli.js scan --cwd .`。

## 后果

Host 工作包、dispatch 允许表、续接上下文、Web 展示和 MiniMax 指引均已实现，并由声明的测试覆盖。

## 风险

公开标签会折叠内部验证状态。上下文必须从既有 Host 记录推导，不能成为第二个可写生命周期存储。动作允许表是权限边界，必须明确覆盖旧动作兼容性。

## 任务

1. 从既有工作流和验证记录推导并暴露不可变阶段上下文。
2. 用上下文约束 dispatch 动作，并在工具结果和审批续接中返回它。
3. 在 Blueprint Web 中渲染 Host 上下文，并更新 MiniMax M3 指引。
4. 添加契约、dispatch、续接和客户端测试；同步架构与双语文档。

## 生命周期

- 状态：已实现
- 实现状态：已交付；Feature 级完成仍由验证记录决定。

## 非目标

- 子代理深度、并发、spawn 策略、重试指纹、checkpoint 或 Session 轮换。这些属于第五阶段，需要单独的 Spec。
- SearXNG 调研或连通性行为。
- 替换 DSH 原生工具或 Agent loop。
