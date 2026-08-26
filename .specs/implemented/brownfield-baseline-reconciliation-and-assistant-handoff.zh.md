# 规格：存量系统基线对账与助手交接

状态：已实现
功能：spec-governance--architecture-design

## 问题

当新规划的 Feature 已经具备产品记录和架构记录后，Blueprint 已经有一条连贯流程；但对于包含未记录能力、组件分配不完整，或者实际实现与开发者预期结构不一致的仓库，它还没有提供接管流程。当前架构摘要可能把一个粗粒度组件报告为结构完整，即使多数产品能力仍未分配、源码所有权不完整，且 Feature 生命周期元数据与 implemented Spec 不一致。

两个内嵌助手之间也缺少确定性交接。Spec 审核助手可以在不知道当前 Feature 是否已有经确认组件所有者的情况下讨论需求；架构助手可以更新 Component 的 `Supported features` 列表，却不能更新 Feature 文件中重复的 `## Components` 列表。Spec 工作区读取 Feature 侧列表，因此成功应用的架构提案仍可能无法被规划和审批工作流看到。开发者目前必须自行判断应该使用哪个助手、架构审核是否完成，以及当前是在记录已有行为还是提议新行为。

## 范围

- 允许：`lib/reconciliation.js`
- 禁止：`.blueprint/approvals/**`
- 禁止：`LICENSE`

## 决策

### 统一的当前状态对账模型

新增一个只读对账模型；它与 Feature 目录、架构目录和生命周期工作流来自同一个工作树快照。它报告当前事实，不推断产品意图，也不静默修复文件：

- 每个没有非废弃 Component 所有者的 Feature；
- 每个未支持任何 Feature 的 Component；
- 过期或相互矛盾的 Feature/Component 分配声明；
- Feature 状态与生命周期工作流之间的差异；
- 被零个或多个 Component 路径模式拥有的仓库文件，并提供有界样本；
- 由各自加载器已经发现的文档、架构和目录问题。

模型公开汇总数量、逐 Feature 就绪状态、逐 Component 覆盖状态和可执行的对账事项。覆盖率是一种接管信号，而不是新的扫描必需错误：现有仓库可以先建立粗粒度但真实的基线，再继续细化。架构目录始终描述 `as-is` 现实。期望的 `to-be` 结构在开发者预览、确认并实现之前始终是助手提案。

### 唯一的规范可执行分配

Component 的 `Supported features` 列表成为规范的可执行 Feature 到 Component 分配来源，因为架构预览/应用可以安全更新这个已登记文件。Feature 文件已有的 `## Components` 段继续作为旧格式或人工编写的镜像被读取，但仪表盘就绪状态和选中高亮由 Component 记录推导。系统明确报告两侧差异，不再让已经确认的架构变更对工作流不可见。任何加载器都不得从源码目录推断 Component，也不得静默重写任一侧。

当至少一个现有、非废弃 Component 明确支持某个 Feature，且被引用的组件记录有效时，该 Feature 达到架构就绪状态。仪表盘随 Feature 返回推导出的组件 ID 和就绪详情。相同状态同时提供给两个助手，并在每次架构应用后重新计算。

### 存量能力与新能力规划模式

在 proposed Spec 尚不存在时，Spec 工作区提供两种明确的规划意图：

- **规划新能力**以需求为先。Spec 助手建立用户可见行为并识别尚未解决的业务边界；如果组件所有权尚未就绪，它会在方案审批前把开发者引导到架构审核。
- **整理现有能力**以证据为先。助手读取可观察 UI、接口、测试和当前文档，标注仓库事实、未知项和推断行为；在不虚构历史意图的前提下创建接管提案；除非开发者明确要求变更，否则保留已验证的外部行为。

两种意图都使用现有 Host 登记的双语功能说明和 proposed Spec 路径。规划提示记录所选意图，并继续在实现和直接审批之前停止。

Spec 审核助手负责产品目的、参与者、场景、范围、规则、失败路径、验收标准和验证。它接收对账结果和已确认 Component 所有者。它可以要求进行架构审核，但不能创建 Component、选择部署拓扑或声称未经确认的架构已经就绪。它编写的 proposed Spec 会把已确认架构事实纳入 Scope 和验证，而不会把助手建议当成权威。

