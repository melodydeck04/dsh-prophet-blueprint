# 规格：Feature 切换自动 compact —— 接通 DSH `/compact` 调度

状态：拟议
功能：spec-governance
父：`.specs/implemented/auto-compact-on-unrelated-task-done.md`（之前的「判定 + CLI 输出」交付）

> 配套：`.specs/implemented/todo-live-compact-hint.md`（先前「打印一行提示」交付，已退役）
> 配套：`.specs/implemented/persistent-todo-list.md`（`task/done` 事件源）
> 配套：`.specs/implemented/auto-compact-on-unrelated-task-done.md`（判定 + CLI 输出行；本 Spec 复用的 `maybeAutoCompact` 纯函数来源）

## 方案

把先前 stub 出来的 dispatcher 真正接通,让 Feature 切换 + 200 KiB 触发器真的调起 DSH 的 `/compact`。CLI 子进程(`node lib/cli.js todo mark …`)没法拿到 host 的 cordis `ctx`,所以调度搬到 host 端 —— 一个在 plugin 自己 cordis fiber 里跑的 session-file watcher。watcher 持有 `ctx.compaction`,以及 orchestrator 在每次 `/blueprint` 调用时捕获的 session 级 `agent` / `AbortSignal` / `commandId`。当新 `task/done` 事件落地且判定说要 fire,watcher 调 `ctx.compaction.compactNow(agent, signal, commandId)` —— 跟 `@deepseek-ai/dsh-command-compact` 内部调人类 `/compact` 时用的是同一个 API。不引入新权限,不走平行路由,不用私有 composer API。

## 问题

`.specs/implemented/auto-compact-on-unrelated-task-done.md` 发了一个支持 `dispatch` callback 参数的纯函数 `maybeAutoCompact`,但 `lib/cli.js#emitAutoCompact` 传的是 `dispatch: null`。CLI 子进程拿不到 `ctx.compaction`,触发器走到判定就退回 `no-dispatch-surface` 打 stdout。host 端明明握着 `ctx.compaction.compactNow(...)`,但从来不调。

三条调度路径都验证过:

- `ctx.inputTriggers.dispatch`(Skills 子 Spec A 的)—— 已确认是 slash 自动补全注册表(`registerSource`),**不是** slash command 调度面。
- `@deepseek-ai/dsh-client-ui-input-trigger` 的 `runSlashCommand` —— 已确认不存在;该 package 的 `apply()` 是空的,只发浏览器半边。
- `ctx.compaction.compactNow(agent, signal, commandId)` —— DSH 文档化 API,`@deepseek-ai/dsh-command-compact` 内部用它包 `/compact`。人类敲 `/compact` 走的也是它。

CLI 是 Node 子进程。DSH host 是父进程。子进程没法回调父进程的 in-process handle。所以 dispatcher 必须落在 host 端,响应 CLI 写到 `session.jsonl` 的 `task/done` 事件,并持有 host 的 cordis 上下文。

## 范围

### 允许路径

- 允许：`lib/auto-compact-watcher.js`
- 允许：`lib/orchestration.js`
- 允许：`lib/index.js`
- 允许：`tests/{auto-compact-watcher,cli-todo,orchestration,orchestration-auto-compact,plugin}.test.js`
- 允许：`docs/user/features/auto-compact-on-unrelated-task-done.{md,zh.md,i18n.yaml}`
- 允许：`.blueprint/features/spec-governance.md`
- 允许：`.specs/implemented/auto-compact-on-unrelated-task-done.md`(只在 `## Consequences` 段后追一段)
- 允许：`package.json`

### 禁止路径

- 禁止：`lib/scan.js`
- 禁止：`lib/web-api.js`
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
- 禁止：`lib/spec-decomposition.js`
- 禁止：`lib/spec-todos.js`
- 禁止：`lib/todo-events.js`
- 禁止：`lib/todo-store.js`
- 禁止：`.blueprint/approvals/**`
- 禁止：`.blueprint/verifications/**`
- 禁止：本 Spec 对文件对之外的 `.specs/**`(`.specs/implemented/auto-compact-on-unrelated-task-done.md` 只允许追一段 `## Consequences`)
- 禁止：`docs/i18n/**`
- 禁止：`design-blueprint.json` 的 default 或 authority 段

## 决策

### 1. Host 端 session-file watcher

`lib/auto-compact-watcher.js` 导出唯一工厂 `createAutoCompactWatcher({ ctx, logger })`。watcher:

1. 持一张 `Map<sessionId, { agent, signal, commandId, lastSeenTaskDoneTime, lastSeenTaskDoneKey }>`,记录当前 session 的运行时 agent 与已消费的最后一条 `task/done`。
2. 暴露 `captureAgent(sessionId, capture)` —— orchestrator 在每次 `/blueprint` 调用时调它刷新 stash。stash 项在 `lastSeenTaskDoneTime` 跟新看到的事件一致时自动幂等。
3. 暴露 `tick({ cwd, sessionId, nowMs })` —— orchestrator 在每次 `/blueprint` 调用末尾调它。tick:
   a. 通过既有 `locateSessionPath` helper 读 `.dsh/sessions/<sessionId>/session.jsonl`(回退到 `<cwd>/session.jsonl`)。
   b. 扫新增行,找 `task/done` 事件,要求 `time > lastSeenTaskDoneTime` 且稳定 key(`seq` 或 `time+todoId`)与 `lastSeenTaskDoneKey` 不同。
   c. 对每个新事件(典型为 0 或 1 个),调 `maybeAutoCompact(...)`,传 `currentTaskSpecPath` ← `event.data.spec` 与一个真 `dispatch` callback,callback 调 `ctx.compaction.compactNow(agent, signal, commandId)`。dispatch 是 fire-and-forget:`tick()` 立刻返回,日志留底,不阻塞 chat 回合。
   d. 用已消费事件更新 `lastSeenTaskDoneTime` 与 `lastSeenTaskDoneKey`。
4. 暴露 `dispose()` 在 plugin unload 时清空 stash。

watcher 是 **authoritative dispatcher**。CLI 的 `emitAutoCompact` 保留打 outcome 行的职责(让开发者看见发生了什么),但 `dispatch` 参数仍是 `null` —— CLI 子进程跑不了真 dispatcher,watcher 在下一次 `/blueprint` 调起时接住同一份 `task/done` 事件。

### 2. Orchestrator 里的 agent stash

`lib/orchestration.js#createBlueprintOrchestrator` 扩展,接可选 `watcher` 依赖。给定时,`dispatchCommand("blueprint", invocation)` 按序做三件事:

1. 从 `invocation.agent` 解析 `sessionId`。
2. 调 `watcher.captureAgent(sessionId, { agent: invocation.agent, signal: invocation.signal, commandId: invocation.commandId })`。
3. 现有 refinement packet 工作完成后,调 `await watcher.tick({ cwd: cwdOf(invocation.agent), sessionId, nowMs: Date.now() })`。orchestrator 内部 await `tick()` 的 promise,但 tick 内部的 `ctx.compaction.compactNow(...)` 调用是 fire-and-forgotten,所以慢 compact 不阻塞 chat 回合。

测试注入 stub `watcher` 记录 `captureAgent` 和 `tick` 调用。orchestrator 的 `dispatchNatural`(`blueprint_dispatch` 工具用的)走同一路径。

### 3. Plugin 入口接通 watcher

`lib/index.js#apply(ctx)` 给 `inject` 数组加 `"compaction"`。在已有 `ctx.effect(function* () { ... })` 块内,Skills provider 注册之后:

1. 如果 `ctx.compaction?.compactNow` 是 function,dynamic `await import(...)` `lib/auto-compact-watcher.js` 并实例化 `createAutoCompactWatcher({ ctx, logger: <plugin logger> })`。传给 `createBlueprintOrchestrator(ctx, { watcher })`。
2. 否则,实例化一个 no-op watcher,记一次 `info` 级「auto-compact: skipped (no DSH compaction service in this profile)」,其余走 `maybeAutoCompact` + `dispatch: null`。这样 CI / lint 不带 DSH 时,`lib/cli.js#emitAutoCompact` 的 outcome 行仍然有意义。
3. 给 `ctx.effect` 注册 disposer,plugin unload 时 `watcher.dispose()`。

watcher import 是 effect body 里的 dynamic `await import(...)`,对齐 Skills loader 的现有写法。plugin 仍然可以在不带 `@deepseek-ai/dsh-compaction` 的 DSH 版本上加载。

### 4. CLI 仍是打印机,不是 dispatcher

`lib/cli.js#emitAutoCompact` 保持当前形态:导入 `maybeAutoCompact`,`dispatch: null`(CLI 子进程调不到 `ctx.compaction`),打六条 outcome 之一(`feature-switch`、`same-feature`、`under-threshold`、`no-previous-task`、`no-dispatch-surface`、`dispatch-failed`)。`no-dispatch-surface` 文案不变。无新 flag,无新行,CLI 端不做 dispatch。

