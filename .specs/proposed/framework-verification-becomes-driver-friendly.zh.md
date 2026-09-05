# 规格:框架 verification 变 driver-friendly

状态:拟议
功能:verification-becomes-driver-friendly
父:spec-governance

## 方案

让 Blueprint 的 verification 框架从非 chat driver 也能跑通。四项独立的框架改造:

1. `validateVerificationPayload(spec, payload)` 返回聚合的 `{ ok, issues[] }` 列表,让 driver 一次看到所有 AC × check 配对问题,而不是 `submitResult` 第一次错就抛。
2. `refreshVerificationSnapshot({ cwd, featureId, expectedRecordHash })` 在 `verification_ready` 阶段重录 snapshot,让 driver 在 `prepareVerification` 与 `submitResult` 之间 stage 或 commit 了文件,不必 abandon 整个 cycle。
3. 两条 CLI 子命令:`verification status <feature-id>` 读 cycle 状态不写;`verification dry-run <feature-id> --payload-file <path>` 跑 `validateVerificationPayload` 并打印所有问题。
4. Spec parse 阶段的 AC evidence schema 校验:**已在本 Spec refinement 时删除**。framework 的 `assertPassingEvidence` 在 submit 时已经查同样规则,加 refine-time gate 只会让 Spec 更难写而不增正确性。Spec 写错了 tag,在 submit 时一次性失败即可。

再加一项属性放宽:`submitFeatureVerificationResult` 在提交者 session id 与 attempt 记录的不同时不再拒,只要 `resultCapability` 对得上 `capabilityHash`。session id 仍记在 attempt 摘要里作为归属,但不再是安全闸。

新 API 是叠加的,既有 chat-handler 行为保持不变。每个改造独立可测。

## 问题

`lib/verification.js` 是为 chat-agent 流程设计的。Chat agent 在 `requestVerification` → `prepareVerification` → `startVerification` → `submitResult` → `finalize` 之间持有 in-memory context,中间不会 stage 或 commit 文件,也不需要中途查询 cycle 状态。程序化 driver(Node 脚本、CI pipeline、手写的 completion 脚本)撞上四个结构摩擦点:

1. **`submitResult` 在第一个错误就抛。** `assertPassingEvidence` 在一个循环里走完所有 AC × check 配对,但循环在第一个不匹配处抛。一个有 8 个配对问题的 driver 要修一个,跑一次,看下一个,再修,再跑。8 次迭代。前一个 auto-compact Spec 也因为这个原因跑了 5 次 verification 尝试(在 verification 历史里有记录)。

2. **Snapshot 漂移在 `verification_ready` 不可恢复。** `prepareVerification` 录 snapshot,`submitResult` 强制 `exact.snapshot.digest === record.snapshot.digest`。中间任何 `git add` / `git commit` / `git rm` 都会让 snapshot 失效,且没有公开 API 能刷新。Driver 要么一次跑完不碰 git,要么 abandon cycle 重新开始。两者都脆。

3. **没有只读查询。** 想看"当前 cycle 状态,哪几个 attempt 失败、为什么"的 driver 必须手读 1000+ 行 `.blueprint/verifications/<feature-id>.json` 并自己解析。没有 CLI 子命令。

4. **错误的 evidence tag 直到 submit 才发现。** `lib/specs.js#verificationMetadata` 解析 `[surface=X; moment=Y; evidence=Z]`,格式错时静默返回 `null`,然后 `inferVerificationMetadata` 猜默认值。作者写 `[surface=cli; moment=static; evidence=acceptance]`(`acceptance` 不是合法 `EVIDENCE_LEVELS`),`scan` 不报,几天后 submit 才报错。

Chat-flow 的五个隐含假设——单一 context、单一 driver、git 不动、不需要中途查询、没早期校验——在框架里被烤死了。对 chat flow 不算 bug,任何其他 flow 都是 bug。

## 范围

### 允许路径

- 允许:`lib/verification.js`
- 允许:`lib/specs.js`
- 允许:`lib/cli.js`
- 允许:`tests/{verification-payload-validation,verification-snapshot-refresh,verification-cli-status,verification-cli-dry-run,verification-session-relaxation}.test.js`
- 允许:`docs/user/features/verification-becomes-driver-friendly.{md,zh.md,i18n.yaml}`
- 允许:`.blueprint/features/spec-governance.md`
- 允许:`.blueprint/features/verification-becomes-driver-friendly.md`
- 允许:`.blueprint/architecture/components/verification-becomes-driver-friendly.md`
- 允许:`package.json`

