# 规格：DSH 原生规格驱动开发与系统地图

状态：拟议
功能：spec-governance--architecture-design

## 问题

Blueprint 已经从仓库规格工具演变成一套可见的编排系统，包含独立协调、架构、实现和验收角色、大量生命周期阶段、Agent 绑定、尝试记录和恢复控制。这些机制解决了真实的安全问题，但它们已经从支撑产品的内部能力变成了产品本身。开发者只是想描述一项需求、得到良好 Spec、完成实现并理解最终系统，却必须先理解 Blueprint 的内部工作流。

预期产品应当更简单。开发者在普通 DSH Chat 中描述一条需求；Blueprint 根据仓库事实理解它，把它完善成完整且可测试的规格，只追问会实质改变行为的问题，实现并验证结果，再更新一张可浏览的 Feature 地图；其中的详情描述系统现在真实存在的能力。

Spec 质量是核心。把需求复制进 Markdown 模板远远不够。Blueprint 需要具备类似 Spec Kit 的澄清、需求清单和跨工件分析能力，并结合 OpenSpec 对“当前能力事实”和“活动变更增量”的区分。这些概念必须通过一条有明确取舍的 DSH 原生工作流呈现，而不是变成一组需要用户操作的阶段或助手。

实现形式是 DSH 外部插件。仓库当前声明 `0.1.1-rc.2` peer 范围，但 DSH 官方 master 手册与公开包注册表并未提供完全相同的一组契约。因此实现不能猜测所谓“最新” API。它必须先解析并锁定精确目标 DSH profile，只使用该版本正式记录的公开扩展点，并在真实组合中测试安装后的插件。

## 范围

### 允许路径

- allow: `lib/index.js`
- allow: `lib/client.js`
- allow: `lib/web-api.js`
- allow: `lib/workflow.js`
- allow: `lib/specs.js`
- allow: `lib/features.js`
- allow: `lib/scan.js`
- allow: `lib/artifacts.js`
- allow: `lib/assistant-actions.js`
- allow: `lib/orchestration.js`
- allow: `lib/verification.js`
- allow: `lib/chat-commands.js`
- allow: `lib/snapshot.js`
- allow: `lib/config.js`
- allow: `lib/cli.js`
- allow: `lib/project-binding.js`
- allow: `lib/version.js`
- allow: `tests/**`
- allow: `.blueprint/features/spec-governance--architecture-design.md`
- allow: `.blueprint/architecture/**`
- allow: `.specs/**`
- allow: `docs/user/features/spec-governance--architecture-design.md`
- allow: `docs/user/features/spec-governance--architecture-design.zh.md`
- allow: `docs/user/features/spec-governance--architecture-design.i18n.yaml`
- allow: `DESIGN.md`
- allow: `README.md`
- allow: `README.zh.md`
- allow: `README.i18n.yaml`
- allow: `design-blueprint.json`
- allow: `package.json`
- allow: `cordis.patch.yml`

### 禁止路径

- deny: `.blueprint/approvals/**`
- deny: `docs/AGENTS.md`
- deny: `docs/i18n/**`
- deny: `.dsh/**`
- deny: `.specs/implemented/unified-blueprint-assistant-and-capability-bound-domain-tools.md`
- deny: `.specs/implemented/unified-blueprint-assistant-and-capability-bound-domain-tools.zh.md`

## 提案

### 产品契约

1. DSH 普通 Chat 是唯一对话界面。开发者可以直接输入普通需求，也可以选择一个带前导输入的 `/blueprint ` 命令；两者产生相同的类型化请求。`/blueprint-status` 和 `/blueprint-map` 是确定性快捷命令。
2. Blueprint Web 是系统地图和文档查看器。它不包含第二个助手、模型 Prompt 输入框、角色选择器、Agent 控制、审批能力或 Client 拥有的工作流引擎。
3. 普通用户体验是“需求 → 完善 → 必要时进行阻塞澄清 → 实现 → 验证 → 更新当前事实”。内部步骤在有助于理解时作为证据展示，而不是成为用户必须操作的阶段。
4. 用户可见状态只保留 `refining`、`ready`、`implementing`、`verifying`、`blocked` 和 `completed`。详细工具、重试、快照或 DSH 诊断事实只在解释失败时出现。
5. Blueprint 会自动跟随当前 DSH workspace。开发者在 Web 端项目 A 的 workspace 中工作时，不需要先执行 Blueprint 专属项目切换；/blueprint、普通需求分发、/blueprint-status、/blueprint-map 和仪表盘动作都应使用项目 A。

