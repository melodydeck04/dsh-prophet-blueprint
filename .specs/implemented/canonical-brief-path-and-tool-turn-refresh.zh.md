# 规格：功能说明规范路径与工具型回合刷新

状态：已实现

## 问题

Blueprint 左栏只会从 `docs/user/features/<feature-id>.md` 及其 `.zh.md` 对应文件读取当前功能的功能说明。但文件尚不存在时，独立审核助手的 prompt 只把路径标成“尚未生成”。负责写文件的 Agent 因此可能自行创造一个看似合理、但不等于当前功能 ID 的文件名；写入虽然成功，左栏却无法发现它。

审核面板目前也只在观察到新的最终助手正文后刷新 dashboard。以文件工具为主的成功回合可能在写入文件后直接结束，并不发布最终助手正文。此时即使文件位于正确路径，左栏仍会保持旧状态，直到开发者手动刷新页面。

## 范围

- 允许：`lib/client.js`
- 允许：`lib/version.js`
- 允许：`tests/**`
- 允许：`package.json`
- 允许：`DESIGN.md`
- 允许：`README.md`
- 允许：`README.zh.md`
- 允许：`README.i18n.yaml`
- 允许：`.specs/**`

## 决策

在浏览器客户端中定义一个辅助函数，按照当前功能 ID 推导精确的中英文功能说明路径。即使文件缺失，也要把规范路径写入审核上下文，并独立标记内容状态；明确要求审核助手不得自创其他名称或位置；左栏缺失态也显示它实际会读取的目标路径。

保留最终助手正文作为提前刷新的信号，同时检测 Session 从运行中变为已结束的状态转换。如果当前提交正在等待刷新，任一信号都只重新加载一次 dashboard。这样既覆盖没有最终正文的工具型成功回合，也保留普通正文回答和手动刷新恢复操作。

版本升级为 `0.13.2`，让包、Host 和浏览器版本能够显示是否已加载修正后的契约。

## 其他方案

**把功能说明移动到功能定义或生命周期 Spec 同级目录。** 不采用，因为 `docs/user/features/` 已经是产品指南的权威位置，dashboard 也按照这个规范位置读取。

**每次写入后在仓库中搜索相似文件名。** 不采用，因为模糊发现会隐藏命名错误，还可能把错误文档关联到当前功能。

**只按定时器刷新。** 不采用，因为轮询会增加不必要的请求，而且仍然没有定义哪个文件属于当前功能。

## 验证

- AC-PATH-1/2：`tests/client-runtime.test.js`、`tests/reviewer.test.js` 和 `tests/spec-workspace.test.js` 验证按照功能 ID 确定的中英文说明路径、缺失态 path 属性、严格的审核助手写入要求，以及左栏显示的精确预期路径。
- AC-REFRESH-1/2：`tests/client-runtime.test.js` 验证从运行中到已结束的状态转换判断；`tests/reviewer.test.js` 和 `tests/spec-workspace.test.js` 固定已提交回合约束、共享的单次刷新辅助逻辑、最终正文信号、Session 结束信号和手动恢复操作。
- AC-VERSION-1：`tests/client.test.js` 固定包和浏览器客户端版本 `0.13.2`；`node lib/cli.js docs check --cwd .` 在 README 语义审阅后确认全部 4 组双语配对。
- `npm.cmd test` 通过全部 43 项测试。
- `npm.cmd run lint:js` 通过所有声明的 JavaScript 语法检查。
- `node lib/cli.js scan --all --cwd .` 在生命周期归档前针对 working-tree 快照报告 0 个必须问题和 0 个建议问题。
- `npm.cmd pack --dry-run --json --cache <temporary-cache>` 生成包含修正客户端与生命周期 Spec 配对的 `0.13.2` 包清单。

## 后果

功能说明继续保存在产品指南的权威目录 `docs/user/features/`，但创建前就拥有明确身份，不能再在不违反审核提示的情况下偏离当前功能 ID。只有文件工具输出、没有助手总结的成功回合也会更新左栏，无需人工重新加载。后台 Session 重连不会触发刷新，因为运行状态转换仍受“存在已提交且等待刷新的回合”约束。