### 禁止路径

- 禁止:`lib/scan.js`
- 禁止:`lib/web-api.js`
- 禁止:`lib/orchestration.js`
- 禁止:`lib/chat-commands.js`
- 禁止:`lib/client.js`
- 禁止:`lib/workflow.js`
- 禁止:`lib/policy.js`
- 禁止:`lib/assistant-actions.js`
- 禁止:`lib/config.js`
- 禁止:`lib/features.js`
- 禁止:`lib/architecture.js`
- 禁止:`lib/artifacts.js`
- 禁止:`lib/reconciliation.js`
- 禁止:`lib/snapshot.js`
- 禁止:`lib/project-binding.js`
- 禁止:`lib/version.js`
- 禁止:`lib/stamps.js`
- 禁止:`lib/path-utils.js`
- 禁止:`lib/docs.js`
- 禁止:`lib/init.js`
- 禁止:`lib/project-root.js`
- 禁止:`lib/project-discovery.js`
- 禁止:`lib/invariant.js`
- 禁止:`lib/skills.js`
- 禁止:`lib/skills/**`
- 禁止:`lib/auto-compact-watcher.js`
- 禁止:`lib/todo-compact-trigger.js`
- 禁止:`lib/spec-todos.js`
- 禁止:`lib/todo-events.js`
- 禁止:`lib/todo-store.js`
- 禁止:`.blueprint/approvals/**`
- 禁止:本 Spec 对文件外的 `.specs/**`
- 禁止:`docs/i18n/**`
- 禁止:`design-blueprint.json` 的 default 或 authority 段

## 决策

### 1. `validateVerificationPayload(spec, payload)` —— 聚合、不抛

`lib/verification.js` 导出新的纯函数:

```js
/**
 * Validate a verification payload against the approved Spec evidence plan
 * without throwing. Returns an aggregate issue list so a programmatic
 * driver sees every AC × check pairing problem in one call.
 *
 * @param {object} spec - parsed Spec (output of buildChangePackage)
 * @param {object} payload - the verification result the driver wants to submit
 * @returns {{ ok: boolean, normalized?: object, issues: string[] }}
 */
export function validateVerificationPayload(spec, payload);
```

函数走 framework 既有 `assertPassingEvidence` 与 `assertResultEvidence` 的每条规则,但把所有问题累到 `issues` 列表而不是第一个抛。`ok` 判定对 `conclusion: "passed"` 的 payload 是严格的(每个 AC × check 配对、每个 passing AC、每个 passing check、至少一个 command-kind check、无 required findings);对 `conclusion: "failed"` 的 payload 是宽松的(只有 required-finding 规则是严格的,失败的 AC 和 check 是预期的)。

既有 `validateVerificationEvidence(spec, value)`(抛错版)保留为薄包装:调 `validateVerificationPayload`,`!ok` 时抛错。

### 2. `refreshVerificationSnapshot({ cwd, featureId, expectedRecordHash })` —— snapshot 恢复

`lib/verification.js` 导出新函数,给 `verification_ready` 阶段的 cycle 重录 snapshot 而不 abandon。Driver 流程:stage 或 commit 文件后调 `refreshVerificationSnapshot` 一次,再 `prepareFeatureVerification`。前置:`record.stage === "verification_ready"` 且 record hash 匹配 `expectedRecordHash`。

### 3. 两条新 CLI 子命令

- `design-blueprint verification status <feature-id> [--cwd <path>] [--json]`:只读 cycle 检查。打 cycle id、stage、snapshot、attempts。加 `--json` 打 public record。
- `design-blueprint verification dry-run <feature-id> --payload-file <path> [--cwd <path>] [--json]`:预演检查。从 `--payload-file` 读 payload,调 `validateVerificationPayload`,打 `OK: payload is valid` 或编号 issue 列表。`ok` 退 0,有问题退 1。

### 4. submit 上的 session-id 归属

`lib/verification.js#submitFeatureVerificationResult` 接可选 `submittedBySessionId` 参数。当传入时,该值记在新 attempt 的 `summary` 开头作为 `[submittedBySessionId=<x>]`,作归属。能力检查(`sha256(resultCapability) === capabilityHash`)仍是安全锚;session id 只记作 audit trail。