### 当前事实与活动变更

1. Feature 记录拥有稳定身份和父子位置。其双语 Feature brief 是当前面向用户的行为事实。技术依赖和代码归属附着在 Feature 详情上，而不是形成一套需要开发者维护的第二产品层级。
2. 活动 proposed Spec 是变更增量。它记录原始需求、拥有 Feature、完善后的要求与场景、假设、非目标、可选设计、有序任务、范围和验证计划。它不会伪装成该 Feature 的完整描述。
3. 成功完成会把已接受行为合并到 Feature brief，并把不可变的 implemented 变更及其验证证据归档。被拒绝或放弃的变更保留为历史，但永远不会成为当前事实。
4. 现有 implemented Spec 继续作为历史决策。存量接管根据代码、测试、UI、接口和文档提取可观察行为，清楚区分事实、推断和未知项；只有无法根据证据确定产品边界时才询问开发者。

### 规格完善引擎

1. Blueprint 首先根据仓库事实理解需求：权威文档、Feature 树、当前 brief、活动变更、相关 implemented 决策、代码路径、接口和测试。它选择或提出一个拥有 Feature，并单独报告跨 Feature 影响。
2. 系统把需求拆解成参与者与目标、入口、正常流程、输入与输出、状态变化、业务规则、失败、边界情况，以及适用时的权限、持久化、兼容性、性能或可靠性约束、非目标和可观察验收场景。
3. 需求使用稳定 `REQ-*` 标识。每个场景使用具体前置条件、动作和结果，例如 Given/When/Then；每项任务和验证结果至少追溯到一条需求。
4. “实质歧义”表示两个或多个合理答案会产生明显不同的行为、数据、兼容性或范围。Blueprint 在一轮中最多提出三个这类问题。非实质不确定性成为明确假设，而不是继续采访用户。
5. 需求清单检查完整性、清晰度、边界覆盖、失败行为、可测试性和冲突；随后，跨工件分析检查增量、可选设计、任务、路径范围和验证计划是否一致。存在未解决的 required 清单或一致性问题时不能开始实现。
6. 完善结果提供简洁的开发者预览：目标、拥有 Feature、场景、假设、非目标、受影响路径或契约、验收和未解决决策。高级工件内容仍可查看和编辑。

### 按比例规划与实现

1. 小型有界变更可以把提案、需求增量、任务和验证放在一份紧凑 proposed Spec 中。只有变更影响模块归属、公共契约、持久化、部署、权限、迁移、并发或其他结构边界时，Blueprint 才生成独立技术设计。
2. 任务按依赖排序，并且足够小以便验证。每项任务标明覆盖的需求和预期验证。未映射任务、没有验证的需求和 Scope 外实现路径都无法通过分析门禁。
3. 根据项目策略，清晰有界工作可以在完善后自动继续。项目可以要求实现前审核一次；个人项目的 autopilot 策略则可以直接继续，除非出现阻塞问题、破坏性动作、兼容性破坏或高风险边界。
4. 默认使用普通 DSH Agent 及其既有权限系统完成实现。Blueprint 不强制创建一组长期协调、架构、实现和验收 Agent。临时结构化 Workflow 或独立验收者只用于复杂或高风险工作，并且属于内部实现选择。
5. 验证运行与需求关联的检查、相关回归测试、文档检查、Blueprint scan，以及仅在行为要求时运行真实 UI 或浏览器证据。失败会带着简明解释返回拥有该问题的需求、设计、任务或实现步骤。
6. 从仓库视角看，完成必须具有原子性：实现和证据匹配已接受增量，Feature brief 与地图反映已交付行为，变更成为不可变历史，过期或部分更新的当前事实会回滚。

