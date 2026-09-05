# 规格：蓝图内持久 TODO 列表

状态：已实现
功能：spec-governance
父级：spec-governance

> 三阶段「会话规模感知」程序的第 1 阶段。
> 配套规格：`.specs/proposed/decomposition-contract.md`（第 2 阶段）、
> `.specs/proposed/compact-at-checkpoint.md`（第 3 阶段）。

## 问题

长 DSH 会话需要自然检查点：开发者完成「一部分」、能用干净 context 走入下一段的瞬间。今天唯一能跨 session 和 compact 存活下来的状态是写到磁盘的内容；运行时和模型 context window 里持有的所有东西，session 一结束或 `/compact` 一触发就全部丢失。结果是开发者没有机器可读的方式标记某一部分完成，不知道某个里程碑刚刚满足了哪条 REQ / AC，也无法事后判断自然 compact 边界在哪里。

挂在 Spec 上的持久 TODO 列表正好补上这个缺口。每条 TODO 携带 `id`、`status`、对所满足 REQ-* 和 AC-* 的引用，以及完成时的时间戳与 session id。列表以纯 YAML 形式紧挨 Spec 存储，因此能跨 compact 存活、跨 session 镜像，也是 diagnostics 包在第 3 阶段读取以识别自然 compact 边界的权威源，还是分解契约（第 2 阶段）用来证明 Spec 已被拆分的事实根据。

## 范围

### 允许路径

- 允许：`lib/todo-store.js`
- 允许：`lib/spec-todos.js`
- 允许：`lib/todo-events.js`
- 允许：`docs/user/features/persistent-todo-list.md`
- 允许：`docs/user/features/persistent-todo-list.zh.md`
- 允许：`docs/user/features/persistent-todo-list.i18n.yaml`
- 允许：`.specs/**/*.todos.yaml`

### 禁止路径

- 禁止：`blueprint-diagnostics/**`
- 禁止：`lib/scan.js`
- 禁止：`lib/web-api.js`
- 禁止：`lib/orchestration.js`
- 禁止：`lib/verification.js`
- 禁止：`lib/chat-commands.js`
- 禁止：`lib/client.js`
- 禁止：`lib/workflow.js`
- 禁止：`.blueprint/**`
- 禁止：`docs/i18n/**`
- 禁止：`design-blueprint.json`

## 方案

### 每个 Spec 一份 YAML 产物

每个加入本程序的 Spec 携带一份兄弟文件 `.specs/<feature>/<spec>.todos.yaml`。文件使用纯 UTF-8 YAML，使开发者能用任意编辑器阅读、产生干净 diff。TODO 条目是 YAML 对象，形状如下：

```yaml
version: 1
spec: .specs/proposed/persistent-todo-list.md
createdAt: 2026-09-02T15:00:00Z
createdBy: session-c4a14d7d-01c1-4e55-99ed-a1f413855a7a
todos:
  - id: T1
    status: done                  # pending | in-progress | done
    req: REQ-PTL-1
    ac: AC-PTL-001
    title: "实现 lib/todo-store.js"
    doneAt: 2026-09-02T15:30:00Z
    doneBy: session-c4a14d7d-01c1-4e55-99ed-a1f413855a7a
  - id: T2
    status: in-progress
    req: REQ-PTL-2
    ac: AC-PTL-002
    title: "接入 todo CLI 子命令"
  - id: T3
    status: pending
    req: REQ-PTL-3
    ac: AC-PTL-003
    title: "发出 task/done 事件"
```

产物是权威。运行期可以镜像它供当前 session 使用，但下一次 session 仍从磁盘重新加载。

### Store 与解析模块

`lib/todo-store.js` 导出纯函数：`loadTodoList(absolutePath) -> TodoList`、`saveTodoList(absolutePath, todoList)`、`validateTodoList(todoList) -> issues[]`。store 不触碰网络或 `process.cwd`；调用方提供绝对路径。`lib/spec-todos.js` 把 Spec 路径解析到它的 `.todos.yaml` 兄弟并返回加载好的列表。两个模块都框架无关、不依赖 DSH。

