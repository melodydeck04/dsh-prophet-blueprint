# 规格：检查本地 DSH 会话日志

状态：implemented

## 问题

仓库已有的小型分析器只能读取纯文本 `session.jsonl`，但本地 DSH 会将会话记录保存到 `~/.dsh/sessions/<project>/<session>/session.jsonl.zstd`。尚未完成的 `tools/peek-session.mjs` 已能解码 zstd 帧，却从存在歧义的目录编码推导项目路径，并查找不存在的 `parentSessionId` 字段。因此 Windows 项目路径会显示为编码名称，也无法可靠检查子代理谱系。

## 提案

将 `tools/peek-session.mjs` 完成为本地 DSH zstd 会话日志的只读命令行检查器。它会列出并摘要持久化 header、渲染子代理谱系，并提供有界事件检查，而不会改写正在运行或归档的 DSH 会话。该工具留在已发布 Blueprint 软件包之外，只使用 Node.js 内置能力。

## 研究与兼容性

于 2026-09-09 在本机检查；这是仅供开发者使用的读取工具，不会加载到 Blueprint 插件或改变 DSH profile。

- Node.js `v22.23.1` 的 `node:zlib` 提供 `zstdDecompressSync`；`C:/Users/Windows/.dsh/sessions/` 下的实际文件以 zstd 帧 magic 开头，解压后是以换行分隔的 JSON 记录。
- 已安装的 DSH `0.1.2-rc.1` 在 `@deepseek-ai/dsh-commands/lib/typert.host.js` 中声明 `SessionHeader`：`id`、可选的 `cwd`、可选的 `parentSession`、可选的 `origin: 'subagent'`、可选的 `delegationDepth` 和可选的 `agentPreset`。
- 已安装的 session-controller schema 在持久化快照中使用 `parentSession`，并从它派生 UI 的 `parentSessionId` 投影。因此 `parentSessionId` 不是本工具应要求的持久化 header 字段。
- DSH 目录名是存储键，不是可逆的路径表示：连字符同时是路径分隔符和合法路径字符。只要存在，持久化 header 的 `cwd` 就是权威显示值。

## 范围

### 允许路径

- allow: `tools/peek-session.mjs`
- allow: `tests/peek-session.test.js`
- allow: `docs/cookbook/inspect-dsh-session-logs.md`
- allow: `docs/cookbook/inspect-dsh-session-logs.zh.md`
- allow: `docs/cookbook/inspect-dsh-session-logs.i18n.yaml`
- allow: `README.md`
- allow: `README.zh.md`
- allow: `README.i18n.yaml`
- allow: `.specs/{proposed,implemented}/inspect-dsh-session-logs{,.zh}.md`

### 禁止路径

- deny: `lib/**`
- deny: `cordis.patch.yml`
- deny: `package.json`
- deny: `.dsh/**`
- deny: `.blueprint/**`
- deny: 除本规格语言对以外的 `.specs/**`

## 决定

`tools/peek-session.mjs` 保持为只使用 Node 的只读命令。默认根目录是本地 DSH 会话目录；`DSH_SESSIONS_ROOT` 可用于测试或用户明确选择的归档目录。它绝不启动 DSH、建立网络连接、改写会话文件或向外发送日志内容。

读取器扫描连续的 zstd 帧，独立解压每个完整帧，并解析每一条非空 JSON 行。末尾不完整的帧会被报告为 torn tail，之前完整记录仍可使用。已完成帧或行格式损坏时，工具会产生明确诊断记录，而不会悄悄改变其余日志。

第一条持久化的 `type: "session"` 记录提供 `id`、`cwd`、`parentSession`、`origin`、`delegationDepth` 和 `agentPreset`。列表与摘要使用这些元数据；编码项目目录仅在没有 `cwd` 时作为回退标签。树形视图将 `parentSession` 与列表中匹配 `id` 的 header 关联，标识 `origin: "subagent"` 的子项；父项不存在时保留该子项并显示为 orphan，绝不虚构关系。

命令支持列表、树形、精确会话详情、摘要、精确事件类型过滤、限制末尾记录、文本过滤和 JSON 输出。人类可读详情会限制消息预览；`--json` 有意输出持久化记录，文档会说明它包含敏感本地数据。

## 需求

- REQ-LOG-1：读取连续的 zstd 帧；文件末尾有不完整帧时保留完整帧中的记录。
- REQ-LOG-2：在可用时，从持久化 session header 推导会话身份、项目显示路径、父级关联、来源、委派深度和 preset。
- REQ-LOG-3：展示直接和嵌套的子代理关系，包括孤立子项；不将存在歧义的目录名当作已解码的工作区路径。
- REQ-CLI-1：提供可预测的只读列表、树形、详情、摘要、JSON、类型、末尾和文本过滤操作，并为无效输入给出可操作错误。
- REQ-DOCS-1：在同步的英文/中文 cookbook 对中说明仅限本地的数据边界、支持命令、子代理语义与 zstd/torn-tail 行为。

