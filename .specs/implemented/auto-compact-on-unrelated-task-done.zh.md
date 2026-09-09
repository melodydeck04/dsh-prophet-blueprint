# 规格：Feature 切换时自动 compact（≥ 200 KiB）

状态：已实现
功能：spec-governance

> 配套：`.specs/implemented/todo-live-compact-hint.md`（先前「打印一行提示」交付，已退役）
> 配套：`.specs/implemented/persistent-todo-list.md`（`task/done` 事件源）
> 配套：`.specs/implemented/compact-at-checkpoint.md`（同一事件在 diagnostics 侧的读取）

## 方案

用真实动作取代「Type /compact before continuing.」字节阈值提示,且只在 Feature 级别的边界触发,只攒够足够多的对话量才值得 compact 一次。当 `design-blueprint todo mark <id> --spec <path> done` 写一条 `data.spec` 归属 Feature 与上一条 `task/done` 不同的 `task/done` 事件时,框架通过文档化 input-trigger 表面调度 DSH 的 `/compact` slash command,触发一次,写一条 `compact/auto-fired` 事件到 `session.jsonl` 供 diagnostics 包归因。**两道闸门都得通过**:Feature 切换信号存在;自上一条 `task/done` 以来累计字节超过 200 KiB。任何一道没通过都不动上下文窗口。不引入新权限、不需要人确认、不走平行路由、不频繁触发噪声。200 KiB 字节下限天然限速:一次成功 compact 总结对话让字节归零,下一次自动 compact 又要重新攒 200 KiB,这是天然最小成本底线。

## 问题

跨多个 Feature 工作的 DSH session,上下文窗口里会堆满与当前意图无关的内容。之前的 `todo-live-compact-hint` Spec 在自上一条 `task/done` 以来累计字节超过 1 MiB 阈值时打印一行"Type /compact before continuing."。这只是信息,开发者还要自己敲 `/compact`。

第一轮细化提议:任何 `task/done` 的 `data.req` / `data.ac` 跟当前 active Feature 的 REQ/AC 集合不重叠时,框架就替你 compact 一次。这个信号粒度太细:一个 session 跨两个 Feature 干 4 个子任务就会 auto-compact 4-6 次,适得其反。**Feature** 级别的信号更合适:开发者刚完成 Feature A 的活,开始 Feature B 的 `task/done`,这时 A 的上下文残留已经无关,边界做一次 compact 刚好。

第一轮细化也提议不加字节下限。这也太松:开发者改一个文档 typo 顺手 mark done,不该触发 summarize-and-replace 这种重型操作。200 KiB 下限跟开发者修订过的意图对得上:auto-compact 只在攒够足够对话量、cost 划算时才跑。

第一轮细化还提议加 5 分钟冷却。这道闸多余:成功 compact 总结对话让字节归零,下一次 auto-compact 又要再攒 200 KiB,天然最小成本底线就是 200 KiB 字节下限。**冷却已从本 Spec 移除。**

## 范围

### 允许路径

- 允许：`lib/todo-compact-trigger.js`
- 允许：`lib/spec-todos.js`
- 允许：`lib/todo-events.js`
- 允许：`lib/cli.js`
- 允许：`tests/todo-compact-trigger.test.js`
- 允许：`tests/spec-todos.test.js`
- 允许：`docs/user/features/auto-compact-on-unrelated-task-done.{md,zh.md,i18n.yaml}`
- 允许：`.blueprint/features/spec-governance.md`

### 禁止路径

- 禁止：`lib/scan.js`
- 禁止：`lib/web-api.js`
- 禁止：`lib/orchestration.js`
- 禁止：`lib/verification.js`
- 禁止：`lib/chat-commands.js`
- 禁止：`lib/client.js`
- 禁止：`lib/workflow.js`
- 禁止：`lib/policy.js`
- 禁止：`lib/assistant-actions.js`
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
- 禁止：`lib/skills.js`
- 禁止：`lib/skills/**`
- 禁止：`.blueprint/approvals/**`
- 禁止：`.blueprint/verifications/**`
- 禁止：本 Spec 对文件外的 `.specs/**`
- 禁止：`docs/i18n/**`
- 禁止：`design-blueprint.json` 的 default 或 authority 段

## 决策

### 1. 二元闸门谓词

`evaluateTrigger({ previousTaskSpecPath, currentTaskSpecPath, previousFeatureId, currentFeatureId, bytesSincePreviousTaskDone })` 在 `lib/todo-compact-trigger.js` 里,返回四选一:

