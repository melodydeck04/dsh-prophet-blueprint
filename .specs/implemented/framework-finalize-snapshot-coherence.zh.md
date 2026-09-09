# 规格：applyTransaction 在 Spec finalize 期间保持 snapshot 一致

状态：已实现
功能：verification-becomes-driver-friendly
父：`.specs/implemented/framework-verification-section-list-bilingual-merged-headings.md`

## 方案

在 `lib/verification.js#applyTransaction` 内部，当 action 列表里有 Spec 升实现的动作对（`{ file: spec.file, content: null }` 删 + `{ file: targetEn, content: <新实现> }` 加），在同一 transaction 内同步 `.blueprint/approvals/<featureId>.json`。新审批记录的 `approval.spec` 必须指向新实现路径 `.specs/implemented/<name>.md`，`approval.specHash` 对齐新实现的 review hash。同步后的审批在 `git add -A -- touched` 之前写入 transaction，并加入 `touched` 集合。

这样 validate scan 看到的 snapshot 跟"finalize 后任何 read-after"看到的 snapshot 一样。Scan 看到刚升实现 Spec 只对应一个 eligible spec——新实现那个。旧 proposed 文件在 git index 里仍是 `D` 状态（用 `git show :path` 还能读到内容），但**不再在 `approvedSpecFiles` 里**，所以 `evaluatePolicy` 不再把它当 finalize 触发的 brief / Feature doc 写入的竞争 owner。`spec-scope-ambiguity` 在这条路径上不再可达。

无公共 API 签名变更，无 policy 变更，无 Spec lifecycle 变更（除 `completeVerifiedFeature` 内部 transaction）。

## 问题

`applyTransaction`（第 ~1029 行）执行：

1. `indexBackup = await backupGitIndex(root)` — 备份 git-index
2. 对每个 `content` 非空的 action 写临时文件
3. 把原文件改名 `.bak` 备份
4. 把临时文件移到正式位置
5. `await stagePaths(root, touched)` — `git add -A -- touched`
6. `await scan({ cwd: root, all: !stage })` — 校验
7. Scan 报 required → 回滚 (1)-(5) 全部

当 action 列表包含 Spec 升实现时——删 proposed 文件 + 加 implemented 文件——第 6 步的 snapshot 同时存在：

- 新实现文件，`A` 状态
- 旧 proposed 文件，`D` 状态但内容仍可用 `git show :path` 读到
- `.blueprint/approvals/<featureId>.json` 记录**没动**，仍指向 `.specs/proposed/<old>.md`

第 6 步 scan 里的 `loadFeatureWorkflow` 读（未变的）approval，跟（仍加载的）旧 proposed Spec 匹配，把旧 proposed 路径加进 `approvedSpecFiles`。`loadSpecs` 从 git-index snapshot 读两个文件——新实现 Spec `Status: implemented`、旧 proposed Spec `Status: proposed`。两者都 eligible：

- 新实现 Spec：`status === "implemented" && stagedPaths.has(spec.file)` → eligible
- 旧 proposed Spec：`status === "proposed" && approvedSpecFiles.has(spec.file)` → eligible（approval 没改、文件 index 里仍可加载）

两个 Spec scope 一样（Scope 在 promote 时保留）。Validate scan 对 finalize 触发的 staged change 跑 `evaluatePolicy`——`docs/user/features/<featureId>.{md,zh.md,i18n.yaml}`（brief 写入 via `mergeCurrentBrief`）、`.blueprint/features/<featureId>.md`（Feature doc 更新 via `activeStatus`）。**每个 M change 同时被两个 eligible owner 覆盖 → `spec-scope-ambiguity` → `spec-scope-coverage` 失败 → scan 报 ≥3 required issues → 第 7 步回滚整个 transaction → `completeVerifiedFeature` 返回 `stage: "needs_changes"`**。

这次会话撞了两次：

- `dsh-native-skill-routing-and-minimax`（attempt 5，之后 manual-finalize 绕过）
- `framework-verification-section-list-bilingual-merged-headings`（attempt 1，之后 manual-finalize 绕过）

两个 cycle 都复现同一根因：framework finalize 不能独立完成 promote；要必须 explicit 删 approval record、从 index 移除旧 proposed 文件的 manual finalize。

第三个撞这条的会是任何未来 scope 较广（覆盖 `lib/`、`tests/`、`docs/`）的 Spec。这是结构性 bug，不是 transient。

## 范围

### 允许路径

- 允许：`lib/verification.js`
- 允许：`tests/verification.test.js`
- 允许：`tests/verification-finalize-coherence.test.js`
- 允许：`docs/user/features/verification-becomes-driver-friendly.md`
- 允许：`docs/user/features/verification-becomes-driver-friendly.zh.md`
- 允许：`docs/user/features/verification-becomes-driver-friendly.i18n.yaml`
- 允许：`.blueprint/features/verification-becomes-driver-friendly.md`
- 允许：`.blueprint/architecture/components/verification-becomes-driver-friendly.md`

