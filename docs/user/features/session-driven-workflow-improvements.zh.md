# 会话驱动的流程改进

[English](session-driven-workflow-improvements.md) | 中文

## 它做什么

从一次真实的 `session.jsonl` 复盘中提炼出五项对 Blueprint 完善流程的小而聚焦的改进：

1. **对 `/blueprint` 输入做意图分类。** 在现有完善流水线跑起来之前，Blueprint 会对输入做一次轻量分类，类别为 `new-feature`、`fix`、`research`、`status`、`unknown` 之一。当类别不确定时，分类器在消耗现有完善流程三问题预算之前，**最多**抛 2 个聚焦问题。非实质的不确定性记为假设。分类结果写入完善包，供后续诊断读取。
2. **在 Blueprint Web 标签中批准并继续。** 当某个 Feature 处在 `refining` 或 `ready` 阶段且有 active proposed Spec 时，详情视图显示 `批准并继续`。精确哈希动作会记录审批、启动实现 cycle、立即应用返回的 Dashboard，并在发起操作的 live DSH Chat 中排入一条带插件来源标识的 follow-up。receipt 会明确报告 Chat 不可用的情况。
3. **完善前的调研 Skill。** 新增 `research-before-refine` DSH Skill，调用本地 SearXNG HTTP 服务，返回前 5 条结果的 Markdown 笔记块。`/blueprint` 把输入归到 `research` 类时，代理会自动触发该 Skill，并把结果折进完善包。Skill 同时是 `user-invocable: true`，所以开发者也能从 Skills 菜单显式调用。
4. **SearXNG 通畅性检查。** 同一个 `probeSearxng` 函数支撑三处 surface：(a) `research-before-refine` Skill 启动时的前置探测，使 SearXNG 故障以 `severity: required` finding 暴露而不是静默超时；(b) 一个新的 `research-connectivity-check` Skill，从 Skills 菜单可达；(c) 在 Blueprint Web 标签 Feature 详情视图里渲染 `SearXNG: ✓ reachable (Xms)` / `SearXNG: ✗ unreachable` 指示器，带刷新按钮。探测默认 `http://localhost:8888`，遵守 `SEARXNG_BASE_URL`，3 s 超时。
5. **确定性阶段工作包。** Host 返回当前生命周期阶段、允许动作、唯一的下一必需动作，以及包含活动 Spec 哈希、Scope、任务和最新验证证据的精简工作包。当前 Chat 必须遵循此工作包，不能执行未被 Host 允许的生命周期动作。
6. **执行预算与恢复。** 治理帮助器将父轮限制为至多三个直接、单一交付物的子任务请求，默认使用 fresh 上下文，对运行故障分类，并写入精简 checkpoint。相同失败指纹再次出现时，会显式阻断流程，而不是重放整个工作流。

四项改动都是加性的。现有 `/blueprint` 完善流、`blueprint_dispatch` 工具、以及 `design-blueprint approve` CLI 仍是权威入口。新 Skill 遵循 [Agent 接口 Skills 层](agent-interface--skills-layer.md) 文档化的 Skills loader 契约；新按钮调用 Chat 代理已经在用的同一个 Host API。

## 预期结果

开发者在 Blueprint 项目里敲 `/blueprint <text>`，会按顺序看到：(1) Chat 回复里一行分类头；(2) 当类别不确定时最多 2 个澄清问题；(3) 现有的完善包；外加 (4) — 当类别为 `research` 时 — 包里附上一段调研笔记。Spec 进入 `ready` 后，开发者在 Blueprint Web 中点击 `批准并继续`。Feature 进入 `implementing`，页面直接使用动作响应更新，发起操作的 Chat 仍在线时会收到下一轮工作。

当开发者敲的 `design-blueprint` slash input 形如 "当前 Feature 阶段是什么？" 时，分类器返回 `status`，现有 `/blueprint-status` 流被短路返回。当敲的是 "在国内怎么配 Docker 镜像源？" 时，分类器返回 `research`；chat-commands 输出一段 coordinator 消息，告诉代理调用 `research-before-refine` Skill；该 Skill 先调 `probeSearxng` 再 POST 到 `${SEARXNG_BASE_URL:-http://localhost:8888}/search`；搜索响应作为 `intent.researchNotes` 进入完善包，探测响应作为 `intent.searxngStatus` 进入完善包。

