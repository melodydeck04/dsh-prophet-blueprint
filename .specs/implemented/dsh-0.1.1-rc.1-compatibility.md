# Spec: DSH 0.1.1-rc.1 compatibility

Status: implemented

## Problem

Blueprint 当前声明并记录的是 DSH `0.1.0-rc.7`。DSH `0.1.1-rc.1` 将会话投影的正式读取路径整理为 `ConversationSnapshot.chat.legacy`，并继续暂时提供顶层兼容字段。若插件继续只依赖旧字段，即使能够加载，也无法证明独立 Spec 审核会话的已完成消息、流式 partial、运行状态和错误状态在新版本中仍能正确显示。插件清单和页面版本也需要明确反映这次兼容基线。

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

## Decision

将插件版本升级为 `0.10.0`，把全部 DSH peer dependency 统一到 `^0.1.1-rc.1`。审核助手优先从 `snapshot.chat.legacy` 读取已完成消息和 partial，并对 DSH 暂时保留的顶层字段做兼容回退；运行、打开和错误状态继续读取 0.1.1 的公开 `ConversationSnapshot` 字段。保持 `Session.open()`、`prompt()`、`cancel()`、Host 创建会话以及 `conversation.view` 注册方式不变，因为 0.1.1 的公开契约仍提供这些能力。

新增静态契约测试，固定 0.1.1 的依赖基线、Client 注入顺序、正式快照路径与旧形状回退，并同步中英文公开说明、架构说明和功能地图。安装验证使用 DSH `0.1.1-rc.1` 的实际 `--dump-config` 组合结果，不修改任何 Blueprint 审批记录。

## Alternatives considered

**只更新 peer dependency，不改快照读取。** 不采用。旧字段目前仍存在，但它们已经被标记为兼容投影，继续把它们当成唯一入口会把升级风险留到后续版本。

**完全删除 rc.7 形状回退。** 不采用。当前用户正在从旧版升级，浏览器缓存或局部依赖尚未完全刷新时，安全回退能给出更稳定的迁移体验；实际安装基线仍明确要求 0.1.1-rc.1。

## Acceptance criteria

- AC-DSH011-1: 包版本为 `0.10.0`，所有 `@deepseek-ai/dsh-*` peer dependency 都声明 `^0.1.1-rc.1`，Cordis 与 React 的既有兼容声明保持不变。
- AC-DSH011-2: 审核消息优先读取 `ConversationSnapshot.chat.legacy.nodes` 与 `ConversationSnapshot.chat.legacy.partial`，并在该切片不存在时回退到顶层 `nodes` 与 `partial`。
- AC-DSH011-3: 审核会话继续在 prompt 前调用 `Session.open()`，并保留发送、停止、打开状态和 Session 错误反馈。
- AC-DSH011-4: DSH Client 的注入声明继续包含 runtime、Markdown primitives 和 conversation，并在 0.1.1-rc.1 的实际 Profile 组合中可解析。
- AC-DSH011-5: Blueprint 标题显示 `0.10.0` 的 Host/Client 版本；README 中英文、DESIGN 和 Web 功能地图明确记录 DSH `0.1.1-rc.1` 基线与快照读取方式。

## Verification

- AC-DSH011-1: test: `tests/dsh-compatibility.test.js`, `tests/client.test.js`
- AC-DSH011-2: test: `tests/dsh-compatibility.test.js`, `tests/reviewer.test.js`
- AC-DSH011-3: test: `tests/reviewer.test.js`, `tests/client-runtime.test.js`
- AC-DSH011-4: test: `tests/dsh-compatibility.test.js`, command: `dsh --profile web --dump-config`
- AC-DSH011-5: test: `tests/client.test.js`, command: `node lib/cli.js docs check --cwd .`
- command: `npm test`
- command: `npm run lint:js`
- command: `node lib/cli.js scan --all --cwd .`
- command: `npm pack --dry-run --json`

Shipped verification on 2026-08-21: all 31 Node tests passed; every JavaScript entry passed `node --check`; the README English/Chinese pair passed structural and semantic confirmation; the working-tree Blueprint scan passed; direct inspection of the official DSH 0.1.1-rc.1 manifests and public type declarations confirmed the Session, Slot, Markdown renderer, and `ConversationSnapshot.chat.legacy` contracts; and the exact 0.1.1-rc.1 CLI composed the Web Profile successfully after the duplicate session-reference plugin was removed.

## Consequences

DSH 仍处于预发布阶段；即使 `0.1.1-rc.1` 的公开类型与组合检查通过，后续 RC 仍可能改变 Session 或 Slot 契约。兼容回退只覆盖快照形状，不掩盖缺少 `open()`、会话创建或 Slot 注册能力的情况，这些缺失仍应明确报错。