- `'fire'` —— 两道闸门都通过:前/后 Feature 都已知且不同,自上一条 `task/done` 以来累计字节 ≥ 200 KiB。
- `'same-feature'` —— 前/后任务共享同一 Feature id。开发者一直停留在一个 Feature 上,不该 compact。
- `'under-threshold'` —— 前/后 Feature 不同,但累计字节 < 200 KiB。compact 太贵不划算。
- `'no-previous-task'` —— `session.jsonl` 里没有上一条 `task/done`(或上一条缺 `data.spec`,或刚发出的事件缺 `data.spec`)。触发器无信号,保持沉默。

单字节下限 `BYTE_THRESHOLD_BYTES = 200 * 1024` 导出为常量。本 Spec 不让它按项目配置;未来 Spec 可以在 `design-blueprint.json` 暴露。

### 2. 触发函数

`maybeAutoCompact({ cwd, sessionId, currentTaskSpecPath, currentFeatureId, nowMs, logger })` 在同一文件里。它:

1. 通过 `locateSessionPath(cwd, sessionId)` 读 `session.jsonl`。文件不存在,返回 `{ invoked: false, reason: 'no-previous-task' }`。
2. 读 `nowMs` 之前最近一条 `task/done` 事件,用 `featureIdForSpecPath(specPath)` 把它的 `data.spec` 解析到 Feature id。解析不出,返回 `{ invoked: false, reason: 'no-previous-task' }`。
3. 用 `bytesBetweenTimestamps(sessionPath, previous.time, nowMs)` 算 `bytesSincePreviousTaskDone`。
4. 用上面三个值调 `evaluateTrigger(...)`。
5. 谓词返回 `'fire'` 时,通过文档化的 `ctx.inputTriggers.dispatch`(Skills 子 Spec A 给 `ctx.skills` 注册的同一条表面)调度 DSH 的 `/compact` slash command。调度是 fire-and-forget:函数在调度返回后即返回,不等待 compact 真正完成。调度成功后,往 `session.jsonl` 追加一条 `compact/auto-fired` 事件,字段 `{ time, reason: 'feature-switch', previousFeatureId, currentFeatureId, bytesSincePreviousTaskDone }`。
6. 成功时返回 `{ invoked: true, reason: 'feature-switch' }`;其余三个 reason 对应 `invoked: false`。
7. 永不抛错。调度失败被捕获,warn 日志,返回 `{ invoked: false, reason: 'dispatch-failed', error: <message> }`。调用方已写下的 `task/done` 事件**绝不**回滚。

### 3. CLI 集成

`lib/cli.js#runTodoMark`(`todo mark <id> done` 子命令)在已写 `task/done` 事件之后新增一步:

1. 用 `featureIdForSpecPath(specRelative)` 解析当前 Feature id。
2. 调 `maybeAutoCompact(...)`,`nowMs` 与事件发共用同一墙钟。
3. 在 stdout 打印五行之一:
   - `Auto-compact: fired (feature-switch: <from> -> <to>, <human> KiB accumulated).` —— `'fire'`
   - `Auto-compact: skipped (same feature as previous: <featureId>).` —— `'same-feature'`
   - `Auto-compact: skipped (under threshold: <bytes> bytes < 200 KiB).` —— `'under-threshold'`
   - `Auto-compact: skipped (no previous task).` —— `'no-previous-task'`
   - `Auto-compact: failed (<message>).` —— 调度失败

旧的 `todo-live-compact-hint` 字节阈值提示从这条路径移除;新 auto-compact 公告取代之。旧 Spec 留在 `.specs/implemented/` 作为历史记录,后续 commit 给它的 `## Consequences` 加一段"已被本 Spec 替代"。

### 4. DSH 调度面

Host 通过人手敲 `/compact` 的同一条文档化路径调它。实现可 import `@deepseek-ai/dsh-client-ui-input-trigger`(前提是该函数为已解析 DSH 版本导出)。如果目标 DSH profile 完全没有 slash-command 调度面,函数在启动时打一次性 warn,本次 session 降级为 no-op;本 Spec 不能在这种状态下发布 —— 开发者必须升级 DSH baseline 或钉已知良好版本。这条选择放在 `## 未决决策` 里直到被解。

### 5. Spec → Feature 解析(简化)