### 禁止路径

- 禁止：`lib/cli.js`
- 禁止：`lib/specs.js`
- 禁止：`lib/policy.js`
- 禁止：上述三个文件之外的所有 `tests/**` 文件
- 禁止：`lib/apply-transaction.js`（目前不存在；防误新建）

## 需求

- REQ-FIN-1：当 `applyTransaction` 的 action 列表包含 Spec promote（一个 `.specs/proposed/<name>.md` 删 + 一个 `.specs/implemented/<name>.md` 加，外加配套 `.zh.md` 对）时，框架重写 `.blueprint/approvals/<featureId>.json`，让 `approval.spec` 指向新实现路径 `.specs/implemented/<name>.md`、`approval.specHash` 对齐新实现 Spec 的 review hash。重写后的审批在 transaction 内（`git add -A` 之前）写入并加入 `touched` 集合。
- REQ-FIN-2：与 REQ-FIN-1 等价——框架在 Spec promote 发生时**直接删除** `.blueprint/approvals/<featureId>.json`（一旦 Spec 实现，approved-Spec approval 不再 authoritative）。删除动作加入 `touched`。
- REQ-FIN-3：`applyTransaction` 末尾的 validate scan 看到重写或删除后的审批在 snapshot 里，`approvedSpecFiles` **不**包含旧 proposed 路径。旧 proposed Spec 仍在 `specs` 里（index `D` 状态仍可加载），但不再 eligible，所以不再贡献 ambiguity。
- REQ-FIN-4：transaction 回滚时（任何其它原因 scan 失败），原审批记录从备份或 pre-transaction snapshot 重新读回恢复。任何 transaction 都不应泄漏陈旧 approval 状态。

## 场景

一个 scope 较广（`lib/**`、`tests/**`、`docs/user/**`）的 Spec 被批准，跑完完整 verification cycle 到 `completeVerifiedFeature`：

1. `currentTruthActions` 计算 action：2 个实现文件加、2 个 proposed 文件删、N 个 brief 文件改（brief 三元组每条一个）、1 个 Feature doc 改。
2. Action 列表传给 `applyTransaction`。
3. `applyTransaction` 检测 Spec promote（一个 action 对源路径在 `.specs/proposed/`、目标路径在 `.specs/implemented/`，配套 `.zh.md` 对应），同步审批：重写 `.blueprint/approvals/<featureId>.json` 指向新实现路径，approval.specHash 对齐实现 spec 的 review hash。把审批文件路径加入 `touched`。
4. 写临时文件、备份原文件、临时文件移到正式位置。
5. `git add -A -- touched` stage：2 个实现文件（A）、2 个 proposed 文件（D）、brief 改（M）、Feature doc（M）、重写后的审批（M）。
6. Validate scan 的 `loadFeatureWorkflow` 读重写后的审批。`approvedSpecFiles` **只**含 `.specs/implemented/<name>.md`。旧 proposed Spec 的文件（`.specs/proposed/<name>.md`）在 `specs` 里但不在 `approvedSpecFiles` 里。
7. `evaluatePolicy` 遍历每个 M change。每个 brief / Feature doc 改**只有一个** eligible owner（新实现 Spec，scope 覆盖 `docs/user/**`）。无 `spec-scope-ambiguity`。无 `spec-scope-coverage` 失败。
8. Scan 返 0 required issues。`applyTransaction` 完成。`completeVerifiedFeature` 返 `stage: "completed"`。Spec 从 `.specs/proposed/` 原子地移到 `.specs/implemented/`，approval 记录一致。

## 验收条件

- AC-FIN-1：`applyTransaction` 完成 Spec promote 后，git-index snapshot 的 `approvedSpecFiles` 集合**包含**新实现路径、**不包含**旧 proposed 路径。（通过 transaction 返回后用 `loadFeatureWorkflow` 读 snapshot 验证。）
- AC-FIN-2：scope 较广的 Spec（至少覆盖 `lib/**`、`tests/**`、`docs/user/**`）跑完整 verification cycle（`beginFeatureImplementation` → `requestFeatureVerification` → `prepareFeatureVerification` → `startFeatureVerification` → `submitFeatureVerificationResult` → `completeVerifiedFeature`）到 `stage: "completed"`，**无 manual-finalize 介入**。（在 `tests/verification-finalize-coherence.test.js` 跑合成 cycle 断言最终 stage。）
- AC-FIN-3：`.zh.md` 用双语合并标题 `## Acceptance criteria / 验收条件` 的 Spec（依赖前一份 Spec 修的 sectionList）跑同样完整 cycle，也到 `stage: "completed"`，**无 manual-finalize 介入**。（验证两处修复组合正确：sectionList 接受合并标题 AND finalize 保持 snapshot 一致。）
- AC-FIN-4：模拟注入 scan 失败让 `applyTransaction` 回滚后，`.blueprint/approvals/<featureId>.json` 恢复到 transaction 前内容。下一次 cycle 可重跑无需重新审批。

