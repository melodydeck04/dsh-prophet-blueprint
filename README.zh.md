# `@dsh-plugins/design-blueprint`

[English](README.md) | 中文

Design Blueprint 是一个 DSH 插件，用于完成一条简单的开发闭环：

`需求 → 完善后的 Spec → 实现 → 验证 → 当前系统地图`

开发者始终留在 DSH 普通 Chat 中。Blueprint 根据仓库事实理解需求，找到或提出一个 owning Feature，把歧义转化为明确需求与场景，实现经过批准的增量，完成验证，并更新可浏览的 Feature 层级。它借鉴 Spec Kit 的澄清与一致性职责，也借鉴 OpenSpec 对“当前事实”和“活动变更”的区分，但不复制两者的多命令仪式。

## 开发者体验

- 输入普通需求或使用 `/blueprint <需求>`；两者进入同一个类型化完善契约。
- 需要明确归属时使用 `@feature:<id>`。归属有歧义时会失败关闭，并且最多显示三个候选项。
- 在 DSH Web 中，Blueprint 会自动跟随当前 Session 所属的 workspace path。`/blueprint-use <项目路径>` 只是在旧 Session、无项目 Session 或有意跨项目查看且 DSH 没有暴露可用 workspace path / Session `cwd` 时使用的手动 escape hatch。
- Blueprint 会按需拆解参与者与目标、入口、正常流程、输入与输出、状态、规则、失败、边界、权限、持久化、兼容性、非目标和可观察验收。
- 需求使用稳定 `REQ-*` 标识和具体 Given/When/Then 场景。实现前会执行需求清单和跨工件分析。
- 一份经过 schema 验证的规范变更包连接需求、影响与按比例设计、任务、Scope、验收证据、生命周期状态和需要发布的 Feature 当前事实。
- 每轮完善最多询问三个会实质改变行为、数据、兼容性、风险或范围的问题；其他不确定性会记录为假设。
- 普通有界工作由当前 DSH Agent 实现。只有风险确实需要时才增加技术设计或独立验收者。
- 每项验收条件都有交付表面、观察时刻和最低证据层级。Web UI 结论需要真实浏览器证据；渐进行为必须在终止事件前后都被观察。
- 公开进度只包括 `refining`、`ready`、`implementing`、`verifying`、`blocked` 和 `completed`。

`/blueprint-status` 返回当前 Feature 状态。`/blueprint-map` 返回 Feature 层级。Blueprint Web 提供搜索、状态筛选、Feature 详情、双语当前 brief、层级、依赖、代码路径、契约、测试、活动规范变更包的追溯／证据计划、可操作状态和已登记文档的安全链接。仪表盘选择只是查看状态：它不能授权写入，也不能静默改变 Chat 目标。

## 当前事实与变更

`.blueprint/features/*.md` 负责稳定 Feature 身份和产品包含关系。每个 Feature 位于 `docs/user/features/` 的双语 brief 描述当前用户可见行为。Feature-linked proposed Spec 只描述活动增量。Implemented 和 rejected Spec 是不可变历史。

仓库工件才是持久权威，助手正文和浏览器状态都不是。开发者的精确审批绑定双语 proposed Spec 的组合哈希。验收绑定 staged Git 快照。完成还要求 Scope、文档、架构、完成卫生和 scan 门禁全部通过。完成卫生检查本次新增 staged 疑似 secret 和未声明临时／调试工件；显式例外记录在 `completionHygiene.secretAllow` 和 `completionHygiene.temporaryAllow`。

`verifying` 表示一项已声明的 attempt 正在运行，或仍有可以自动收集的证据，并且没有已知失败门禁。已知失败会进入 `blocked`，显示稳定原因代码、归属层、简明证据和一个建议下一步。重试会追加新的 attempt，不会覆盖之前的证据。

Feature 父子关系表达产品能力包含。Component 归属、契约、部署和依赖保留为高级技术投影，不会形成第二套需要用户操作的产品层级。

## DSH 集成契约

当前版本精确面向已安装 DSH Web profile 的契约：

