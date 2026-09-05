# 规格：诊断在 TODO 完成边界提示 compact

状态：已实现
功能：blueprint-session-diagnostics
父级：spec-governance

> 三阶段「会话规模感知」程序的第 3 阶段。
> 依赖：`.specs/proposed/persistent-todo-list.md`（第 1 阶段）。
> 配套：`.specs/proposed/decomposition-contract.md`（第 2 阶段）。
> 配套现行 Spec：`.specs/proposed/blueprint-session-diagnostics.md`（包的权威文件）。

## 问题

第 1 阶段给开发者提供了一种方式：通过往 `session.jsonl` 写一条 `task/done` 事件来标记「这部分做完了」。第 2 阶段把它变成结构性预期：大 Spec 必须分解，每份分解出的片段预期以 `task/done` 收尾。缺失的是读取侧：diagnostics 包目前不看 `task/done` 事件，所以即便开发者按第 1 阶段正确完成，得到的还是跟从不标记 TODO 的人一样的扁平审计报告。

本第 3 阶段补上闭环。它落地后，`blueprint-diagnostics audit` 读 `task/done`（与 `task/status`）事件、按边界把 session 切成段、测量每个边界之后开发者没 `/compact` 让多少字节累积，并发出 `## Compact boundaries` Markdown 段加 `compactBoundaries` 字段。verdict 由 `totalMissedSavingsBytes` 驱动；没有 `task/done` 事件的 session 完全跳过本段（避免对第 1 阶段之前的导出误报）。

## 范围

### 允许路径（diagnostics 包内）

- 允许：`blueprint-diagnostics/lib/audit.js`
- 允许：`blueprint-diagnostics/lib/report.js`
- 允许：`blueprint-diagnostics/lib/thresholds.js`
- 允许：`blueprint-diagnostics/lib/compare.js`
- 允许：`blueprint-diagnostics/tests/compact-boundaries.test.js`
- 允许：`blueprint-diagnostics/tests/fixtures/compact-boundaries-session.jsonl`
- 允许：`blueprint-diagnostics/tests/fixtures/no-task-done-session.jsonl`
- 允许：`blueprint-diagnostics/docs/diagnostics/README.md`
- 允许：`blueprint-diagnostics/docs/diagnostics/README.zh.md`
- 允许：`blueprint-diagnostics/docs/diagnostics/README.zh.i18n.yaml`
- 允许：`.blueprint/features/blueprint-session-diagnostics.md`
- 允许：`.blueprint/architecture/components/blueprint-session-diagnostics.md`

### 禁止路径

- 禁止：`@dsh-plugins/design-blueprint` host 插件下任何路径（`lib/*`、`bin/*`、`.specs/**` 等）
- 禁止：`lib/scan.js`（第 2 阶段负责 scan 规则改动）
- 禁止：`.blueprint/**`
- 禁止：`docs/i18n/**`
- 禁止：本 Spec 配对文件以外的 `.specs/**`
- 禁止：对 `design-blueprint.json` 的 default 或 authority 段做任何改动

## 方案

### Audit 扩展

`lib/audit.js` 像今天一样一次性走完所有事件。遇到 `task/done` 时，往 `compactBoundaries.boundaries` 追加一条 entry，承载 `seq`、`time`、`todoId`、`spec`、`req`、`ac`、`title`、`sessionId`、以及一个空的 `segmentBytes` 占位。事件循环结束后，audit 按顺序遍历边界：对每个边界 `b[i]`，计算 `segmentBytes` 为落在 `(b[i].time, b[i+1].time]`（最后一段用 `(b[i].time, lastTime]`）窗口内事件的字节总和。`segmentDurationMs` 是同一窗口的挂钟时长。

`totalMissedSavingsBytes` 是所有 `segmentBytes` 之和。意图是损失厌恶：开发者看到自己在每个 `task/done` 边界敲 `/compact` 能省下多少字节。阈值放在 `lib/thresholds.js`，让维护者无需读 audit 逻辑就能调整。

`verdict.compact-boundaries-missed` 通过既有的 `classify` 辅助函数对照 `THRESHOLDS["compact-boundaries-missed"]` 计算。顶层 `verdict.dominant` 选择算法不变：若已有维度是红，本阶段绝不抢主导标签；只有当既无黄/红维度、或本阶段的 break-point 排到最高时，它才会贡献。