### CLI 子命令

`lib/cli.js` 新增 `todo` 子命令：

```
node lib/cli.js todo list --spec <spec.md> [--json]
node lib/cli.js todo show <id> --spec <spec.md> [--json]
node lib/cli.js todo mark <id> <status> --spec <spec.md> [--session-id <id>]
```

`mark` 是唯一写回磁盘的命令。当把一条 TODO 转成 `done` 时，CLI 把一条 `task/done` 事件 append 到 `session.jsonl`（使用 `lib/types/todo-events.js`）；转成 `in-progress` 或回退到 `pending` 时，append 一条 `task/status`。事件 schema 故意收得很窄，使第 3 阶段的 audit 不必再演化。

### 事件 schema

```jsonl
{"type":"task/status","seq":<int>,"time":<ms>,"data":{"todoId":"T1","from":"in-progress","to":"done","spec":".specs/proposed/persistent-todo-list.md","req":"REQ-PTL-1","ac":"AC-PTL-001"}}
{"type":"task/done","seq":<int>,"time":<ms>,"data":{"todoId":"T1","spec":".specs/proposed/persistent-todo-list.md","req":"REQ-PTL-1","ac":"AC-PTL-001","title":"实现 lib/todo-store.js"}}
```

`task/done` 是第 3 阶段锁定的自然 compact 边界标记。`task/status` 让 audit 能诚实地分辨 pending 与 in-progress。

### 存活保证

因为产物是磁盘上的文件，`/compact` 丢不了它，session 崩溃丢不了它，新 session 按需重新加载它。运行期镜像只是便利，YAML 才是真相。

## 验收条件

- AC-PTL-001：`.specs/proposed/persistent-todo-list.md` 这份 Spec 能与一份 `.todos.yaml` 配对，并通过 `lib/todo-store.js` 解析成结构化 `TodoList` 对象。[surface=api; moment=terminal; evidence=static-unit]
- AC-PTL-002：`node lib/cli.js todo list --spec <spec.md>` 退出码 0，并为每条 TODO 打印含 `id`、`status`、`req`、`ac`、`title` 的表。[surface=cli; moment=terminal; evidence=user-visible]
- AC-PTL-003：`node lib/cli.js todo mark T1 done --spec <spec.md> --session-id <id>` 把新的 `done` 状态写入 YAML、设置 `doneAt` 与 `doneBy`，并向 `session.jsonl` append 一条 `task/done` 事件加一条 `task/status` 事件。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-PTL-004：跑完 `todo mark T1 done` 之后，删除运行期镜像（或模拟一次全新 session），下一次 `todo list` 仍把 T1 报告为 `done`，因为 YAML 才是事实源。[surface=api; moment=terminal; evidence=static-unit]
- AC-PTL-005：违反 schema 的 `.todos.yaml`（缺 `version`、id 重复、`status` 取值非法）会让校验失败，CLI 输出明确错误而非静默损坏状态。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-PTL-006：所有现有 `tests/*.test.js` 测试在改动后继续通过。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-PTL-007：双语 docs 落地后，`design-blueprint docs check` 退出码 0。[surface=repository; moment=static; evidence=completion-hygiene]

## 验证

- AC-PTL-001：测试 `tests/todo-store.test.js`
- AC-PTL-002：测试 `tests/cli-todo.test.js`
- AC-PTL-003：测试 `tests/cli-todo.test.js`
- AC-PTL-004：测试 `tests/todo-store.test.js` + `tests/spec-todos.test.js`
- AC-PTL-005：测试 `tests/todo-store.test.js`
- AC-PTL-006：命令 `node --experimental-test-isolation=none --test "tests/*.test.js"`
- AC-PTL-007：命令 `node lib/cli.js docs check --cwd .`