### 系统地图

1. Blueprint 主视图是当前系统的 Feature 层级，支持展开、搜索、状态筛选和直接进入 Feature 详情。
2. Feature 详情展示摘要、当前行为与场景、父级与子级、依赖、主要代码路径、接口、测试、文档、活动变更、验证状态和已完成变更历史。
3. Feature 包含关系与技术依赖相互独立。依赖可以跨越树分支，而不改变身份或父级。Component 级信息可以继续作为高级技术投影，但普通 Feature 规划不强制使用。
4. 仪表盘选择只是查看状态。它不能授权仓库修改，也不能静默改变 DSH Chat 目标。模型动作使用明确 Feature id 或根据仓库事实得到的无歧义选择。

### DSH 原生插件契约

1. 实现前必须记录精确目标 DSH profile、解析后的包版本、官方文档 revision 或 release，以及受支持的 Node 版本。Blueprint 使用的全部 DSH peer 包必须解析成相互兼容的一组契约。
2. Host 继续作为普通 Cordis 插件，并声明服务依赖。命令通过正式命令服务注册，模型能力通过正式工具服务注册；每个监听器、注册、计时器或拥有的资源都随插件作用域释放。
3. Host 与 Client 保持分离。浏览器通过正式类型化 Host API 获得仓库投影和确定性动作。UI 组合使用目标版本正式提供的 Client slot 或视图扩展点；不修改 Shell，也不调用私有输入框 API。
4. 项目解析必须理解 DSH workspace。给定当前 `sessionId` 时，Blueprint 首先解析该 Session 所属的 DSH workspace，并使用该 workspace 的 path 作为项目入口路径。只有 DSH 没有暴露 workspace path 时，才依次回退到 Session `cwd`、插件/进程 `cwd`，最后才使用显式手动 fallback。
5. 手动 `/blueprint-use <项目路径>` 是 escape hatch，不是普通项目选择方式。它可以用于旧 Session、无项目 Session 或有意跨项目查看的场景，但永远不能高于当前 DSH workspace path，也不能覆盖从 Session `cwd` 发现的真实 Blueprint 项目。
6. 每个动作开始时都从当前 DSH 状态计算一次有效项目根目录，然后把这个根目录传给仓库操作。命令、普通工具分发、仪表盘、文档读取、审批、准备、架构动作、实现和验证都共享同一个解析器，不能对当前项目产生不同判断。
7. Blueprint Web 在可用时分别展示三种身份：DSH workspace 标题/路径、Session `cwd` 和有效 Blueprint root。如果手动 fallback 生效，UI 必须把它标记为兜底证据，并提供清晰的替换或移除入口。
8. Agent、Workflow、Session、goal 或 Job API 只在目标版本有正式文档且符合其所有权和持久语义时使用。Session 标题、Prompt 标记、最新消息扫描、浏览器存储和 React effect 永远不能授予权限。
9. 软件包继续作为由 `package.json` 和 `cordis.patch.yml` 声明的可安装 DSH bundle。兼容 fixture 会把软件包安装或链接到精确目标 profile，启动真实 Host 和 Web Client，验证命令、工具与仪表盘注册，卸载插件并断言清理完成。
10. 最新 master 手册可以用于迁移规划，但实现以解析出的精确目标契约为准。如果需要的公开扩展点不存在，Spec 必须返回修订，或者明确升级 DSH 基线；禁止用私有 API 替代。
### 从当前提案迁移

1. 之前的精确哈希审批和验收尝试属于已经被替代的编排提案。编辑本 proposed Spec 会使旧审批失效；AI 不编辑审批记录，也不会把早期实现视为新哈希下的已授权实现。
2. 现有 staged 代码作为先前工作保留，审批后再根据新 Scope 审核。有用的 DSH 命令、仓库扫描、验证和仪表盘代码可以保留；不服务于简化产品的角色机制会删除或收缩。
3. 现有 Feature 身份、implemented Spec、双语文档和 scan 行为迁移时不能伪造当前事实。完整系统地图出现前，每个接管能力都要先形成真实 Feature brief。

### 非目标

