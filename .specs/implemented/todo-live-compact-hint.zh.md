# 规格：TODO 完成时的实时 compact 提醒

状态：已实现
功能：spec-governance

## 问题

`design-blueprint todo mark <id> done` 写一条 `task/done` 事件,但它对「自上一条 `task/done` 起累积了多少字节」保持沉默。开发者只能等到下次跑 `blueprint-diagnostics audit session.jsonl`,通过 `compact-boundaries-missed` 规则拿到字节总数。等到 verdict 被读到时,新字节已经越线了。提醒需要在 `mark done` **当下**触发,带精确字节数,这样开发者才能决定是否在继续前 `/compact`。

`todo mark <id> done` 已经会发 `task/done` 事件;字节数已经在文件里。提醒只需读出来。

## 范围

### 允许路径

- 允许：`docs/user/features/todo-live-compact-hint.md`
- 允许：`docs/user/features/todo-live-compact-hint.zh.md`
- 允许：`docs/user/features/todo-live-compact-hint.i18n.yaml`

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
- 禁止：`lib/spec-decomposition.js`
- 禁止：`lib/todo-store.js`
- 禁止：`lib/spec-todos.js`
- 禁止：`lib/todo-events.js`
- 禁止：`blueprint-diagnostics/**`
- 禁止：`.blueprint/approvals/**`
- 禁止：`.blueprint/verifications/**`
- 禁止：本 Spec 配对文件以外的 `.specs/**`
- 禁止：`docs/i18n/**`
- 禁止：`design-blueprint.json` 的 default 或 authority 段

## 方案

### `todo mark <id> done` 自动提醒

当 `runTodo(flags, positional)` 给一条 TODO 写 `task/done` 事件时,CLI 接着读「新事件 `time` 与上一条 `task/done` `time`(或 session 开始时间,取较晚)之间」的字节,打一行提醒。格式固定、对机器友好:

```
Compaction hint: 1.42 MiB accumulated since last task/done. Type /compact before continuing.
```

这一行追加在已有 `Marked ... as done.` 之后。字节总数低于 1 MiB 阈值时,该行被抑制(阈值与 `compact-boundaries-missed` 的 yellowAt 一致,只在 `audit` 报黄时触发)。

字节扫描读取 `<cwd>/.dsh/sessions/<sessionId>/session.jsonl`(若 CLI 提供了 `sessionId`),否则读 `<cwd>/session.jsonl`。两个都不存在,提醒被抑制,stderr 输出一行调试信息:

```
Compaction hint: skipped (no session.jsonl at <path>).
```

文件存在但没有上一条 `task/done` 事件,扫描从文件第一字节起算。新事件 `time` 比上一条旧(时钟偏移),扫描范围 `[prior, new]`。

### `todo status [--json]` 查询

`todo` 子命令下新增 `status` action。打印一屏报告:

- 当前 Spec 的 TODO 数(`pending | in-progress | done`),
- 最近 3 条 `task/done` 事件(id、spec、req、ac、title、time、sessionId),
- 最近两条 `task/done` 之间的字节 delta(若无第二条则取 session 开始到现在),
- 与 `compact-boundaries-missed` 阈值对齐的结论 emoji(`🟢`/`🟡`/`🔴`)。

`--json` 同样的字段以 JSON 对象返回,供工具串联。

`todo status` 只读,不发 `task/*` 事件,不写 TODO list,不写审批记录。

### 单辅助,零新依赖

`lib/cli.js` 加一个辅助 `readSessionSegmentBytes(sessionPath, lo, hi)`,流式逐行读 `session.jsonl`,累加 `time` 落在 `[lo, hi]` 的记录的字节长度,返回总数。位置和 `renderSpecForReview` 相邻,沿用同样的读模式(`readFile` + 按 newline 切)。不引入新包。

## 验收条件

- AC-LC-001：`design-blueprint todo mark T1 done --spec <spec.md>` 写 `task/done` 事件,且当字节总数越过 1 MiB 黄线时,打印 `Compaction hint: <X> MiB accumulated since last task/done. Type /compact before continuing.`。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-LC-002：`design-blueprint todo mark T1 done --spec <spec.md>` 在字节总数低于 1 MiB 时 **不** 打印提醒行。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-LC-003：`design-blueprint todo mark T1 done --spec <spec.md>` 仅在字节数越过 1 MiB(yellowAt)时打印提醒,越过 4 MiB(redAt)时额外加 `🟡 Compact now.`,与 diagnostics 阈值对齐。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-LC-004：找不到 session 文件时,`design-blueprint todo mark T1 done --spec <spec.md>` 在 stderr 打印 `Compaction hint: skipped (no session.jsonl at <path>).`。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-LC-005：`design-blueprint todo status --spec <spec.md>` 打印计数摘要、最近 `task/done` 事件、字节 delta 和结论 emoji;`--json` 返回同字段的 JSON 对象。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-LC-006：不传 `--spec` 的 `design-blueprint todo mark T1 done` 退出码非零(沿用现有必填 flag 校验),不打印提醒。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-LC-007：所有现有 `tests/*.test.js` 在改动后继续通过。[surface=cli; moment=terminal; evidence=contract-integration]

