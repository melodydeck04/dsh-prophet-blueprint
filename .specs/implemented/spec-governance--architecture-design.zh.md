# 规格：架构设计工作区与模型

状态：已实现
功能：spec-governance--architecture-design

## 问题

Blueprint 当前把开发者拥有的 Feature 层级呈现为项目结构图，但这棵树只能表达一种无类型的 `Parent` 关系，无法区分产品能力包含、软件组成、运行时依赖、部署、插件边界和源码所有权。当前规范 Feature 身份还会编码父级，因此重新挂接父级可能重命名 Feature、后代节点、功能说明、Spec 和审批引用，即使变化的只是概念位置。在这棵树旁边增加面向架构的聊天，只会产生缺少持久可审核模型的建议，并继续混淆产品结构与软件结构。

## 范围

- 允许：`lib/config.js`
- 允许：`lib/architecture.js`
- 允许：`lib/features.js`
- 允许：`lib/artifacts.js`
- 允许：`lib/workflow.js`
- 允许：`lib/scan.js`
- 允许：`lib/web-api.js`
- 允许：`lib/client.js`
- 允许：`lib/index.js`
- 允许：`lib/version.js`
- 允许：`tests/**`
- 允许：`.blueprint/architecture/**`
- 允许：`.blueprint/features/**`
- 允许：`.specs/**`
- 允许：`docs/user/features/**`
- 允许：`design-blueprint.json`
- 允许：`DESIGN.md`
- 允许：`README.md`
- 允许：`README.zh.md`
- 允许：`README.i18n.yaml`
- 允许：`package.json`
- 禁止：`.blueprint/approvals/**`
- 禁止：`LICENSE`

## 决策

### 分离权威模型

把当前“项目结构”展示改名为“功能图”，并把它的 `Parent` 边限定为产品能力包含。新增可配置的架构根目录，其中由开发者拥有的组件记录使用稳定 ID，并声明组件种类、可选容器、部署单元、拥有的源码路径、提供的契约、类型化依赖、支持的 Feature ID、必需文档和生命周期状态。包含关系必须无环；引用、关系类型、Feature 映射、部署标识和源码路径都必须经过验证。Feature 与组件的分配是多对多关系，不会改变任一方身份。

`DESIGN.md` 继续作为面向人的当前架构与组件所有权权威。机器可读组件目录负责图身份与拓扑；生命周期 Spec 负责变更理由和备选方案。扫描器检查对应关系，但不会尝试从源码树推断架构或 Feature 边界。

### 稳定身份与可变位置

对于新创建的 Feature 和架构组件，把稳定身份与层级解耦。经确认且全局唯一的 ASCII 键成为不可变 Feature ID，而 `Parent` 保持为可单独修改的引用。重新挂接稳定 Feature 时，只更新关系，不重命名其工件路径或后代节点。现有层级式及其他旧 ID 继续可读，永远不会自动重命名；任何可选规范化仍需开发者确认预览，并使受影响审批失效。组件 ID 遵循相同的稳定规则，而 `Container` 变化只改变图中位置。

### 架构设计工作区

在“优化 Spec”和“功能图”旁边增加第三个 Blueprint 主工作区“架构设计”。首期支持逻辑组件图和提议变更叠加图。图中区分包含关系与类型化依赖边，可以选择规范组件详情，并展示部署、提供的契约、源码所有权、支持的 Feature、文档状态和验证问题。选择 Feature 时突出所有已分配组件；选择组件时突出所有受支持 Feature。

架构变化采用乐观并发的预览与应用边界。预览列出每个组件和 Feature 映射的新增、更新或删除，每条变化的类型化边，路径所有权冲突，受影响接口与部署单元，旧身份影响，文档变化和审批失效。应用操作重新计算预览，并且只写入已登记的 Feature 规划和架构工件。来源过期、引用无效、冲突、路径所有权歧义、环或差异扩张时，操作必须失败关闭。

### 独立架构助手

为每个项目和协议创建专用架构审核 Session，并与开发对话及 Spec 审核助手分开。每次提交都携带经过分隔的当前 Feature 记录、组件记录、`DESIGN.md`、相关清单、公共契约、已批准决策摘要、选中的 Feature 或组件，以及开发者提案。仓库材料被视为不可信上下文，而不是指令。

独立 Session 是持久化与隔离机制，不是另一个面向用户的聊天目的地。`ArchitectureAssistant` 会在“架构设计”工作区内嵌展示与 Spec 审核助手相同的已完成消息、流式 Markdown、思考摘要、工具活动、错误、取消、滚动跟随和对话恢复。创建或重新打开后台 Session 时不得替换 Blueprint 视图，也不得要求开发者转到其他聊天继续操作。由于当前 DSH 创建契约不支持隐藏或指定父 Session，Blueprint 会通过官方 Workspace API 立即归档后台 Session。归档后的后台 Session 保留持久日志，并且仍可由内嵌助手寻址，但不会出现在普通 Workspace 或 Ungrouped 分组界面中。重新打开旧的未归档架构 Session 时，也必须先将其归档。