- DSH 版本：`0.1.1-rc.2`，正式发布修订 `dsh-v0.1.1-rc.2 (b150a55)`
- 已验证 Node.js 版本：`22.23.1`
- Host 组合：Cordis function plugin
- Client 组合：通过 rc.2 的 `slots.inject` / `slots.register` 契约接入 `conversation.view`

Host 注册公开的命令、系统提示、Web server 和工具服务。它不要求 DSH Agent 服务，也不强制创建 coordinator、architect、implementer 和 verifier 角色家族。Client 使用 DSH 懒加载模块、公开 conversation view slot、Session 投影、理解 DSH workspace 的项目解析和 input-trigger source。它不修改 Shell、不调用私有输入框 API、不创建 Session，也不拥有生命周期权限。

软件包继续作为由 `package.json` 和 `cordis.patch.yml` 声明的仓外 DSH bundle。最新 master 文档可用于迁移参考，但运行时代码遵循精确的已安装版本契约。

## 命令与 API

- `/blueprint <需求>` 在当前 Chat 中完善一项需求。
- `/blueprint-use <项目路径>` 为无项目或旧 Session 记录一个手动兜底 Blueprint 项目。普通 DSH Web workspace 会根据当前 Session 所属 workspace path 自动选择；兜底永远不会覆盖 workspace path，也不会覆盖从 Session `cwd` 发现的真实 Blueprint 项目。
- `/blueprint-status` 不触发模型回合，直接报告公开 Feature 状态。
- `/blueprint-map` 不触发模型回合，直接输出 Feature 层级。
- `design-blueprint init [--cwd <路径>]` 创建或升级非破坏性的治理基线。
- `design-blueprint scan [--cwd <路径>] [--all] [--json] [--severity required|recommended|all]` 默认检查精确 Git index；`--all` 检查工作树。
- `design-blueprint docs list|check|confirm <文件> [--cwd <路径>]` 管理双语文档对应关系。
- `design-blueprint approve <feature-id> --spec-hash <sha256> --yes [--cwd <路径>]` 是开发者明确授权后的精确哈希审批 CLI fallback。
- `design-blueprint verification ...` 提供持久的实现与验证恢复操作。
- `design-blueprint install-hook [--local|--global] [--uninstall]` 管理 Git 门禁。
- `design-blueprint stamp --verify|--refresh|--acknowledge [--force]` 管理可选的新鲜度标记。

程序化导出包括 `./chat-commands`、`./orchestration`、`./project-binding`、`./web-api`、`./workflow`、`./verification`、`./features`、`./architecture`、`./reconciliation`、`./assistant-actions`、`./scan`、`./docs`、`./specs`、`./snapshot`、`./policy`、`./config`、`./init`、`./install-hook`、`./stamps` 和 `./version`。

## 项目权威

`design-blueprint.json` 指定常驻指令、架构、公开契约、Spec 生命周期、Feature／审批／验证目录、文档政策和变更 Scope。仓库相对路径使用受支持的 `*`、`**` 和 `?` glob 语法；绝对路径和父级穿越会被拒绝。

每项非平凡变更都需要：

1. 创建或更新一个 proposed Spec，其中包含机器可读 Scope、稳定 `AC-*` 验收标识和对应验证条目。
2. 保持 Product brief、Spec、架构、实现、测试和公开文档一致。
3. 项目政策要求时，取得开发者对精确 proposed 双语哈希的直接审批。
4. 只在 Scope 内实现并 stage 预期快照。
5. 运行相关测试、`design-blueprint docs check` 和 staged `design-blueprint scan`。
6. 只根据已接受证据和当前 Host 门禁完成生命周期。

## 限制

Blueprint 不保证一句不完整需求只有一个正确解释；它会暴露实质歧义和假设。它不会根据源码目录推断 Feature 层级，不会替代 DSH Chat 或权限系统，不会从仪表盘执行任意仓库命令，不会让手动兜底覆盖 DSH workspace 或 cwd 自动发现，也不会把模型声称“通过”视为完成权威。

本仓库是私有软件包源码，要求 Node.js `>=22.19`。



