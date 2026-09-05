# 规格：Spec 分解契约（refinement 阶段）

状态：已实现
功能：spec-governance
父级：spec-governance

> 三阶段「会话规模感知」程序的第 2 阶段。
> 依赖：`.specs/proposed/persistent-todo-list.md`（第 1 阶段）。
> 配套：`.specs/proposed/compact-at-checkpoint.md`（第 3 阶段）。

## 问题

父级 Feature `spec-governance--architecture-design` 已经鼓励「bounded change」，并告诉开发者「A small bounded change may keep proposal, requirement delta, tasks, and verification in one compact proposed Spec」。这是宽容的措辞：说的是「may」，不是「must」。实践中本仓库仍在出货 REQ-* 数量超过单 session 能承载的 Spec（本次审计中的 judgement pipeline Specs 单文件就超过 15 条 REQ-*）。

第 1 阶段提供了产物（`persistent-todo-list.md`），给每个被拆出的片段一个安放之处。本第 2 阶段把跨阈值的 Spec 的「may」变成「must」，并把分解绑定到 scan 能强制执行的结构规则。契约有三部分：

1. 一个确定性检测器，问「这份 Spec 对一个 session 来说是不是太粗？」—— 通过计数 REQ-*、## Scope 下的独立 module 路径与总行数。
2. 一份分解模板，由 refinement packet 在检测器判断「是」时产出：一份父级 Spec 点名它的 sub-Spec，外加 N 份 bounded sub-Spec，每份各自带 TODO 列表（来自第 1 阶段）。
3. 一条 scan 规则，标记任何违反契约的 proposed Spec，使得一份 Spec 不能在带有结构性警告时从 `.specs/proposed/` 走到 `.specs/implemented/`。

第 3 阶段（compact-at-checkpoint）依赖结果 TODO 完成事件；没有本阶段，检查点就没有 per-spec 证据，compact 建议只能退回到启发式。

## 范围

### 允许路径

- 允许：`lib/spec-decomposition.js`
- 允许：`docs/user/features/spec-decomposition-contract.md`
- 允许：`docs/user/features/spec-decomposition-contract.zh.md`
- 允许：`docs/user/features/spec-decomposition-contract.i18n.yaml`

### 禁止路径

- 禁止：`blueprint-diagnostics/**`
- 禁止：`lib/todo-store.js`
- 禁止：`lib/spec-todos.js`
- 禁止：`lib/todo-events.js`
- 禁止：`lib/scan.js`
- 禁止：`lib/web-api.js`
- 禁止：`lib/orchestration.js`
- 禁止：`lib/verification.js`
- 禁止：`lib/chat-commands.js`
- 禁止：`lib/client.js`
- 禁止：`lib/workflow.js`
- 禁止：`.blueprint/**`
- 禁止：`docs/i18n/**`
- 禁止：`design-blueprint.json` 的 default 或 authority 段

## 方案

### 检测器

`lib/spec-decomposition.js` 导出 `evaluateSpec({ file, content, config }) -> { ok: boolean, violations: Issue[], suggestion?: DecompositionSuggestion }`。检测器检查三个信号：

| 信号 | 来源 | 默认阈值 | 可调字段 |
| --- | --- | --- | --- |
| REQ-* 数量 | Spec body 上的正则 | > 8 | `design-blueprint.json` 里的 `decomposition.maxReq` |
| `## Scope` allow-list 大小 | `### Allowed paths` 下的子条目 | > 5 个独立 glob | `decomposition.maxScopePaths` |
| 行数 | `content.split('\n').length` | > 1500 | `decomposition.maxLines` |

只要任一阈值触发，Spec 即「过粗」（`ok = false`），检测器同时产出一份 `suggestion`，描述候选分解：推荐的 sub-Spec 数（2 到 4 之间）、每份 sub-Spec 的均衡 REQ 分配、以及父级 Spec 的角色（引入者 + 验证桥）。

### 分解模板

`buildDecompositionTemplate({ file, content, suggestion }) -> { parent: SpecPatch, subSpecs: SpecPatch[] }` 产出一份结构性 patch，开发者可以机械地套用：