`tests/cli-todo.test.js` 加一个用例锁定契约:

- CLI 调用打印 `Auto-compact: skipped (no DSH slash-command dispatch surface; manual /compact required).` 后,在同一 session 目录放一个 stub watcher,用同一 `cwd` 与 `sessionId` tick 它,stub watcher 必须对 CLI 刚写的 `task/done` 事件调 dispatch callback。

这锁住契约:CLI 打印,host 调度;两条路不竞态,不重复。

### 5. 复用的纯函数

`lib/todo-compact-trigger.js#maybeAutoCompact` 不动。已有的 `dispatch` callback 合约就是接缝 —— watcher 传 `async (cmd) => ctx.compaction.compactNow(agent, signal, commandId)`。`maybeAutoCompact` 末尾的 `compact/auto-fired` 事件写入(dispatch 成功之后)就是先前 Spec 承诺的 diagnostics 归因;它现在从一个真的 `/compact` 调起后落地,而不是 stub。

### 6. 双语用户文档

`docs/user/features/auto-compact-on-unrelated-task-done.{md,zh.md,i18n.yaml}`:

- 英文 `## Common questions` 最后一条("What if my DSH profile does not expose a slash-command dispatch surface?")改写为：「If the resolved DSH version exposes `ctx.compaction.compactNow` (the same API the human `/compact` slash command uses internally), the plugin's host-side watcher calls it directly when the trigger fires. There is no manual `/compact` step. If the resolved profile has no `ctx.compaction`, the trigger reduces to a no-op with a one-time boot warning, and the developer must upgrade the DSH baseline.」
- `## It's working if` 加一条可观察:「After a successful fire, DSH's `/compact` slash command resolves the same way it does when typed manually — the context window shortens, a `compaction/start` and `compaction/end` event pair land in `session.jsonl`, and the framework's `compact/auto-fired` event is appended right after the `compaction/end` event with `previousFeatureId` / `currentFeatureId` / `bytesSincePreviousTaskDone`.」

中文镜像同步更新。

### 7. 父 Spec 追一段

`.specs/implemented/auto-compact-on-unrelated-task-done.md` 的 `## Consequences` 段追加一段,说明原「DSH dispatch surface is not wired」一行已被本 Spec 解决;历史记录保留。

## 验收条件

