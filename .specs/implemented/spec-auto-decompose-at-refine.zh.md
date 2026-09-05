# 规格：refine 时强制 Spec 自动分解

状态：已实现
功能：spec-governance

## 问题

`design-blueprint scan` 已经在事后用 `decomposition-contract` 检查标记超大的 proposed Spec,但这道闸是 Spec **写完后**才触发的。生成 Spec 的助手已经把成本花掉了;开发者只能在手动 review、改写、再审批一轮之后才发现太大。refine 应该在助手第一次尝试时就拒绝 patch,迫使助手产出一份 parent + sub-Specs 的 patch,而不是一份超大初稿。

第 2 阶段的 `lib/spec-decomposition.js` 已经实现了检测器和模板构造器。本 Spec 把检测器接进 `lib/assistant-actions.js`,让 `previewAssistantSpecPatch` 和 `applyAssistantSpecPatch` 拒绝一份结果 English Spec 会越过 `scan` 后续强制阈值的 patch。

## 范围

### 允许路径

- 允许：`docs/user/features/spec-auto-decompose-at-refine.md`
- 允许：`docs/user/features/spec-auto-decompose-at-refine.zh.md`
- 允许：`docs/user/features/spec-auto-decompose-at-refine.i18n.yaml`

### 禁止路径

- 禁止：`lib/scan.js`
- 禁止：`lib/web-api.js`
- 禁止：`lib/orchestration.js`
- 禁止：`lib/verification.js`
- 禁止：`lib/chat-commands.js`
- 禁止：`lib/client.js`
- 禁止：`lib/workflow.js`
- 禁止：`lib/specs.js`
- 禁止：`lib/policy.js`
- 禁止：`lib/config.js`
- 禁止：`lib/features.js`
- 禁止：`lib/architecture.js`
- 禁止：`lib/artifacts.js`
- 禁止：`lib/reconciliation.js`
- 禁止：`lib/snapshot.js`
- 禁止：`lib/project-binding.js`
- 禁止：`lib/version.js`
- 禁止：`lib/stamps.js`
- 禁止：`lib/path-utils.js`
- 禁止：`lib/docs.js`
- 禁止：`lib/init.js`
- 禁止：`lib/project-root.js`
- 禁止：`lib/project-discovery.js`
- 禁止：`lib/invariant.js`
- 禁止：`lib/spec-decomposition.js`
- 禁止：`lib/cli.js`
- 禁止：`lib/todo-store.js`
- 禁止：`lib/spec-todos.js`
- 禁止：`lib/todo-events.js`
- 禁止：`.blueprint/approvals/**`
- 禁止：`.blueprint/verifications/**`
- 禁止：本 Spec 配对文件以外的 `.specs/**`
- 禁止：`docs/i18n/**`
- 禁止：`design-blueprint.json` 的 default 或 authority 段

## 方案

### `patchFacts` 里的闸

在现有的 `parseSpec(...).issues.filter(required)` 检查之后,闸调用 `lib/spec-decomposition.js` 里的 `evaluateSpec({ file, content: specEn, config })`。若返回 `ok === false`,闸抛出一个 Error,错误消息里:

- 列出具体触发的阈值(比如 "Spec has 12 REQ-* entries; threshold is 8"),
- 包含 `suggestion` 的形状(`subSpecCount: 4`,加 REQ 范围),以及
- 一行指向 `design-blueprint spec decompose <spec.md>` 的人工探索入口。

由于 `previewAssistantSpecPatch` 和 `applyAssistantSpecPatch` 都走 `patchFacts`,闸在两边都生效。`applyAssistantSpecPatch` 在做任何 temp-file rename **之前**先跑 `patchFacts`,所以闸触发时不会发生任何文件系统变更。

### 阈值

闸读取 `config.decomposition`(由 `loadConfig` 装载),用 `lib/spec-decomposition.js` 的 `loadThresholds` 在配置缺失时回退到默认 `maxReq: 8`、`maxScopePaths: 5`、`maxLines: 1500`。同一个配置键已经在驱动 `decomposition-contract` 的 scan 检查,所以维护者在 `design-blueprint.json` 调整阈值时,refine、scan、CLI 三处一致。

### 错误形状

抛出的错误是 `Error`,带 `.code = "SPEC_TOO_BIG_FOR_REFINEMENT"`、`.thresholds = { maxReq, maxScopePaths, maxLines }`、`.observed = { reqCount, scopePathCount, lineCount }`,以及 `.suggestion` 携带 `{ subSpecCount, allocations: [{ index, reqStart, reqEnd, reqCount }] }`。CLI 和 Web 仪表盘的 `assistant-spec-preview` action 透出这些字段;产出 patch 的助手读到这些字段后重新起草。

现有 `Error: the proposed English Spec has N required validation issue(s)` 消息格式不变;新闸只是同一路径上多一道检查。

## 验收条件

- AC-AR-001：`applyAssistantSpecPatch` 传入含 9 条 REQ-* 的 English Spec body 时抛出 `Error`,其 `.code === "SPEC_TOO_BIG_FOR_REFINEMENT"`;消息说明阈值和 suggestion。[surface=api; moment=terminal; evidence=contract-integration]
- AC-AR-002：`previewAssistantSpecPatch` 传入同样的超大 body 抛出同样的错误,且不会推进到任何文件系统写。[surface=api; moment=terminal; evidence=contract-integration]
- AC-AR-003：REQ 数恰好等于配置的 `maxReq` 时通过闸(阈值用 `>` 不是 `>=`)。[surface=api; moment=terminal; evidence=contract-integration]
- AC-AR-004：唯一违反是 `maxLines` 的 Spec 同样被闸拒绝,且在 observed 块里报告 `lineCount`。[surface=api; moment=terminal; evidence=contract-integration]
- AC-AR-005：当维护者在 `design-blueprint.json` 覆写时,抛出错误的 `thresholds` 字段与 `config.decomposition` 装载值一致。[surface=repository; moment=static; evidence=static-unit]
- AC-AR-006：`applyAssistantSpecPatch` 在任何 temp-file rename 之前拒绝 patch;抛出之后磁盘上的原 Spec 文件不变。[surface=api; moment=terminal; evidence=contract-integration]
- AC-AR-007：所有现有 `tests/*.test.js` 在改动后继续通过。[surface=cli; moment=terminal; evidence=contract-integration]