### Markdown 段

`lib/report.js` 在既有的 `## Compactions`（若第 2 阶段的 `## Cross-feature scope` 落地则在其后）与 `## Tool names` 之间渲染新段：

```
## Compact boundaries

- task/done events: 3
- missed compact savings: 5.4 MiB
- verdict: 🟡 (yellow)

| boundary | todoId | spec | segment bytes | duration |
| --- | --- | --- | ---: | ---: |
| 12:34:56 | T1 | .specs/proposed/foo.md | 1.2 MiB | 22 min |
| 13:01:14 | T2 | .specs/proposed/foo.md | 2.0 MiB | 41 min |
| 14:18:02 | T3 | .specs/proposed/bar.md | 2.2 MiB | 1 h 12 min |
```

`compactBoundaries.boundaries` 为空时，整段省略（无标题、无 `(none)` 占位），保证第 1 阶段之前的 session 渲染与今天完全一致。

### Compare 扩展

`lib/compare.js` 在既有的表里加一行：`compact boundaries missed`，左侧 / 右侧分别为两份报告的格式化字节总数。阈值检查沿用既有的 10% 规则；2 倍或更大的差异标 ⚠。

### 阈值

```js
"compact-boundaries-missed": Object.freeze({
  yellowAt: 1 * 1024 * 1024,
  redAt: 4 * 1024 * 1024,
}),
```

数字是启发式，针对产生本次审计提示的真实 session 调过；故意偏保守，避免小段开销把 verdict 拉黄。

## 验收条件

- AC-COMPACT-001：`node bin/blueprint-diagnostics.js audit tests/fixtures/compact-boundaries-session.jsonl` 退出码 0，渲染出的 Markdown 报告含 `## Compact boundaries` 与逐边界的表。[surface=cli; moment=terminal; evidence=user-visible]
- AC-COMPACT-002：零 `task/done` 事件的 session 渲染既有段位不变；不输出 `## Compact boundaries` 标题。[surface=cli; moment=terminal; evidence=user-visible]
- AC-COMPACT-003：`report.compactBoundaries.boundaries` 是数组，长度等于输入中 `task/done` 事件数；每条 entry 承载「Audit 扩展」一节列出的字段。[surface=api; moment=terminal; evidence=contract-integration]
- AC-COMPACT-004：`report.compactBoundaries.totalMissedSavingsBytes` 等于所有边界 `segmentBytes` 之和；`verdicts["compact-boundaries-missed"]` 遵循既有的 `classify` 规则。[surface=api; moment=terminal; evidence=static-unit]
- AC-COMPACT-005：`THRESHOLDS["compact-boundaries-missed"]` 从 `lib/thresholds.js` 加载；改文件就改 verdict，不动 audit 逻辑。[surface=repository; moment=static; evidence=static-unit]
- AC-COMPACT-006：两份报告都携带 `compactBoundaries` 字段时，`compare` 输出加一行 `compact boundaries missed`。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-COMPACT-007：所有 `tests/*.test.js` 在改动后继续通过。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-COMPACT-008：双语 README 落地后，`design-blueprint docs check` 退出码 0。[surface=repository; moment=static; evidence=completion-hygiene]

## 验证