## 怎么用

- `/blueprint <text>` — 跟今天一样，但带分类显示，且当类别是 `research` 时自动触发新 Skill。
- Skills 菜单 → `research-before-refine` — 显式调用调研；与自动触发路径一致。Skill 正文要求代理 POST 到本地 SearXNG 服务并返回 Markdown 笔记块。
- Blueprint Web Feature 详情 → `批准并继续`（仅在 Spec 处于 `refining` 或 `ready`、且当前精确哈希尚未被批准时显示）。一次 Host 动作会启动实现并尝试续接同一 Chat。

`SEARXNG_BASE_URL` 从环境变量读取，默认 `http://localhost:8888`。Skill 不会对 `5xx`/`4xx` 静默成功：它会发出一条 `severity: required` 的 finding，附上精确的错误字符串与请求的 URL。

## 兼容性

分类器、Web 按钮、调研 Skill 都是加性的。现有 `/blueprint` 完善流、`blueprint_dispatch` 工具、以及 `design-blueprint approve` CLI 仍是权威入口。新 Skill 遵循文档化的 Skills loader 契约；新按钮调用 Chat 代理已经在用的同一个 Host API。配套 Feature 文档 [Spec 治理 — 架构设计](spec-governance--architecture-design.md) 与 [Agent 接口 Skills 层](agent-interface--skills-layer.md) 描述了本 Feature 组合的既有边界。

## 参考文档

- `.blueprint/features/session-driven-workflow-improvements.md` — Owning Feature 记录。
- `.blueprint/features/spec-governance--architecture-design.md` — Companion（拥有 `lib/chat-commands.js`、`lib/orchestration.js`、`lib/web-api.js`、`lib/client.js`）。
- `.blueprint/features/agent-interface--skills-layer.md` — Companion（拥有用于注册新 Skill 的 Skills loader）。
- `.blueprint/architecture/components/session-driven-workflow-improvements.md` — 新代码路径的 Component 归属。
- `.specs/proposed/session-driven-workflow-improvements.md` — **当前 proposed** 规格（批准续接与响应式状态）。
- `.specs/rejected/session-driven-workflow-improvements--research-and-connectivity.md` — 已拒绝的子 Spec B（调研 Skill + 连通性检查）；作为下一轮参考保留。
- `.dsh/skills/research-before-refine/SKILL.md` — 新 Skill 正文（由既有 Skills loader 加载；先以子 Spec A 形式交付，在子 Spec B 中扩展）。
- `DESIGN.md` — 待子 Spec A 落地时新增"意图路由与新 Skill"小节。

## 当前提案状态

本 Feature 描述四项新增。框架只允许每个 Feature 有一个当前 proposed Spec，因此变更被拆为两份子 Spec：

- **子 Spec A（当前 proposed）**：输入分类 + Approve 按钮。先交付。
- **子 Spec B（推迟到下一轮迭代）**：调研 Skill + SearXNG 连通性检查。完整 Spec 作为已拒绝的参考保留；子 Spec A 批准后，开发者可通过把已拒绝文件的 Status 改为 `proposed` 并复制回 `.specs/proposed/` 来提出子 Spec B。

## 已验证的当前行为

<!-- blueprint-current:session-driven-workflow-improvements.md -->

下面验收条件从 active proposed Spec 直接复制。**只有当开发者批准精确的双语 Spec 哈希、且实现通过与需求关联的验收后**，它们才成为事实。

### 通畅性检查

- AC-CONN-001：`probeSearxng({ baseUrl: 'http://localhost:8888', timeoutMs: 3000 })` 在本地 SearXNG 可达时返回 `{ ok: true, baseUrl, statusCode: 200, latencyMs: <integer> }`。[surface=api; moment=terminal; evidence=contract-integration]
- AC-CONN-004：`research-before-refine` Skill 正文在搜索 POST 之前调用 `probeSearxng`；当 `ok === false` 时 Skill 抛 `severity: required` finding 并跳过搜索 POST。探测响应被追加到 `intent.searxngStatus`。[surface=api; moment=terminal; evidence=contract-integration]
- AC-CONN-008：Blueprint Web Feature 详情在既有工作流状态块旁渲染 `SearXNG: ✓ reachable (Xms)` 或 `SearXNG: ✗ unreachable` 指示器，并带刷新按钮。指示器在页面加载时填充，点击刷新按钮时重新填充。[surface=web-ui; moment=terminal; evidence=user-visible]