## 需求

### REQ-PTL-1 — YAML 产物格式

`lib/todo-store.js` 应读、写一份 YAML：含 `version: 1`、承载 Spec 相对路径的 `spec` 字段、`todos` 数组（每条含 `id`、`status`、`req`、`ac`、`title`，以及可选的 `doneAt` / `doneBy`）。store 遇到 schema 违规应抛出 `TodoSchemaError`，并一次性列出全部违规。

### REQ-PTL-2 — 从 Spec 到 TODO 的路径解析

`lib/spec-todos.js` 应在给定 Spec 路径 `S` 时返回把 `.md` 替换为 `.todos.yaml` 的绝对路径（若 `S` 以 `.zh.md` 结尾，则先剥去 `.zh.md` 和 `.md`）。YAML 不存在时返回 `null`；不存在不抛错。

### REQ-PTL-3 — CLI 子命令接口

`lib/cli.js todo <subcommand>` 应支持 `list`、`show <id>`、`mark <id> <status>`，参数与上文「CLI 子命令」一致。`mark` 拒绝把 TODO 切到 `{pending, in-progress, done}` 之外的状态。

### REQ-PTL-4 — task/done 与 task/status 事件

`lib/types/todo-events.js` 导出 `buildTaskStatusEvent({todoId, from, to, spec, req, ac, seq, time, sessionId})` 与 `buildTaskDoneEvent({todoId, spec, req, ac, title, seq, time, sessionId})`。两个函数返回可 JSON 序列化的对象，符合方案里的 schema。每次 `mark` 调用，CLI 恰好 append 一条 `task/status` 事件；新状态为 `done` 时再额外 append 一条 `task/done` 事件。

### REQ-PTL-5 — 幂等 re-mark

连续两次跑 `mark T1 done`，第二次不应再 append 第二条 `task/done` 事件。CLI 应识别这次 no-op 并以退出码 0 退出，消息中点名已是 `done` 的 TODO。

### REQ-PTL-6 — YAML 权威

`lib/todo-store.js` 不应静默把 YAML 合并进陈旧的运行期镜像。`loadTodoList` 始终重新读文件；store 不在 CLI 调用之间保留内存缓存。覆盖「新 session」场景的测试必须存在，以证明 YAML 是事实源。

### REQ-PTL-7 — Schema 校验

`validateTodoList(todoList)` 在 YAML 合规时返回空数组；否则返回 `{ code, path, message }` 形式的逐条违规列表。store 拒绝保存校验不通过的列表。

## 场景

[scenario=happy-load-and-list]
给定一份 Spec，伴随兄弟 `.todos.yaml` 含三条 TODO，
当 `node lib/cli.js todo list --spec <spec.md>` 跑起来，
那么 stdout 显示一张三行表，`id`、`status`、`req`、`ac`、`title` 与 YAML 对齐。

[scenario=mark-writes-event]
给定一份 Spec 含一条 pending TODO `T1`，
当 `node lib/cli.js todo mark T1 done --spec <spec.md> --session-id s1` 跑起来，
那么磁盘上的 YAML 把 `T1` 标为 `status: done`，并设 `doneAt` 与 `doneBy: s1`，
且 `session.jsonl` 末尾追加一条 `task/status` 事件后跟一条 `task/done` 事件。

[scenario=fresh-session-reloads-yaml]
给定上一场景已跑完，
当新 session 重新加载 YAML 并跑 `todo list`，
那么 `T1` 仍显示为 `done`，即便上一 session 的运行期状态已消失。

[scenario=invalid-yaml-rejected]
给定一份 YAML 含重复的 TODO id，
当 `loadTodoList` 被调用，
那么抛出 `TodoSchemaError`，消息点名 `duplicate id: T2` 与其它所有违规。