- 重新实现 DSH Chat、Agent loop、权限 UI、终端、浏览器或 Session 查看器。
- 把内部 Agent 拓扑、能力令牌、快照摘要或重试机制作为普通产品工作流展示。
- 为每项小变更强制进行架构审核、创建多个 Agent 或执行独立浏览器验收。
- 只根据源码目录推断产品 Feature 层级。
- 在不暴露实质歧义或假设的情况下，保证一句不完整需求只有一种正确解释。

## 考虑过的替代方案

**继续 Host 拥有的多角色编排提案。** 不作为默认方案，因为它把生命周期安全机制变成了开发者体验。其中部分机制可以继续作为高风险验收的可选内部能力。

**复制 Spec Kit 的命令顺序。** 拒绝，因为要求开发者分别运行 specify、clarify、checklist、plan、tasks、analyze、implement 和 converge，会重新引入 Blueprint 需要消除的复杂性。Blueprint 在一条引导流程中承担这些质量职责。

**完全复制 OpenSpec 的文件和命令。** 拒绝，因为 OpenSpec 不提供 Blueprint 的 Feature 层级和系统地图，而当前仓库已经拥有兼容的 Feature、双语 brief、proposed、implemented 和 rejected 概念。Blueprint 采用当前事实与增量语义，不进行不必要的格式迁移。

**从初始需求直接生成代码。** 拒绝，因为用户的核心要求是正确拆解和完善 Spec；澄清和一致性检查之前开始实现，只会保留歧义，而不会解决它。

**在 DSH 旁边构建独立 Web 应用。** 拒绝，因为 Blueprint 是 DSH 插件。它必须通过正式 Host 和 Client 扩展点组合，并复用 DSH Chat、权限、Session 和运行时服务。

## 验收条件

- AC-SIMPLE-001: 一条普通 DSH 需求或 `/blueprint ` 输入会创建相同的类型化 Blueprint 变更请求，不会打开另一个 Chat，也不会要求开发者选择内部角色。
- AC-SIMPLE-002: Blueprint 根据权威文档、Feature 当前事实、相关代码与测试理解每项变更，选择一个拥有 Feature，并展示跨 Feature 影响，不会静默虚构层级。
- AC-SIMPLE-003: 完善引擎生成稳定需求与具体场景，并在适用时覆盖正常行为、状态、规则、失败、边界情况、兼容性、非目标和可观察验收。
- AC-SIMPLE-004: Blueprint 一轮最多提出三个实质问题，把非实质不确定性记录为可见假设，并且存在未解决阻塞歧义时不能实现。
- AC-SIMPLE-005: 需求清单与跨工件分析会在实现前拒绝不清晰、矛盾、不可测试、未映射、Scope 外或彼此不一致的变更包。
- AC-SIMPLE-006: 每项任务和验证结果都追溯到稳定需求，只有声明的结构风险触发时才要求技术设计。
- AC-SIMPLE-007: 正常流程可以在没有强制多 Agent 编排的情况下实现并验证清晰有界变更；项目策略仍可对高风险工作要求审核或独立验收。
- AC-SIMPLE-008: 成功完成会原子更新 Feature 当前双语事实、归档不可变变更证据，并且不会把被拒绝或放弃的变更纳入当前行为。
- AC-SIMPLE-009: Blueprint Web 展示可搜索 Feature 层级和详情，其中包含当前行为、层级、依赖、代码路径、测试、文档、活动变更、状态和历史，但不拥有编排。
- AC-SIMPLE-010: 用户可见工作流只展示 refining、ready、implementing、verifying、blocked 和 completed；内部 DSH 诊断按需查看，而不是普通使用的必需内容。
- AC-SIMPLE-011: 插件解析并记录一份精确 DSH 目标契约，只使用其公开 Host／Client／Cordis 扩展点，继续作为可安装 bundle，并在卸载时清理全部注册。
- AC-SIMPLE-012: 真实目标 profile 兼容场景从需求完善经过实现、验证、当前事实更新、系统地图检查、插件卸载和重启恢复全部通过，不修改 DSH 核心，也不使用私有 Client API。
- AC-SIMPLE-013: 在包含多个 workspace 的 DSH Web 中，Blueprint 会根据当前 Session 所属 workspace path 自动解析当前交互的项目；只有没有 DSH workspace path 且没有可用 Session cwd 时，才需要 /blueprint-use。