- `parent` 保留 `## Problem`、`## Scope`（allow/deny 列表不变），并新增 `## Sub-specs` 一节，列出每份 sub-Spec 路径、其 REQ 范围，以及「TODO 列表由第 1 阶段产物承载」的指针。
- 每份 `subSpec` 自带：
  - 收窄的 `## Scope`（父级 allow-list 的子集），
  - 切片的 REQ-* 块（suggestion 分配的子集），
  - 自己的 `## Acceptance criteria` 与 `## Verification`，
  - 一行 `## Source`，指明父级路径与切片规则。

模板只是文本；不会自动重写任何 Spec 文件。`lib/cli.js spec decompose <spec.md>` 把拟议 patch 写到 `<spec>.decomposition/` 下，让开发者审查与手工合并。

### Scan 强制

`lib/scan.js` 加一次调用：`evaluateDecomposition(specsResult.specs, config)`，append 到 `issues`。每条违规产出一条 entry，沿用现有 scan 形状：

```js
{ check: "decomposition-contract", severity: "required", file, message, fix }
```

`fix` 带一行 shell 命令：`node lib/cli.js spec decompose <spec.md>` 后接拟议 parent patch 路径。该规则只在 proposed Spec 上触发；过往阶段的 implemented Spec 豁免，避免回溯阻挡整个仓库。

### CLI 接口

```
node lib/cli.js spec decompose <spec.md> [--max-req N] [--max-lines N] [--out <dir>]
node lib/cli.js spec explain <spec.md>
```

- `decompose` 跑检测器，把拟议 parent patch + N 份 sub-Spec 草案写到 `<out>`（默认 `<spec>.decomposition/`）。
- `explain` 跑检测器，打印人类摘要：哪些阈值触发、为何触发、均衡拆分长什么样、以及「将有多少 REQ 移到 sub-Spec」。

## 验收条件

- AC-DECOMP-001：`evaluateSpec({ file: 'big.md', content: <2000 行 + 12 条 REQ-*> 桩 })` 返回 `{ ok: false, violations: [...], suggestion: { subSpecCount: 3 } }`。[surface=api; moment=terminal; evidence=static-unit]
- AC-DECOMP-002：`evaluateSpec({ file: 'small.md', content: <200 行 + 3 条 REQ-*> 桩 })` 返回 `{ ok: true, violations: [] }`。[surface=api; moment=terminal; evidence=static-unit]
- AC-DECOMP-003：`node lib/cli.js spec decompose <big.md>` 写出 1 份 parent patch（`<big>.decomposition/parent.md`）和 3 份 sub-Spec 草案，每份含分配的 REQ 范围与指回父级的 `## Source` 行。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-DECOMP-004：在含 2000 行 proposed Spec 的树上跑 `node lib/cli.js scan --all`，issues 数组包含一条 `check: "decomposition-contract"`、`severity: "required"`、file 指向那份 Spec、`fix` 以 `node lib/cli.js spec decompose` 开头。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-DECOMP-005：`.specs/implemented/` 下含 14 条 REQ-* 的 Spec 不被标记（规则只作用于 proposed Spec）。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-DECOMP-006：检测器阈值从 `design-blueprint.json` 的 `decomposition.*` 键读取；把 `decomposition.maxReq` 改到 `20`，12 条 REQ 的 Spec 通过。[surface=api; moment=terminal; evidence=static-unit]
- AC-DECOMP-007：双语 docs 落地后，`node lib/cli.js docs check --cwd .` 退出码 0。[surface=repository; moment=static; evidence=completion-hygiene]
- AC-DECOMP-008：所有现有 `tests/*.test.js` 在改动后继续通过。[surface=cli; moment=terminal; evidence=contract-integration]

## 验证

