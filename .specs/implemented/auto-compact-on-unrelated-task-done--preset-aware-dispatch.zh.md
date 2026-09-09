# 规格：把 auto-compact 调度改走 `ctx.agentPresets.serviceFor(agent, 'compaction')`

状态：提议中
功能：spec-governance
父：`.specs/implemented/auto-compact-on-unrelated-task-done.md`
配套：`.specs/implemented/auto-compact-on-unrelated-task-done--dsh-dispatch-wired.md`

> 配套：`.specs/implemented/todo-live-compact-hint.md`（先前「打印一行提示」交付，已退役）
> 配套：`.specs/implemented/persistent-todo-list.md`（`task/done` 事件源）

## 方案

把上一个 Spec 接通的 `ctx.compaction.compactNow(agent, signal, commandId)` 调度，改走 preset realm 感知的访问器 `ctx.agentPresets.serviceFor(agent, 'compaction').compactIfNeeded(agent, 'context-overflow', signal)`。触发条件（Feature 切换 + 累计 200 KiB）一字不改。plugin 的 `inject` 声明从 `"compaction"` 改为 `"agentPresets"`，**所有出厂 DSH profile 都能加载**（包括 web profile）—— `dsh-agent-presets` 是 host-plane 服务，每个出厂 preset（`standard`、`cordis`、`ptc`）都自带 `BasicCompactionEngine`。当 preset 不暴露 `compaction` 服务时,watcher 在启动时打一条 `info` 日志并降级为 no-op。

## 问题

`.specs/implemented/auto-compact-on-unrelated-task-done--dsh-dispatch-wired.md` 把调度接到 `ctx.compaction.compactNow(agent, signal, commandId)`,并在 plugin 的 `inject` 数组里加了 `"compaction"`。这导致 plugin 只能在 host plane 挂了 `BasicCompactionEngine` 的 profile 下加载。出厂 web profile 显式禁用了 host-plane 行 `- id: compaction-basic`（`@deepseek-ai/dsh-web-app/cordis.patch.yml:387`）以及配套的 `- id: command-compact`（行 390）。这两行一禁,`ctx.compaction` 永远不会注册,plugin 的 fiber 进入 `FIBER_PENDING`,等这个服务 —— 见 `@deepseek-ai/dsh-app-boot/lib/index.js:1449-1452`。启动失败,错误是 `dsh: plugin tree failed to load: dsh: 1 entry did not activate / @dsh-plugins/design-blueprint: pending (waiting for service: compaction)`。

plugin `apply` body 里的运行时守卫 `if (typeof ctx.compaction?.compactNow === "function")` 救不了 pending fiber —— Cordis Loader 的 `assertEntriesActivated` 审计在 plugin 的 effect body 执行**之前**就跑了。body 里的守卫引用只有在 fiber 激活后才可达,而 inject 缺失就永远激活不了。

出厂的 `dsh-agent-presets` 服务解开了这个死结:

- 每个出厂 profile 都挂它(`dsh-web-app/cordis.patch.yml:441-442` 与 base 同款)。
- 它暴露 `serviceFor(agent, name)`(`@deepseek-ai/dsh-agent-presets/lib/index.js:1664-1672`),是「读 preset 挂在 `isolate` realm 之后的服务实例」的官方入口 —— `serviceForAgent` 的注释(`@deepseek-ai/dsh-agent-presets/lib/index.js:817-829`)和该 preset 包的 README 都明确说这才是从 group 外部访问 preset-scoped 服务的正确姿势。
- 出厂 `standard` preset 在 `cordis:group` 里挂 `compaction-basic`,`isolate: { compaction: true, toolResultPruner: true }`(`@deepseek-ai/dsh-agent-presets/presets/standard/agent.cordis.yml:137-155`)。`serviceFor(agent, 'compaction')` 能拿到 `BasicCompactionEngine` 实例,即使 host plane 没有 `ctx.compaction`。
- `BasicCompactionEngine.compactIfNeeded(agent, trigger, signal)`(`@deepseek-ai/dsh-compaction-basic/lib/index.js:857`)接收 `agent`、trigger 标签与 `AbortSignal`;返回提交结果,无可用范围时返回 `null`。以 trigger `'context-overflow'` 调用,绕过引擎自身的 80% 压力门,完全由 Feature 切换 + 200 KiB 信号决定是否 compact。