## 验证

- AC-FIN-1：[surface=repository; moment=terminal; evidence=contract-integration] 测试：`tests/verification-finalize-coherence.test.js#finalize 后审批记录指向新实现路径、不指向旧 proposed 路径`
- AC-FIN-2：[surface=repository; moment=terminal; evidence=contract-integration] 测试：`tests/verification-finalize-coherence.test.js#scope 较广的 Spec 跑完整 verification cycle，无需 manual-finalize 介入`
- AC-FIN-3：[surface=repository; moment=terminal; evidence=contract-integration] 测试：`tests/verification-finalize-coherence.test.js#zh.md 用双语合并标题的 Spec 跑完整 cycle，无需 manual-finalize 介入`
- AC-FIN-4：[surface=repository; moment=terminal; evidence=contract-integration] 测试：`tests/verification-finalize-coherence.test.js#transaction 回滚后原审批记录恢复`
- 回归：命令 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/verification.test.js tests/verification-payload-validation.test.js tests/verification-snapshot-refresh.test.js tests/verification-cli-status.test.js tests/verification-cli-dry-run.test.js tests/verification-session-relaxation.test.js tests/verification-finalize-coherence.test.js`
- 命令 `node lib/cli.js scan --cwd .` 对 staged Git snapshot 返回 `0 required / 0 recommended`
- 命令 `node lib/cli.js docs check --cwd .` 返回 0 issue

## 任务

1. 改 `lib/verification.js#applyTransaction`（第 ~1029-1080 行）实现 REQ-FIN-1..4。检测 Spec promote action 对，然后 transaction 内重写或删除 approval 记录、加入 `touched`，回滚时恢复。改一个函数。范围：`lib/verification.js`。AC：AC-FIN-1..4。
2. 加 `tests/verification-finalize-coherence.test.js` 覆盖 AC-FIN-1..4：建一个合成 git fixture 含已批准 Spec，跑 `completeVerifiedFeature` 完整 cycle，断言 stage 为 `completed` 并检查 approval 记录状态。范围：`tests/verification-finalize-coherence.test.js`。AC：AC-FIN-1..4。
3. 跑 focused test 套件、`scan`、`docs check`。范围：仓库根。AC：AC-FIN-1..4、回归检查、scan gate、docs gate。

## 备选方案

- **保持 `completeVerifiedFeature` 现状，把 manual-finalize workaround 当作永久 fixture**。否决。每次 scope 广的 Spec cycle 都要手动 finalize（运营开销大）、手动 JSON 写入易错、还把底层 bug 从 cycle 日志里遮住。这次会话撞了两次，**第三次是结构性保证**。
- **让 `evaluatePolicy` 知道"正在 promote"、finalize 期间排除 promote-target 的 scope 检查**。否决。隐藏而不是修设计——未来真正产生 ambiguity 的 feature 仍会撞。
- **不用更新 approval，改用 `git rm --cached <old-path>` 把旧 proposed 从 index 删掉**。考虑过。从 snapshot 角度看与 REQ-FIN-1..3 等价。否决理由：approval record 是"这个 Spec 是否被批"的 authoritative 来源，留下指向已删旧 proposed 路径的陈旧 approval 是潜在不一致。正确做法是更新或删除 approval。

## 风险

- `applyTransaction` 也被 `completeVerifiedFeature` 之外路径用（比如 abort / abandon 流）。Spec-promote 检测必须保守：**只当** action 列表**同时**含一个 `.specs/proposed/<name>.md` 删 + 对应 `.specs/implemented/<name>.md` 加（配套 `.zh.md` 对应）才触发审批同步。其它 action 列表不能触发。
- 回滚正确性：transaction 前审批必须捕获（要么从 index 备份，要么从独立 snapshot 读），跟文件回滚一起原子恢复。陈旧 approval 跨 transaction 泄漏会阻塞下一次 cycle。
- 本方案**不改 `completeVerifiedFeature` 公共签名**。改动在 `applyTransaction` 内部；同一个 `completeVerifiedFeature` 调用点继续工作。

## 生命周期

仅研究与提案。等待精确双语 hash 批准后再实现。先前的批准只覆盖其他 Spec。

## 结果

Blueprint 已通过与需求关联的验收自动完成本次交付。

- 验收快照：`git-index:20c1599a2eebc4a8363a079948f05b1bb8a686725900ff6ae24b51a56b5250ef`
- 验收尝试：`attempt-1`
- 结论：[submittedBySessionId=session-driver-finalize-fix]
Auto-generated passing result.
- AC 证据：4 项全部通过。
- 检查证据：scan-pass（command）。
