# 规格：Agent 执行预算与恢复

状态：拟议
Feature：agent-execution-budgeting

## 问题

长时间 DSH 开发会在同一失败上反复消耗 token，委派工作也可能扩展为缺乏责任边界的嵌套子代理。现有验证记录会保留证据，但不会分类重复运行故障、限制一轮委派，或在上下文过期前产生可复用 checkpoint。

## 范围

- allow: `.specs/{proposed,implemented}/agent-execution-budgeting*.md`
- allow: `.blueprint/features/agent-execution-budgeting.md`
- allow: `.blueprint/architecture/components/session-driven-workflow-improvements.md`
- allow: `lib/execution-governance.js`
- allow: `lib/orchestration.js`
- allow: `lib/index.js`
- allow: `lib/verification.js`
- allow: `tests/*execution-governance*.test.js`
- allow: `DESIGN.md`
- allow: `docs/user/features/session-driven-workflow-improvements*`

## 方案

新增 Host 管理的执行治理模块。它为每轮发放至多三个直接、fresh 的子任务额度；每个请求必须声明一个交付物，拒绝由子任务再发起的委派。模块为每次验证或编排失败记录标准化失败指纹。连续第二次出现同一指纹时，将 Feature 置为 `blocked`，保留证据并给出一个修复动作；限流、server-529、能力缺失与 Spec/权限不匹配分别给出恢复指引，绝不整体重跑验证。

在生命周期边界，Host 写入精简 checkpoint：已完成与未完成任务、已批准的文件变更、检查结果、失败指纹（如有）和下一允许动作。当前 Chat 收到 checkpoint。长会话建议开发者引用该 checkpoint 开启 fresh Session，但绝不自动 fork、恢复或创建另一个 Agent。

DSH 将子代理定义为可选 `ctx.subagents` 接口；spawn 子任务不继承父对话上下文，因此默认使用 fresh、自包含且单一交付物的提示词。DSH 工具目录分别记录后台工作和子任务控制。MiniMax M 系列指南偏好简短、具体指令和受限输出，checkpoint 与子任务提示词结构遵循该建议。

来源：[DSH 子代理子系统](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subagent.md)、[DSH 工具目录](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-catalog.md)、[MiniMax M 系列提示词指南](https://platform.minimax.io/docs/token-plan/prompting-best-practices)，均于 2026-09-10 核查。

## 备选方案

**全局禁止子代理。** 不采用，因为有边界的独立调研或检查可减少父上下文消耗。

**重试每一次验证失败。** 不采用，因为基础设施和权限故障的恢复路径不同于代码故障。

## 验收条件

- AC-BUDGET-001：父轮最多可授权三个直接子任务，每个任务只允许一个必要交付物；拒绝子任务发起的委派。[surface=service-background; moment=terminal; evidence=contract-integration]
- AC-BUDGET-002：默认子任务为 fresh 且自包含；除非记录明确 `requiresParentHistory` 原因，否则拒绝 fork。[surface=service-background; moment=terminal; evidence=contract-integration]
- AC-BUDGET-003：连续两次相同标准化指纹将公开 Feature 状态置为 `blocked`，保留两次观察并提供一个恢复动作。[surface=api; moment=terminal; evidence=contract-integration]
- AC-BUDGET-004：`RATE_LIMIT`、`SERVER_529`、能力缺失和 Spec/权限不匹配各自产生不同恢复指引，且不自动重放所有验证检查。[surface=api; moment=terminal; evidence=contract-integration]
- AC-BUDGET-005：每个生命周期边界产生持久化精简 checkpoint，包含完成工作、剩余工作、改动文件、检查结果、失败证据和下一动作。[surface=repository; moment=terminal; evidence=contract-integration]
- AC-BUDGET-006：MiniMax M3 指引要求每个子任务只有一个交付物、输出有边界，并在重大方向变化时先以 checkpoint 交接 fresh Session。[surface=repository; moment=static; evidence=static-unit]

## 验证

- AC-BUDGET-001: test: `tests/execution-governance.test.js`
- AC-BUDGET-002: test: `tests/execution-governance.test.js`
- AC-BUDGET-003: test: `tests/execution-governance.test.js`
- AC-BUDGET-004: test: `tests/execution-governance.test.js`
- AC-BUDGET-005: test: `tests/execution-governance.test.js`
- AC-BUDGET-006: test: `tests/execution-governance.test.js`

## 风险

治理模块只能观察 DSH 公开服务，不能假定安装了某个子代理 provider；也不能把短暂服务故障转换为代码修复任务。

## 任务

1. 增加有边界的子任务请求校验和失败指纹分类。
2. 将治理接入 dispatch 与验证失败处理，不新增 Agent loop。
3. 持久化并呈现生命周期 checkpoint；加入 MiniMax M3 指引。
4. 添加契约测试并同步设计与双语文档。

## 生命周期

- 状态：拟议
- 验证实现后的目标状态：已实现

## 非目标

- 自动创建 Session、自动 fork/resume 或更改 DSH provider 配置。
- 修改 DSH 原生子代理实现或绕过其工具权限。
