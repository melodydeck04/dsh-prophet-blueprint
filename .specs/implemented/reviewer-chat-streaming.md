# Spec: Stream the review assistant like DSH Chat

Status: implemented

## Problem

Blueprint 的 Spec 审核助手虽然使用独立 DSH Session，但当前在发送前没有打开该 Session 的会话窗口。DSH 会在冷会话尚未打开时暂存实时事件，因此审核回复可能直到一轮完成后才一次性出现在右侧面板，和主 Chat 的逐步生成体验不一致。审核栏也缺少清晰的消息角色、流式光标、会话加载状态、自动跟随最新内容和 Session 级错误反馈。

## Scope

- allow: `lib/client.js`
- allow: `lib/version.js`
- allow: `tests/**`
- allow: `package.json`
- allow: `DESIGN.md`
- allow: `README.md`
- allow: `README.zh.md`
- allow: `README.i18n.yaml`
- allow: `.blueprint/features/web-dashboard.md`
- allow: `.specs/**`

## Proposal

让审核栏遵循 DSH Chat 的会话生命周期：先打开独立 Session 的实时事件窗口，再发送审核 prompt，并持续把 Session 快照中的 finalized nodes 与 partial assistant block 投影到 Blueprint。保留审核专用的中文提示和窄栏界面，不复制主 Chat 的私有组件。

## Decision

审核助手继续拥有独立的 DSH Session，但在恢复会话和首次发送前都显式调用 Session 的 `open()`，使其建立与 DSH Chat 相同的实时事件窗口。右侧面板直接订阅该 Session 的 `ConversationSnapshot`，把已完成 assistant 节点和 `snapshot.partial` 分开投影；partial 每次变化都触发重新渲染，并在文本尾部显示生成光标。

消息区使用接近 DSH Chat 的对话布局，显示“你”和“审核助手”角色，生成期间自动滚动到最新内容，并继续提供停止按钮。`openState`、`promptError` 和 `lastAgentError` 会转换成用户可读状态；浏览器镜像仍只保存已完成消息，不把未完成 partial 当作历史记录。

插件补丁版本升级为 `0.8.1`，Host 与 Client 版本仍在 Blueprint 标题旁进行一致性校验。

## Alternatives considered

**按固定间隔轮询完整会话。** 拒绝。轮询会增加延迟和请求开销，也无法与 DSH Chat 的事件顺序保持一致。

**在前端对最终文本播放打字动画。** 拒绝。它只制造流式视觉效果，不能提前呈现模型输出，也不能及时暴露 Agent 错误或响应停止操作。

**直接嵌入完整 DSH Chat 组件。** 暂不采用。Blueprint 需要按功能和 Spec 哈希管理独立会话，并保持紧凑的审核专用上下文与布局；复用公开 Session 生命周期和快照语义能得到同等流式数据，同时降低对 Chat 私有 UI 结构的耦合。

## Risks

DSH 客户端版本如果不暴露 concrete Session 的 `open()`，审核栏无法建立实时窗口。该情况必须 fail closed 并提示升级 DSH，而不能退回到假流式动画。高频 partial 更新会增加窄栏重绘次数，因此消息仍按纯文本渲染，浏览器镜像也只保存 finalized 消息。自动滚动当前始终跟随最新输出；如果未来支持用户在生成期间向上阅读，需要增加“脱离底部后暂停跟随”的交互状态。

## Acceptance criteria

- AC-1: 新建或恢复审核 Session 时会在提交 prompt 前打开会话事件窗口，并且已有审核会话在面板挂载后也会被打开。
- AC-2: 审核回复使用 `ConversationSnapshot.partial` 实时更新，partial 与已完成消息不会重复显示，完成后的浏览器镜像不包含 partial。
- AC-3: 审核消息显示角色与流式光标，内容增长时自动跟随到底部；生成期间可以停止。
- AC-4: 会话加载状态以及 prompt/Agent 错误会在审核栏中显示，并且打开失败不会造成未处理的 Promise rejection。
- AC-5: 标题显示的 Host/Client 版本升级为 `0.8.1`，中英文公开文档同步说明实时会话行为。

## Verification

- AC-1: test: `tests/client-runtime.test.js`, `tests/reviewer.test.js`
- AC-2: test: `tests/reviewer.test.js`, `tests/client.test.js`
- AC-3: test: `tests/reviewer.test.js`, `tests/client.test.js`
- AC-4: test: `tests/reviewer.test.js`, `tests/client.test.js`
- AC-5: test: `tests/client.test.js`, command: `node lib/cli.js docs check --cwd .`
- command: `npm test`
- command: `npm run lint:js`
- command: `node lib/cli.js scan --all --cwd .`

Shipped verification on 2026-08-21: all 27 Node tests passed; every JavaScript entry passed `node --check`; all three bilingual documentation pairs passed `docs check`; the working-tree Blueprint scan reported zero required and zero recommended issues; and `npm pack --dry-run --json` produced the `0.8.1` package containing the updated Client, Host version module, tests, documentation, feature map, and specification.

## Consequences

审核栏不复制 DSH Chat 的内部组件，而是复用 DSH Session 的公开生命周期与快照语义，因此可以保留 Blueprint 专用的窄布局和审核约束。`open()` 会为每个正在查看的审核会话维护一个实时窗口；切换功能时由 DSH Session 运行时继续管理订阅和缓存边界。