需要架构审核时，Spec 助手的已完成回复可以包含一个经过分隔、符合当前 Schema 的交接，其中包括 Feature ID、审核原因、已确认产品约束、未解决架构问题和有界证据摘要。Blueprint 会从可见 Markdown 中移除机器块，并渲染**开始架构审核**卡片。开发者点击是明确的下发边界：Blueprint 保留选中 Feature，打开“架构设计”，并把结构化交接与最新 Host 上下文提交给独立架构 Session。开发者无需重新描述需求，同时也不会在缺少可见操作时启动隐藏的助手间对话。

### 架构对账与能力放置模式

架构工作区在图之前展示对账摘要。当选中 Feature 没有经确认的 Component 所有者时，主要操作让架构助手聚焦当前状态对账；当所有权已经建立时，助手聚焦提议变化的影响评估。在两种模式下，架构助手都负责组件位置、类型化关系、接口、数据与部署边界、源码所有权、兼容性和迁移影响。

处理存量系统时，助手先描述可观察的 `as-is` 结构，区分仓库事实与推断，并提议能够真实表达现状的最小目录变化。它不得直接把当前目录重写成理想化的 `to-be` 图。已有的单组件预览/应用仍是唯一可执行变更面；多组件接管必须表现为一系列有序、分别确认的变更。

把选中 Feature 加入 Component `Supported features` 的提案应用后，Host 会重新计算对账状态；无需编辑 Feature 文件或复制聊天文本，Spec 工作区就会变为架构就绪。在 Spec 与架构工作区之间移动的导航操作会保留选中的 Feature。

架构助手的持久结果是开发者确认的 Component 模型和 Host 计算的对账状态，而不是复制到另一个聊天的对话记录。返回后，Spec 审核助手在下一次提交时会接收这些最新事实，并可完成 Development Spec。两个助手 Session 永远不会直接互相调用、互相审批，也不能建立后台审核循环。

### 工作流门槛与恢复

Blueprint 可以在架构分配完成前准备和审核功能说明及 Spec 工件，但方案审批与“开始开发”要求架构就绪。Web 操作和哈希绑定 CLI 审批备用路径都必须在 Host 侧执行相同规则；隐藏浏览器按钮不是安全边界。清晰的待处理卡片会解释为何审批不可用，并以同一个 Feature 打开“架构设计”。

如果已批准 Feature 随后失去所有有效 Component 所有者，“开始开发”会变为不可用，直到架构对账恢复所有权。Component 记录变化不会改变 Spec 审核哈希，但系统始终从当前快照重新计算就绪状态。已有 implemented Feature 即使被报告存在对账差异也继续可读；接管过程不会伪造或重写它们的历史审批记录。

### 当前仓库对账

仓库自身的架构 Feature 已从过期的 planned/文档状态更新为 active 当前行为，同时保留本次增强。规范组件记录已纳入 Git，并明确支持现有 Feature 目录，使项目自身展示它所执行的同一套交接。已发布 Feature 身份描述现在符合真实交付状态：层级式 Feature 身份变化仍然使用显式迁移工作流，而 Component 身份继续与 `Container` 解耦。较早架构决策中缺失的验收编号属于单独受治理的历史清理，本次快照不会把它变成第二个范围重叠的实现所有者。

公共文档会解释常规新能力路径、存量接管路径、`as-is`/`to-be` 区分、助手职责、架构就绪门槛，以及刻意保留的开发者手动决策。

## 其他方案

**让两个助手都检查仓库，并依靠提示词自行协作。** 不采用，因为两个独立 Session 无法仅凭对话推断建立持久、确定性的交接。

**把 Feature 侧 `## Components` 列表作为规范来源。** 不采用，因为架构助手唯一安全的可执行变更面写入 Component 记录；成功预览/应用后仍然需要第二次手工 Feature 编辑。

**从源码路径自动推断 Feature 和 Component。** 不采用，因为源码布局不是产品意图；误导性的自动架构比明确的不完整基线更危险。

**在所有文件和 Feature 完成分配前阻止每次扫描。** 不采用，因为存量系统接管必须可以渐进执行。对账覆盖率保持可见且可操作，而实现审批只对当前 Feature 建立门槛。

**为现有代码生成追溯性的 implemented Spec。** 不采用，因为仓库证据可以建立当前行为，但无法诚实重建最初意图、备选方案或历史验证。

## 验收标准