### 意图分类器

- AC-CLASS-001：`classifyIntent({ text, features, source })` 在 token 匹配 research 意图的输入上返回 `{ class: 'research', confidence: 'high', evidence: ['searxng', 'mirrors'] }`。[surface=api; moment=static; evidence=static-unit]
- AC-CLASS-002：`classifyIntent` 在描述新 Feature 且无 research 信号的输入上返回 `{ class: 'new-feature', confidence: 'high', evidence: ['add', 'feature'] }`。[surface=api; moment=static; evidence=static-unit]
- AC-CLASS-003：`classifyIntent` 在两种意图分数相当的输入上返回 `{ class: 'unknown', ambiguous: true, clarifyingQuestions: [...] }`，且数组长度 ≤ 2。[surface=api; moment=terminal; evidence=contract-integration]
- AC-CLASS-004：`createRefinementPacket` 在每个成功包上把分类记到 `intent.class`、`intent.confidence`、`intent.evidence`。[surface=api; moment=terminal; evidence=contract-integration]
- AC-CLASS-005：当 `intent.class === 'research'` 时，coordinator 消息包含一行 `## Research notes — <topic>` 块，指示代理在现有完善维度之前调用 `research-before-refine` Skill。[surface=api; moment=terminal; evidence=contract-integration]

### Approve 按钮

- AC-APPR-001：当 `feature.workflow.stage ∈ {refining, ready}`、`feature.workflow.spec?.changePackage` 存在、且 `feature.workflow.approval?.specHash !== feature.workflow.spec.changePackage.lifecycle.specHash` 时，Blueprint Web Feature 详情渲染 "Approve" 按钮。[surface=web-ui; moment=terminal; evidence=user-visible]
- AC-APPR-002：点击 Approve 按钮调用 `callApi({ action: 'approve', cwd, sessionId, dshWorkspacePath, dshWorkspaceTitle, featureId, specHash, yes: true })`，传入精确的当前 `specHash`。[surface=web-ui; moment=terminal; evidence=user-visible]
- AC-APPR-003：成功 approve 后，`feature.workflow.approval.specHash` 等于新的 `feature.workflow.spec.changePackage.lifecycle.specHash`，公开阶段变成 `implementing`。[surface=web-ui; moment=progressive; evidence=user-visible]
- AC-APPR-004：approve 失败时通过既有的 `setError` 抛出精确的错误消息；按钮不会静默重试。[surface=web-ui; moment=terminal; evidence=user-visible]
- AC-APPR-005：当 `feature.workflow.stage` 为 `draft`、`verification_required`、`rejected` 或已审批时，Approve 按钮被隐藏。[surface=web-ui; moment=static; evidence=static-unit]

### 完善前调研 Skill

- AC-RES-001：`.dsh/skills/research-before-refine/SKILL.md` 存在，frontmatter 含 `name: research-before-refine`、`description: <text>`、`user-invocable: true`，且**不**含 `disable-model-invocation: true`。[surface=repository; moment=static; evidence=static-unit]
- AC-RES-002：Skill 正文要求代理 POST `${SEARXNG_BASE_URL:-http://localhost:8888}/search`，JSON body，返回前 5 条结果的 Markdown 笔记块。[surface=repository; moment=static; evidence=static-unit]
- AC-RES-003：SearXNG 返回 `5xx` 或 `4xx` 时，Skill 发出一条 `severity: required` 的 finding，附上精确错误字符串与请求 URL；不返回伪造的 Markdown 笔记块。[surface=api; moment=terminal; evidence=contract-integration]
- AC-RES-004：成功调研后，`refinement.intent.researchNotes` 含 `{ topic, summary, sources: [{ title, url, snippet }] }`。[surface=api; moment=terminal; evidence=contract-integration]
- AC-RES-005：Skill 由既有 Skills loader 注册；`node lib/cli.js skills list` 输出 `research-before-refine`，`modelInvocable: true`、`userInvocable: true`。[surface=cli; moment=terminal; evidence=contract-integration]

### 跨切关注

