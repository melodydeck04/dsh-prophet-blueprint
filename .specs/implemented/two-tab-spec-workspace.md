# Spec: Two-tab Spec workspace

Status: implemented

## Problem

Blueprint 当前把项目统计、功能结构、功能详情、开发流程、Spec 正文和审核助手堆在同一页面。Spec 正文藏在可折叠的开发流程区域，助手又位于详情旁边，开发者难以把“查看当前 Spec”和“让助手优化 Spec”当作一个连续动作。架构图与目录也没有形成独立、明确的浏览入口。

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

把 Blueprint 主界面收敛为两个一级 Tab：默认打开“优化 Spec”，另一个为“项目结构”。

“优化 Spec”采用左右双栏。左栏始终显示当前功能名称、功能选择器、Spec 生命周期状态、审批/开发状态、Spec 文件路径和完整正文；若尚无 Spec，则显示生成开发方案的直接入口。右栏放置独立 Spec 助手，继续使用 DSH Session 的实时窗口、0.1.1 会话快照与 `MarkdownText`，逐块显示流式回复，并保留停止、错误反馈和 Markdown 渲染。助手收到明确授权后可直接修改当前 proposed Spec；一轮完成后自动刷新 dashboard，使左栏正文、状态和哈希直接更新。

“项目结构”只承载架构图/目录切换、功能选择和功能定义详情。项目检查数字压缩成一行摘要；Spec 正文与开发流程动作不在结构详情中重复。新建/编辑功能留在这个 Tab，避免 Spec 工作区混入功能目录维护。

开发所需但不应喧宾夺主的信息仅保留三类：Spec 文件路径、Spec 生命周期与审批/开发状态、Host/Client 插件版本及刷新提示。插件版本升级为 `0.11.0`。

## Alternatives considered

**继续使用一个页面，只缩小现有卡片。** 不采用。信息层级仍然混杂，无法建立“左边看 Spec、右边与助手共同修改”的稳定工作区。

**把 Spec 助手做成第三个 Tab。** 不采用。对话与正文分离后，用户仍需来回切换才能核对修改结果，违背直接可见的目标。

## Acceptance criteria

- AC-SPEC-TAB-1: Blueprint 有“优化 Spec”和“项目结构”两个一级 Tab，默认进入“优化 Spec”。
- AC-SPEC-TAB-2: 优化 Spec 左栏显示当前功能名称、可切换的功能、Spec 状态、审批/开发状态、文件路径和完整正文；无 Spec 时提供生成方案入口。
- AC-SPEC-TAB-3: 优化 Spec 右栏使用独立 DSH Session，按 finalized nodes 与 partial 实时流式渲染 Markdown，并支持停止和错误反馈。
- AC-SPEC-TAB-4: 助手可在明确授权后直接修改当前 proposed Spec；完成后 dashboard 自动刷新，左栏无需复制粘贴即可显示新正文与状态。
- AC-SPEC-TAB-5: 项目结构 Tab 提供架构图/目录切换、功能选择和功能定义详情，不重复展示 Spec 正文或审核助手。
- AC-SPEC-TAB-6: package、Host 与 Client 版本统一为 `0.11.0`；README 中英文、DESIGN 和 Web 功能地图同步描述双 Tab 布局。

## Verification

- AC-SPEC-TAB-1: test: `tests/client.test.js`, `tests/spec-workspace.test.js`
- AC-SPEC-TAB-2: test: `tests/spec-workspace.test.js`
- AC-SPEC-TAB-3: test: `tests/reviewer.test.js`, `tests/dsh-compatibility.test.js`
- AC-SPEC-TAB-4: test: `tests/reviewer.test.js`, `tests/spec-workspace.test.js`
- AC-SPEC-TAB-5: test: `tests/spec-workspace.test.js`, `tests/client.test.js`
- AC-SPEC-TAB-6: test: `tests/client.test.js`, command: `node lib/cli.js docs check --cwd .`
- command: `npm.cmd test`
- command: `npm.cmd run lint:js`
- command: `node lib/cli.js scan --all --cwd .`
- command: `npm.cmd pack --dry-run --json --cache <workspace-temp-cache>`

Shipped verification on 2026-08-21: all 35 Node tests passed, including the new two-tab layout, Spec document, structure-boundary, automatic refresh, streaming Session, and DSH 0.1.1 compatibility checks; every JavaScript entry passed `node --check`; all three bilingual documentation pairs were confirmed and passed `docs check`; the working-tree Blueprint scan reported zero required and zero recommended issues; and `npm pack --dry-run --json` produced the `0.11.0` package with the new client, tests, documentation, feature map, and implemented specification.

## Consequences

切换功能会按 Spec 哈希切换独立审核 Session；这是防止旧上下文污染新 Spec 的必要行为，但用户需要通过功能选择器明确知道当前正在优化哪个功能。Spec 自动刷新依赖 Agent 产生新的 finalized assistant turn；保留手动“刷新结果”用于网络或 Session 异常后的恢复。