## 验证

- AC-SIMPLE-001: DSH 集成测试比较普通工具分发和前导输入命令请求，断言只有普通 Chat 界面，并且不存在角色选择或内嵌输入框 UI。
- AC-SIMPLE-002: 仓库 fixture 覆盖精确 Feature 选择、新子功能提案、跨 Feature 依赖、未知边界和存量证据，并断言不会根据目录虚构结构。
- AC-SIMPLE-003: 完善 fixture 覆盖 UI、API、持久化、权限、失败、兼容性和小型有界变更；快照断言每种需求都生成适当的稳定要求和场景覆盖。
- AC-SIMPLE-004: 歧义测试区分实质选择与假设，执行三个问题上限、持久化回答，并且只因未解决实质决策阻塞实现。
- AC-SIMPLE-005: 质量门禁测试注入模糊描述、矛盾、缺失失败行为、需求／任务缺口、缺失验证、设计冲突和路径 Scope 违规，并断言失败关闭与修复建议。
- AC-SIMPLE-006: 追溯测试把每项任务和检查映射到需求，并验证结构触发条件会生成设计内容，而简单变更不会。
- AC-SIMPLE-007: 策略测试覆盖个人项目 autopilot、要求审核模式、破坏性或兼容性变更确认、可选结构化 Workflow 和独立高风险验收。
- AC-SIMPLE-008: 事务测试在实现、证据、brief 合并、归档和地图更新的每个边界注入失败；断言回滚、幂等重试、双语同步和不可变历史。
- AC-SIMPLE-009: Client 与真实浏览器测试浏览多层 Feature 树、搜索、打开详情、查看当前和历史事实，并证明页面状态不能授权 Host 修改。
- AC-SIMPLE-010: UI 投影测试断言六个公开状态，并验证尝试、能力、Session 绑定和快照诊断会折叠，直到用户打开失败详情。
- AC-SIMPLE-011: 契约测试解析活动 profile 的精确包图、验证 peer 对齐、执行正式命令／工具／API／slot 注册、卸载插件，并拒绝私有或跨版本 API。
- AC-SIMPLE-012: 运行完整 Node 测试、语法检查、双语文档检查、工作树与 staged Blueprint scan，然后启动精确 DSH 目标 profile，跨一次重启完成真实需求到地图场景。
- AC-SIMPLE-013: workspace fixture 至少创建两个不同路径的 DSH workspace 和对应 Session id，断言命令、工具和仪表盘动作按当前 sessionId 选择项目，断言 Session cwd 只是 fallback，断言手动绑定永远不能覆盖 workspace path，并断言重启恢复依赖 DSH workspace 状态而不需要 /blueprint-use。

## 风险

- DSH 仍处于 developer preview，公开 npm 版本可能与当前 master 手册或已有本地 profile 不一致。版本发现和真实 profile 契约 fixture 是实现前的强制条件。
- 自动完善 Spec 可能在预览过于简短时隐藏假设。即使默认流程保持简洁，实质决策、假设、非目标和需求覆盖仍必须可以查看。
- 把 Feature brief 作为当前事实需要安全的双语合并和迁移行为。不能通过改写历史决策制造干净的当前状态。
- 单一 Feature 层级无法表达所有技术关系。依赖和代码归属必须保留为独立边，同时让主要树保持开发者可理解。
- 不再强制独立角色会减少流程仪式，但也可能降低高风险变更的保障。项目策略和明确风险触发条件必须保留按比例审核与验收。
- DSH 可能在本地 storage 文件、Client Session 投影和公开 Host 服务之间以不同形式暴露 workspace 上下文。实现必须优先使用有文档的 API，把直接读取 storage 视为兼容 fallback，并且在无法确定时显式失败，不能选错项目。
- 仓库当前包含被替代提案留下的 staged 实现，不能把它误认为新 Spec 哈希已经授权的实现。