- AC-DOCS-001：`docs/user/features/session-driven-workflow-improvements.{md,zh.md,i18n.yaml}` 存在；英文页描述了三项新增。[surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-002：新文档落地后，`node lib/cli.js docs check --cwd .` 报 0 required、0 recommended。[surface=cli; moment=static; evidence=completion-hygiene]
- AC-SCAN-001：本 Spec 落地后，`node lib/cli.js scan --all --cwd .` 报 0 required、0 recommended。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001：改动后所有既有 host 测试继续通过。[surface=cli; moment=terminal; evidence=contract-integration]

## 已验证的当前行为

<!-- blueprint-current:session-driven-workflow-improvements--input-classification-and-approval.md -->

### 会话驱动的流程改进 — 输入分类与 Approve 按钮（子 Spec A）

- AC-CLASS-001：`classifyIntent({ text: 'how do I configure Docker mirrors in China?', features: [], source: 'command' })` 返回 `{ class: 'research', confidence: 'high', evidence: ['how', 'configure', 'mirrors'] }`。[surface=api; moment=static; evidence=static-unit]
- AC-CLASS-002：`classifyIntent({ text: 'add a new Approve button to the Blueprint tab', features: [], source: 'command' })` 返回 `{ class: 'new-feature', confidence: 'high', evidence: ['add', 'new', 'blueprint'] }`。[surface=api; moment=static; evidence=static-unit]
- AC-CLASS-003：`classifyIntent({ text: 'fix the broken Approve button', features: [], source: 'command' })` 返回 `{ class: 'fix', confidence: 'high', evidence: ['fix', 'broken'] }`。[surface=api; moment=static; evidence=static-unit]
- AC-CLASS-004：当 top-2 类别分数相差 ≤ 1 token 时，`classifyIntent` 返回 `{ class: 'unknown', ambiguous: true, clarifyingQuestions: [...] }`，数组长度 ≤ 2。[surface=api; moment=terminal; evidence=contract-integration]
- AC-CLASS-005：对完全匹配 status 信号的输入，`classifyIntent` 返回 `{ class: 'status', confidence: 'high', evidence: ['what is', 'current', 'stage'] }`。[surface=api; moment=static; evidence=static-unit]
- AC-CLASS-006：`createRefinementPacket({...})` 在每个成功的包上把分类记到 `intent.class`、`intent.confidence`、`intent.evidence`、以及（当 ambiguous 时）`intent.clarifyingQuestions`。[surface=api; moment=terminal; evidence=contract-integration]
- AC-CLASS-007：一轮抛出的澄清问题总数仍 ≤ 3；新 `clarifyingQuestions` 占 1 或 2 题；既有完善问题占其余。[surface=api; moment=terminal; evidence=contract-integration]
- AC-APPR-001：当 `feature.workflow.stage ∈ {refining, ready}`、`feature.workflow.spec?.changePackage` 存在、且 `feature.workflow.approval?.specHash !== feature.workflow.spec.changePackage.lifecycle.specHash` 时，Blueprint Web Feature 详情渲染 "Approve" 按钮。[surface=web-ui; moment=terminal; evidence=user-visible]
- AC-APPR-002：当 `feature.workflow.stage` 为 `draft`、`verification_required`、`rejected` 或已审批时，按钮被隐藏。[surface=web-ui; moment=static; evidence=static-unit]
- AC-APPR-003：点击按钮调用 `callApi({ action: 'approve', cwd, sessionId, dshWorkspacePath, dshWorkspaceTitle, featureId, specHash, yes: true })`，传入精确的当前 `specHash`。[surface=web-ui; moment=terminal; evidence=user-visible]
- AC-APPR-004：失败时通过既有 `setError` 抛出精确错误消息；按钮不静默重试，标签不变。[surface=web-ui; moment=terminal; evidence=user-visible]
- AC-APPR-005：成功 approve 后，`feature.workflow.approval.specHash` 等于 `feature.workflow.spec.changePackage.lifecycle.specHash`，公开阶段变成 `implementing`。[surface=web-ui; moment=progressive; evidence=user-visible]
- AC-APPR-006：`lib/web-api.js` 暴露 `approve` 动作，调用既有 `approveFeatureProposal({ cwd, featureId, specHash, yes })`；动作读取与 CLI 同一精确哈希门禁。[surface=api; moment=terminal; evidence=contract-integration]