`featureIdForSpecPath(specPath)` 在 `lib/spec-todos.js`,把 Spec 路径解析到 Feature id。实现:走 `.blueprint/features/<feature-id>.md` 文件,找 `## Documents` 列表里含该 Spec 路径的那一个;或者读 Spec 文件 frontmatter 里的 `Feature:` 行。解析不到返回 `null`。原 Spec 的四级阶梯被替代为「`session.jsonl` 最近一条 `task/done.data.spec` + 此 lookup」。

### 6. 字节测量

`bytesBetweenTimestamps(sessionPath, lo, hi)` 复用 `lib/cli.js#readSessionSegmentBytes` 的逻辑:遍历 `session.jsonl` 里 `time ∈ (lo, hi]` 的行,累加 `Buffer.byteLength(line, "utf8") + 1`。阈值 **200 KiB = 204 800 字节**。

### 7. 冷却测量(已移除)

5 分钟冷却闸门已移除。成功 auto-compact 总结对话让字节归零,下一次 auto-compact 又要再攒 200 KiB,天然最小成本底线就是字节下限。字节下限单独限速触发器。

## 验收条件

- AC-SWITCH-001:`evaluateTrigger({ previousTaskSpecPath: 'a.md', currentTaskSpecPath: 'a.md', previousFeatureId: 'F', currentFeatureId: 'F', bytesSincePreviousTaskDone: 500000 })` 返回 `'same-feature'`。[surface=api; moment=static; evidence=static-unit]
- AC-SWITCH-002:`evaluateTrigger({ previousTaskSpecPath: 'a.md', currentTaskSpecPath: 'b.md', previousFeatureId: 'F1', currentFeatureId: 'F2', bytesSincePreviousTaskDone: 100000 })` 返回 `'under-threshold'`。[surface=api; moment=static; evidence=static-unit]
- AC-SWITCH-003:`evaluateTrigger({ previousTaskSpecPath: 'a.md', currentTaskSpecPath: 'b.md', previousFeatureId: 'F1', currentFeatureId: 'F2', bytesSincePreviousTaskDone: 500000 })` 返回 `'fire'`。[surface=api; moment=static; evidence=static-unit]
- AC-SWITCH-004:`evaluateTrigger({ previousTaskSpecPath: 'a.md', currentTaskSpecPath: 'b.md', previousFeatureId: null, currentFeatureId: 'F2', bytesSincePreviousTaskDone: 500000 })` 返回 `'no-previous-task'`(开发者没产生过上一条 `task/done`,框架无法判断从哪儿来)。[surface=api; moment=static; evidence=static-unit]
- AC-SWITCH-005:`evaluateTrigger({ previousTaskSpecPath: 'a.md', currentTaskSpecPath: 'b.md', previousFeatureId: 'F1', currentFeatureId: null, bytesSincePreviousTaskDone: 500000 })` 返回 `'no-previous-task'`(刚发出的任务缺 `data.spec`,没法锚定 Feature 切换)。[surface=api; moment=static; evidence=static-unit]
- AC-TRIG-001:`maybeAutoCompact` 在谓词为 `'same-feature'` 时返回 `{ invoked: false, reason: 'same-feature' }` 且不写任何东西。[surface=api; moment=terminal; evidence=contract-integration]
- AC-TRIG-002:`maybeAutoCompact` 在累计字节 < 200 KiB 时返回 `{ invoked: false, reason: 'under-threshold' }` 且不写任何东西。[surface=api; moment=terminal; evidence=contract-integration]
- AC-TRIG-003:`maybeAutoCompact` 在没有上一条 `task/done` 时返回 `{ invoked: false, reason: 'no-previous-task' }` 且不写任何东西。[surface=api; moment=terminal; evidence=contract-integration]
- AC-TRIG-004:`maybeAutoCompact` 在谓词为 `'fire'` 时调度文档化的 `/compact` slash command 恰好一次,且往 `session.jsonl` 追加一条 `compact/auto-fired` 事件。[surface=api; moment=terminal; evidence=contract-integration]
- AC-TRIG-005:`maybeAutoCompact` 捕获调度失败,返回 `{ invoked: false, reason: 'dispatch-failed' }`,**不**回滚调用方已写的 `task/done` 事件。[surface=api; moment=terminal; evidence=contract-integration]
- AC-CLI-001:在 Feature 切换且 > 200 KiB 累计字节时,`design-blueprint todo mark <id> --spec <path> done` 在 stdout 打印 `Auto-compact: fired (feature-switch: <from> -> <to>, <human> KiB accumulated).`。[surface=cli; moment=terminal; evidence=user-visible]
- AC-CLI-002:同 Feature `task/done` 时,同上命令打印 `Auto-compact: skipped (same feature as previous: <featureId>).`。[surface=cli; moment=terminal; evidence=user-visible]
- AC-CLI-003:Feature 切换但 < 200 KiB 累计字节时,同上命令打印 `Auto-compact: skipped (under threshold: <bytes> bytes < 200 KiB).`。[surface=cli; moment=terminal; evidence=user-visible]
- AC-CLI-004:无上一条 `task/done` 时,同上命令打印 `Auto-compact: skipped (no previous task).`。[surface=cli; moment=terminal; evidence=user-visible]
- AC-CLI-005:旧的"Compaction hint"行不再由 `todo mark done` 发出。[surface=cli; moment=terminal; evidence=user-visible]
- AC-ACTIVE-001:`featureIdForSpecPath('.specs/proposed/foo.md')` 返回拥有该 Spec 路径的 Feature id,或 `null`。[surface=api; moment=static; evidence=contract-integration]
- AC-ACTIVE-002:`featureIdForSpecPath('does-not-exist.md')` 返回 `null`。[surface=api; moment=static; evidence=contract-integration]
- AC-DOCS-001:`docs/user/features/auto-compact-on-unrelated-task-done.{md,zh.md,i18n.yaml}` 存在,英文页含四个 mattpocock 节标题。[surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-002:新 docs 落地后,`node lib/cli.js docs check --cwd .` 报 0 required / 0 recommended issue。[surface=cli; moment=static; evidence=completion-hygiene]
- AC-SCAN-001:本 Spec 落地后,`node lib/cli.js scan --all --cwd .` 报 0 required / 0 recommended issue。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001:改动后,所有 232 条 host 测试继续通过。[surface=cli; moment=terminal; evidence=contract-integration]

## 验证

- AC-SWITCH-001 至 AC-SWITCH-005:测试 `tests/todo-compact-trigger.test.js` [surface=api; moment=static; evidence=static-unit]
- AC-TRIG-001 至 AC-TRIG-005:测试 `tests/todo-compact-trigger.test.js`,用一个记录调用的 stub slash-command dispatcher [surface=api; moment=terminal; evidence=contract-integration]
- AC-CLI-001 至 AC-CLI-005:测试 `tests/cli-todo.test.js`,覆盖四种 stdout 行并断言旧 hint 文本不再出现 [surface=cli; moment=terminal; evidence=user-visible]
- AC-ACTIVE-001、AC-ACTIVE-002:测试 `tests/spec-todos.test.js` [surface=api; moment=static; evidence=contract-integration]
- AC-DOCS-001:检视三份新 docs 文件 [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-002:命令 `node lib/cli.js docs check --cwd .` [surface=cli; moment=static; evidence=completion-hygiene]
- AC-SCAN-001:命令 `node lib/cli.js scan --all --cwd .` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001:命令 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js" "tests/**/*.test.js" "blueprint-diagnostics/tests/*.test.js"` [surface=cli; moment=terminal; evidence=contract-integration]

## 风险

- 文档化的 DSH slash-command 调度面跟版本强相关。如果目标 DSH profile 没暴露 `runSlashCommand` 或等价入口,触发器降级到启动期一次性 warn 的 no-op。本 Spec 不能在这种状态下发布;开发者必须升级 DSH 或钉一个已知良好版本。
- `featureIdForSpecPath` 在决策时走 Feature 树。如果 Feature 树很大(成百上千),单次 lookup 是 O(N)。未来 Spec 可以加预计算索引;本 Spec 发简单版本。
- 200 KiB 是启发式。199 KiB 累计字节里包含 100 KiB 无关对话的也仍然不触发。未来 Spec 可以把字节下限换成相关性加权;本 Spec 发字节下限。
- `compact/auto-fired` 事件在调度成功**之后**写。如果 host 在调度和事件写入之间崩溃,diagnostics 包会漏掉归因。风险有界 — compact 已经发生。
- `featureIdForSpecPath` 对孤儿 Spec(没归属 Feature)返回 `null`,触发器返回 `'no-previous-task'`,开发者可手动 `/compact`。

## 需求

### REQ-TRIG-1 — 二元闸门谓词

`lib/todo-compact-trigger.js` 的 `evaluateTrigger` 应是纯函数,返回 `'fire'`、`'same-feature'`、`'under-threshold'` 或 `'no-previous-task'` 之一。不读不写文件系统、网络、进程状态。不抛错。

### REQ-TRIG-2 — Feature 切换为主信号

当 `previousFeatureId === currentFeatureId` 且两者都非 null,谓词应返回 `'same-feature'`。这种情况绝不能返回 `'fire'`。

### REQ-TRIG-3 — 200 KiB 字节下限

当 Feature id 不同且 `bytesSincePreviousTaskDone < 204800`(200 KiB),谓词应返回 `'under-threshold'`。

### REQ-TRIG-4 — 缺失上下文为 no-op

当 `previousFeatureId` 或 `currentFeatureId` 为 `null`,谓词应返回 `'no-previous-task'`。框架绝不从缺失数据虚构 Feature。

### REQ-DISPATCH-1 — DSH `/compact` 走文档化表面

`maybeAutoCompact` 在谓词为 `'fire'` 时,通过人手敲 `/compact` 的同一条路径调度 DSH 的 `/compact` slash command。不调私有 composer API,不走平行路由。

### REQ-DISPATCH-2 — 失败不得回滚

`maybeAutoCompact` 的调度失败被捕获,日志,返回 `{ invoked: false, reason: 'dispatch-failed' }`。调用方的 `task/done` 事件绝不被回滚。

### REQ-DISPATCH-3 — diagnostics 友好事件

调度成功后,`maybeAutoCompact` 往 `session.jsonl` 追加一条 `compact/auto-fired` 事件,字段 `{ time, reason, previousFeatureId, currentFeatureId, bytesSincePreviousTaskDone }`。

### REQ-CLI-1 — `todo mark done` 调触发器

`lib/cli.js#runTodoMark` 应在写 `task/done` 事件之后调 `maybeAutoCompact`,不管字节数或 Feature 是否切换。旧字节阈值提示文本移除。

### REQ-CLI-2 — stdout 一行结果

`runTodoMark` 应在 stdout 打印五行之一。旧 `Compaction hint:` 行不再由此命令发出。

### REQ-ACTIVE-1 — Spec → Feature 查找

`lib/spec-todos.js` 的 `featureIdForSpecPath(specPath)` 应返回拥有给定 Spec 路径的 Feature id,或 `null`。

### REQ-ACTIVE-2 — 纯查找

`featureIdForSpecPath` 应是 spec 路径与 Feature 树快照的纯函数,不修改状态。

## 场景

[scenario=feature-switch-fires]
给定 `task/done` 事件 `data.spec: '.specs/proposed/b.md'`,上一条 `task/done` 的 `data.spec: '.specs/proposed/a.md'`,两条 Spec 归属不同 Feature,自上一条 `task/done` 以来累计 500 KiB,
当触发器跑,
那么 DSH 的 `/compact` slash command 调度恰好一次,且 `session.jsonl` 追加一条 `compact/auto-fired`。

[scenario=same-feature-skips]
给定 `task/done` 事件 `data.spec: '.specs/proposed/a.md'`,上一条 `task/done` 同 Spec 路径,
当触发器跑,
那么 DSH `/compact` 调度不发生,也不写 `compact/auto-fired`。

[scenario=under-threshold-skips]
给定 Feature 切换,累计字节 100 KiB,
当触发器跑,
那么 DSH `/compact` 调度不发生,stdout 显示 `Auto-compact: skipped (under threshold: 102400 bytes < 200 KiB).`。

[scenario=no-previous-task-skips]
给定全新 `session.jsonl` 的第一条 `task/done`,
当触发器跑,
那么 DSH `/compact` 调度不发生,stdout 显示 `Auto-compact: skipped (no previous task).`。

[scenario=dispatch-failure-does-not-rollback]
给定 `maybeAutoCompact` 调一个会抛错的 stub slash-command dispatcher,
当调用返回,
那么返回值是 `{ invoked: false, reason: 'dispatch-failed', error: <message> }`,且调用方写下的 `task/done` 事件仍留在 `session.jsonl`。

## 假设

1. 目标 DSH 版本暴露文档化的 slash-command 调度面(如 `ctx.inputTriggers.dispatch` 注册 by Skills sub-spec A,或 `@deepseek-ai/dsh-client-ui-input-trigger` 导出的 `runSlashCommand`)。若不暴露,本 Spec 不能发布,开发者必须升级 DSH baseline。
2. `lib/todo-events.js#buildTaskDoneEvent` 已经写 `data.spec` 给每条 `task/done` 事件;本 Spec 复用既有字段,不改事件 schema。
3. `compact/auto-fired` 事件用与 `task/done` 同样的 `session.jsonl` 行格式,让 diagnostics 包的 stream parser 无需改动就能读。
4. 200 KiB 字节下限是典型 DSH session 的合理默认。真实 workload 有需要时,未来 Spec 可以在 `design-blueprint.json` 暴露。

## 非目标

- 没有实时 compact 守护进程。触发器是事件驱动的(`task/done`);不做周期性后台扫。
- 不查 REQ/AC 集合。触发器是 Feature 粒度,单个 REQ/AC id 关联不算信号。
- 不做字节下限单独触发。Feature 切换本身不够;字节下限防小量无关编辑的噪声。
- 没有新的 slash command 给开发者用。动作就是 DSH 原本文档化的 `/compact`;框架只是编程式调它。
- 不在 Feature 完成时 compact。触发器是 `task/done` Feature 切换,不是 `feature/completed`。
- 不在空闲时 compact。框架不开 N 分钟定时器来触发 compact;那属于另一份 Feature 提案。
- 不引入新权限面。调度走人手敲的同一条文档化 DSH API;框架不申请额外权限。

## 备选方案

**`task/done` 总是触发 compact,不管 Feature 或字节数。** 不采用。开发者明确区分"Feature 切换且攒够对话"与"任何完成";无条件 compact 会在常规增量工作中重置上下文,弊大于利。

**用 REQ/AC 集合不重叠作为信号,而不是 Feature 切换。** 不采用。REQ/AC 重叠信号太细;跨两个 Feature 干 4 个子任务就会 auto-compact 4-6 次,适得其反。

**无字节下限。** 开发者审查过过度触发风险后不采用。200 KiB 字节下限符合修订过的意图:auto-compact 只在攒够足够对话量、cost 划算时才跑。

**5 分钟冷却。** 不采用。200 KiB 字节下限单独限速触发器;成功 compact 总结对话让字节归零,下一次 auto-compact 又要再攒 200 KiB。

**复用现有 `todo-live-compact-hint` 而不是新建 Spec。** 不采用。Hint 是信息性,新行为是动作性。

**通过私有 composer API 或私下写文件触发 compact。** 不采用。框架产品契约是走文档化面;绕开 DSH 会产生会漂移的平行路由。

## 任务

1. 写 `lib/todo-compact-trigger.js`,导出 `evaluateTrigger`、`maybeAutoCompact`、`featureIdForSpecPath`、`bytesBetweenTimestamps`,以及 `BYTE_THRESHOLD_BYTES = 200 * 1024` 常量。AC:AC-SWITCH-001 至 AC-SWITCH-005、AC-TRIG-001 至 AC-TRIG-005。
2. 在 `lib/spec-todos.js` 加 `featureIdForSpecPath`。AC:AC-ACTIVE-001、AC-ACTIVE-002。
3. 更新 `lib/cli.js#runTodoMark`,在写 `task/done` 事件之后调 `maybeAutoCompact`,并在 stdout 打印五行结果之一。移除旧 `Compaction hint:` 文本。AC:AC-CLI-001 至 AC-CLI-005。
4. 写 `tests/todo-compact-trigger.test.js`,覆盖谓词、触发函数、字节测量,以及一个记录调用的 stub slash-command dispatcher。AC:AC-SWITCH-001 至 AC-SWITCH-005、AC-TRIG-001 至 AC-TRIG-005。
5. 扩展 `tests/cli-todo.test.js`,加四种 stdout 行用例并断言旧 hint 缺失。AC:AC-CLI-001 至 AC-CLI-005。
6. 扩展 `tests/spec-todos.test.js`,加 `featureIdForSpecPath` 用例。AC:AC-ACTIVE-001、AC-ACTIVE-002。
7. 写 `docs/user/features/auto-compact-on-unrelated-task-done.{md,zh.md,i18n.yaml}`,含四个 mattpocock 节标题。AC:AC-DOCS-001。
8. 把三份新 docs 和新 test 加到 `.blueprint/features/spec-governance.md` 的 `required documents` 与 `Scope` 列表。AC:AC-SCAN-001。
9. 给现有 `.specs/implemented/todo-live-compact-hint.md` 的 `## Consequences` 段补一段,说明字节阈值提示已被本 Spec 的 auto-compact 公告取代。AC:AC-CLI-005。
10. 跑 `node lib/cli.js docs check --cwd .`、`node lib/cli.js scan --all --cwd .`、完整 host + diagnostics 测试套件。AC:AC-DOCS-002、AC-SCAN-001、AC-REGRESSION-001。

## 生命周期

- 状态:拟议
- 批准后目标状态:已实现(文件移至 `.specs/implemented/auto-compact-on-unrelated-task-done.md`)

## 事实变化

新增事实:
- `lib/todo-compact-trigger.js` 存在,导出 `evaluateTrigger`、`maybeAutoCompact`、`featureIdForSpecPath`、`bytesBetweenTimestamps`、`BYTE_THRESHOLD_BYTES`。
- `lib/spec-todos.js` 导出 `featureIdForSpecPath`。
- `lib/cli.js#runTodoMark` 在写 `task/done` 事件之后调 `maybeAutoCompact`,并在 stdout 打印五行结果之一。
- 旧 `Compaction hint:` 行不再由 `todo mark done` 发出。
- 一种新事件 `compact/auto-fired` 可在 auto-compact 调度成功后出现在 `session.jsonl` 里。
- `spec-governance` Feature brief 的 `Documents` 与 `Scope` 列表新增三份 required docs 与一份新 required test。

保留事实:
- 除 `todo mark done` 的 hint 行外,所有现有 CLI 子命令。
- 现有 232 条 host 测试与 diagnostics 包测试。
- `todo-live-compact-hint` Spec 留在 `.specs/implemented/` 作为历史记录(给 `## Consequences` 段加一段说明)。
- `persistent-todo-list`、`compact-at-checkpoint`、session-scale-awareness 程序其余部分不变。

## 可追溯性

REQ-TRIG-1 → scenario[feature-switch-fires]、[same-feature-skips]、[under-threshold-skips] → task 1 → AC-SWITCH-001、AC-SWITCH-002、AC-SWITCH-003 → 验证 tests/todo-compact-trigger.test.js
REQ-TRIG-2 → scenario[same-feature-skips] → task 1 → AC-SWITCH-001 → 验证 tests/todo-compact-trigger.test.js
REQ-TRIG-3 → scenario[under-threshold-skips] → task 1 → AC-SWITCH-002 → 验证 tests/todo-compact-trigger.test.js
REQ-TRIG-4 → scenario[no-previous-task-skips] → task 1 → AC-SWITCH-004、AC-SWITCH-005 → 验证 tests/todo-compact-trigger.test.js
REQ-DISPATCH-1 → scenario[feature-switch-fires] → task 1 → AC-TRIG-004 → 验证 tests/todo-compact-trigger.test.js
REQ-DISPATCH-2 → scenario[dispatch-failure-does-not-rollback] → task 1 → AC-TRIG-005 → 验证 tests/todo-compact-trigger.test.js
REQ-DISPATCH-3 → scenario[feature-switch-fires] → task 1 → AC-TRIG-004 → 验证 tests/todo-compact-trigger.test.js
REQ-CLI-1 → scenario[feature-switch-fires]、[same-feature-skips]、[under-threshold-skips]、[no-previous-task-skips] → task 3 → AC-CLI-001、AC-CLI-002、AC-CLI-003、AC-CLI-004 → 验证 tests/cli-todo.test.js
REQ-CLI-2 → scenario[feature-switch-fires] → task 3 → AC-CLI-001、AC-CLI-005 → 验证 tests/cli-todo.test.js
REQ-ACTIVE-1 → task 2 → AC-ACTIVE-001、AC-ACTIVE-002 → 验证 tests/spec-todos.test.js
REQ-ACTIVE-2 → task 2 → AC-ACTIVE-001、AC-ACTIVE-002 → 验证 tests/spec-todos.test.js

## 未决决策

1. 准确的 DSH API 调度面没在本 Spec 钉死。实现在 `ctx.inputTriggers.dispatch`(Skills sub-spec A 文档化)与 `runSlashCommand`(`@deepseek-ai/dsh-client-ui-input-trigger` 若导出)之间二选一,任务 3 选哪个取决于已解析 DSH 版本实际导出哪一个。如果两个都没有,`REQ-DISPATCH-1` 不能被满足,Spec 在运行时会卡住;开发者必须升级 DSH。

## 质量清单(自检)

- 需求完整:yes(10 个 REQ,覆盖谓词、dispatch、CLI 集成、active Feature 解析)
- 需求无歧义:yes
- 需求有边界:yes
- 需求能感知失败:yes
- 需求可测:yes
- 需求无矛盾:yes

## 跨工件分析

- 需求到场景:yes
- 需求到影响:yes
- 需求到任务:yes
- 需求到验收:yes
- 需求到验证:yes
- 任务到范围:yes
- 设计到范围:yes
- 范围到路径:yes

## 结果

Blueprint 完成需求联动验证后自动填入。

- 已验证 snapshot：`git-index:047e45f6e5e7381e113f83efc5aa71f0190bbdf7a592fa637e03ff27bbe0b443`
- 验证尝试：`attempt-auto-compact`
- 结论：自动 compact 在 Feature 切换（≥200 KiB）时落地。`lib/todo-compact-trigger.js` 导出 `evaluateTrigger`、`maybeAutoCompact`、`featureIdForSpecPath`、`bytesBetweenTimestamps` 与 `BYTE_THRESHOLD_BYTES`。`lib/spec-todos.js` 导出 `featureIdForSpecPath`。`lib/cli.js#runTodoMark` 在写入 `task/done` 事件后调用 `maybeAutoCompact`，并打印五行结果之一：`feature-switch fired`、`same feature`、`under threshold`、`no previous task`、`dispatch failed`。旧的"Compaction hint: ... MiB accumulated ..." 行被退役；`tests/todo-compact-hint.test.js` 更新为断言新行为。所有 252 项 host 测试与诊断测试通过；`node lib/cli.js scan --all --cwd .` 报 0 required / 0 recommended；`node lib/cli.js docs check --cwd .` 确认 18/18 双语对。此构建尚未接通 DSH 调度面，触发器在一次启动期警告后返回 `no-dispatch-surface`；当已解析的 DSH 版本暴露 `ctx.inputTriggers.dispatch` 或 `@deepseek-ai/dsh-client-ui-input-trigger#runSlashCommand` 时，后续 Spec 再接通。
- AC 证据：21 条验收全部通过。
- 检查证据：predicate（命令）、trigger（命令）、cli-output（命令）、active-feature（命令）、docs-check（命令）、scan（命令）、full-test（命令）。

### 后续：DSH 调度接通（`.specs/implemented/auto-compact-on-unrelated-task-done--dsh-dispatch-wired.md`）

上面 `## 未决决策` 提到的"DSH 调度面尚未接通"由配套交付的后继 Spec 解决。该后继引入 host-side session-file watcher（`lib/auto-compact-watcher.js`），通过 plugin 入口的 `inject: ["compaction"]` 注册。watcher 在 Feature 切换 + 200 KiB 谓词 fire 时直接调用 `ctx.compaction.compactNow(agent, signal, commandId)`——`@deepseek-ai/dsh-command-compact` 内部使用的同一 API。CLI 的 `lib/cli.js#emitAutoCompact` 仍传 `dispatch: null`（拿不到 host 的 cordis `ctx`），但它的打印行对人仍然有用，host watcher 才是权威的调度方。CLI 的 `no-dispatch-surface` 行只在已解析的 DSH profile 完全没有 `ctx.compaction`（CI / lint）时出现。

### 后续：DSH 调度改走 `agentPresets.serviceFor`（`.specs/proposed/auto-compact-on-unrelated-task-done--preset-aware-dispatch.md`）

第一次接通调度的后继把 `"compaction"` 留在 plugin 的 `inject` 数组里，在出厂 `web` profile（`@deepseek-ai/dsh-web-app/cordis.patch.yml:387-391` 同时禁用 `- id: compaction-basic` 与 `- id: command-compact`）上会让 Cordis Loader 的 `assertEntriesActivated` 把 fiber 卡在 `FIBER_PENDING`，并报 `pending (waiting for service: compaction)` 拒启 plugin。配套 Spec 把 watcher 重写为通过 `ctx.agentPresets.serviceFor(agent, 'compaction').compactIfNeeded(agent, 'context-overflow', signal)` 解析 compaction 引擎，并把 inject 依赖从 `"compaction"` 换成 `"agentPresets"`（host-plane 服务，每个出厂 profile 都挂）。标准 preset 的 `cordis:group` 已经把 `compaction-basic` 挂在 `isolate` realm 后面，`serviceForAgent` 是在该 realm 内读服务的官方访问器。触发判定与 CLI 行为不变；plugin 现在能在每个出厂 DSH profile（含 web）上干净加载，Feature 切换 + 200 KiB 自动 compact 在当前 session 的 preset 挂了 compaction 引擎时通过 preset-scoped `BasicCompactionEngine` 触发。