助手必须区分仓库事实、推断、假设和开发者决定。回复需要覆盖产品位置、组件分配、类型化关系变化、接口与数据影响、部署与插件边界、源码所有权、兼容性与迁移影响、至少一个可行备选方案，以及尚未解决的用户可见或业务边界问题。它可以建议扩展现有组件、新增内部组件、新增平级服务或新增插件，但页面或依赖本身不能作为新增插件的依据。

助手首先生成结构化的变更前后提案。只有开发者的明确操作可以把精确的当前提案应用到已登记架构记录，并同步与 Feature 关联的中英文功能说明和 proposed Spec。助手不能编辑实现文件、把生命周期文档移动到 implemented、写入审批记录或自行批准结果。任何已应用的 Spec 变化都会通过现有精确哈希工作流使旧审批失效。

### 当前架构与公共契约

实现阶段更新 `DESIGN.md` 中最终形成的组件所有权和权威边界，更新双语 README 契约与中英文功能说明，在适当位置导出架构解析器，并保持包内容与 DSH 客户端集成准确。这项功能仍属于现有 Design Blueprint 插件。除非后续经审核设计建立了独立的宿主扩展生命周期，否则创建可单独安装的插件不在本提案范围内。

## 其他方案

**在没有新模型的情况下向现有 Feature 图增加架构聊天。** 不采用，因为建议不会拥有稳定组件 ID、类型化边、源码所有权或确定性的变更前后差异。

**把 Feature 层级当成软件架构。** 不采用，因为产品包含关系是一棵树，而组件分配与运行时依赖是类型化多对多图。

**把 `DESIGN.md` 解析成完整机器权威。** 不采用，因为自由格式架构理由对人有价值，但不能安全支持乐观并发、图验证或精确变更目标。

**继续在每个新 Feature ID 中编码父级。** 不采用，因为可变产品关系不应该强制迁移工件和后代身份。

**立即创建独立架构插件。** 不采用，因为这项能力扩展 Blueprint 现有的治理、Web 客户端、Host API 和审批工作流；目前没有建立独立安装或生命周期边界。

## 验收标准

- AC-ARCH-10：创建或重新打开架构助手 Session 时，“架构设计”工作区保持选中，对话只通过内嵌助手呈现；后台 Session 会被归档，因此不会继续出现在普通 Workspace 或 Ungrouped 聊天分组中，同时其持久历史仍可恢复。

## 验证

- AC-ARCH-1：`tests/architecture.test.js`、`tests/config.test.js`
- AC-ARCH-2：`tests/features.test.js`、`tests/artifacts.test.js`、`tests/workflow.test.js`
- AC-ARCH-3：`tests/client.test.js`、`tests/client-runtime.test.js`
- AC-ARCH-4：`tests/client.test.js`、`tests/architecture.test.js`
- AC-ARCH-5：`tests/web-api.test.js`、`tests/architecture.test.js`
- AC-ARCH-6：`tests/architecture-reviewer.test.js`、`tests/client-runtime.test.js`；内嵌历史、流式 Markdown、活动投影、滚动跟随，以及不跳转到外部聊天
- AC-ARCH-7：`tests/architecture-reviewer.test.js`、`tests/web-api.test.js`、`tests/staged-policy.test.js`
- AC-ARCH-8：`tests/scan.test.js`、`tests/staged-policy.test.js`、命令 `node lib/cli.js scan --all --cwd .`
- AC-ARCH-9：`tests/plugin.test.js`、命令 `node lib/cli.js docs check --cwd .`、命令 `npm.cmd test`、命令 `npm.cmd run lint:js`
- AC-ARCH-10：`tests/architecture-reviewer.test.js`；新建和恢复的后台 Session 在使用前都会通过注入的 DSH Workspace 服务归档

## 后果

开发者现在可以借助一个稳定且可审计的模型，把产品能力位置与软件组件、依赖、部署和源码所有权设计区分开。功能图与架构设计工作区共享同一套稳定的组件与 Feature 身份，身份在 `Parent` 和 `Container` 变化时保持不变，因此挂接讨论不会重命名文档、后代节点或审批。架构助手把分析建立在当前仓库事实之上，在保留独立且已归档、不会进入普通 Workspace 与 Ungrouped 分组的后台 Session 的同时，把完整对话持续内嵌在架构工作区中，并且无法自行批准结果；每项架构变化仍然要求开发者操作，并复用保护 Spec 生命周期的同一套精确哈希审批工作流。

提议范围较大，可以分阶段推进内部里程碑，但任何 Scope 拆分或行为缩减都必须在代码变化前更新并重新批准本 Spec。架构 Session 仍受当前 DSH Agent 能力面的提示约束，因此精确写入端点、乐观并发、审批失效和扫描器执行仍然必要。密集组件图如果缺少过滤和有界布局，可能难以阅读；类型化路径所有权可能暴露现有重叠，需要采用策略而不是自动修复。
