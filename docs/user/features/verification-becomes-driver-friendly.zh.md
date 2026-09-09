---
title: 验证框架对 driver 友好
title.zh: 验证框架对 driver 友好
---

# 验证框架对 driver 友好

[English](verification-becomes-driver-friendly.md) | 中文

## 变化内容

Blueprint 的验证框架（`lib/verification.js` 那套，支撑 `blueprint_dispatch action=complete`）原本偏向 chat-agent driver：单个 Chat 会话在 `requestVerification` → `prepareVerification` → `startVerification` → `submitResult` → `finalize` 之间持有 context，中间不会 stage 或 commit 文件，也不会丢失 in-memory `resultCapability`。程序化 driver（Node 脚本、CI pipeline、手写的 completion 脚本）撞上四个结构性摩擦点，恰好是 chat agent 凭偶然避开的那四个：

1. `submitResult` 在第一个错误就抛。一个有 8 个 AC × check 配对问题的 driver 要修一个、跑一次、看下一个、再修再跑——8 轮迭代。
2. `git add` / `git commit` 后的 snapshot 漂移在 `verification_ready` 阶段不可恢复。原本没有公开 API 刷新 snapshot，driver 要么一次跑完不碰 git，要么 abandon cycle 重新开始。
3. 没有只读查询。想了解"当前 cycle 状态、哪几次 attempt 失败、为什么失败"的 driver 必须手读 `.blueprint/verifications/<feature-id>.json`。
4. Session-id 归属被强制校验。想以非 chat 身份（CI 服务账号、completion 脚本）提交的 driver 因 session id 与 chat-agent session id 不一致而被拒。

本 Feature 通过四项框架改造关掉这四个缺口。

## 四项改造

### 1. `validateVerificationPayload(spec, payload)` — 聚合、非抛错

`lib/verification.js` 导出一个纯函数：在一个循环里走完所有 AC × check 配对，把每个问题累加进 `issues` 列表，**不抛错**。driver 一次拿到所有配对问题，一次修完。

```js
import { validateVerificationPayload } from "@dsh-plugins/design-blueprint/verification";

const result = validateVerificationPayload(spec, payload);
if (!result.ok) {
	for (const issue of result.issues) console.error(issue);
}
```

原有抛错的 `validateVerificationEvidence(spec, value)` 保留，变成薄壳包装：调用 `validateVerificationPayload` 后失败时再 throw。

### 2. `refreshVerificationSnapshot({ cwd, featureId, expectedRecordHash })` — snapshot 恢复

`lib/verification.js` 导出此函数，重录 `verification_ready` cycle 的 snapshot 而不 abandon。driver 在 `prepareVerification` 与 `submitResult` 之间 stage 或 commit 完文件后调用一次。前提：`record.stage === "verification_ready"` 且 record hash 与 `expectedRecordHash` 一致。

```js
import { refreshVerificationSnapshot } from "@dsh-plugins/design-blueprint/verification";

await refreshVerificationSnapshot({ cwd, featureId, expectedRecordHash: recordHash });
```

下一次 `prepareFeatureVerification` 就能基于新 snapshot 通过。该函数不调用 `materializeVerificationWorkspace`——driver 需自己另行调用 `prepareFeatureVerification`。

### 3. 两条 CLI 子命令

- `design-blueprint verification status <feature-id> [--cwd <path>] [--json]`：只读 cycle 状态查询，打印 cycle id、stage、snapshot、attempts、history。带 `--json` 时打印公开 record。不写 `.blueprint/verifications/<feature-id>.json`。
- `design-blueprint verification dry-run <feature-id> --payload-file <path> [--cwd <path>] [--json]`：预检。从 `--payload-file` 读 payload，调用 `validateVerificationPayload`，要么打印 `OK: payload is valid`（退出 0），要么打印编号问题列表加 `FAIL: <n> issue(s) found`（退出 1）。不写 record。

### 4. submit 上的 session-id 归属

`lib/verification.js#submitFeatureVerificationResult` 接收可选的 `submittedBySessionId` 参数。传入时，其值作为 `[submittedBySessionId=<x>]` 记在新 attempt 的 `summary` 开头用于归属。安全闸仍是 capability 校验（`sha256(resultCapability) === capabilityHash`）；session id 仅作审计归属。

```js
import { submitFeatureVerificationResult } from "@dsh-plugins/design-blueprint/verification";

await submitFeatureVerificationResult({
	cwd, featureId, expectedRecordHash, attemptId, resultCapability,
	result, submittedBySessionId: "ci-pipeline-1234",
});
```

## 不变之处

- `lib/orchestration.js` 的 chat-agent 流程。chat handler 仍以 chat-agent session id 提交；放宽仅是为非 chat driver 开闸。
- `capabilityHash = sha256(resultCapability)` 不变式。capability hash 仍是安全闸。session id 原本就只是归属，这次明确把它"实锤为归属"。
- verification record 格式。新增字段（`summary` 里的 `submittedBySessionId`）只是对既有字符串的向后兼容追加。

## 何时使用

- CI 中关闭验证 cycle 的程序化 completion 脚本。
- 编排多个验证流程的 hand-rolled completion driver（Node 脚本）。
- 单个 Host 并行驱动多个 Feature、想直接读 cycle 状态而非解析 JSON 文件。

chat-agent 流程不变；本 Feature 是叠加的。

## 已验证的当前行为

<!-- blueprint-current:framework-verification-becomes-driver-friendly.md -->

### 框架 verification 变 driver-friendly

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

## 已验证的当前行为

<!-- blueprint-current:framework-finalize-snapshot-coherence.md -->

### applyTransaction 在 Spec finalize 期间保持 snapshot 一致

- AC-FIN-1：`applyTransaction` 完成 Spec promote 后，git-index snapshot 的 `approvedSpecFiles` 集合**包含**新实现路径、**不包含**旧 proposed 路径。（通过 transaction 返回后用 `loadFeatureWorkflow` 读 snapshot 验证。）
- AC-FIN-2：scope 较广的 Spec（至少覆盖 `lib/**`、`tests/**`、`docs/user/**`）跑完整 verification cycle（`beginFeatureImplementation` → `requestFeatureVerification` → `prepareFeatureVerification` → `startFeatureVerification` → `submitFeatureVerificationResult` → `completeVerifiedFeature`）到 `stage: "completed"`，**无 manual-finalize 介入**。（在 `tests/verification-finalize-coherence.test.js` 跑合成 cycle 断言最终 stage。）
- AC-FIN-3：`.zh.md` 用双语合并标题 `## Acceptance criteria / 验收条件` 的 Spec（依赖前一份 Spec 修的 sectionList）跑同样完整 cycle，也到 `stage: "completed"`，**无 manual-finalize 介入**。（验证两处修复组合正确：sectionList 接受合并标题 AND finalize 保持 snapshot 一致。）
- AC-FIN-4：模拟注入 scan 失败让 `applyTransaction` 回滚后，`.blueprint/approvals/<featureId>.json` 恢复到 transaction 前内容。下一次 cycle 可重跑无需重新审批。