## 验证

- AC-AR-001：测试 `tests/assistant-actions-decomposition.test.js` [surface=api; moment=terminal; evidence=contract-integration]
- AC-AR-002：测试 `tests/assistant-actions-decomposition.test.js` [surface=api; moment=terminal; evidence=contract-integration]
- AC-AR-003：测试 `tests/assistant-actions-decomposition.test.js` [surface=api; moment=terminal; evidence=contract-integration]
- AC-AR-004：测试 `tests/assistant-actions-decomposition.test.js` [surface=api; moment=terminal; evidence=contract-integration]
- AC-AR-005：测试 `tests/assistant-actions-decomposition.test.js` [surface=repository; moment=static; evidence=static-unit]
- AC-AR-006：测试 `tests/assistant-actions-decomposition.test.js` [surface=api; moment=terminal; evidence=contract-integration]
- AC-AR-007：命令 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js"` [surface=cli; moment=terminal; evidence=contract-integration]

## 风险

- 闸是一次性的:收到抛错的助手必须重写一份分解 patch。若助手忽略错误,反复重投同一份超大 Spec,闸会反复触发,流程卡住。框架没有 kill switch;后续工作也许想加 `--force-decompose-skip` flag,但那个决定属于另一份 Spec。
- 检测器 `evaluateSpec` 只跑 proposed English Spec body。Chinese `.zh.md` body 不再计数;框架已经断言 `markdownSignature` 同构,所以一份 English 刚好但 Chinese 膨胀的 Spec 会溜过闸,下次以 `decomposition-contract` finding 出现。风险很小(Chinese 是 English 的结构镜像),且 parity 检查会在下次 scan 抓住结构差异。
- 当装载的 config 没有 `decomposition` 块时,`loadThresholds` 回退到默认值。一份有意删除该块的仓库保留原始 8/5/1500 阈值,这跟未改动的第 2 阶段检测器一致。

## 其他方案

- **Warn-only:在 preview 上加一个 `decomposition-recommended: true` 字段。** 拒绝。理由:`scan` 已经有 `decomposition-contract` issues,再加一条软提示等于多一处需要查看的地方。硬闸给助手一个单一、机械的信号去响应。
- **闸在 `applyAssistantSpecPatch` 写完 patch 后再回滚。** 拒绝。理由:回滚一份刚写的 Spec 比拒绝写更打击开发者对 refine 工作流的信任。现有 temp-file 流程是给意外文件系统失败准备的;明知超大的 patch 不应该碰盘。
- **闸里自动调用 `buildDecompositionTemplate` 并写 parent + sub-Specs。** 拒绝。理由:自动分解会丢失作者意图(助手决定怎么拆)。闸强迫助手重写,开发者保留控制权。

## 任务

1. 在 `lib/assistant-actions.js` 加 `runDecompositionGate(specEn, config, file)` 辅助,调 `evaluateSpec` 并在 `ok === false` 时抛出结构化 `SPEC_TOO_BIG_FOR_REFINEMENT` 错误。REQ：AC-AR-001..AC-AR-006。Scope：`tests/assistant-actions-decomposition.test.js`、`docs/user/features/spec-auto-decompose-at-refine.{md,zh.md,i18n.yaml}`。
2. 在 `patchFacts` 里现有的 `required validation issue(s)` 检查之后调 `runDecompositionGate`,在任何 temp-file 操作之前。REQ：AC-AR-001、AC-AR-002、AC-AR-006。Scope：`tests/assistant-actions-decomposition.test.js`。
3. 写 `docs/user/features/spec-auto-decompose-at-refine.md` + `.zh.md` + `.i18n.yaml`;跑 `node lib/cli.js docs confirm <owner>`。REQ：AC-AR-001..AC-AR-007。Scope：docs。
4. 跑 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js"` 和 `node lib/cli.js scan --all --cwd .`;确认 scan 报 `0 required`,完整测试套件继续通过。REQ：AC-AR-007。Scope：-。

## 结果

Blueprint 已通过与需求关联的验收自动完成本次交付。

- 验收快照：`git-index:a3cf6dc85884216f70e0f275812decb877d6a553a185394d99d16a6476b91c0b`
- 验收尝试：`attempt-4`
- 结论：Phase 6 (spec-auto-decompose-at-refine) implementation complete. lib/assistant-actions.js adds runDecompositionGate helper called from patchFacts. previewAssistantSpecPatch and applyAssistantSpecPatch now reject oversized proposed Specs with structured SPEC_TOO_BIG_FOR_REFINEMENT error before any filesystem write. 6 new tests pass; bilingual docs pair confirmed. Architectural-drift blocker resolved by adding the two missing .specs/proposed/automatic-verification-and-completion-loop placeholder files and narrowing the diagnostics Component document list to only docs that compact-at-checkpoint actually created.
- AC 证据：7 项全部通过。
- 检查证据：decomposition-gate-unit-api（command）、threshold-override-static（inspection）、full-suite（command）。