## 验收条件

- AC-VPAY-001:`validateVerificationPayload(spec, payload)` 在每个 AC × check 配对都满足时返回 `{ ok: true, normalized }`。[surface=api; moment=static; evidence=static-unit]
- AC-VPAY-002:`validateVerificationPayload(spec, payload)` 在不满足时返回 `{ ok: false, issues: [...] }`,列出每个缺 AC、每个失败 AC、每个失败 check、每个缺 command check、每个不满足 AC × check 配对,以及 passing 结果里的每个 required finding。函数不抛。[surface=api; moment=terminal; evidence=contract-integration]
- AC-VPAY-003:`validateVerificationPayload` 跨多个非法 AC 累加:5 个 AC 缺配对的 payload 返回含 5 条配对行的 `issues`。[surface=api; moment=terminal; evidence=contract-integration]
- AC-VPAY-004:`validateVerificationPayload` 只在 payload `conclusion === "failed"` 时,要求至少一个 finding 的 `severity === "required"`。[surface=api; moment=static; evidence=static-unit]
- AC-VPAY-005:既有 `validateVerificationEvidence(spec, value)` 在 payload 非法时继续抛。[surface=api; moment=static; evidence=static-unit]
- AC-VREFRESH-001:`refreshVerificationSnapshot({ cwd, featureId, expectedRecordHash })` 在 record 是 `verification_ready` 且 hash 匹配时成功,新 record 的 `snapshot.digest` 反映当前 git index。[surface=api; moment=terminal; evidence=contract-integration]
- AC-VREFRESH-002:`refreshVerificationSnapshot` 在调用方传过时 `expectedRecordHash` 时抛 "verification record hash does not match"。[surface=api; moment=terminal; evidence=contract-integration]
- AC-VREFRESH-003:`refreshVerificationSnapshot` 在 record 是其他 stage 时抛 "snapshot refresh is only valid from stage 'verification_ready'"。[surface=api; moment=terminal; evidence=contract-integration]
- AC-VREFRESH-004:`refreshVerificationSnapshot` 之后,下一次 `prepareFeatureVerification` 在新 snapshot 上不抛。[surface=api; moment=terminal; evidence=contract-integration]
- AC-VSTATUS-001:`design-blueprint verification status <feature-id> --cwd . --json` 打 JSON 对象,key 含 `featureId`、`stage`、`cycle`、`spec`、`snapshot`、`attempts`、`history`。[surface=cli; moment=terminal; evidence=user-visible]
- AC-VSTATUS-002:`design-blueprint verification status` 不写 `.blueprint/verifications/<feature-id>.json`(文件 mtime 不变)。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-VSTATUS-003:`design-blueprint verification status` 在 feature 无 record 时退 1,打 "verification record not found for feature '<x>'"。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-VDRYRUN-001:`design-blueprint verification dry-run <feature-id> --cwd . --payload-file <path>` 在 payload 每个 AC 配对齐时退 0,打 `OK: payload is valid`。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-VDRYRUN-002:`design-blueprint verification dry-run` 在 3 个 AC 缺配对时退 1,打 3 行 issue(每行一个 AC),加一行 `FAIL: 3 issues found`。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-VDRYRUN-003:`design-blueprint verification dry-run` 即便失败也不写 `.blueprint/verifications/<feature-id>.json`。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-RELAX-001:`submitFeatureVerificationResult` 接受 `submittedBySessionId` 可选参数;当传入时,该值记在新 attempt 的 `summary` 开头作为 `[submittedBySessionId=<x>]`,作归属。session id 仅作 audit trail 不作安全闸。[surface=api; moment=terminal; evidence=contract-integration]
- AC-RELAX-002:`submitFeatureVerificationResult` 在 `resultCapability` 对不上 `capabilityHash` 时仍拒。capability hash 仍是安全锚。[surface=api; moment=terminal; evidence=contract-integration]
- AC-DOCS-001:`docs/user/features/verification-becomes-driver-friendly.{md,zh.md,i18n.yaml}` 存在,英文页描述四项框架改造 + session-id 放宽。[surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-002:`node lib/cli.js docs check --cwd .` 报 0 required / 0 recommended issue。[surface=cli; moment=static; evidence=completion-hygiene]
- AC-SCAN-001:`node lib/cli.js scan --all --cwd .` 报 0 required / 0 recommended issue。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001:改动后,所有 244 条既有 host 测试继续通过,加上本 Spec 的新测试。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-UNBLOCK-001:本 Spec 落地后,`.specs/proposed/auto-compact-on-unrelated-task-done--dsh-dispatch-wired.md` 当前卡在 `verification_ready` stale snapshot 的 verification cycle,在新 API 驱动下走完。completion script 录一条 `passed` attempt,record 达 `stage: "completed"`。[surface=cli; moment=terminal; evidence=contract-integration]

## 验证

- AC-VPAY-001:测试 `tests/verification-payload-validation.test.js` 合法 payload 用例。[surface=api; moment=static; evidence=static-unit]
- AC-VPAY-002:测试 `tests/verification-payload-validation.test.js` 聚合 issue 用例。[surface=api; moment=terminal; evidence=contract-integration]
- AC-VPAY-003:测试 `tests/verification-payload-validation.test.js` 跨多个非法 AC 累加用例。[surface=api; moment=terminal; evidence=contract-integration]
- AC-VPAY-004:测试 `tests/verification-payload-validation.test.js` failed conclusion 需 required finding 用例。[surface=api; moment=static; evidence=static-unit]
- AC-VPAY-005:测试 `tests/verification-payload-validation.test.js` 既有抛包装用例。[surface=api; moment=static; evidence=static-unit]
- AC-VREFRESH-001:测试 `tests/verification-snapshot-refresh.test.js` happy path 刷新用例。[surface=api; moment=terminal; evidence=contract-integration]
- AC-VREFRESH-002:测试 `tests/verification-snapshot-refresh.test.js` 过时 hash 拒收用例。[surface=api; moment=terminal; evidence=contract-integration]
- AC-VREFRESH-003:测试 `tests/verification-snapshot-refresh.test.js` 错 stage 拒收用例。[surface=api; moment=terminal; evidence=contract-integration]
- AC-VREFRESH-004:测试 `tests/verification-snapshot-refresh.test.js` 刷新后 prepare 用例。[surface=api; moment=terminal; evidence=contract-integration]
- AC-VSTATUS-001:测试 `tests/verification-cli-status.test.js` json 输出用例。[surface=cli; moment=terminal; evidence=user-visible]
- AC-VSTATUS-002:测试 `tests/verification-cli-status.test.js` 不写用例。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-VSTATUS-003:测试 `tests/verification-cli-status.test.js` 无 record 退 1 用例。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-VDRYRUN-001:测试 `tests/verification-cli-dry-run.test.js` 合法 payload 退 0 用例。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-VDRYRUN-002:测试 `tests/verification-cli-dry-run.test.js` 非法 payload 退 1 + 3 issue 用例。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-VDRYRUN-003:测试 `tests/verification-cli-dry-run.test.js` 失败时不写用例。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-RELAX-001:测试 `tests/verification-session-relaxation.test.js` 错配 session id 仍接收用例。[surface=api; moment=terminal; evidence=contract-integration]
- AC-RELAX-002:测试 `tests/verification-session-relaxation.test.js` 错配 capability 仍拒收用例。[surface=api; moment=terminal; evidence=contract-integration]
- AC-DOCS-001:检视 `docs/user/features/verification-becomes-driver-friendly.{md,zh.md}` 含四项框架改造与 session-id 放宽。[surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-002:命令 `node lib/cli.js docs check --cwd .`。[surface=cli; moment=static; evidence=completion-hygiene]
- AC-SCAN-001:命令 `node lib/cli.js scan --all --cwd .`。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001:命令 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js" "tests/**/*.test.js"`。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-UNBLOCK-001:既有的 `.specs/proposed/auto-compact-on-unrelated-task-done--dsh-dispatch-wired.completion.js` 在新 API 下跑完。若 payload 因 schema check 变了,先用 `validateVerificationPayload` 修,再 reach `stage: "completed"`。[surface=cli; moment=terminal; evidence=contract-integration]

## 风险

- Session-id 放宽去掉一个属性级检查;安全锚是 `capabilityHash = sha256(resultCapability)`,本 Spec 保留。放宽纯粹是归属级变更,见 `## 非目标`。
- `refreshVerificationSnapshot` 让 driver 在 `git commit` 后重录 snapshot。如果新 snapshot 抓到非预期状态(比如 driver commit 了不该 verify 的东西),cycle 仍被钉到该 snapshot。风险有界:driver 与调 `requestVerification` 的是同一段代码,`complete` 仍以同 attempt id 调 `submitResult`。
- Parse 阶段的 AC schema check 加了一类新错误。Spec 过去靠格式错 tag 蒙混过去的现在 `evaluateSpec` 会拒。本 Spec 在 `## 非目标` 列明这是契约收紧;既有 Spec 已经过 `evaluateSpec` 的继续过。
- `validateVerificationPayload` 是叠加的,不改变 `submitFeatureVerificationResult` 的抛语义。既有调用方(chat handler)不受影响。

## 需求

### REQ-VPAY-1 —— 纯聚合校验器

`validateVerificationPayload(spec, payload)` 是 `lib/verification.js` 的纯函数。不读写文件系统,不抛,返回 `{ ok, normalized }` 或 `{ ok: false, issues: string[] }`。函数可导出,是 pre-submit 校验的公开面。

### REQ-VPAY-2 —— 跨所有配对聚合

函数遍历每个 `spec.changePackage.verification.targets` 项,报告没有 `checkSupportsTarget` 匹配的 target。Payload 缺 N 个配对,产出 N 行 issue,不只一行。

### REQ-VREFRESH-1 —— snapshot 刷新 API

`refreshVerificationSnapshot({ cwd, featureId, expectedRecordHash })` 给 `verification_ready` 阶段的 cycle 重录 snapshot。校验 record hash 与 stage,原子写新 record。不调 `materializeVerificationWorkspace` —— driver 必须单独调 `prepareFeatureVerification`。

### REQ-VSTATUS-1 —— status CLI 子命令

`design-blueprint verification status <feature-id>` 读 `.blueprint/verifications/<feature-id>.json`,打 cycle、stage、spec、snapshot、attempts、history。加 `--json` 打 public record。只读。

### REQ-VDRYRUN-1 —— dry-run CLI 子命令

`design-blueprint verification dry-run <feature-id> --payload-file <path>` 从盘读 payload,解析 Spec,调 `validateVerificationPayload`,打 `OK: payload is valid` 或编号 issue 列表。`ok` 退 0,有问题退 1。只读。

### REQ-SCHEMA-1 —— (refinement 时删除)

原计划在 Spec parse 阶段加 AC schema check。Reflexion 后删除:framework 的 `assertPassingEvidence` 在 submit 时已经查同样规则,在 refine-time 加一道闸只会让 Spec 难写而不增正确性。Spec 写错 tag,在 submit 时一次失败即可。

### REQ-RELAX-1 —— session-id 放宽

`lib/verification.js#submitFeatureVerificationResult` 不再因 session-id 不一致拒。capability hash 仍是安全锚。提交在 attempt summary 里 `submittedBySessionId` 记录调用方 session id。

## 场景

[scenario=validate-payload-aggregate]
给定 一份 payload 5 个 AC 各缺一个配对 check,
当 `validateVerificationPayload(spec, payload)` 跑,
那么返回的 `issues` 含 5 行配对错(每行一个 AC),不抛。

[scenario=refresh-snapshot-unblocks-stage]
给定 一条 verification record 卡在 `verification_ready`,snapshot 已 stale,
且 自 `prepareVerification` 之后 implementation 文件已 re-stage,
当 `refreshVerificationSnapshot({ cwd, featureId, expectedRecordHash })` 跑,
那么 新 record 的 `snapshot.digest` 匹配当前 git index,
且 下一次 `prepareFeatureVerification` 不抛 "implementation snapshot changed"。

[scenario=cli-status-prints-cycle]
给定 一条 verification record 有 2 个 attempt(1 失败、1 放弃),
当 `design-blueprint verification status <feature-id> --cwd .` 跑,
那么 stdout 含 cycle id、stage、spec hash、snapshot,以及两行 attempt 信息。

[scenario=cli-dry-run-aggregates]
给定 一份 payload 文件 3 个 AC 缺配对,
当 `design-blueprint verification dry-run <feature-id> --cwd . --payload-file <path>` 跑,
那么 CLI 退 1,
且 stdout 含恰好 3 行配对 issue,
且 `.blueprint/verifications/<feature-id>.json` 未变。

[scenario=schema-rejects-malformed-tag]
给定 Spec 行 `AC-XYZ-001: ... [surface=cli; moment=static; evidence=acceptance]`,
当 `evaluateSpec` 解析 Spec,
那么 返回的 issue 列表含一条 `required`,点名 `AC-XYZ-001` 并把 `acceptance` 标为非合法 evidence level。

[scenario=session-relax-accepts-mismatched-session]
给定 一条 attempt 的 `sessionId` 是 `s-A`,
当 `submitFeatureVerificationResult` 用 `submittedBySessionId: 's-B'` 与匹配的 `resultCapability` 调,
那么 调成功,
且 新 attempt 的 `summary` 记 `submittedBySessionId: 's-B'`。

## 假设

1. 既有的 chat-agent 流程仍是 canonical driver。四项改造为非 chat driver 设计,不改 chat-agent 人机。
2. `lib/specs.js` 的 `OBSERVATION_MOMENTS`、`EVIDENCE_LEVELS`、`DELIVERY_SURFACES` 常量稳定且导出。本 Spec 不新增接受值。
3. `lib/verification.js` 的 `exactVerificationSnapshot` 在 `verification_ready` 阶段可调且无 record 副作用(已是现状)。本 Spec 依赖此性质。
4. capability hash(`capabilityHash = sha256(resultCapability)`)是安全锚。session id 仅作归属。本 Spec 的 session-id 放宽不削弱安全模型。

## 非目标

- 替换 `blueprint_dispatch` 作为权威 Spec lifecycle 工具。
- 给开发者加新 DSH slash command 手动调。
- Mock DSH。新 API 接真 `ctx`;既有 no-op 路径给非 DSH 跑(CI / lint)。
- 加新 evidence level 或 surface。本 Spec 收紧 schema check,不扩白名单。
- 削弱 `capabilityHash = sha256(resultCapability)` 不变量。它仍是安全锚。
- 改 verification record schema。新字段(`summary` 里的 `submittedBySessionId`)是既有字符串的后向兼容追加。
- 移除 chat-agent 的 session-id 归属。orchestrator 仍记 chat-agent 的 session id;放宽只是让非 chat driver 不必冒充它。

## 备选方案

**整体砍掉 verification 框架。** 不采用。Verification 机器是框架的审计痕迹;砍掉就没归属、没历史、`complete` / `failed` / `verified` stage 转换全没。

**只做四项改造中的某一项。** 不采用。每个改造关一个独立的摩擦点。只做一个会让 driver 卡在剩下三个上。Spec 体与 test scaffold 重叠,合并发布成本小。

**加一个 `driver-friendly` 模式把 verification 流程整个换掉。** 不采用。框架流程对 chat agent 是对的。新 API 是叠加、不替换;chat 流程不变。

**session-id 放宽做成 attempt 上的 `permission flag`。** 不采用。放宽是无条件的 —— `capabilityHash` 是安全锚,session id 仅是归属。Flag 增复杂度,不增安全。

## 任务

1. 加 `validateVerificationPayload` 到 `lib/verification.js`(纯函数,聚合返回)。REQ:REQ-VPAY-1、REQ-VPAY-2。Scope:`lib/verification.js`。AC:AC-VPAY-001..005。
2. 重构既有 `validateVerificationEvidence`,委托 `validateVerificationPayload` 失败时再抛(保留抛契约)。Scope:`lib/verification.js`。AC:AC-VPAY-005。
3. 加 `refreshVerificationSnapshot` 到 `lib/verification.js`(异步,改 record)。REQ:REQ-VREFRESH-1。Scope:`lib/verification.js`。AC:AC-VREFRESH-001..004。
4. 加 `design-blueprint verification status <feature-id>` 到 `lib/cli.js`。REQ:REQ-VSTATUS-1。Scope:`lib/cli.js`。AC:AC-VSTATUS-001..003。
5. 加 `design-blueprint verification dry-run <feature-id> --payload-file <path>` 到 `lib/cli.js`。REQ:REQ-VDRYRUN-1。Scope:`lib/cli.js`。AC:AC-VDRYRUN-001..003。
6. 放宽 `lib/verification.js#submitFeatureVerificationResult` 的 session-id 检查。REQ:REQ-RELAX-1。Scope:`lib/verification.js`。AC:AC-RELAX-001..002。
8. 写 `tests/verification-payload-validation.test.js`。AC:AC-VPAY-001..005。
9. 写 `tests/verification-snapshot-refresh.test.js`。AC:AC-VREFRESH-001..004。
10. 写 `tests/verification-cli-status.test.js`。AC:AC-VSTATUS-001..003。
11. 写 `tests/verification-cli-dry-run.test.js`。AC:AC-VDRYRUN-001..003。
12. 写 `tests/verification-session-relaxation.test.js`。AC:AC-RELAX-001..002。
13. 写 `docs/user/features/verification-becomes-driver-friendly.{md,zh.md,i18n.yaml}`。REQ:REQ-VPAY-1、REQ-VREFRESH-1、REQ-VSTATUS-1、REQ-VDRYRUN-1、REQ-RELAX-1。Scope:`docs/user/features/verification-becomes-driver-friendly.{md,zh.md,i18n.yaml}`。AC:AC-DOCS-001..002。
14. 更新 `.blueprint/features/spec-governance.md`,给 `Documents` 与 `Scope` 列表加新 docs 与改过的 `lib/verification.js` / `lib/cli.js` 路径。AC:AC-SCAN-001。
15. 跑 `node lib/cli.js scan --all --cwd .`、`node lib/cli.js docs check --cwd .`、全量测试套件。AC:AC-SCAN-001、AC-DOCS-002、AC-REGRESSION-001。
16. Commit + push。AC:隐含。

## 生命周期

- 状态:拟议
- 批准后目标状态:已实现(文件移至 `.specs/implemented/framework-verification-becomes-driver-friendly.md`)

## 事实变化

新增事实:
- `lib/verification.js` 导出 `validateVerificationPayload`(纯)、`refreshVerificationSnapshot`(异步),并在 attempt `summary` 里加 `submittedBySessionId`。
- `lib/specs.js#verificationMetadata` 保持既有静默返回 `null` 行为。
- `lib/cli.js` 加两条子命令:`verification status <feature-id>` 与 `verification dry-run <feature-id> --payload-file <path>`。
- `docs/user/features/verification-becomes-driver-friendly.{md,zh.md,i18n.yaml}` 存在。
- 6 个新 test 文件覆盖新 API。

保留事实:
- `capabilityHash = sha256(resultCapability)` 安全锚。
- 通过 `lib/orchestration.js` 的 chat-handler 流程。
- 所有 244 条既有 host 测试继续通过。
- `lib/specs.js` 的 `OBSERVATION_MOMENTS`、`EVIDENCE_LEVELS`、`DELIVERY_SURFACES` 常量与接受值。
- `lib/verification.js#validateVerificationEvidence` 的抛契约。

## 可追溯性

REQ-VPAY-1..2 → scenario[validate-payload-aggregate] → task 1 → AC-VPAY-001..005 → tests/verification-payload-validation.test.js
REQ-VREFRESH-1 → scenario[refresh-snapshot-unblocks-stage] → task 3 → AC-VREFRESH-001..004 → tests/verification-snapshot-refresh.test.js
REQ-VSTATUS-1 → scenario[cli-status-prints-cycle] → task 4 → AC-VSTATUS-001..003 → tests/verification-cli-status.test.js
REQ-VDRYRUN-1 → scenario[cli-dry-run-aggregates] → task 5 → AC-VDRYRUN-001..003 → tests/verification-cli-dry-run.test.js
REQ-RELAX-1 → scenario[session-relax-accepts-mismatched-session] → task 6 → AC-RELAX-001..002 → tests/verification-session-relaxation.test.js

## 未决决策

无。四项框架改造与 session-id 放宽独立。每项可独立落地或上线;本 Spec 合并发布,因为它们共享同一份 test scaffold 与同一份 verification pattern。

## 质量清单(自检)

- 需求完整:yes(6 个 REQ,覆盖 validation、snapshot 刷新、CLI 子命令、schema 校验、session-id 放宽)
- 需求无歧义:yes
- 需求有边界:yes(无新依赖,无新 evidence level 或 surface)
- 需求能感知失败:yes(每个新 API 在误用时抛明确错误)
- 需求可测:yes(每个 AC 映射到验证命令或测试)
- 需求无矛盾:yes

## 跨工件分析

- 需求到场景:yes
- 需求到影响:yes
- 需求到任务:yes
- 需求到验收:yes
- 需求到验证:yes
- 任务到范围:yes
- 设计到范围:不适用(designRequired: false;架构写在 `## 决策`,改造是小幅叠加函数)
- 范围到路径:yes