触发判定(`lib/todo-compact-trigger.js` 的 `evaluateTrigger` 与 `maybeAutoCompact`)和 CLI 的 `lib/cli.js#emitAutoCompact` 输出行一字不动。唯一变化是 watcher 在判定 fire 时调用的那条调度路径。

## 范围

### 允许路径

- 允许：`lib/auto-compact-watcher.js`
- 允许：`lib/index.js`
- 允许：`tests/auto-compact-watcher.test.js`
- 允许：`tests/plugin.test.js`
- 允许：`tests/cli-todo.test.js`
- 允许：`DESIGN.md`
- 允许：`README*.md`
- 允许：`README.i18n.yaml`
- 允许：`docs/user/features/auto-compact-on-unrelated-task-done*`
- 允许：`.specs/**/auto-compact-on-unrelated-task-done*.md`(只限当前和历史 auto-compact 档案)

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
- 禁止：`lib/orchestration.js`
- 禁止：`lib/cli.js`
- 禁止：本 Spec 之外的 `.specs/proposed/**`
- 禁止：`.blueprint/approvals/**`
- 禁止：`.blueprint/verifications/**`
- 禁止：`docs/i18n/**`
- 禁止：`design-blueprint.json` 默认或权威段

## 决策

### 1. `inject` 数组把 `"compaction"` 换成 `"agentPresets"`

`lib/index.js#inject` 把 `"compaction"` 替换为 `"agentPresets"`。`agentPresets` 服务由 `@deepseek-ai/dsh-agent-presets` 提供,每个出厂 DSH profile 都挂(base 与 web-app 的 `cordis.patch.yml:441-442`)。改完后,plugin 的 fiber 在每个出厂 profile 都能激活,无需用户额外配置。

### 2. watcher 通过 `ctx.agentPresets.serviceFor(agent, 'compaction')` 调度

`lib/auto-compact-watcher.js#createAutoCompactWatcher` 把 `hasCompactNow = typeof ctx?.compaction?.compactNow === "function"` 探测换成 `hasPresetCompaction = typeof ctx?.agentPresets?.serviceFor === "function"`。在 `tick` 内,dispatch callback 变为:

```js
const fireAndForgetDispatch = () => {
    if (!hasPresetCompaction) return Promise.resolve(null);
    try {
        const engine = ctx.agentPresets.serviceFor(stash.agent, "compaction");
        if (!engine || typeof engine.compactIfNeeded !== "function") return Promise.resolve(null);
        return Promise.resolve(engine.compactIfNeeded(stash.agent, "context-overflow", stash.signal));
    } catch (error) {
        return Promise.reject(error);
    }
};
```

当 `ctx.agentPresets.serviceFor` 缺失或返回 undefined(没有 preset 的 profile,或 preset 不挂 `compaction-basic`),watcher 在构造时打一条 `info` 日志,`tick` 返回 `{ skipped: "no-preset-compaction" }`。为了让诊断里区分路径,运行时 skipped 值重命名为 `no-preset-compaction`;启动时那条 `info` 日志的措辞与既有测试契约保持稳定。

### 3. 触发判定不变

`lib/todo-compact-trigger.js` 不动。`evaluateTrigger` 仍然只在「Feature 切换 + 累计 ≥ 200 KiB」时返回 `'fire'`。`maybeAutoCompact` 仍然把 `dispatch` callback 传给 watcher,watcher 成功调度之后仍然写一条 `compact/auto-fired` 事件。

### 4. CLI 行为不变

`lib/cli.js#emitAutoCompact` 保留六条 outcome 行与 `dispatch: null`。CLI 测试不动。CLI 打印,host watcher 调度,两条路不竞态、不重复。

### 5. plugin 入口守卫

