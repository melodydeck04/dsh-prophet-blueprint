# 规格：Chat 活动流与稳定审核会话

状态：已实现

## 问题

Spec 助手目前会把 DSH 对话压平为用户正文和助手正文，只流式读取 `kind: text` 内容。因此 DSH Chat 已经在展示思考摘要、工具调用、文件修改和子 Agent 活动时，右侧仍只显示笼统的“正在生成”。审核会话身份还包含精确 Spec 哈希；助手一旦成功直接修改文件，自己的会话就立即被判为旧版本，下一条消息会创建另一个会话。

Web dashboard 功能已经有一份英文的 Feature 关联生命周期 Spec，但没有中文对应文件。虽然新的双语功能说明已经存在，“开发 Spec”的语言切换仍无法为当前功能显示真实中文文件。

## 范围

- 允许：`lib/client.js`
- 允许：`lib/version.js`
- 允许：`tests/**`
- 允许：`package.json`
- 允许：`DESIGN.md`
- 允许：`README.md`
- 允许：`README.zh.md`
- 允许：`README.i18n.yaml`
- 允许：`docs/user/features/**`
- 允许：`.blueprint/features/web-dashboard.md`
- 允许：`.specs/**`

## 决策

把 DSH 公开的对话活动投影到 Spec 助手中，不再丢弃非正文块。DSH 已公开的思考摘要、工具调用、文件修改、子 Agent 或任务活动按时间顺序显示为紧凑活动卡；最终 Markdown 正文继续使用 `MarkdownText` 流式渲染。绝不编造或暴露隐藏思维链，只显示 DSH Session 快照已经提供给界面的字段。

让审核会话身份稳定绑定项目、功能和审核协议，不再把会变化的 Spec 审阅哈希放进本地存储键或 Session 标题。直接修改文件后只刷新文档，原对话继续连接。页面保留明确的“新建对话”操作；每次提交仍附带最新上下文，使复用的 Session 能看到最新文件。

为 Web dashboard 现有的 Feature 关联 implemented Spec 增加中文对应文件，使“开发 Spec”能够切换真实的中英文文件。插件版本升级为 `0.13.0`。

## 其他方案

**继续只显示运行提示，直到回答正文出现。** 不采用，因为它隐藏了助手仍在工作的具体原因。

**直接渲染原始快照 JSON。** 不采用，因为它不可读、不稳定，而且可能显示 DSH Chat 并不视为界面内容的字段。

**保留按哈希分裂的会话，并把旧消息复制到每个新会话。** 不采用，因为这会割裂同一次编辑对话，并重复每次消息已经携带的上下文。

## 验证

- 活动条件一/二/三：`tests/dsh-compatibility.test.js` 覆盖已完成思考、流式思考和正文、文件修改、运行中子 Agent 与未知数据安全处理；`tests/reviewer.test.js` 固定活动界面。
- 会话条件一/二：`tests/client-runtime.test.js` 证明 Spec 哈希变化后仍复用同一 Session，并提交最新 Spec 正文；`tests/reviewer.test.js` 和 `tests/spec-workspace.test.js` 固定稳定身份与明确重置操作。
- 双语界面条件一：`tests/specs.test.js` 加载真实 Web dashboard Feature 关联中英文 Spec，并验证英文主文件不含中文正文。
- 版本条件一：`tests/client.test.js` 和 `tests/dsh-compatibility.test.js` 固定插件 `0.13.0` 与 DSH `0.1.1-rc.2`。
- `npm.cmd test` 通过全部 40 项测试。
- `npm.cmd run lint:js` 通过全部已声明的 JavaScript 语法检查。
- `node lib/cli.js docs check --cwd .` 确认全部 4 组双语文档。
- `node lib/cli.js scan --all --cwd .` 在生命周期归档前报告 0 个必须问题和 0 个建议问题。
- `npm.cmd pack --dry-run --json --cache <temporary-cache>` 包含活动感知客户端和两个语言文件。

## 后果

Spec 助手现在会显示具体进度，不再只有笼统运行提示；成功直接编辑也不会割裂自己的对话。Web dashboard 功能能够显示真正单一语言的中英文 Spec 配对。DSH 活动块仍是预览阶段契约，因此投影采用防御性读取，并保留只显示正文的回退。稳定 Session 会积累更长历史，需要时可通过明确的“新建对话”建立干净边界。
