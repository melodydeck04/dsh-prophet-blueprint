# 规格：Host 管理的功能工件工作流

状态：已实现
功能：web-dashboard

## 问题

Blueprint 已经为功能说明提供确定的读取路径，但创建功能时仍允许 `1` 这类弱 ID，规划 prompt 也仍要求通用 DSH Agent 创建或寻找文件。模型可能自创一个基于标题的文件名、写入未登记的同级文件，或者在 dashboard 当前功能指向其他位置时仍报告成功。加强 prompt 可以降低偏移概率，但不能把工件身份变成产品不变量。

功能显示名称、父子关系、规范 ID、文件路径、双语对应文件、生命周期 Spec 和审批记录之间也缺少一个共享解析器。浏览器会重建部分路径，工作流则从文件内容推断其他路径。因此重命名或重新挂接上级时，没有一份统一预览能列出全部受影响工件，历史纯数字 ID 也没有受控的规范化路径。

## 范围

- 允许：`lib/artifacts.js`
- 允许：`lib/client.js`
- 允许：`lib/cli.js`
- 允许：`lib/web-api.js`
- 允许：`lib/features.js`
- 允许：`lib/specs.js`
- 允许：`lib/workflow.js`
- 允许：`lib/path-utils.js`
- 允许：`lib/docs.js`
- 允许：`lib/index.js`
- 允许：`lib/init.js`
- 允许：`lib/version.js`
- 允许：`tests/**`
- 允许：`package.json`
- 允许：`AGENTS.md`
- 允许：`DESIGN.md`
- 允许：`README.md`
- 允许：`README.zh.md`
- 允许：`README.i18n.yaml`
- 允许：`docs/user/features/**`
- 允许：`.blueprint/features/**`
- 允许：`.specs/**`

## 决策

### 稳定的功能身份

新建功能不再直接填写自由格式 ID，而是明确填写显示名称、上级功能和本地键。Host 只能通过确定性的 ASCII slug 规则建议本地键。非 ASCII 名称不得自动进行语义翻译；开发者必须提供并确认符合 `[a-z][a-z0-9-]*` 的小写 ASCII 本地键。新建功能禁止使用纯数字键。

顶层功能的规范 ID 等于本地键；子功能的规范 ID 为 `<parent-id>--<local-key>`。双连字符分隔符会记录创建时的上级关系，但不引入嵌套目录，从而保留开发者拥有的扁平 `.blueprint/features` 功能地图和明确的 `Parent:` 关系。创建页面在保存前预览 ID 和每一个工件路径。完成工件准备后，ID 不可变；修改显示名称不会重命名文件，重新挂接上级必须使用下述迁移工作流。

### 由 Host 统一管理工件解析

新增一个 Host 端解析器，作为功能工件身份的唯一所有者。给定规范功能 ID 和工作流状态，它返回以下内容的结构化描述：

- `.blueprint/features/<feature-id>.md`；
- `docs/user/features/<feature-id>.md`、`.zh.md` 和 `.i18n.yaml`；
- `.specs/proposed/<feature-id>.md` 与 `.zh.md`，或对应生命周期位置；
- `.blueprint/approvals/<feature-id>.json`。

dashboard API 返回这份描述，并包含存在性、语言、生命周期和当前哈希事实。浏览器代码只渲染描述，不再重建、搜索或模糊匹配路径。工作流就绪状态和审批选择只认可描述中登记的文件；名称相似的游离文件仍是普通未关联文档。

### 在 AI 规划前准备工件

“生成开发方案”会先使用功能 ID 和预期功能哈希调用同源 Host 操作。Host 验证当前身份、检查所有目标冲突，并以一个可恢复操作创建中英文功能说明和 proposed Spec 骨架。英文 Spec 骨架包含 `Status: proposed`、`Feature: <feature-id>`、机器可读 Scope 和稳定的验收/验证占位；语言切换链接和文档标题由 Blueprint 创建，不由模型创建。该操作绝不创建或修改审批记录。

只有准备成功后，Blueprint 才向 DSH Agent 发送 prompt。prompt 提供不可变工件描述，并要求模型填写既有文件，而不是选择或创建路径。只有已登记文件通过生命周期、双语结构和内容检查，方案才算完成；Agent 声称完成或写入描述之外的文件都不能推进工作流状态。得到明确授权后，现有独立审核助手也只能编辑这些已登记的 proposed 工件。即使当前 DSH Agent 仍保留普通通用工具面，这也能建立由 Host 管理的身份。

### 绑定哈希的 CLI 审批回退

Blueprint Web 仍然是开发者直接审批的首选界面。如果 Web 无法打开，开发者可以运行 `design-blueprint approve <feature-id> --spec-hash <sha256> --yes`，通过 CLI 调用同一个 Host 审批操作。命令要求明确提供功能 ID、当前可见的中英文 Spec 组合审核哈希以及确认标志；缺少参数、格式错误、哈希过期、功能不存在或存在多个 proposed Spec 时都会拒绝执行，也不会通过模糊名称选择方案。审批记录继续使用既有原子写入逻辑。AI 只有在同一任务中获得开发者明确授权“通过 CLI 审批并继续”时才能代为调用该命令，绝不能拼装、手写或修改审批记录。

### 明确的历史身份迁移

现有 ID 继续可读，不会自动重命名。纯数字或由开发者主动选择的历史功能会显示“规范化身份”操作。开发者提供或确认本地键和目标上级。在修改前，Host 返回精确迁移预览，列出功能定义、功能说明三件套、Spec 配对及其生命周期位置、子功能 `Parent:` 引用、必须文档引用和审批影响。