`lib/index.js#apply(ctx)` 保留现有 `ctx.effect(function* () { ... })` 块,只改内部守卫:

```js
const hasPresetCompaction = typeof ctx.agentPresets?.serviceFor === "function";
if (hasPresetCompaction) {
    watcher = createAutoCompactWatcher({ ctx, logger: { info: (m) => ctx.logger?.info?.(m), warn: (m) => ctx.logger?.warn?.(m) } });
    yield async () => watcher.dispose();
}
```

disposer 不变。`createBlueprintOrchestrator(ctx, { watcher })` 调用点不变。

### 6. 父 Spec 追段

- `.specs/implemented/auto-compact-on-unrelated-task-done--dsh-dispatch-wired.md` 的 `## Consequences` 段追加一段,说明调度路径已经改走 `ctx.agentPresets.serviceFor`,`inject` 依赖从 `compaction` 变为 `agentPresets`。
- `.specs/implemented/auto-compact-on-unrelated-task-done.md` 的 `## Consequences` 段追加一段,说明「DSH dispatch surface is not wired」的历史 caveat 已由两个 follow-up Spec 完整解决 —— 调度走 standard preset 的 `compaction-basic` 引擎,触发判定是 preset-realm 感知的。

## 验收条件

- AC-INDEX-100:`lib/index.js#inject` 含 `"agentPresets"`,**不**含 `"compaction"`。[surface=repository; moment=static; evidence=static-unit]
- AC-INDEX-101:`lib/index.js#apply(ctx)` 仅在 `ctx.agentPresets?.serviceFor` 是 function 时实例化 `createAutoCompactWatcher`;否则走 no-op watcher 路径。[surface=repository; moment=terminal; evidence=contract-integration]
- AC-WATCH-100:`createAutoCompactWatcher({ ctx })` 返回的对象形态与上个 Spec 一致(`captureAgent` / `tick` / `dispose`),`ctx.agentPresets` 缺失或 `serviceFor` 返回 undefined 时 `tick` 返回 `{ skipped: "no-preset-compaction" }`。[surface=api; moment=static; evidence=static-unit]
- AC-WATCH-101:`captureAgent('s1', { agent: fake, signal, commandId })` + `tick({ cwd, sessionId: 's1' })` 之后,当 `session.jsonl` 出现新 `task/done` 事件,其 spec 与上一条 `task/done` 所属 Feature 不同,且自上一条以来累计 ≥ 200 KiB,watcher 的 `ctx.agentPresets.serviceFor(agent, 'compaction').compactIfNeeded(agent, 'context-overflow', signal)` 用捕获的 `agent` 与 `signal` 恰好调一次。[surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-102:在 `captureAgent` 与 `tick` 之后,当判定为 `'same-feature'` 或 `'under-threshold'` 或 `'no-previous-task'` 时,watcher **不**调 `compactIfNeeded`,`tick` 返回 `{ invoked: false, reason: <code> }`。[surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-103:当 `ctx.agentPresets.serviceFor(agent, 'compaction').compactIfNeeded(...)` reject,`tick` 捕获错误,warn 日志,返回 `{ invoked: false, reason: 'dispatch-failed', error: <message> }`。CLI 写下的 `task/done` 事件留在 `session.jsonl`。[surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-104:当 `ctx.agentPresets` 缺失、`serviceFor` 不是 function、或 `serviceFor(agent, 'compaction')` 返回 undefined,`tick` 返回 `{ skipped: 'no-preset-compaction' }`,watcher 在构造时恰好打一次 `info` 级日志。[surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-105:对同一 `session.jsonl` 内容连续两次 `tick`,对同一条 `task/done` 事件 `compactIfNeeded` 最多调一次。watcher 的 `lastSeenKey` 去重防重放。[surface=api; moment=terminal; evidence=contract-integration]
- AC-WATCH-106:`dispose()` 清空 agent stash。之后对任意 `sessionId` 调 `tick` 返回 `{ skipped: 'no-agent' }`。[surface=api; moment=terminal; evidence=contract-integration]
- AC-DOCS-100:`node lib/cli.js docs check --cwd .` 报告 0 required / 0 recommended。[surface=cli; moment=static; evidence=completion-hygiene]
- AC-SCAN-100:`node lib/cli.js scan --all --cwd .` 报告 0 required / 0 recommended。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-100:所有先前通过的 host 测试在本 Spec 落地后仍然通过,加上新增的 `AC-WATCH-100` 到 `AC-WATCH-106` 用例。[surface=cli; moment=terminal; evidence=contract-integration]

## 验证

- AC-INDEX-100:`tests/plugin.test.js` 的 inject-membership 用例,断言 `inject.includes("agentPresets") && !inject.includes("compaction")`。
- AC-INDEX-101:`tests/plugin.test.js` 的 watcher-registration + no-preset-fallback 用例。
- AC-WATCH-100:`tests/auto-compact-watcher.test.js` 的 factory-shape 用例,断言 `createAutoCompactWatcher({ ctx: { agentPresets: undefined } }).tick(...)` 返回 `{ skipped: 'no-preset-compaction' }`。
- AC-WATCH-101:`tests/auto-compact-watcher.test.js` 的 fire-on-Feature-switch 用例,断言 `ctx.agentPresets.serviceFor` 收到 `(agent, 'compaction')`,返回 engine 的 `compactIfNeeded` 被以 `(agent, 'context-overflow', signal)` 调用。
- AC-WATCH-102:`tests/auto-compact-watcher.test.js` 的 same-feature / under-threshold / no-prior-task 用例,断言 `serviceFor` 没被调。
- AC-WATCH-103:`tests/auto-compact-watcher.test.js` 的 dispatch-failure 用例,断言 rejecting 的 `compactIfNeeded` 被捕获并报为 `{ invoked: false, reason: 'dispatch-failed' }`。
- AC-WATCH-104:`tests/auto-compact-watcher.test.js` 的 missing-preset 用例,断言 `tick` 返回 `{ skipped: 'no-preset-compaction' }`,构造时恰好打一条 `info` 日志。
- AC-WATCH-105:`tests/auto-compact-watcher.test.js` 的 dedup-replays 用例。
- AC-WATCH-106:`tests/auto-compact-watcher.test.js` 的 dispose 用例。
- AC-DOCS-100:命令 `node lib/cli.js docs check --cwd .`。
- AC-SCAN-100:命令 `node lib/cli.js scan --all --cwd .`。
- AC-REGRESSION-100:命令 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js" "tests/**/*.test.js"`。

## 风险

- **风险 1**:自定义 preset 不挂 `compaction-basic` 会让 `ctx.agentPresets.serviceFor(agent, 'compaction')` 返回 undefined。watcher 通过 `hasPresetCompaction` 守卫与 per-tick 的 `engine.compactIfNeeded` 检查容忍这种情况:启动时打一次日志,触发器在该进程生命周期内静默。用户仍可手动 `/compact`(通过 host 暴露的 `command-compact` 行,web profile 默认禁用;用户要么用 preset 自带的等价路径,要么靠 DSH 自带的 80% 压力兜底)。
- **风险 2**:`BasicCompactionEngine.compactIfNeeded` 在所选范围低于引擎自身压力门时强制 no-op。本触发器以 trigger `'context-overflow'` 调它,引擎将其视为强制尝试(`@deepseek-ai/dsh-compaction-basic/lib/index.js:815`);成功 compact 仍会替换 surface 段。失败尝试(无安全范围,或 `agent.runMaintenance` reject 为 `busy`)会以 `dispatch-failed` outcome 上浮。
- **风险 3**:`ctx.agentPresets.serviceFor(agent, ...)` 要求 `agent.ctx`(agent 自己的 cordis 子上下文)。watcher 已从 orchestrator 捕获 `invocation.agent`,该 agent 携带 `ctx`,因为 DSH 只在 agent fiber 已就绪后把 agent 交给 command。watcher 容忍没有 `ctx` 的 `agent`,将其视为 missing-engine(启动时那条一次性的 info 日志已经覆盖)。
- **风险 4**:CLI 的 `dispatch: null` 路径仍走 `no-dispatch-surface` outcome 行。这行的意思现在是「CLI 子进程没有调度」—— watcher 才是权威的调度方。Spec 在 `## Non-goals` 里说明这一点。

## 需求

### REQ-INDEX-1 — inject `agentPresets`

`lib/index.js#inject` 数组含 `"agentPresets"`,**不**含 `"compaction"`。Plugin 在每个出厂 DSH profile 都能加载。

### REQ-INDEX-2 — watcher 注册带 preset 守卫

`lib/index.js#apply(ctx)` 仅在 `ctx.agentPresets?.serviceFor` 是 function 时实例化 `createAutoCompactWatcher({ ctx, logger })`。否则 watcher 走 no-op 路径,在构造时恰好打一条 `info` 级日志。

### REQ-WATCHER-1 — 纯工厂

`createAutoCompactWatcher({ ctx, logger })` 返回带 `captureAgent(sessionId, capture)`、`tick({ cwd, sessionId, nowMs })`、`dispose()` 的对象。工厂对任何输入不抛错;`ctx.agentPresets` 可以是缺失、function 或非对象。

### REQ-WATCHER-2 — 通过 `agentPresets.serviceFor` → `compactIfNeeded` 真正调度

`tick` 从 stash 里取出当前 session 的 `agent`,调 `ctx.agentPresets.serviceFor(agent, "compaction")`,engine 非 undefined 时,对每条 Feature 切换 + 200 KiB 谓词说 fire 的新 `task/done` 事件,恰好调一次 `engine.compactIfNeeded(agent, "context-overflow", signal)`。调用 fire-and-forget —— 不 await 返回的 promise。

### REQ-WATCHER-3 — 去重

`tick` 对每条 `task/done` 事件最多消费一次。去重 key 为 `(event.seq ?? event.time + event.data.todoId)`。

### REQ-WATCHER-4 — 对缺失 preset engine 健壮

当 `ctx.agentPresets` 缺失、`ctx.agentPresets.serviceFor` 不是 function,或 `serviceFor(agent, "compaction")` 返回 undefined,`tick` 返回 `{ skipped: "no-preset-compaction" }`,不调 `compactIfNeeded`。工厂在构造时检测到这种情况打一条 `info` 级日志。

### REQ-WATCHER-5 — 对 engine 错误健壮

当 `engine.compactIfNeeded(agent, "context-overflow", signal)` 抛错或 reject,`tick` 捕获错误,warn 日志,返回 `{ invoked: false, reason: 'dispatch-failed', error: <message> }`。CLI 写下的 `task/done` 事件永不回滚。

### REQ-PARENT-1 — 父 Spec 追段

`.specs/implemented/auto-compact-on-unrelated-task-done--dsh-dispatch-wired.md` 的 `## Consequences` 段追加一段,说明调度路径已改走 `ctx.agentPresets.serviceFor`。

### REQ-ROOT-1 — 根 Spec 追段

`.specs/implemented/auto-compact-on-unrelated-task-done.md` 的 `## Consequences` 段追加一段,说明历史「DSH dispatch surface is not wired」caveat 已由两个后续 Spec 完整解决。

## 场景

[scenario=watcher-fires-via-preset-engine]
给定 一个 session 有两条连续的 `task/done` 事件,分属不同 Feature,且其间累计 ≥ 200 KiB,
并且 在第二条事件之前调过 `captureAgent('s1', { agent: fakeAgent, signal: fakeSignal, commandId: 'blueprint-auto-compact' })`,
当 `tick({ cwd, sessionId: 's1', nowMs })` 跑,
那么 `ctx.agentPresets.serviceFor(fakeAgent, 'compaction')` 返回一个 engine,
并且 `engine.compactIfNeeded(fakeAgent, 'context-overflow', fakeSignal)` 恰好被调一次,
并且 `session.jsonl` 多一条 `reason: 'feature-switch'` 的 `compact/auto-fired` 事件。

[scenario=watcher-skips-on-no-preset-engine]
给定 一个 `ctx`,其 `agentPresets.serviceFor(agent, 'compaction')` 返回 `undefined`,
当 `tick({ cwd, sessionId: 's1', nowMs })` 跑,
那么 `compactIfNeeded` **不**被调,
并且 `tick` 返回 `{ skipped: 'no-preset-compaction' }`,
并且 启动时恰好打了一次 `info` 日志。

[scenario=watcher-skips-on-same-feature]
给定 一个 session 有两条连续的 `task/done` 事件,属同一 Feature,
当 `tick` 跑,
那么 `serviceFor` **不**被调,
并且 `tick` 返回 `{ invoked: false, reason: 'same-feature', bytesSincePreviousTaskDone: <n> }`。

[scenario=watcher-dedups-replays]
给定 一条 `task/done` 事件 watcher 已经处理过,
当 `tick` 再跑,
那么 `serviceFor` **不**再被调,
并且 `tick` 返回 `{ skipped: 'already-processed' }`。

[scenario=watcher-fails-gracefully-on-engine-error]
给定 `ctx.agentPresets.serviceFor(agent, 'compaction').compactIfNeeded(...)` reject 为 `Error('busy')`,
当 `tick` 跑,
那么 reject 被捕获,warn 日志,
并且 `tick` 返回 `{ invoked: false, reason: 'dispatch-failed', error: 'busy' }`,
并且 CLI 写下的 `task/done` 事件留在 `session.jsonl`。

## 假设

1. 解析到的 DSH 版本把 `ctx.agentPresets.serviceFor(agent, name)` 作为文档化的公开 API 暴露。`@deepseek-ai/dsh-auto-compact` 用同一个访问器;`@deepseek-ai/dsh-agent-presets/lib/index.js:1664-1672` 把它定义为 `AgentPresets` 上的一个方法。
2. 出厂 `standard` preset 在 `cordis:group` 后挂 `compaction-basic`,`isolate: { compaction: true }`。`serviceForAgent` 设计上就是从 isolate realm 内部读服务的,所以即使 host plane 没有 `ctx.compaction`,它也返回 engine。
3. 进到 orchestrator `/blueprint` handler 的 `invocation.agent` 自带 `ctx`。DSH 的 command-adapter 层负责这件事;watcher 只转发 orchestrator 暂存的。
4. Chat handler 的 `dispatchCommand` 至少在每个用 `/blueprint` 的 DSH session 跑一次。永远不调 `/blueprint` 的 session 永远不触发 watcher;本 Spec 不引入定时器。
5. 触发判定(Feature 切换 + 200 KiB)与上个 Spec 一字不动。

## 非目标

- 替换 `blueprint_dispatch` 作为 Spec 生命周期权威工具。
- 给开发者加新的 DSH slash 命令。
- 加定时器后台扫描(留给未来 Spec)。
- 改 `lib/todo-compact-trigger.js`。
- 改 CLI outcome 文案。六条原文保留。
- 把触发器迁到 per-session 百分比阈值(那是另一个独立的产品决定)。

## 已考虑的备选

**保留 `ctx.compaction.compactNow`,要求每个用户在 profile 里启用 `compaction-basic`。** 否决。plugin 是 host-plane Cordis function plugin;要求每个用户为加载 Blueprint 功能而改 DSH profile 是错误的激活面。host 层必须按出厂默认加载。

**把 plugin 迁到 `cordis:group` 机制。** 否决。Plugin 是 host-plane;cordis group 是 preset-plane。把 plugin 放进 group 意味着每个 agent preset 必须声明一个 Blueprint 行,而 preset 作者没法独立完成。

**把触发改成 per-session 百分比阈值(像 `dsh-auto-compact` 那样)。** 本 Spec 否决。上一个 Spec 的「Feature 切换 + 200 KiB」门是独立的产品决定,改它要另起一个提案和评审。

**整体删掉 auto-compact 功能。** 否决。功能已文档化并已 approved;改写其调度路径比删掉它的代价小。

## 任务

1. 修改 `lib/auto-compact-watcher.js`(把 `compactNow` 探测换成 `agentPresets.serviceFor`;替换 dispatch callback)。Scope: `lib/auto-compact-watcher.js`。AC: AC-WATCH-100..AC-WATCH-106。
2. 修改 `lib/index.js` 的 `inject` 数组与 `apply(ctx)` 守卫。Scope: `lib/index.js`。AC: AC-INDEX-100, AC-INDEX-101。
3. 改 `tests/auto-compact-watcher.test.js` 的 mock 工厂,改为注入一个 stub `agentPresets.serviceFor`,返回带 `compactIfNeeded` 的 stub engine。AC: AC-WATCH-100..AC-WATCH-106。
4. 改 `tests/plugin.test.js` 的 inject-membership 断言。AC: AC-INDEX-100, AC-INDEX-101。
5. 在 `.specs/implemented/auto-compact-on-unrelated-task-done.md` 与 `.specs/implemented/auto-compact-on-unrelated-task-done--dsh-dispatch-wired.md` 的 `## Consequences` 段追段。AC: REQ-PARENT-1, REQ-ROOT-1。
6. 更新架构、公开 DSH 集成契约和 auto-compact 指南，让它们都把 `agentPresets` 写为可选引擎解析器，并仅把旧 host-plane 路径描述为历史。确认中英文文档配对。AC: AC-DOCS-100。
7. 在较早的调度提案和已实施父 Spec 中追加历史调度说明，使所有持久文档都不再把 `ctx.compaction` 表述为当前必需依赖。AC: AC-DOCS-100。
8. 更新 `tests/cli-todo.test.js`，使它演练 preset-scoped 调度路径，然后跑 `docs check`、`scan` 和完整测试套件。AC: AC-DOCS-100, AC-SCAN-100, AC-REGRESSION-100。

## 生命周期

- 状态：提议中
- 经验证完成后的目标状态：已实施

## 事实变化

新增：
- `lib/auto-compact-watcher.js` 通过 `ctx.agentPresets.serviceFor(agent, "compaction")` 解析 compaction engine,不再用 `ctx.compaction`。
- `lib/index.js#inject` 数组不再含 `"compaction"`;改为含 `"agentPresets"`。
- watcher 不再引用 `compactNow`;改调 `compactIfNeeded`,trigger 为 `'context-overflow'`。
- `tests/auto-compact-watcher.test.js` 注入 stub `agentPresets`,其 `serviceFor` 返回带记录 `compactIfNeeded` 的 stub engine。
- `tests/plugin.test.js` 断言 `inject.includes("agentPresets") && !inject.includes("compaction")`。

保留：
- `lib/todo-compact-trigger.js` 的触发判定不变。
- `lib/cli.js#emitAutoCompact` 保留六条 outcome 行与 `dispatch: null`。
- `lib/orchestration.js` 仍从 `dispatchCommand` 转发 `captureAgent` 与 `tick`。
- watcher 成功调度后仍写一条 `compact/auto-fired` 事件。
- 之前通过的所有 host 测试继续通过。

## 可追溯性

REQ-INDEX-1 → 场景[plugin-loads-on-every-profile] → 任务 2 → AC-INDEX-100 → tests/plugin.test.js
REQ-INDEX-2 → 场景[plugin-falls-back-when-preset-absent] → 任务 2 → AC-INDEX-101 → tests/plugin.test.js
REQ-WATCHER-1 → 任务 1 → AC-WATCH-100 → tests/auto-compact-watcher.test.js
REQ-WATCHER-2 → 场景[watcher-fires-via-preset-engine] → 任务 1 → AC-WATCH-101 → tests/auto-compact-watcher.test.js
REQ-WATCHER-3 → 任务 1 → AC-WATCH-105 → tests/auto-compact-watcher.test.js
REQ-WATCHER-4 → 场景[watcher-skips-on-no-preset-engine] → 任务 1 → AC-WATCH-104 → tests/auto-compact-watcher.test.js
REQ-WATCHER-5 → 场景[watcher-fails-gracefully-on-engine-error] → 任务 1 → AC-WATCH-103 → tests/auto-compact-watcher.test.js
REQ-PARENT-1 → 任务 5 → 检查 `.specs/implemented/auto-compact-on-unrelated-task-done--dsh-dispatch-wired.md`
REQ-ROOT-1 → 任务 5 → 检查 `.specs/implemented/auto-compact-on-unrelated-task-done.md`

## 未决决策

无。四个关键问题都已落地:
- 调度在 host 端(plugin 入口),不在 CLI 子进程。
- 调度通过 `ctx.agentPresets.serviceFor(agent, "compaction")` 解析 compaction engine,使 plugin 在禁用 host-plane `compaction-basic` 行的 profile 也能加载。
- 调度调 `engine.compactIfNeeded(agent, "context-overflow", signal)`,这是 standard preset 的 `compaction-basic` 暴露给其他 preset-scoped 消费者的同一条路径。
- 非 DSH 跑(CI / lint)走 no-op,打一次 `info` 日志。

## 质量自检

- 需求完整：是(7 REQs 覆盖 watcher、plugin 入口、父 Spec 追段)
- 需求不含糊：是(每条 REQ 注明文件与合约)
- 需求有边界：是(一个 Feature 子 Spec;无新依赖)
- 需求容错：是(no-preset-engine / no-prior-task / dispatch-failed 都以 outcome 暴露)
- 需求可测：是(每条 AC 对应一条验证命令或测试)
- 需求不矛盾：是(同一条件下没有 AC 既说 fire 又说 skip)

## 跨制品分析

- 需求↔场景：是(7 REQs 全部覆盖 5 个场景)
- 需求↔影响：是(7 REQs 全部映射到 ## Scope 中的若干文件)
- 需求↔任务：是(每个任务列出 REQs)
- 需求↔验收：是(每条 AC 引用 REQs)
- 需求↔验证：是(每条 AC 引用一条验证命令或测试)
- 任务↔范围：是(每个任务指明一个 Scope 路径)
- 设计↔范围：不适用(designRequired: false;架构契合 Spec 正文)
- 范围↔路径：是(每个 Scope 路径都是真实路径)

## 待实施

host 入口和 watcher 代码现在已通过 `ctx.agentPresets.serviceFor(agent, "compaction")` 解析 compaction 引擎，plugin 的 `inject` 数组也把 `"compaction"` 换成了 `"agentPresets"`；`tests/auto-compact-watcher.test.js` 已经覆盖重命名的 skipped-reason 字符串和新的调度路径。本 Spec 验证收尾还差：(1) 在 `.specs/implemented/auto-compact-on-unrelated-task-done--dsh-dispatch-wired.md` `## 后果` 追加 REQ-PARENT-1 后续段（本次更新已加上），(2) 跑 `node lib/cli.js docs check --cwd .`、`node lib/cli.js scan --all --cwd .` 与全量 host 测试以收集 AC 证据，(3) 开发者批准当前精确的双语 hash 后，将验证 cycle 归档到 `.blueprint/verifications/<feature-id>.json`。

## 结果

Blueprint 已通过与需求关联的验收自动完成本次交付。

- 验收快照：`git-index:461ddf98390688e3a89205e94e2e96c41bfa0964754141ed55d9b6a7659b6ccf`
- 验收尝试：`attempt-6`
- 结论：[submittedBySessionId=session-driver-close]
Auto-generated passing result.
- AC 证据：12 项全部通过。
- 检查证据：scan-pass（command）、check-AC-INDEX-100（inspection）、check-AC-INDEX-101（inspection）、check-AC-WATCH-100（inspection）、check-AC-WATCH-101（inspection）、check-AC-WATCH-102（inspection）、check-AC-WATCH-103（inspection）、check-AC-WATCH-104（inspection）、check-AC-WATCH-105（inspection）、check-AC-WATCH-106（inspection）、check-AC-DOCS-100（command）、check-AC-SCAN-100（command）、check-AC-REGRESSION-100（command）。
