# 规格：双语功能说明与开发规格

状态：已实现

## 问题

Blueprint 目前把原始生命周期规格作为功能的第一份、也是唯一一份说明。历史规格使用的语言不统一，有些文件还把中文产品说明和英文机器结构混在一起。开发者在理解功能效果之前就会看到大量实现细节，仓库也没有确定地关联简洁功能说明与正式开发规格。

生命周期加载器还会把 `.specs` 下的每个 Markdown 文件都当成独立规格。普通的 `.zh.md` 中文对应文件会被误判为第二份方案，而且当前审批哈希无法在只修改中文文件时失效。

## 范围

- 允许：`AGENTS.md`
- 允许：`lib/client.js`
- 允许：`lib/index.js`
- 允许：`lib/specs.js`
- 允许：`lib/workflow.js`
- 允许：`lib/web-api.js`
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

每个新规划的功能按顺序拥有两类产物。

第一类是类似 README 的功能说明：英文文件为 `docs/user/features/<feature-id>.md`，简体中文文件为 `docs/user/features/<feature-id>.zh.md`，并使用现有 `.i18n.yaml` 记录审阅结果。两份文件采用相同的四段结构：实现什么、最终效果、怎么使用、注意事项。Blueprint 默认显示中文，并提供明确的英文切换。

第二类是正式生命周期规格。机器解析的英文主文件仍为 `.specs/<lifecycle>/<name>.md`，中文对应文件为 `.specs/<lifecycle>/<name>.zh.md`。生命周期加载器不把 `.zh.md` 当成第二份规格，而是把它关联到英文主文件。规格审阅哈希覆盖两份文件的精确内容，因此任一语言被修改都会使开发者审批失效。历史上的单文件规格在迁移期间仍可读取。

“优化 Spec”工作区先显示“功能说明”，再显示“开发 Spec”，并默认使用中文。页面显示当前语言的真实文件路径，缺少对应文件时明确提示。规划提示先创建功能说明配对，再创建 proposed Spec 配对，不实现代码。独立助手会收到两种语言的功能说明和 Spec；获得明确写入授权后，可以同步编辑当前配对，但每个文件必须保持单一语言。

插件版本升级为 `0.12.0`。

## 其他方案

**继续使用一份双语 Spec。** 不采用，因为产品意图和工程权威仍然混在一起，阅读顺序依旧杂乱。

**只保存中文 Spec。** 不采用，因为部分仓库需要英文工程权威，而且用户明确要求独立的对应语言文件。

**把两个语言文件都当成独立生命周期规格。** 不采用，因为功能工作流选择和审批会产生歧义。

## 验证

- 双语条件一：`tests/specs.test.js` 验证 `.zh.md` 会被关联，而不会被独立解析。
- 双语条件二：`tests/workflow.test.js` 和 `tests/web-api.test.js` 验证组合审阅哈希以及只修改中文时审批失效。
- 双语条件三：`tests/spec-workspace.test.js` 和 `tests/client.test.js` 验证先功能说明、后 Spec 的规划边界。
- 双语条件四：`tests/spec-workspace.test.js` 验证默认中文功能说明和全部文档/语言切换。
- 双语条件五：`tests/reviewer.test.js` 验证四份产物上下文、单一语言规则和自动刷新。
- 双语条件六：`tests/specs.test.js` 和 `tests/spec-workspace.test.js` 验证历史迁移兼容与明确的缺失语言状态。
- 双语条件七：`tests/client.test.js` 验证版本 `0.12.0`；`node lib/cli.js docs check --cwd .` 报告 4 组双语配对全部已确认。
- `npm.cmd test` 通过全部 38 项测试。
- `npm.cmd run lint:js` 通过全部已声明的 JavaScript 语法检查。
- `node lib/cli.js scan --all --cwd .` 在生命周期归档前报告 0 个必须问题和 0 个建议问题。

## 后果

开发者现在会先阅读简洁的中文功能说明，再按需打开工程细节，同时每一份中英文产物都是独立的真实文件。英文生命周期文件仍是机器解析的结构权威，审批绑定双语组合哈希。历史单文件规格仍然兼容，但只有补写中文对应文件后才能获得中文视图。规格在生命周期目录间移动时，必须在同一次变更中移动 `.zh.md` 对应文件。