[scenario=no-todo-yet]
给定一份 Spec 没有 `.todos.yaml` 兄弟，
当 `node lib/cli.js todo list --spec <spec.md>` 跑起来，
那么 CLI 退出码 0，打印 `(no TODO list yet for this Spec)`，
而 `mark` 在首次成功调用时创建 YAML。

## 假设

1. v1 通过标准库做 YAML round-trip 是可接受的；后续规格可以在不改动产物格式的前提下替换更严格的 parser。
2. session id 由调用方通过 `--session-id` 传入。若省略，CLI 使用 `DSH_SESSION_ID` 环境变量；两者皆缺时回退到 `unknown`（测试套件会避免这种情况）。
3. 运行期镜像（DSH 的 `todo/write` 事件流）仅作信息提示，YAML 才是权威。第 1 阶段必须有覆盖此点的测试，以避免后续回归。
4. Spec → TODO 路径解析对 `.md` 与 `.zh.md` 处理一致：TODO 文件紧挨英文 Spec。`.zh.md` Spec 永远不带自己的 `.todos.yaml`。

## 非目标

- 不在 `task/done` 时自动 compact。第 3 阶段负责提示，开发者自己决定何时敲 `/compact`。
- 不改 DSH 侧。TODO 列表是 Blueprint 产物，不是运行期 feature。
- 不支持多 Spec 共用 TODO 文件。一个 Spec 一份 YAML，仅此而已。
- 不支持 TODO 列表的实时协同编辑。YAML 是 read-modify-write；并发写入赛跑，最后一次写赢。

## 其他方案

**把 TODO 列表镜像到数据库。** 不采用，因为开发者想不离开文件树就能读写它，且基于文件的状态天然能跨 compact 存活。

**复用 DSH 的 `todo/write` 事件作为权威。** 不采用，因为这些事件是 session 范围的、随 session 一起消失，不能作为跨 session 的事实源。

**从 REQ-* 自动生成 TODO 条目。** 暂缓。第 1 阶段先交付手工编辑；第 2 阶段可能在分解契约里加自动生成。

## 任务

1. 实现 `lib/todo-store.js`：`loadTodoList`、`saveTodoList`、`validateTodoList`、`TodoSchemaError`。
   REQ：REQ-PTL-1、REQ-PTL-7
   范围：`lib/todo-store.js`
   AC：AC-PTL-001、AC-PTL-005
2. 实现 `lib/spec-todos.js`：`resolveTodoPath(specPath)` 与 `loadTodosForSpec(specPath)`。
   REQ：REQ-PTL-2
   范围：`lib/spec-todos.js`
   AC：AC-PTL-001
3. 实现 `lib/types/todo-events.js`：`buildTaskStatusEvent` 与 `buildTaskDoneEvent`。
   REQ：REQ-PTL-4
   范围：`lib/types/todo-events.js`
   AC：AC-PTL-003
4. 扩展 `lib/cli.js`：注册 `todo` 子命令，承载 `list`、`show`、`mark` 与上文记录的 flag。
   REQ：REQ-PTL-3、REQ-PTL-4、REQ-PTL-5
   范围：`lib/cli.js`
   AC：AC-PTL-002、AC-PTL-003、AC-PTL-005
5. 编写 `tests/todo-store.test.js`、`tests/spec-todos.test.js`、`tests/cli-todo.test.js`。
   REQ：REQ-PTL-1、REQ-PTL-2、REQ-PTL-3、REQ-PTL-4、REQ-PTL-5、REQ-PTL-6、REQ-PTL-7
   范围：`tests/todo-store.test.js`、`tests/spec-todos.test.js`、`tests/cli-todo.test.js`
   AC：AC-PTL-001、AC-PTL-002、AC-PTL-003、AC-PTL-004、AC-PTL-005
6. 编写 `docs/user/features/persistent-todo-list.md` 与 `.zh.md`，以及 `.i18n.yaml` 配对记录。
   REQ：REQ-PTL-1
   范围：`docs/user/features/persistent-todo-list.{md,zh.md,i18n.yaml}`
   AC：AC-PTL-007