- AC-COMPACT-001：测试 `tests/compact-boundaries.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-COMPACT-002：测试 `tests/compact-boundaries.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-COMPACT-003：测试 `tests/compact-boundaries.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-COMPACT-004：测试 `tests/compact-boundaries.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-COMPACT-005：测试 `tests/compact-boundaries.test.js` [surface=repository; moment=static; evidence=static-unit]
- AC-COMPACT-006：测试 `tests/compact-boundaries.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-COMPACT-007：命令 `node --experimental-test-isolation=none --test "blueprint-diagnostics/tests/*.test.js"` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-COMPACT-008：命令 `node lib/cli.js docs check --cwd .` [surface=cli; moment=static; evidence=completion-hygiene]

## 需求

### REQ-COMPACT-1 — Audit 读 `task/done` 与 `task/status`

`lib/audit.js` 应在既有的事件种类之外扫描 `task/done` 与 `task/status`。对每条 `seq` 与 `time` 为数字的 `task/done` 事件，追加一条 boundary entry，承载 `seq`、`time`、`data.todoId`、`data.spec`、`data.req`、`data.ac`、`data.title`，以及 `data.sessionId`（若存在，否则 `null`）。

### REQ-COMPACT-2 — 逐段字节聚合

事件循环结束后，audit 应为每个边界 `b[i]` 计算 `segmentBytes`：把 `time` 落在 `(b[i].time, b[i+1].time]`（最后一段用 `(b[i].time, lastTime]`）窗口内事件的 `approximateSize(record)` 求和。聚合字节按既有的事件种类到分桶映射归入 `{ assistant, toolResult, reasoning, user }`。

### REQ-COMPACT-3 — 总漏 compact 节省

`totalMissedSavingsBytes` 等于所有边界所有分桶之和。即使 `boundaries` 为空也设此字段（此时为 `0`）。

### REQ-COMPACT-4 — Verdict 走阈值块

`verdicts["compact-boundaries-missed"]` 通过既有的 `classify(totalMissedSavingsBytes, THRESHOLDS["compact-boundaries-missed"])` 计算。阈值块在 `lib/thresholds.js`，`yellowAt: 1 MiB`、`redAt: 4 MiB`。

### REQ-COMPACT-5 — 空时省略整段

`compactBoundaries.boundaries.length === 0` 时，`lib/report.js` 必须不输出 `## Compact boundaries` 标题。既有段位渲染不变。

### REQ-COMPACT-6 — Markdown 段内容

段位被输出时，含：
- 一行摘要 `task/done events: <count>`，
- 格式化的 `missed compact savings`，
- 一行 verdict 表情与色彩字面词，
- 一张逐边界的表，列：`boundary`（时间）、`todoId`、`spec`、`segment bytes`、`duration`。

### REQ-COMPACT-7 — Compare 行

`lib/compare.js` 应加一行 `compact boundaries missed`，`left` / `right` 分别是两份报告的格式化 `totalMissedSavingsBytes`。该行沿用既有的 10% 显著性规则。

### REQ-COMPACT-8 — 不新增 host-plugin 导入

`lib/audit.js`、`lib/report.js`、`lib/compare.js`、`lib/thresholds.js` 不得从 `@dsh-plugins/design-blueprint` 导入。`package.json` 不含指向 host 插件的 `dependencies` 项既是既有 diagnostics 契约的一部分，应继续通过。

## 场景

[scenario=three-task-done-renders]
给定一份 session.jsonl 含三条 `task/done` 事件，且与 assistant/chunk、tool/result 事件交错，
当 `blueprint-diagnostics audit <path>` 跑起来，
那么 Markdown 报告含 `## Compact boundaries` 与一张三行表，
且 `report.compactBoundaries.boundaries.length` 为 3，
且 `verdicts["compact-boundaries-missed"]` 是 `green | yellow | red` 之一。

[scenario=no-task-done-omits-section]
给定一份 session.jsonl 含零 `task/done` 事件（即既有 fixture），
当 `blueprint-diagnostics audit <path>` 跑起来，
那么 Markdown 报告不含 `## Compact boundaries`，
且 `report.compactBoundaries.boundaries` 是 `[]`，
且 `totalMissedSavingsBytes` 是 `0`。

[scenario=verdict-color-from-threshold]
给定 `totalMissedSavingsBytes === 1.5 * 1024 * 1024`，
当 audit 对其分类，
那么 `verdicts["compact-boundaries-missed"]` 是 `yellow`。

[scenario=verdict-color-red]
给定 `totalMissedSavingsBytes === 5 * 1024 * 1024`，
当 audit 对其分类，
那么 `verdicts["compact-boundaries-missed"]` 是 `red`。

[scenario=compare-adds-row]
给定两份报告都含 `compactBoundaries.totalMissedSavingsBytes`，
当 `compare` 跑起来，
那么输出表含一行 `compact boundaries missed`。

[scenario=segment-bucket-correctness]
给定边界在 `seq: 100`，其后是一条 `seq: 105` 的 assistant/chunk（5 KiB）与一条 `seq: 110` 的 tool/result（20 KiB），
当段位被计算，
那么 `segmentBytes.assistant` 是 `5120`，`segmentBytes.toolResult` 是 `20480`。