## 验证

- AC-LC-001：测试 `tests/todo-compact-hint.test.js`
- AC-LC-002：测试 `tests/todo-compact-hint.test.js`
- AC-LC-003：测试 `tests/todo-compact-hint.test.js`
- AC-LC-004：测试 `tests/todo-compact-hint.test.js`
- AC-LC-005：测试 `tests/todo-compact-hint.test.js`
- AC-LC-006：测试 `tests/todo-compact-hint.test.js`
- AC-LC-007：命令 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js"`

## 风险

- 字节扫描同步读 `session.jsonl`,对开发者驱动的 `mark done` 足够,但在多 MB session 上会慢。后续 Spec 可改成流式;本 Spec 把范围限制在「两个 `task/done` 之间」并在到达上一条时短路。
- 提醒用 `/compact` 作为开发者提示,假设 DSH 提供这个命令。如果未来 DSH 改名,提醒文案会落后。提醒有意保持单行,让维护者无需走 Spec 即可更新。
- `todo status` 读最近 3 条 `task/done`;还没有过任何一条的 session 打印 `none yet`。字节 delta 回退到整段 session 长度,这是稳妥的默认。
- `todo mark ... done` 是唯一触发提醒的 transition。其他 (`pending`、`in-progress`) 保持静默,与第 1 阶段「只有 `task/done` 信号自然 compact 边界」的规则一致。

## 其他方案

- **只在下次 `audit` 跑时打印提醒。** 拒绝。理由:开发者意图是 *session 中*保持会话精简,不是事后看报告。提醒的价值就在当下,不是延迟报告。
- **把提醒做成独立的 `todo hint` 子命令,要开发者主动调。** 拒绝。理由:那等于把负担丢回给开发者让他记一个步骤。refine 时自动检查已经把那道闸放进了框架层;compact 提醒应该按同样原则。
- **直接通过 diagnostics 包读字节。** 拒绝。理由:`blueprint-diagnostics` 是独立的包,host 插件不该为了一个 CLI 行为依赖它。`lib/cli.js` 30 行辅助就够;阈值常量放进 `design-blueprint.json` 就和诊断包对齐了。

## 任务

1. 在 `lib/cli.js` 紧挨 `renderSpecForReview` 加 `readSessionSegmentBytes(sessionPath, lo, hi)`。REQ：AC-LC-001、AC-LC-002、AC-LC-003。Scope：`tests/todo-compact-hint.test.js`、`docs/user/features/todo-live-compact-hint.{md,zh.md,i18n.yaml}`。
2. 改 `lib/cli.js` 的 `runTodo(flags, positional)`,让 `done` 分支在写完 `task/done` 事件后读 `session.jsonl`,字节总数越过 1 MiB 时打提醒行,越 4 MiB 时带 `🟡 Compact now.` 对齐 `compact-boundaries-missed` 阈值。REQ：AC-LC-001、AC-LC-002、AC-LC-003。Scope：`tests/todo-compact-hint.test.js`。
3. 在 `lib/cli.js` 加 `runTodoStatus(flags, positional)`,挂到 `todo` 子命令的 `status` action,打印计数摘要和最近 `task/done` 事件。REQ：AC-LC-005。Scope：`tests/todo-compact-hint.test.js`。
4. 写 `docs/user/features/todo-live-compact-hint.md` + `.zh.md` + `.i18n.yaml`;跑 `node lib/cli.js docs confirm <owner>`。REQ：AC-LC-001..AC-LC-007。Scope：docs。
5. 跑 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js"` 和 `node lib/cli.js scan --all --cwd .`;确认 scan 报 `0 required`,完整测试套件继续通过。REQ：AC-LC-007。Scope：-。

## 结果

Blueprint 已通过与需求关联的验收自动完成本次交付。

- 验收快照：`git-index:e201532cf5487905cf00a9e417e5c11794b6f3d442607e173ac936a2cf9c207a`
- 验收尝试：`attempt-2`
- 结论：todo-live-compact-hint implementation complete. lib/cli.js adds readSessionSegmentBytes and emitCompactHint helpers; runTodo prints the compaction hint after marking a task done; todo status subcommand shows counts, recent events, byte delta, and verdict. 7 new tests pass; bilingual docs pair confirmed.
- AC 证据：7 项全部通过。
- 检查证据：compact-hint-yellow（command）、compact-hint-red（command）、full-suite（command）、docs-check（command）。