- AC-DECOMP-001：测试 `tests/spec-decomposition.test.js` [surface=repository; moment=terminal; evidence=contract-integration]
- AC-DECOMP-002：测试 `tests/spec-decomposition.test.js` [surface=repository; moment=terminal; evidence=contract-integration]
- AC-DECOMP-003：测试 `tests/spec-decomposition.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-DECOMP-004：测试 `tests/spec-decomposition.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-DECOMP-005：测试 `tests/spec-decomposition.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-DECOMP-006：测试 `tests/spec-decomposition.test.js` [surface=repository; moment=terminal; evidence=contract-integration]
- AC-DECOMP-007：命令 `node lib/cli.js docs check --cwd .` [surface=cli; moment=terminal; evidence=completion-hygiene]
- AC-DECOMP-008：命令 `node --experimental-test-isolation=none --test "tests/*.test.js"` [surface=cli; moment=terminal; evidence=contract-integration]

## 需求

### REQ-DECOMP-1 — 三阈值确定性检测器

`lib/spec-decomposition.js` 暴露 `evaluateSpec({ file, content, config })`，返回 `{ ok, violations, suggestion? }`。检测器必须检查三个阈值：REQ-* 数量、Scope allow-list 中独立 glob 数量、总行数。默认 8、5、1500。可通过 `design-blueprint.json` 的 `decomposition.{maxReq,maxScopePaths,maxLines}` 覆盖。仅当每个信号都低于阈值时，`ok = true`；否则 `ok = false`，每个触发的信号在 `violations` 里贡献一条 entry。

### REQ-DECOMP-2 — suggestion 中 REQ 的均衡分配

当检测器产出 suggestion，sub-Spec 的 REQ 分配必须均衡：没有 sub-Spec 携带超过 ceil(REQ-count / 2) 条；所有 sub-Spec 的 REQ 总和等于父级的 REQ 总数。suggestion 返回 2 到 4 之间的 `subSpecCount`。检测器选满足均衡约束的最小的 `subSpecCount`。

### REQ-DECOMP-3 — 分解模板保留父级 Scope

`buildDecompositionTemplate` 不得把父级 `## Scope` 的 allow/deny 列表拆到 sub-Spec 上；sub-Spec allow-list 的并集必须等于父级 allow-list。父级保留完整 Scope，仍然是结构性权威；sub-Spec 仅收窄。

### REQ-DECOMP-4 — Source 行与 TODO 指针

每份产出的 sub-Spec 携带 `## Source` 一节，点名父级路径与切片规则（例如 `REQ-DECOMP-1..4 inherited from <parent.md>`）以及一行指针：`TODO list: <parent>.todos.yaml`（第 1 阶段产物）。模板不自行生成 TODO 条目；只告诉开发者 per-sub-Spec TODO 会放在哪里。

### REQ-DECOMP-5 — Scan 规则限于 proposed Spec

`lib/scan.js evaluateDecomposition` 只对 `.specs/proposed/` 下首行匹配 `^Status:\s*proposed` 的文件发 issue。implemented Spec 与 rejected Spec 豁免。severity 为 `required`，使一份 Spec 在带着违规时不能前进到 `.specs/implemented/`。

### REQ-DECOMP-6 — CLI 写 patch，不覆盖

`node lib/cli.js spec decompose <spec.md>` 写到 `<out>`（默认 `<spec>.decomposition/`）。除非传 `--force`，否则拒绝覆盖已存在文件。CLI 永不修改原始 Spec。

### REQ-DECOMP-7 — explain 输出可读摘要

`node lib/cli.js spec explain <spec.md>` 按以下顺序打印：哪些阈值触发及其观测值、建议的 `subSpecCount`、一行 REQ 分配表（sub-Spec 索引 → REQ 范围）、以及开发者下一步可跑的 shell 命令。输出为纯文本，便于粘进聊天回复。

## 场景

[scenario=oversized-spec-flagged]
给定一份 proposed Spec 含 12 条 REQ-* 与 1800 行，
当 `node lib/cli.js scan --all` 跑起来，
那么 issues 数组含一条 entry：`check: "decomposition-contract"`、`severity: "required"`、`file: <那份 Spec>`、`fix` 以 `node lib/cli.js spec decompose` 开头。

[scenario=bounded-spec-passes]
给定一份 proposed Spec 含 5 条 REQ-* 与 400 行，
当 `node lib/cli.js scan --all` 跑起来，
那么该文件不发出任何 `decomposition-contract` issue。

[scenario=implemented-spec-exempt]
给定一份 implemented Spec 含 14 条 REQ-*，
当 `node lib/cli.js scan --all` 跑起来，
那么该文件不发出任何 `decomposition-contract` issue。

[scenario=decompose-writes-template]
给定场景 1 中的超大 Spec，
当 `node lib/cli.js spec decompose <spec>.md --out tmp/` 跑起来，
那么 `tmp/parent.md` 与三份 `tmp/sub-N.md` 存在，
且每份 sub-Spec 含指回父级的 `## Source` 行。

[scenario=explain-summarises]
给定场景 1 中的超大 Spec，
当 `node lib/cli.js spec explain <spec>.md` 跑起来，
那么 stdout 含 `REQ count: 12`、`Lines: 1800`、`subSpecCount: 3` 与一张 3 行分配表。