- AC-BR-1：Host 从一个工作树快照返回确定性的对账模型，其中包含未分配 Feature、未支持 Feature 的 Component、生命周期/状态差异、分配漂移，以及有界的未拥有/多重拥有文件覆盖；不得推断或写入产品与架构边界。
- AC-BR-2：Component `Supported features` 记录是可执行分配来源；仪表盘据此推导每个 Feature 的组件所有者和架构就绪状态，报告旧 Feature 侧差异，并在应用架构提案后立即刷新两个工作区。
- AC-BR-3：开发者可以在准备工件前选择**规划新能力**或**整理现有能力**；后者使用证据优先语言，标注事实、推断和未知项，默认保留已验证行为，并且不虚构历史设计意图。
- AC-BR-4：Spec 助手负责产品行为、范围、验收和验证；它接收当前对账及已确认组件事实，识别待完成架构审核的情况，并且最多生成一个经过验证的结构化交接，同时既不创建架构记录，也不声称未经确认的位置。
- AC-BR-5：架构工作区展示当前基线，并把 `as-is` 事实与 `to-be` 提案分开；其助手负责位置、关系、契约、部署、路径所有权、兼容性和迁移，并可通过当前单组件预览/应用边界对账现有 Feature。
- AC-BR-6：除非选中 Feature 至少拥有一个有效的非废弃 Component 所有者，否则方案审批与“开始开发”不可用；Host 对 Web 和 CLI 审批执行相同规则；经开发者确认的交接卡片会打开“架构设计”、保留 Feature 选择并自动提交已验证的 Spec 上下文，无需开发者重复描述。
- AC-BR-7：仓库自身的 Feature、Component、功能说明、架构描述和公共契约在当前生命周期、分配、身份迁移、助手职责和存量工作流事实方面一致；不得伪造或手工编辑历史审批记录。
- AC-BR-8：已有初始化仓库、implemented Feature、旧 Feature `## Components` 段、DSH Session 恢复、乐观并发、双语审核哈希和单组件架构提案边界保持兼容。
- AC-BR-9：所有新增对账、提示、交接、门槛、兼容性和 UI 行为都具备自动化证据，并且完整测试、JavaScript 语法、双语文档、工作树扫描和暂存快照扫描命令全部通过。

## 验证

- AC-BR-1：`tests/reconciliation.test.js`、`tests/web-api.test.js`
- AC-BR-2：`tests/reconciliation.test.js`、`tests/scan.test.js`、`tests/web-api.test.js`、`tests/client.test.js`
- AC-BR-3：`tests/spec-workspace.test.js`、`tests/reviewer.test.js`、`tests/artifacts.test.js`
- AC-BR-4：`tests/reviewer.test.js`、`tests/client-runtime.test.js`、`tests/spec-workspace.test.js`
- AC-BR-5：`tests/architecture-reviewer.test.js`、`tests/client.test.js`、`tests/web-api.test.js`
- AC-BR-6：`tests/workflow.test.js`、`tests/cli-approval.test.js`、`tests/web-api.test.js`、`tests/spec-workspace.test.js`、`tests/architecture-reviewer.test.js`
- AC-BR-7：`tests/scan.test.js`、命令 `node lib/cli.js docs check --cwd .`
- AC-BR-8：现有 `tests/**/*.test.js`，重点覆盖 `tests/features.test.js`、`tests/workflow.test.js`、`tests/architecture.test.js` 和 `tests/dsh-compatibility.test.js`
- AC-BR-9：命令 `npm.cmd test`、`npm.cmd run lint:js`、`node lib/cli.js docs check --cwd .`、`node lib/cli.js scan --all --cwd .`，以及暂存的 `node lib/cli.js scan --cwd .`

## 后果

- 路径模式覆盖可能报告有意不受管理的生成文件或治理文件。它必须保持为有界的建议性清单，并展示匹配依据。
- 把 Component 记录设为规范分配来源会改变已有重复字段的含义。旧 Feature 声明必须继续可读，并在迁移期间显式展示差异。
- 架构门槛可能使 Feature 目录早于组件模型的现有用户感到意外。implemented Feature 继续可读；新的审批尝试会获得直接恢复路径，而不是笼统错误。
- 当测试和公共契约不完整时，证据优先文档仍可能夸大行为。提示和 UI 必须标注未知项并要求开发者确认，而不是把推断表现为事实。
- 如果仅凭模型文本自动触发，下发操作可能变成隐藏或循环的多助手工作流。交接解析必须绑定 Schema，下发必须要求一次可见的开发者点击，而且架构助手不能自行触发返回交接。
- `lib/client.js` 仍是较大的浏览器包。本变更应把纯对账与就绪逻辑隔离在 Host 代码中，避免新增另一个独立聊天界面。