## 验收标准

- AC-LOG-001：含两个连续 zstd 帧及换行 JSON 的 fixture 按顺序返回两帧记录。追加不完整第三帧会报告 `tornFrame: true`，但不会丢失前两帧。 [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOG-002：列表 fixture 的 session header 含 `cwd`、`origin: "subagent"`、`parentSession`、`delegationDepth` 和 `agentPreset` 时，摘要准确暴露这些值，并使用 `cwd` 而非编码目录标签。 [surface=cli; moment=terminal; evidence=contract-integration]
- AC-LOG-003：`--tree` 将子项嵌套到其列出的 `parentSession` 下；父项缺失的子项仍显示并标为 orphan。 [surface=cli; moment=terminal; evidence=contract-integration]
- AC-CLI-001：`--list`、精确会话的 `--summary`、`--type`、`--last` 与 `--json` 在 fixture 根目录上产生确定性输出；未知会话以非零状态退出并指出搜索根目录。 [surface=cli; moment=terminal; evidence=contract-integration]
- AC-CLI-002：命令不会写入 `DSH_SESSIONS_ROOT`；列表、树形、摘要与详情调用后 fixture 目录快照不变。 [surface=cli; moment=terminal; evidence=contract-integration]
- AC-DOCS-001：cookbook 语言对和配对记录描述最终命令契约且语义等价。`node lib/cli.js docs check --cwd .` 对该语言对报告零 required 与 recommended 问题。 [surface=cli; moment=static; evidence=completion-hygiene]
- AC-REGRESSION-001：`node --check tools/peek-session.mjs`、`node --test tests/peek-session.test.js`、相关已有 session 分析器及暂存 Blueprint scan 通过。 [surface=repository; moment=terminal; evidence=contract-integration]

## 验证

- AC-LOG-001：`node --test tests/peek-session.test.js` 的多帧与 torn-tail 用例。
- AC-LOG-002：`node --test tests/peek-session.test.js` 的 header 元数据用例。
- AC-LOG-003：`node --test tests/peek-session.test.js` 的树形与 orphan 用例。
- AC-CLI-001：`node --test tests/peek-session.test.js` 的命令用例。
- AC-CLI-002：`node --test tests/peek-session.test.js` 的 fixture 不变用例。
- AC-DOCS-001：`node lib/cli.js docs check --cwd .`。
- AC-REGRESSION-001：`node --check tools/peek-session.mjs`；`node --test tests/peek-session.test.js`；`node tools/summarize-session.cjs <fixture>`；`node tools/analyze-session.cjs <fixture>`；暂存快照上的 `node lib/cli.js scan --cwd .`。

## 任务

1. 用持久化 header 元数据替换存储名路径推导，并添加明确 zstd 帧诊断。
2. 添加树形投影并完成 CLI 解析与输出契约。
3. 添加隔离的压缩日志 fixture 和命令级测试。
4. 发布双语 cookbook 和简洁的 README 开发工具链接。

## 考虑过的替代方案

**将存储目录解码为 Windows 路径。** 拒绝，因为 DSH 将连字符同时用作存储分隔符和合法目录名，映射无法恢复所有路径。正常 header 中的持久化 `cwd` 可用，且是正确的权威来源。

**添加 DSH Web route 或插件服务。** 拒绝，因为会话检查是开发者诊断任务。插件 route 会扩大 Host 的安全与兼容性表面，而本地命令可检查已停止的 DSH 安装和归档。

**在分析前完整解压或修复原文件。** 拒绝，因为实时写入者可能留下不完整的最后一帧。独立读取完整帧会保留证据，且不改写源文件。

## 风险

会话记录可能包含敏感提示词和工具数据。默认人类可读输出保持紧凑；`--json` 为本地诊断保留完整输出，文档已将其标为敏感。未来 DSH 版本可能改变存储格式；帧或 header 不兼容必须产生清晰读取错误，而不是推断结果。为获得权威元数据，列出大量历史会读取每个压缩日志；实际操作时应优先使用 `--project`。

## 结果

仓库现在拥有一个只在本地运行的会话日志检查器，它使用存储的 DSH header 元数据显示 workspace 和子代理谱系。它不改变 DSH 运行时、profile、网络或源日志。范围内的 zstd、元数据、树形、过滤、缺失会话、torn-tail 和零写入测试已通过；同步的 cookbook 与 README 语言对已通过文档检查；精确暂存快照已通过 Blueprint scan。