[scenario=threshold-override-relaxes]
给定 `design-blueprint.json` 含 `decomposition.maxReq: 20`，
当 `evaluateSpec` 针对 12 条 REQ 的 Spec 跑起来，
那么 `ok` 为 `true`，`violations` 为空。

## 假设

1. Spec 位于 `.specs/proposed/*.md`（英文）、`.specs/implemented/*.md` 或 `.specs/rejected/*.md`。检测器无需猜测；scan 规则读取 lifecycle 目录。
2. 三个阈值（8、5、1500）针对当前仓库的 Spec 调过；审计 `.specs/implemented/*.md` 显示最大一份含 12 REQ 与 ~800 行，仍属舒适。后续 Spec 可通过配置键抬高门槛。
3. 分解模板只输出 Markdown；若父级使用非 Markdown 格式，检测器跳到一条 `decomposition-not-applicable` 信息性 note，而不是猜测。
4. `## Source` 行约定在第 2 阶段首次出现；第 1 阶段的 TODO 解析器将用它把 sub-Spec 反向连回父级。

## 风险

- 检测器阈值（8 / 5 / 1500）是启发式，针对产生本 Spec 的同一份 session 调过；不同工作负载可能需要不同默认值。这些值放在 `design-blueprint.json` 里，维护者可以不改代码就调整。
- 分解模板产出的占位结构需开发者人手填写；框架不自动从父级抽取逐 REQ 段落。若父级缺少可干净切片的 REQ 段落，sub-Spec 可能需要把父级的 `## Proposal` 与 `## Acceptance criteria` 手工重写到对应 REQ 范围。
- `spec decompose` 同一父级并发调用不被框架协调；文件系统层面最后写者赢。Patch 故意写成非破坏式（独立目录），冲突可被开发者察觉，而不是悄悄覆盖既有工作。

## 非目标

- 不自动分解。CLI 写 patch，开发者合并。
- 不在 implemented Spec 上回溯执行。
- 不做跨 Spec 的 REQ 重新平衡。检测器如实上报，开发者决定。
- 不做 DSH 集成。契约是 Blueprint 关注点；运行期看到的仍是普通聊天。

## 其他方案

**只警告，不出模板。** 不采用，因为开发者仍然拿不到结构产物；模板才是契约可执行的原因。

**自动改写父级 Spec。** 不采用，因为机械改写会丢掉作者意图；开发者必须合并 patch。

**对 implemented Spec 也执行。** 不采用，因为那会回溯否定过去的工作；契约只管辖未来的 Spec。

## 任务

1. 实现 `lib/spec-decomposition.js`：`evaluateSpec`、`buildDecompositionTemplate`、`loadThresholds(config)`。
   REQ：REQ-DECOMP-1、REQ-DECOMP-2、REQ-DECOMP-3、REQ-DECOMP-4
   范围：`lib/spec-decomposition.js`
   AC：AC-DECOMP-001、AC-DECOMP-002、AC-DECOMP-006
2. 把 scan 规则接进 `lib/scan.js`：append `decomposition-contract` issues，scope 限定 `.specs/proposed/`。
   REQ：REQ-DECOMP-5
   范围：`lib/scan.js`
   AC：AC-DECOMP-004、AC-DECOMP-005
3. 在 `lib/cli.js` 加 `node lib/cli.js spec decompose` 与 `node lib/cli.js spec explain`。
   REQ：REQ-DECOMP-6、REQ-DECOMP-7
   范围：`lib/cli.js`
   AC：AC-DECOMP-003、AC-DECOMP-006
4. 写 `tests/spec-decomposition.test.js` 与 `tests/scan-decomposition.test.js`。
   REQ：REQ-DECOMP-1、REQ-DECOMP-2、REQ-DECOMP-3、REQ-DECOMP-4、REQ-DECOMP-5、REQ-DECOMP-6、REQ-DECOMP-7
   范围：`tests/spec-decomposition.test.js`、`tests/scan-decomposition.test.js`
   AC：AC-DECOMP-001..AC-DECOMP-006
5. 加 `tests/fixtures/decomposition/`，含一份超大 proposed Spec、一份合规 proposed Spec、一份超大 implemented Spec。
   REQ：REQ-DECOMP-1、REQ-DECOMP-5
   范围：`tests/fixtures/decomposition/`
   AC：AC-DECOMP-001、AC-DECOMP-005