确认时会重新验证源哈希和目标不存在，然后以一个可恢复操作更新路径和引用。任何失败都保留原身份为权威。由于 Feature 头和组合 Spec 内容会变化，迁移会使原审批失效，绝不会静默沿用。开发者必须重新审核并批准迁移后的 proposed Spec。AI 无权发起或确认迁移。

### 版本和迁移边界

该工作流以 `0.14.0` 交付。现有功能文件和历史 Spec 名称继续兼容；确定性命名只应用于新功能和明确迁移。初始化模板和功能表单会解释新的名称/上级/本地键契约，但不会为现有仓库虚构产品层级。

## 其他方案

**每次加载都直接从显示名称生成文件名。** 不采用，因为显示名称可以本地化和修改；改标签会静默改变身份。

**让 LLM 把中文名称翻译为英文 slug。** 不采用，因为模型输出不确定，会让文件身份依赖 prompt 和模型版本。

**使用嵌套目录表达层级。** 不采用，因为仓库明确要求功能文件直接位于配置的功能根目录；`Parent:` 继续作为层级权威。

**规范文件缺失时搜索相似文件名。** 不采用，因为模糊关联可能连接无关内容，还会隐藏错误写入。

**升级时自动重命名所有历史功能。** 不采用，因为路径变化会影响链接、子级关系、Spec 和审批，必须经过开发者明确审阅的迁移。

## 验收条件

- AC-ID-1：新建功能必须填写名称、上级和由开发者确认的 ASCII 本地键；拒绝纯数字键，非 ASCII 名称绝不能由 AI 进行语义翻译。
- AC-ID-2：顶层 ID 等于本地键，子功能 ID 等于 `<parent-id>--<local-key>`；保存前显示完整路径预览；已准备身份不能通过普通名称或上级编辑改变。
- AC-ARTIFACT-1：一个 Host 解析器返回规范的功能定义、功能说明三件套、生命周期 Spec 配对和审批路径，并包含存在性、语言、生命周期和哈希事实。
- AC-ARTIFACT-2：浏览器和工作流使用 Host 描述，不在客户端重建或模糊搜索；名称相似的游离文件永远不能满足当前功能。
- AC-PLAN-1：生成方案会在提示 Agent 前原子准备精确的双语功能说明和 Feature 关联 proposed Spec 骨架，而且绝不写入审批记录。
- AC-PLAN-2：Agent 只被要求填写已登记文件；工作流只能由验证通过的登记工件推进，不能由助手声明或未登记写入推进。
- AC-MIGRATE-1：历史 ID 保持兼容，只能通过开发者确认的预览进行修改；预览列出全部受影响工件、引用、子级、冲突和审批后果。
- AC-MIGRATE-2：迁移会重新验证哈希，失败时可恢复，更新完整身份集合，并使旧审批失效而不是转移审批。
- AC-SAFETY-1：所有工件准备和迁移路径都是项目相对路径，位于配置根目录以内，拒绝遍历和冲突，并使用陈旧写入保护。
- AC-DOCS-1：双语功能说明、公开文档、架构、功能地图和测试使用独立语言文件描述已交付的身份与工件工作流。
- AC-VERSION-1：包、Host 和浏览器客户端版本均为 `0.14.0`。

## 验证

- AC-ID-1：测试 `tests/features.test.js`、`tests/spec-workspace.test.js`、`tests/client-runtime.test.js`
- AC-ID-2：测试 `tests/features.test.js`、`tests/web-api.test.js`、`tests/spec-workspace.test.js`
- AC-ARTIFACT-1：测试 `tests/artifacts.test.js`、`tests/web-api.test.js`、`tests/workflow.test.js`
- AC-ARTIFACT-2：测试 `tests/artifacts.test.js`、`tests/spec-workspace.test.js`、`tests/workflow.test.js`
- AC-PLAN-1：测试 `tests/web-api.test.js`、`tests/workflow.test.js`、`tests/specs.test.js`、`tests/docs.test.js`
- AC-PLAN-2：测试 `tests/client-runtime.test.js`、`tests/workflow.test.js`、`tests/reviewer.test.js`
- AC-MIGRATE-1：测试 `tests/artifacts.test.js`、`tests/web-api.test.js`、`tests/features.test.js`
- AC-MIGRATE-2：测试 `tests/artifacts.test.js`、`tests/web-api.test.js`、`tests/workflow.test.js`
- AC-SAFETY-1：测试 `tests/artifacts.test.js`、`tests/web-api.test.js`、`tests/project-root.test.js`
- AC-DOCS-1：命令 `node lib/cli.js docs check --cwd .`，命令 `node lib/cli.js scan --all --cwd .`
- AC-VERSION-1：测试 `tests/client.test.js`、`tests/dsh-compatibility.test.js`
- 命令：`npm.cmd test`
- 命令：`npm.cmd run lint:js`
- 命令：`npm.cmd pack --dry-run --json --cache <temporary-cache>`

## CLI 回退验收补充

- AC-APPROVAL-1：Web 不可用时，CLI 只有在明确提供功能 ID、当前中英文组合审核哈希和 `--yes` 后才能审批，并与 Web 使用相同的原子记录及过期哈希拒绝机制。
- AC-APPROVAL-1 验证：测试 `tests/workflow.test.js`、`tests/web-api.test.js`、`tests/cli-approval.test.js`。

## 后果

把创建时的上级关系编码进不可变的扁平 ID，意味着后续重新挂接上级必须执行迁移，而不能只改元数据。Host 会在 AI 内容准备完成前创建可见骨架文件，因此 UI 必须区分“已准备”和“可审核”。通用 DSH Agent 仍保留普通工具能力；安全不变量是只有 Host 登记工件才能推进 Blueprint 工作流，而不是模型进程受到文件系统沙箱隔离。Windows 上的多文件原子行为必须使用可恢复暂存和回滚，不能假设 POSIX 重命名语义。