7. 跑 `node --experimental-test-isolation=none --test "tests/*.test.js"` 与 `node lib/cli.js docs check --cwd .`。
   REQ：全部
   范围：-
   AC：AC-PTL-006、AC-PTL-007

## 生命周期

- 状态：拟议
- 批准后的目标状态：已实现（文件移至 `.specs/implemented/`）

## 事实变化

新增事实：
- `lib/todo-store.js`、`lib/spec-todos.js`、`lib/types/todo-events.js` 存在并被导出。
- `node lib/cli.js todo` 子命令存在，含 `list`、`show`、`mark`。
- 跑过 `mark` 之后 `session.jsonl` 中出现 `task/done` 与 `task/status` 事件。
- Spec 可携带兄弟 `.todos.yaml` 产物，schema 按上文记录。

保留事实：
- 所有现有 CLI 子命令。
- 所有现有测试。

## 可追溯性

REQ-PTL-1 → scenario[happy-load-and-list]、[invalid-yaml-rejected] → task 1 → AC-PTL-001、AC-PTL-005 → 验证 tests/todo-store.test.js
REQ-PTL-2 → scenario[no-todo-yet]、[happy-load-and-list] → task 2 → AC-PTL-001 → 验证 tests/spec-todos.test.js
REQ-PTL-3 → scenario[happy-load-and-list]、[mark-writes-event]、[no-todo-yet] → task 4 → AC-PTL-002、AC-PTL-003 → 验证 tests/cli-todo.test.js
REQ-PTL-4 → scenario[mark-writes-event] → task 3、4 → AC-PTL-003 → 验证 tests/cli-todo.test.js
REQ-PTL-5 → scenario[mark-writes-event]（第二次调用）→ task 4 → AC-PTL-003 → 验证 tests/cli-todo.test.js
REQ-PTL-6 → scenario[fresh-session-reloads-yaml] → task 1 → AC-PTL-004 → 验证 tests/todo-store.test.js
REQ-PTL-7 → scenario[invalid-yaml-rejected] → task 1 → AC-PTL-005 → 验证 tests/todo-store.test.js

## 未决决策

无。四个关键问题（文件格式、store 纯度、事件 schema、幂等 re-mark）都在上文确定。

## 质量自检

- 需求完整：✓
- 需求无歧义：✓
- 需求有边界：✓
- 需求能感知失败：✓（无 YAML、YAML 非法、新 session、幂等 re-mark 都覆盖）
- 需求可测：✓
- 需求无矛盾：✓

## 跨工件分析

- 需求到场景：✓ 7 个 REQ 全部被 5 个场景覆盖
- 需求到影响：✓ 7 个 REQ 全部映射到「## 范围」里的文件
- 需求到任务：✓ 每个任务列出 REQ
- 需求到验收：✓ 每个 AC 注明 REQ
- 需求到验证：✓ 每个 AC 注明验证命令或测试
- 任务到范围：✓ 每个任务注明范围路径
- 设计到范围：不适用（designRequired: false）
- 范围到路径：✓ 每个范围路径对应真实路径

## 结果

Blueprint 已通过与需求关联的验收自动完成本次交付。

- 验收快照：`git-index:e5eb2f40b0a2cd8900066cff53e9942f5d827217f3363c0dc7629c7b7566205f`
- 验收尝试：`attempt-6`
- 结论：Phase 1 (persistent-todo-list) implementation complete. lib/todo-store.js + lib/spec-todos.js + lib/todo-events.js + lib/cli.js todo subcommand; 121/121 host tests + 21/21 diagnostics; scan --all clean; docs check 7/7 ok; pair confirmed.
- AC 证据：7 项全部通过。
- 检查证据：todo-store-unit（command）、cli-todo-tests（command）、full-suite（command）、docs-check（command）。