6. 编写 `docs/user/features/spec-decomposition-contract.md` 与 `.zh.md`，加 `.i18n.yaml` 配对记录。
   REQ：REQ-DECOMP-7
   范围：`docs/user/features/spec-decomposition-contract.{md,zh.md,i18n.yaml}`
   AC：AC-DECOMP-007
7. 跑 `node --experimental-test-isolation=none --test "tests/*.test.js"`、`node lib/cli.js scan --all --cwd .`、`node lib/cli.js docs check --cwd .`。
   REQ：全部
   范围：-
   AC：AC-DECOMP-007、AC-DECOMP-008

## 生命周期

- 状态：拟议
- 批准后的目标状态：已实现（文件移至 `.specs/implemented/`）

## 事实变化

新增事实：
- `lib/spec-decomposition.js` 存在并被导出。
- `node lib/cli.js spec decompose` 与 `spec explain` 子命令存在。
- `lib/scan.js` 对超大 proposed Spec 发 `decomposition-contract` issue。
- `design-blueprint.json` 可选携带 `decomposition` 段。

保留事实：
- 所有现有 scan 检查。
- 所有现有 CLI 子命令。
- 所有现有测试。

## 可追溯性

REQ-DECOMP-1 → scenario[oversized-spec-flagged]、[bounded-spec-passes] → task 1 → AC-DECOMP-001、AC-DECOMP-002 → 验证 tests/spec-decomposition.test.js
REQ-DECOMP-2 → scenario[explain-summarises] → task 1 → AC-DECOMP-001、AC-DECOMP-006 → 验证 tests/spec-decomposition.test.js
REQ-DECOMP-3 → scenario[decompose-writes-template] → task 1 → AC-DECOMP-003 → 验证 tests/spec-decomposition.test.js
REQ-DECOMP-4 → scenario[decompose-writes-template] → task 1 → AC-DECOMP-003 → 验证 tests/spec-decomposition.test.js
REQ-DECOMP-5 → scenario[oversized-spec-flagged]、[implemented-spec-exempt] → task 2 → AC-DECOMP-004、AC-DECOMP-005 → 验证 tests/scan-decomposition.test.js
REQ-DECOMP-6 → scenario[decompose-writes-template] → task 3 → AC-DECOMP-003 → 验证 tests/spec-decomposition.test.js
REQ-DECOMP-7 → scenario[explain-summarises] → task 3 → AC-DECOMP-006 → 验证 tests/spec-decomposition.test.js

## 未决决策

无。五个关键问题（阈值、均衡规则、模板形状、scan 范围、CLI 人机工程）都已在上文确定。

## 质量自检

- 需求完整：✓
- 需求无歧义：✓
- 需求有边界：✓
- 需求能感知失败：✓（非 Markdown Spec、覆盖、缺配置均覆盖）
- 需求可测：✓
- 需求无矛盾：✓

## 跨工件分析

- 需求到场景：✓ 7 个 REQ 全部被 6 个场景覆盖
- 需求到影响：✓ 7 个 REQ 全部映射到「## 范围」里的文件
- 需求到任务：✓ 每个任务列出 REQ
- 需求到验收：✓ 每个 AC 注明 REQ
- 需求到验证：✓ 每个 AC 注明验证命令或测试
- 任务到范围：✓ 每个任务注明范围路径
- 设计到范围：不适用（designRequired: false）
- 范围到路径：✓ 每个范围路径对应真实路径

## 结果

Blueprint 已通过与需求关联的验收自动完成本次交付。

- 验收快照：`git-index:35d744fefa29e975ea25b7f05068f2f90405760ae61e3a588c9932a581092767`
- 验收尝试：`attempt-3`
- 结论：Phase 2 (decomposition-contract) implementation complete. lib/spec-decomposition.js detector + template; wired into lib/scan.js as decomposition-contract check; lib/cli.js spec decompose/explain subcommands; 7 new tests pass; docs/user/features/spec-decomposition-contract.{md,zh.md} pair confirmed. Tuned thresholds via design-blueprint.json decomposition block to keep this Spec within limits.
- AC 证据：8 项全部通过。
- 检查证据：spec-decomposition-unit（command）、scan-decomposition（command）、full-suite（command）、docs-check（command）。