- AC-WATCH-001:`createAutoCompactWatcher({ ctx })` 返回带 `captureAgent`、`tick`、`dispose` 三方法的对象。对没有 `captureAgent` 过的 `sessionId` 调 `tick` 是 no-op(返回 `{ skipped: 'no-agent' }`)。[surface=api; moment=static; evidence=static-unit]
- AC-WATCH-002:在 `captureAgent('s1', { agent: fake, signal, commandId })` 与 `tick({ cwd, sessionId: 's1' })` 之后,当 `session.jsonl` 含一条新 `task/done` 事件,其 spec 归属与上一条 `task/done` 事件的 Feature 不同,且自上一条以来累计 ≥ 200 KiB,watcher 的 `ctx.compaction.compactNow(agent, signal, commandId)` 用捕获的 `agent` / `signal` / `commandId` 恰好调一次。[surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-003:在 `captureAgent` 与 `tick` 之后,当谓词为 `'same-feature'` 或 `'under-threshold'` 或 `'no-previous-task'`,`ctx.compaction.compactNow` **不**被调,`tick` 返回 `{ invoked: false, reason: <code> }`。[surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-004:对同一 `session.jsonl` 内容连续两次 `tick({ cwd, sessionId: 's1' })`,对同一条 `task/done` 事件 `ctx.compaction.compactNow` 最多调一次。watcher 的 `lastSeenTaskDoneKey` 去重防重放。[surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-005:当 `ctx.compaction.compactNow(agent, signal, commandId)` 抛错,`tick` 捕获错误,warn 日志,返回 `{ invoked: false, reason: 'dispatch-failed', error: <message> }`。CLI 写下的 `task/done` 事件留在 `session.jsonl`。[surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-006:`dispose()` 清空 agent stash。之后对任意 `sessionId` 调 `tick` 返回 `{ skipped: 'no-agent' }`。[surface=api; moment=terminal; evidence=contract-integration]
- AC-INDEX-001:`lib/index.js#inject` 含 `"compaction"`,与既有五个服务并列。[surface=repository; moment=static; evidence=static-unit]
- AC-INDEX-002:`lib/index.js#apply(ctx)` 在已有 `ctx.effect` 块内、`commands` / `tools` / `webServer` 注册**之前**注册 watcher。当 `ctx.compaction.compactNow` 不存在时,走 no-op watcher 路径。[surface=repository; moment=terminal; evidence=contract-integration]
- AC-INDEX-003:`lib/index.js#apply(ctx)` 注册 `ctx.effect` disposer,plugin unload 时调 `watcher.dispose()`。[surface=repository; moment=supporting; evidence=contract-integration]
- AC-ORCH-001:`createBlueprintOrchestrator(ctx, { watcher: stubWatcher })`,stubWatcher 的 `captureAgent` 与 `tick` 为记录 stub:`dispatchCommand("blueprint", invocation)` 之后,`stubWatcher.captureAgent` 用 `(sessionId, { agent, signal, commandId })` 调过一次,`stubWatcher.tick` 用 `{ cwd, sessionId, nowMs }` 调过一次。[surface=api; moment=terminal; evidence=contract-integration]
- AC-ORCH-002:orchestrator 通过 dependencies 透传:用 `createBlueprintOrchestrator(ctx, { watcher: null })` 构造的测试仍能工作(orchestrator 容许 watcher 缺失;`dispatchCommand` 不调 capture 也不调 tick)。[surface=api; moment=terminal; evidence=contract-integration]
- AC-CLI-006:`design-blueprint todo mark <id> --spec <path> done` 写一条 `task/done` 事件后,CLI 打印六条 outcome 之一(已有),stub watcher 用同一 `cwd` 与 `sessionId` tick 之后能看见新事件并通过 `ctx.compaction.compactNow` 调度。CLI 打出来的行跟 watcher 的 outcome 互相独立(watcher 的 fire 在后续 watcher tick 可见)。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-DOCS-003:`docs/user/features/auto-compact-on-unrelated-task-done.md` 与 `.zh.md` 存在;英文 `## Common questions` 段不再有「manual /compact required」那句,改为说明 host-side watcher 直接调 `ctx.compaction.compactNow`。新文案落地后,`node lib/cli.js docs check --cwd .` 报 0 required / 0 recommended issue。[surface=cli; moment=static; evidence=completion-hygiene]
- AC-PARENT-001:`.specs/implemented/auto-compact-on-unrelated-task-done.md` 在 `## Consequences` 段后追一段,说明本 Spec 解决了原「DSH dispatch surface is not wired」寝忌。[surface=repository; moment=static; evidence=static-unit]
- AC-SCAN-002:本 Spec 落地后,`node lib/cli.js scan --all --cwd .` 报 0 required / 0 recommended issue。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-002:改动后,所有 252 条既有 host 测试继续通过,加上新增的 `tests/auto-compact-watcher.test.js` 与 orchestration / CLI 新测试。[surface=cli; moment=terminal; evidence=contract-integration]

## 验证

- AC-WATCH-001:测试 `tests/auto-compact-watcher.test.js` 工厂形态用例。[surface=api; moment=static; evidence=static-unit]
- AC-WATCH-002:测试 `tests/auto-compact-watcher.test.js` Feature 切换 fire 用例。[surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-003:测试 `tests/auto-compact-watcher.test.js` same-feature / under-threshold / no-prior-task 用例。[surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-004:测试 `tests/auto-compact-watcher.test.js` 去重重放用例。[surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-005:测试 `tests/auto-compact-watcher.test.js` 调度失败用例。[surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-006:测试 `tests/auto-compact-watcher.test.js` dispose 用例。[surface=api; moment=terminal; evidence=contract-integration]
- AC-INDEX-001:测试 `tests/plugin.test.js` inject 成员用例。[surface=repository; moment=static; evidence=static-unit]
- AC-INDEX-002:测试 `tests/plugin.test.js` watcher 注册与无 compaction 退路用例。[surface=repository; moment=terminal; evidence=contract-integration]
- AC-INDEX-003:测试 `tests/plugin.test.js` disposer 注册用例。[surface=repository; moment=supporting; evidence=contract-integration]
- AC-ORCH-001:测试 `tests/orchestration-auto-compact.test.js` 转发到 watcher 用例。[surface=api; moment=terminal; evidence=contract-integration]
- AC-ORCH-002:测试 `tests/orchestration-auto-compact.test.js` watcher-null 用例。[surface=api; moment=terminal; evidence=contract-integration]
- AC-CLI-006:测试 `tests/cli-todo.test.js` CLI 打印 + host 调度用例。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-DOCS-003:检视两份更新的 `docs/user/features/auto-compact-on-unrelated-task-done.{md,zh.md}`,加命令 `node lib/cli.js docs check --cwd .`。[surface=cli; moment=static; evidence=completion-hygiene]
- AC-PARENT-001:检视 `.specs/implemented/auto-compact-on-unrelated-task-done.md` 的 `## Consequences` 追段。[surface=repository; moment=static; evidence=static-unit]
- AC-SCAN-002:命令 `node lib/cli.js scan --all --cwd .`。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-002:命令 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js" "tests/**/*.test.js"`。[surface=cli; moment=terminal; evidence=contract-integration]

## 风险

- watcher 由 chat handler 事件驱动。CLI 写 `task/done` 事件与下一次 `/blueprint` 调用触发 watcher 之间有一个事件延迟。一个开发者完成 `task/done` 之后立即敲非 `/blueprint` 内容,auto-compact 要等下次 `/blueprint` 才触发。可接受:每个 DSH chat session 终归会敲一次 `/blueprint`,且慢 compact 是 fire-and-forget。
- watcher 为 active session 持有 `agent` 引用。如果 session 在 orchestrator `dispatchCommand` 跑完前结束(例如 agent 中途崩),stash 会保留 `agent` 直至 `dispose()`。引用无害:`dispose()` 在 plugin unload 清,且 `tick()` 在 `task/done` 不是新事件时 no-op。
- `ctx.compaction.compactNow(agent, signal, commandId)` 要求 `ManualCompactAgentContext`(`session` + `options` + `runMaintenance`)。`invocation.agent` 不一定每个 DSH profile 都带 `runMaintenance`。watcher 容错:`compactNow` 抛错时,warn 日志,落回 `dispatch-failed` outcome。运行期假设见 `## 假设`。
- 未来 Spec 可能想在当前 chat-driven tick 上加一个真的 timer 驱动轮询(用于从不调 `/blueprint` 的 session)。那份 Spec 会注册 `ctx.interval(...)` 加 `inject: ['timer']`;本 Spec 不引入该依赖。

## 需求

### REQ-WATCHER-1 — 纯工厂

`lib/auto-compact-watcher.js` 的 `createAutoCompactWatcher({ ctx, logger })` 返回带 `captureAgent(sessionId, capture)`、`tick({ cwd, sessionId, nowMs })`、`dispose()` 的对象。不读不写 `session.jsonl` 之外的任何文件系统,不调 `process.exit`,任何输入都不抛。

### REQ-WATCHER-2 — `ctx.compaction.compactNow` 真调度

`tick` 对每条新 `task/done` 事件,Feature 切换 + 200 KiB 谓词 fire 时,用最近一次 `captureAgent` 给该 `sessionId` 捕获的 `agent` / `signal` / `commandId`,调 `ctx.compaction.compactNow(agent, signal, commandId)` 恰好一次。dispatch 是 fire-and-forget:不 await 调用返回的 promise。

### REQ-WATCHER-3 — 去重

`tick` 消费每条 `task/done` 事件最多一次。同一 `session.jsonl` 内容两次 tick 对同一事件最多触发一次 `compactNow`。去重 key 是 `(event.seq ?? event.time+event.data.todoId)`。

### REQ-WATCHER-4 — 缺 agent 容错

`tick` 对没有 agent stash 项的 `sessionId` 返回 `{ skipped: 'no-agent' }`,不调 `compactNow`。匹配 CI / 非 DSH 路径。

### REQ-WATCHER-5 — compact 失败容错

`ctx.compaction.compactNow` 抛错或 reject 时,`tick` 捕获,warn 日志,返回 `{ invoked: false, reason: 'dispatch-failed', error: <message> }`。CLI 写下的 `task/done` 事件**绝不**回滚。

### REQ-INDEX-1 — 注入 `compaction`

`lib/index.js#inject` 数组加 `"compaction"`,与既有服务并列。plugin 入口在不带 `@deepseek-ai/dsh-compaction` 的 DSH 版本上仍可加载(沿用既有模式)。

### REQ-INDEX-2 — watcher 注册

`lib/index.js#apply(ctx)` 实例化 `createAutoCompactWatcher({ ctx, logger })` 并传到 `createBlueprintOrchestrator(ctx, { watcher })`。当 `ctx.compaction.compactNow` 不是 function,实例化 no-op watcher 并写一次性 `info` 日志。

### REQ-INDEX-3 — 释放器

拥有 watcher 的 `ctx.effect` 块同时注册 disposer(`yield async () => watcher.dispose()`),plugin unload 时清空 agent stash 与去重状态。

### REQ-ORCH-1 — orchestrator 接 watcher

`lib/orchestration.js#createBlueprintOrchestrator(ctx, dependencies = {})` 接 `dependencies.watcher`,给定时,`dispatchCommand` 调 `watcher.captureAgent` 与 `watcher.tick`。既有行为(refinement packet、`agent.steer(...)`)不变。

### REQ-ORCH-2 — 容许 watcher 缺失

`dependencies.watcher` 缺失或 `null` 时,`dispatchCommand` 不报错继续。契约:orchestrator 仍可独立测试。

### REQ-CLI-1 — CLI 打印,watcher 调度

`lib/cli.js#emitAutoCompact` 保留既有六条 outcome 与 `dispatch: null`。除 `.specs/implemented/auto-compact-on-unrelated-task-done.md` 既定改动之外,无新增 CLI 改动。

### REQ-DOCS-1 — 改用户文档

英文与中文 `docs/user/features/auto-compact-on-unrelated-task-done.{md,zh.md}` 改 `## Common questions` 与 `## It's working if` 段,反映 host-side watcher 调度。

### REQ-PARENT-1 — 父 Spec 追段

`.specs/implemented/auto-compact-on-unrelated-task-done.md` 的 `## Consequences` 段追一段,说明原「DSH dispatch surface is not wired」寝忌被本 Spec 解决。

## 场景

[scenario=watcher-fires-compactNow-on-feature-switch]
给定 一条 session 含两条连续 `task/done` 事件,归属不同 Feature,两条之间累计 ≥ 200 KiB,
且 在第二条之前 `captureAgent('s1', { agent: fakeAgent, signal: fakeSignal, commandId: 'blueprint-auto-compact' })` 已被调,
当 `tick({ cwd, sessionId: 's1', nowMs })` 跑,
那么 `ctx.compaction.compactNow(fakeAgent, fakeSignal, 'blueprint-auto-compact')` 调一次,
且 `session.jsonl` 多一条 `compact/auto-fired`,`reason: 'feature-switch'`。

[scenario=watcher-skips-on-same-feature]
给定 一条 session 含两条连续 `task/done` 事件,归属同一 Feature,
当 `tick` 跑,
那么 `ctx.compaction.compactNow` **不**被调,
且 `tick` 返回 `{ invoked: false, reason: 'same-feature', bytesSincePreviousTaskDone: <n> }`。

[scenario=watcher-skips-on-under-threshold]
给定 一条 session 含两条连续 `task/done` 事件,归属不同 Feature,两条之间累计 < 200 KiB,
当 `tick` 跑,
那么 `ctx.compaction.compactNow` **不**被调,
且 `tick` 返回 `{ invoked: false, reason: 'under-threshold', bytesSincePreviousTaskDone: <n> }`。

[scenario=watcher-skips-on-no-prior-task]
给定 全新 `session.jsonl` 含一条 `task/done`,
当 `tick` 跑,
那么 `ctx.compaction.compactNow` **不**被调,
且 `tick` 返回 `{ invoked: false, reason: 'no-previous-task' }`。

[scenario=watcher-skips-on-no-agent]
给定 该 session 没有先调 `captureAgent`,
当 `tick` 跑,
那么 `ctx.compaction.compactNow` **不**被调,
且 `tick` 返回 `{ skipped: 'no-agent' }`。

[scenario=watcher-dedups-replays]
给定 一条 `task/done` 事件 watcher 已处理过,
当 `tick` 再跑,
那么 `ctx.compaction.compactNow` **不**再被调,
且 `tick` 返回 `{ skipped: 'already-processed' }`。

[scenario=watcher-fails-gracefully-on-compaction-error]
给定 `ctx.compaction.compactNow` reject `Error('busy')`,
当 `tick` 跑,
那么 reject 被捕获并 warn 日志,
且 `tick` 返回 `{ invoked: false, reason: 'dispatch-failed', error: 'busy' }`,
且 CLI 写下的 `task/done` 事件仍在 `session.jsonl`。

[scenario=cli-does-not-dispatch-but-host-does]
给定 一次 CLI `design-blueprint todo mark T1 done --spec .specs/proposed/foo.md` 跑下来往 `session.jsonl` 写一条 `task/done`,
当 CLI 打印 `Auto-compact: skipped (no DSH slash-command dispatch surface; manual /compact required).`,
且 host watcher 用同一 `cwd` 与 `sessionId` 跑一次 tick,
那么 host watcher 在谓词 fire 时调 `ctx.compaction.compactNow`,
且 CLI 打印的 outcome 行不变。

## 假设

1. 已解析 DSH 版本导出 `ctx.compaction.compactNow(agent, signal, commandId)` 为文档化公开 API。`@deepseek-ai/dsh-command-compact` 内部用之;watcher 用之。
2. orchestrator 的 `/blueprint` handler 拿到的 `invocation.agent` 是 `ManualCompactAgentContext`(即带 `session` / `options` / `runMaintenance`)。DSH 的 command-adapter 层负责;watcher 只转发 orchestrator stash 的内容。
3. chat handler 的 `dispatchCommand` 在每个用 `/blueprint` 的 DSH session 中至少跑一次。开发者从不敲 `/blueprint` 时,该 session 不会触发 auto-compact —— 本 Spec 不引入 timer 补这场景。
4. `session.jsonl` 在 DSH session 目录存在时位于 `<cwd>/.dsh/sessions/<sessionId>/session.jsonl`,否则位于 `<cwd>/session.jsonl`。匹配 `lib/todo-compact-trigger.js#locateSessionPath`。

## 非目标

- 不替换 `blueprint_dispatch` 作为权威 Spec lifecycle 工具。
- 不新增 DSH slash command 给开发者手动调用。动作就是既有 `/compact` slash command,编程式调起。
- 不加 timer-driven 后台扫。watcher 由 chat 驱动。未来 Spec 可加 `ctx.interval(...)` 服务不敲 `/blueprint` 的 session。
- 不 mock DSH。watcher 接真 `ctx`;no-op 路径给非 DSH 跑(CI / lint)用。
- 不改 `lib/todo-compact-trigger.js`。纯函数就是接缝,不动。
- 不改 CLI outcome 行文。既有六条保留原文。
- 不动 `.specs/implemented/auto-compact-on-unrelated-task-done.md` 除一段 `## Consequences` 追段。

## 备选方案

**用 `ctx.inputTriggers.registerSource` 当 slash-command dispatch surface。** 不采用。`ctx.inputTriggers` 是输入自动补全注册表(见 `@deepseek-ai/dsh-client-ui-input-trigger/lib/types/client/contract.d.ts`);`registerSource` 加候选项,不是 slash-command 执行器。

**用 `@deepseek-ai/dsh-client-ui-input-trigger` 的 `runSlashCommand`。** 不采用。该 package `apply()` 是空的(`lib/index.js`),`runSlashCommand` 未导出。

**让 CLI 子进程 shell-out 调 DSH 跑 `/compact`。** 不采用。CLI 是无状态 Node binary,跟父 DSH 进程没有 IPC 通道。shell-out 会从侧门进 DSH,产出 in-process 子 agent,不是当前用户的 active session。

**把判定搬进 orchestrator 的 `dispatchCommand`,每次 `/blueprint` 同步调 `compactNow`。** 不采用。chat handler 跑在 CLI 子进程写 `task/done` 事件之前,同一回合看不见新事件。watcher 模式更干净地处理一事件延迟。

**加 `ctx.interval(...)` 轮询。** 本 Spec 不采用:(a) 加 `inject: ['timer']` 会扩 plugin 的依赖面,(b) chat-driven tick 已经覆盖每个用 `/blueprint` 的 session。未来 Spec 可加 timer-driven 变体服务不敲 `/blueprint` 的 session。

**绕过 DSH 写平行路由(例如 DSH 轮询的文件系统 trigger)。** 不采用。产品契约就是用人类同一条文档化 DSH API;平行路由会漂移。

## 任务

1. 写 `lib/auto-compact-watcher.js`(覆盖 REQ-WATCHER-1..5)。Scope:`lib/auto-compact-watcher.js`。AC:AC-WATCH-001..006。
2. 改 `lib/orchestration.js` 接 `dependencies.watcher`(REQ-ORCH-1..2)。Scope:`lib/orchestration.js`。AC:AC-ORCH-001..002。
3. 改 `lib/index.js` 的 `inject` 与 `apply(ctx)` 注册 watcher(REQ-INDEX-1..3)。Scope:`lib/index.js`。AC:AC-INDEX-001..003。
4. 写 `tests/auto-compact-watcher.test.js`。AC:AC-WATCH-001..006。
5. 写 `tests/orchestration-auto-compact.test.js`。AC:AC-ORCH-001..002。
6. 扩 `tests/plugin.test.js`。AC:AC-INDEX-001..003。
7. 扩 `tests/cli-todo.test.js`(REQ-CLI-1)。AC:AC-CLI-006。
8. 改 user docs 并跑 `docs confirm`(REQ-DOCS-1)。AC:AC-DOCS-003。
9. 追 `## Consequences` 段(REQ-PARENT-1)。AC:AC-PARENT-001。
10. 更新 Feature brief、`package.json#lint:js`。AC:AC-SCAN-002。
11. 跑 `docs check`、`scan`、全量测试套件。AC:AC-DOCS-003、AC-SCAN-002、AC-REGRESSION-002。

## 生命周期

- 状态:拟议
- 批准后目标状态:已实现(文件移至 `.specs/implemented/auto-compact-on-unrelated-task-done--dsh-dispatch-wired.md`)

## 事实变化

新增事实:
- `lib/auto-compact-watcher.js` 存在,导出 `createAutoCompactWatcher`。
- `lib/orchestration.js#createBlueprintOrchestrator` 接 `dependencies.watcher`,在 `dispatchCommand` 转发 `captureAgent` + `tick`。
- `lib/index.js#apply(ctx)` 当 `ctx.compaction.compactNow` 是 function 时实例化 watcher;否则 no-op watcher + 一次性 `info` 日志。
- `tests/auto-compact-watcher.test.js` 存在,覆盖六个场景。
- `docs/user/features/auto-compact-on-unrelated-task-done.{md,zh.md}` 不再有「manual /compact required」寝忌。

保留事实:
- `lib/todo-compact-trigger.js#maybeAutoCompact` 与 `BYTE_THRESHOLD_BYTES = 200 * 1024` 不动。
- `lib/cli.js#emitAutoCompact` 保留六条 outcome 与 `dispatch: null`。
- 所有 252 条既有 host 测试继续通过;`node lib/cli.js scan --all --cwd .` 与 `node lib/cli.js docs check --cwd .` 保持 0 issue。

## 可追溯性

REQ-WATCHER-1..5 → scenarios in `## Scenarios` → task 1 → AC-WATCH-001..006 → tests/auto-compact-watcher.test.js
REQ-INDEX-1..3 → task 3 → AC-INDEX-001..003 → tests/plugin.test.js
REQ-ORCH-1..2 → task 2 → AC-ORCH-001..002 → tests/orchestration-auto-compact.test.js
REQ-CLI-1 → scenario[cli-does-not-dispatch-but-host-does] → task 7 → AC-CLI-006 → tests/cli-todo.test.js
REQ-DOCS-1 → task 8 → AC-DOCS-003 → user docs + docs check
REQ-PARENT-1 → task 9 → AC-PARENT-001 → inspection of .specs/implemented/auto-compact-on-unrelated-task-done.md

## 未决决策

无。四个实质问题都解:
- dispatcher 在 host 端(CLI 子进程没法调 `ctx.compaction`)。
- dispatcher 用 `ctx.compaction.compactNow(agent, signal, commandId)`,跟 `@deepseek-ai/dsh-command-compact` 用的是同一文档化 API。
- watcher 的 tick 由 chat 驱动(orchestrator 每次 `/blueprint` 调),不是 timer 驱动。
- 非 DSH 跑(CI / lint)走 no-op watcher + 一次性 `info` 日志。

## 质量清单(自检)

- 需求完整:yes(12 个 REQ,覆盖 watcher、orchestrator、plugin 入口、CLI、文档、父 Spec 追段)
- 需求无歧义:yes(每个 REQ 点名文件与合约)
- 需求有边界:yes(一个 Feature 子 Spec;无新依赖;无 timer 服务)
- 需求能感知失败:yes(no-agent、no-prior-task、dispatch-failed 都表面成 outcome)
- 需求可测:yes(每个 AC 映射到验证命令或测试)
- 需求无矛盾:yes(没 AC 在同条件上既说 fire 又说 skip)

## 跨工件分析

- 需求到场景:yes(12 个 REQ 全被 8 个场景覆盖)
- 需求到影响:yes(12 个 REQ 全映射到 `## 范围` 里至少一个文件)
- 需求到任务:yes(每个 task 列出 REQ)
- 需求到验收:yes(每个 AC 点名 REQ)
- 需求到验证:yes(每个 AC 点名验证命令或测试)
- 任务到范围:yes(每个 task 点名 Scope 路径)
- 设计到范围:不适用(designRequired: false;架构写在 Spec 正文,跟 `lib/index.js` 既有 Skills-loader 模式对齐)
- 范围到路径:yes(每个 Scope 路径匹配真实路径)