## 假设

1. 由第 1 阶段 `lib/types/todo-events.js` 产出的 `task/done` 事件 schema 即本阶段读取的契约。`todoId`、`spec`、`req`、`ac`、`title` 与可选 `sessionId` 字段名稳定。
2. 第 1 阶段之前的 session 仍能干净审计：audit 在缺失 `task/done` 事件时跳过、永不抛错、永不为空列表加段位标题。
3. `compactBoundaries` 字段是加性的；`AuditReport` 上既有的字段形状与语义不变。
4. Compare 输出不是本阶段的主要交付表面；该行仅为信息性，不阻塞。

## 非目标

- 不实时触发 compact。diagnostics 表面为信息性；开发者自己决定何时敲 `/compact`。
- 不改 `lib/thresholds.js` 中既有的五个维度阈值。新增 `compact-boundaries-missed` 是唯一增量。
- 不强制与 host 插件集成。diagnostics 包保留零依赖契约。

## 其他方案

**逐事件「漏 compact 节省」估算。** 不采用，过度工程；按段估保守且直接回答开发者真正问的问题（「上一段我多花了多少？」）。

**verdict 为红时阻塞审批。** 不采用；本阶段仅建议，dominant 选择算法已偏向既有红色维度，在新诊断上设门会阻塞无关工作。

**跳过 compare 行。** 不采用；既有 compare 命令已经包住每个有意义的维度，开发者也想在同任务的两轮迭代之间比较 `compact boundaries missed`。

## 任务

1. 扩展 `lib/audit.js`：扫描 `task/done` / `task/status` 事件，填充 `report.compactBoundaries` 的 `boundaries`、`totalBoundaries`、`totalMissedSavingsBytes` 与 `verdict`。
   REQ：REQ-COMPACT-1、REQ-COMPACT-2、REQ-COMPACT-3、REQ-COMPACT-4
   范围：`blueprint-diagnostics/lib/audit.js`
   AC：AC-COMPACT-001、AC-COMPACT-003、AC-COMPACT-004
2. 在 `lib/thresholds.js` 中加 `compact-boundaries-missed` 块。
   REQ：REQ-COMPACT-4
   范围：`blueprint-diagnostics/lib/thresholds.js`
   AC：AC-COMPACT-005
3. 在 `lib/report.js` 中渲染 `## Compact boundaries` Markdown 段；`boundaries.length === 0` 时省略。
   REQ：REQ-COMPACT-5、REQ-COMPACT-6
   范围：`blueprint-diagnostics/lib/report.js`
   AC：AC-COMPACT-001、AC-COMPACT-002
4. 在 `lib/compare.js` 加 `compact boundaries missed` 行。
   REQ：REQ-COMPACT-7
   范围：`blueprint-diagnostics/lib/compare.js`
   AC：AC-COMPACT-006
5. 写 `tests/compact-boundaries.test.js` 覆盖全部六个场景；添加两个 fixture。
   REQ：REQ-COMPACT-1、REQ-COMPACT-2、REQ-COMPACT-3、REQ-COMPACT-4、REQ-COMPACT-5、REQ-COMPACT-6、REQ-COMPACT-7、REQ-COMPACT-8
   范围：`blueprint-diagnostics/tests/compact-boundaries.test.js`、`blueprint-diagnostics/tests/fixtures/compact-boundaries-session.jsonl`、`blueprint-diagnostics/tests/fixtures/no-task-done-session.jsonl`
   AC：AC-COMPACT-001..AC-COMPACT-006
6. 编写 `docs/diagnostics/README.md` 与 `README.zh.md` 更新，描述新段、阈值块与零事件回退。
   REQ：REQ-COMPACT-5、REQ-COMPACT-6
   范围：`blueprint-diagnostics/docs/diagnostics/README.md`、`blueprint-diagnostics/docs/diagnostics/README.zh.md`
   AC：AC-COMPACT-008
7. 跑 `node --experimental-test-isolation=none --test "blueprint-diagnostics/tests/*.test.js"` 与 `node lib/cli.js docs check --cwd .`。
   REQ：全部
   范围：-
   AC：AC-COMPACT-007、AC-COMPACT-008

## 生命周期

- 状态：拟议
- 批准后的目标状态：已实现（文件移至 `.specs/implemented/`）

## 事实变化

新增事实：
- `report.compactBoundaries` 存在于 `AuditReport`，含 `boundaries`、`totalBoundaries`、`totalMissedSavingsBytes`、`verdict`。
- `verdicts["compact-boundaries-missed"]` 对每份报告都会计算。
- 至少含一条 `task/done` 事件时输出 `## Compact boundaries` Markdown 段。
- `THRESHOLDS["compact-boundaries-missed"]` 块存在于 `lib/thresholds.js`。
- `compare` 输出新增 `compact boundaries missed` 行。

保留事实：
- `AuditReport` 上既有所有字段、既有 CLI 行为、既有所有测试。

## 可追溯性

REQ-COMPACT-1 → scenario[three-task-done-renders] → task 1 → AC-COMPACT-001、AC-COMPACT-003 → 验证 tests/compact-boundaries.test.js
REQ-COMPACT-2 → scenario[segment-bucket-correctness] → task 1 → AC-COMPACT-003 → 验证 tests/compact-boundaries.test.js
REQ-COMPACT-3 → scenario[three-task-done-renders] → task 1 → AC-COMPACT-004 → 验证 tests/compact-boundaries.test.js
REQ-COMPACT-4 → scenario[verdict-color-from-threshold]、[verdict-color-red] → task 1、2 → AC-COMPACT-004、AC-COMPACT-005 → 验证 tests/compact-boundaries.test.js
REQ-COMPACT-5 → scenario[no-task-done-omits-section] → task 3 → AC-COMPACT-002 → 验证 tests/compact-boundaries.test.js
REQ-COMPACT-6 → scenario[three-task-done-renders] → task 3 → AC-COMPACT-001 → 验证 tests/compact-boundaries.test.js
REQ-COMPACT-7 → scenario[compare-adds-row] → task 4 → AC-COMPACT-006 → 验证 tests/compact-boundaries.test.js
REQ-COMPACT-8 → 所有场景（隐式不变量）→ 既有测试 `tests/audit.test.js` 的 no-host-import 断言 → AC-COMPACT-007 → 验证 tests/compact-boundaries.test.js

## 未决决策

无。五个关键问题（事件 schema、段窗口、阈值默认值、省略段规则、compare 行）均在上文确定。

## 质量自检

- 需求完整：✓
- 需求无歧义：✓
- 需求有边界：✓
- 需求能感知失败：✓（无 `task/done`、缺 schema 字段、空段都覆盖）
- 需求可测：✓
- 需求无矛盾：✓

## 跨工件分析

- 需求到场景：✓ 8 个 REQ 全部被 6 个场景覆盖
- 需求到影响：✓ 8 个 REQ 全部映射到「## 范围」里的文件
- 需求到任务：✓ 每个任务列出 REQ
- 需求到验收：✓ 每个 AC 注明 REQ
- 需求到验证：✓ 每个 AC 注明验证命令或测试
- 任务到范围：✓ 每个任务注明范围路径
- 设计到范围：不适用（bounded change）
- 范围到路径：✓ 每个范围路径对应真实路径

## 结果

Blueprint 已通过与需求关联的验收自动完成本次交付。

- 验收快照：`git-index:cb927223fd3086a7516a383e27bb1603bfb849eb98630c8dcb1a2ac9f5fb86e3`
- 验收尝试：`attempt-3`
- 结论：Phase 3 (compact-at-checkpoint) implementation complete. blueprint-diagnostics/lib/audit.js now walks task/done events and populates report.compactBoundaries; thresholds.js gains the compact-boundaries-missed block (1 MiB yellow, 4 MiB red); report.js renders the new ## Compact boundaries section (omitted entirely when no task/done events are present); compare.js adds a compact boundaries missed row. 5 new tests pass; docs/diagnostics/README.{md,zh.md} pair documented.
- AC 证据：8 项全部通过。
- 检查证据：compact-boundaries-unit（command）、thresholds-loaded（inspection）、full-suite（command）、docs（inspection）。
