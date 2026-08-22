# `@dsh-plugins/design-blueprint`

[English](README.md) | 中文

面向 DSH 辅助开发的规格生命周期、开发者直接批准、功能架构、架构设计工作区、文档治理与对应关系检查。插件将长期 AI 指令、当前架构、公开契约、文档角色和受生命周期管理的设计决策彼此分开，再检查暂存的实现变更是否始终处于一份已审阅且明确批准的功能规格范围内。

该软件包是一个 DSH 仓库外 Bundle。Host 插件为组装后的系统提示词提供简短的规格驱动指引，注册直接的 `/blueprint` 命令，并公开一个范围严格受限的仪表盘 API。DSH Web 客户端在会话中增加 **Blueprint** 标签页，用于查看项目功能树、文档满足度、审计详情、架构设计和安全的功能编辑。无外部依赖的 CLI 可以初始化项目、验证精确的 Git 索引、验证工作树、管理可选的内容印章，并安装本地 pre-commit hook。

## 公开 API

- `design-blueprint init [--cwd <path>]` 创建结构上可用的治理基线：权威文档、生命周期规格、功能根目录、架构组件目录、文档标准、双语策略与术语，以及项目级 DSH 文档 Skill。现有正文永不覆盖；旧版 Blueprint 配置只会在缺少 `documentation` 或 `architecture` 部分时得到补充。
- `design-blueprint scan [--cwd <path>] [--all] [--json] [--severity required|recommended|all]` 默认验证精确的 Git 索引。`--all` 验证工作树，且会报告格式错误或不一致的架构记录与断裂的 Feature 分配，但不应用暂存变更范围策略。
- `design-blueprint docs list|check|confirm <file> [--cwd <path>]` 分别列出配对状态、执行双语契约检查，或明确记录一组已完成语义审阅的配对。
- `design-blueprint install-hook [--local|--global] [--uninstall]` 默认安装本地 hook。安装到全局 Git 模板必须明确指定。
- `design-blueprint stamp --verify|--refresh|--acknowledge [--force]` 保留可选的文件新鲜度机制。印章目标必须解析到项目根目录以内。
- `/blueprint [all]` 通过 DSH 交互式命令适配器运行同一个扫描器。直接运行 `/blueprint` 读取暂存快照；`all` 读取工作树。命令会向上查找 `design-blueprint.json`，并拒绝扫描无关的后备目录。
- DSH Web 的 **Blueprint** 标签页读取当前会话工作区，先打开中文的 README 式“功能说明”，再提供正式的“开发 Spec”，可以在独立的中英文文件之间切换、使用流式审核助手，并提供独立的功能树与“架构设计”工作区（包含逻辑组件图、变更前后叠加视图和独立架构助手）。
- 程序化导出包括 `./scan`、`./architecture`、`./config`、`./docs`、`./workflow`、`./specs`、`./features`、`./policy`、`./snapshot`、`./project-root`、`./project-discovery`、`./web-api`、`./init`、`./install-hook` 和 `./stamps`。

## 配置

`design-blueprint.json` 指定各类权威来源和变更策略：

```json
{
  "version": 1,
  "authority": {
    "instructions": ["AGENTS.md"],
    "architecture": ["DESIGN.md"],
    "publicContracts": ["README.md"],
    "specsRoot": ".specs"
  },
  "changePolicy": {
    "requireSpecFor": ["**"],
    "allowWithoutSpec": [
      ".specs/**",
      ".blueprint/approvals/**",
      ".blueprint/architecture/**",
      "design-blueprint.json",
      "README.i18n.yaml"
    ]
  },
  "features": {
    "root": ".blueprint/features",
    "approvalsRoot": ".blueprint/approvals"
  },
  "architecture": {
    "root": ".blueprint/architecture"
  },
  "documentation": {
    "standards": ["docs/AGENTS.md"],
    "roles": {
      "tutorials": "docs/cookbook/**",
      "references": "docs/reference/**",
      "productGuides": "docs/user/**",
      "decisions": ".specs/**"
    },
    "i18n": {
      "enabled": true,
      "include": ["README.md", "docs/**/*.md"],
      "exclude": [
        "docs/AGENTS.md",
        "docs/i18n/terminology.md",
        "docs/i18n/style-samples.md"
      ],
      "migrationSeverity": "recommended"
    }
  }
}
```

路径和 glob 都相对于仓库根目录。支持的 glob 语法为 `*`、`**` 和 `?`。绝对路径与父目录穿越会被拒绝。

各类权威角色有意保持独立：

- `instructions` 是 AI 开发过程加载的长期指令。
- `architecture` 描述当前系统构成与职责归属。
- `publicContracts` 描述使用者可见的行为。
- `specsRoot` 保存拟议、已实现和已拒绝的决策。
- `features.root` 保存开发者拥有的功能定义，供 Web 功能层级和文档满足度视图使用。
- `features.approvalsRoot` 保存与 proposed Spec 精确哈希绑定的开发者直接批准记录。
- `architecture.root` 保存开发者拥有的架构组件记录，把产品包含（`Parent`）与类型化的软件组成、部署、运行时依赖清楚地区分开。
- `documentation.standards` 指定文档角色的权威来源，AI 在处理面向人的文档前会读取它。
- `documentation.roles` 为教程、参考资料、产品指南和长期决策分配不同归属位置。
- `documentation.i18n` 定义双语范围、明确排除项，以及采用 Blueprint 前已存在但尚未配对的文档所使用的迁移严重级别。

## 文档治理与翻译

初始化会创建 `docs/AGENTS.md` 作为角色标准，创建 `docs/i18n/README.md` 作为配对契约，创建 `docs/i18n/translation-rules.md` 作为翻译方法，创建 `docs/i18n/terminology.md` 作为术语权威来源，并创建 `docs/i18n/style-samples.md` 保存已审阅的项目语言风格。初始化还会创建 `.dsh/skills/blueprint-doc-standards/SKILL.md` 和仅能明确调用的 `.dsh/skills/blueprint-translate-docs/SKILL.md`；DSH 会将它们发现为项目级 Skill。

范围内的一组配对由 `foo.md`、`foo.zh.md` 和 `foo.i18n.yaml` 组成，两种语言拥有同等权威。记录保存与 `git hash-object` 一致的完整 Git blob 哈希，而不是普通文件 SHA-1。`docs check` 会拒绝不完整的既有三文件配对、过期哈希、缺失的 H1 语言切换链接，以及标题层级、列表、表格形状、链接目标或围栏代码的漂移。采用 Blueprint 之前已经存在的单独文档默认只产生建议级迁移项，因此初始化不会自行编造翻译。

机械一致不等于语义审阅。常规 AI 路径在同一次变更中对对应文档应用最小补丁，并保留未改动的正文。扩展翻译 Skill 只在用户明确要求时运行。当人工或具备相应能力的 AI 确认两侧含义一致后，`docs confirm` 会重新检查结构；如果项目使用 Git，它还会存储 Git blob、固定可恢复的 Blueprint 快照 ref，并写入已审阅的哈希。

## 功能目录与 Web 仪表盘

功能文件默认直接存放在 `.blueprint/features` 下。每个文件记录稳定的小写 ID、可选父功能、生命周期状态、摘要、实现范围、必须或建议关联的文档、验收说明和自由补充说明。文件布局始终属于开发者表达的意图；插件绝不会根据源码目录猜测产品功能。Web 面板可以在紧凑目录与自上而下的 SVG 架构图之间切换；统一节点和正交连接线都来自同一组父子关系。

Blueprint 标题会显示 Host 与浏览器客户端实际加载的插件版本。版本一致时只显示一个紧凑版本号；不一致时会同时显示两端版本，并要求完整重启 DSH Web。标题下方继续显示项目根目录，使“插件缓存过期”和“会话打开了错误工作区”可以直接区分。

仪表盘包含三个一级 Tab。默认打开的**优化 Spec**工作区会先在左栏打开当前功能的中文**功能说明**，并提供明确的**功能说明/开发 Spec**与**中文/English**切换，同时显示真实文件路径、功能名称、Spec 生命周期、审批/开发状态和渲染后的 Markdown。简洁功能说明固定使用四个对应章节——实现什么、最终效果、怎么使用、注意事项；开发者需要工程细节时再打开正式 Spec。右栏放置独立流式助手。**项目结构**包含功能架构图/目录切换、功能选择、紧凑审计数字和功能定义编辑，不再重复显示文档或助手。**架构设计**作为第三个一级 Tab，展示当前逻辑组件图和变更前后叠加图，呈现规范的组件详情（部署单元、拥有路径、提供的契约、支持的 Feature、文档状态和验证问题），并运行独立架构助手，返回结构化位置分析，而不是把 Feature 层级当成聊天上下文。Feature 的 `Parent` 仅表示产品能力包含；调用、复用、集成和共享页面使用类型化的架构关系。

新的功能说明保存为 `docs/user/features/<feature-id>.md`、`docs/user/features/<feature-id>.zh.md` 和经过审阅的 `.i18n.yaml` 配对记录。Host 管理的工件解析器会返回这些精确路径，以及功能定义、生命周期 Spec 配对、审批路径、存在状态和哈希；浏览器只渲染这份描述，不再重建或模糊匹配文件名。正式生命周期规格使用 `.specs/<lifecycle>/<name>.md` 作为机器解析的英文主文件，并以 `.specs/<lifecycle>/<name>.zh.md` 作为中文对应文件。中文文件会关联到主文件，不会被当成第二份生命周期提案。历史单文件规格仍可读取；请求尚未存在的语言时，页面会明确提示缺少文件，不会回退到中英文混写内容。

新建功能时，可编辑的显示名称与开发者确认的 ASCII 本地键相互分离。顶层功能 ID 等于本地键；子功能 ID 等于 `<parent-id>--<local-key>`。系统拒绝纯数字的新键，也不会自动把非 ASCII 名称语义翻译成键。表单会在保存前预览 Host 管理的完整工件集合。工件准备完成后，普通名称编辑不会重命名身份，更换上级必须使用显式的**规范化身份**预览。该可恢复迁移会在确认前列出所有移动工件、更新引用、后代身份、冲突和失效审批；在开发者主动迁移前，历史 ID 继续可读。

新组件保存在 `.blueprint/architecture/components/<id>.md`，包含稳定的 ASCII Id、Kind、可选 Container、Deployment 标识、Status、拥有源码路径、提供的契约、类型化依赖（`depends_on`、`calls`、`publishes`、`consumes`、`exposes`、`extends`）、支持的 Feature ID，以及必须或建议文档。组件身份与 `Container` 解耦，重新挂接父级只会改变图中位置，不会重命名工件路径或后代节点。图中区分包含边和类型化依赖边；选择 Feature 会突出所有已分配组件，选择组件会突出所有受支持 Feature。

仪表盘根据定义中的摘要、范围以及所有必须文档是否存在来计算满足度。建议文档仍会显示，但不会降低百分比。无效父级链接、循环、缺失的必须文档、格式错误的功能定义、格式错误的组件记录、有歧义的拥有路径、不支持的关系类型、被复用的部署或契约标识以及断裂的 Feature 分配都会显示在同一审计详情界面。由于 `.blueprint/architecture/**` 被排除在 `requireSpecFor` 之外，在实现审批之前仍然可以完成纯架构规划，审批和 Spec 生命周期仍然受治理。

选中的功能还会显示结构化中文需求分析，将仓库事实拆分为用户价值、使用场景、范围内与范围外行为、规则与生命周期状态、失败边界、验收条件、风险和待确认问题。缺少的材料会明确标记为“尚未说明”，不会被前端静默编造。

编辑入口被刻意限制在很小的范围内：HTTP 端点只接受同源 JSON，只解析由 `design-blueprint.json` 锚定的目录，只写入 `<features.root>/<validated-id>.md` 或 `<architecture.root>/components/<validated-id>.md`，限制请求和文档大小，拒绝父目录穿越，并使用页面加载时的 SHA-256 哈希拒绝陈旧更新。架构变化使用乐观并发的预览与应用边界：预览列出每个组件和 Feature 映射的新增、更新或删除，每条变化的类型化边，部署与契约影响，有歧义的路径所有权，环，文档变化和审批失效；应用操作重新计算预览，只写入已登记的组件文件，并在快照过期、引用无效、冲突、成环或差异扩张时失败关闭。它不是通用文件系统编辑器。

## 开发者直接批准的功能工作流

与功能关联的规格会在 proposed 状态下面增加 `Feature: <id>`。Blueprint 根据仓库产物而不是浏览器内存推导工作流状态，并按以下顺序运行：

- 保存功能定义。
- **生成开发方案**先让 Host 以可恢复方式准备已经登记的中英文功能说明三件套和 Feature-linked proposed Spec 配对。工作流进入可见的“已准备”状态，然后助手只填写这些既有路径并移除骨架标记；系统明确禁止实现或自行批准。
- 开发者在**优化 Spec**中先阅读功能说明，再阅读 proposed Spec，然后点击**审核并确认方案**。Host 会把英文主 Spec 的精确路径和同时覆盖两个语言文件的审阅哈希写入 `.blueprint/approvals/<feature-id>.json`。如果 Blueprint Web 无法打开，开发者可以明确使用 `design-blueprint approve <feature-id> --spec-hash <sha256> --yes`；CLI 调用相同的过期哈希校验和原子写入逻辑，不接受模糊名称，也不会隐式选择方案。
- 只有批准仍与当前规格一致时才显示 **开始开发**，并把已批准的规格路径与哈希提交到同一个 DSH Session。
- AI 只实现已批准 Scope，并运行声明的检查。如果方案发生变化，哈希不匹配会立即取消其授权，并要求开发者重新审阅。
- 只有验证通过后，AI 才可以把规格移动到 `implemented`，并描述已经交付的决策、证据和后果。

即使 Scope 与变更文件匹配，暂存策略也会排除尚未批准的 Feature-linked proposal，不允许它拥有实现变更。`.specs/**`、`.blueprint/approvals/**` 和 `.blueprint/architecture/**` 保持为仅治理路径，使方案编写、直接批准与架构规划可以先于实现发生。批准记录是强工作流信号，但不是针对拥有无限制工作区写权限的恶意进程的密码学边界。

### 独立架构助手

“架构设计”工作区在右侧打开专用助手。第一次发送消息时，它会创建一个全新的 Host DSH Session/Agent，与开发会话和 Spec 审核助手均独立，但完整对话始终内嵌在 Blueprint 中，不会把开发者转到其他聊天。Blueprint 会立即通过 DSH 的 Workspace API 归档这个后台 Session，因此普通 Workspace 和 Ungrouped 分组不会显示它，而其持久历史仍可供内嵌助手恢复。已有的未归档架构 Session 会在 Blueprint 下次打开时自动迁移。已完成消息、流式 Markdown、思考与工具活动、错误、取消、本地恢复和底部跟随使用与 Spec 审核助手相同的可见投影。会话按照项目、审核协议版本和功能 ID 命名并恢复。每次提交都会携带经过分隔的当前 Feature 记录、组件记录、`DESIGN.md`、相关清单、公共契约、已批准决策摘要、选中的 Feature 或组件以及开发者提案。仓库材料被视为不可信上下文，而不是指令。

助手区分仓库事实、推断、假设和开发者决定；回复覆盖产品位置、组件分配、类型化关系变化、接口与数据影响、部署与插件边界、源码所有权、兼容性与迁移影响、至少一个可行备选方案，以及尚未解决的用户可见或业务边界问题。它可以建议扩展现有组件、新增内部组件、新增平级服务或新增插件，但页面或依赖本身不能作为新增插件的依据。

助手首先生成结构化的变更前后提案。只有开发者的明确操作可以把精确的当前提案应用到已登记架构记录，并同步与 Feature 关联的中英文功能说明和 proposed Spec。架构 Session 不能编辑实现文件、把生命周期文档移动到 implemented、写入审批记录或自行批准结果。任何已应用的 Spec 变化都会通过现有精确哈希工作流使旧审批失效。

### 独立 Spec 审核助手

选中的功能会在**优化 Spec**右侧打开专用助手。第一次发送消息时，它会在相同工作区创建一个全新的 Host DSH Session/Agent，而不是复制开发会话。会话按照项目、审核协议版本和功能 ID 命名并恢复。修改任意一种语言的 Spec 只会刷新文档，不会更换当前对话；点击**新建对话**才会归档旧 Session 标题并创建干净会话。

审核助手默认使用中文，从六个方面检查：目标与参与者、范围与非目标、状态/权限/数据规则、异常与恢复、安全/并发/兼容性，以及可观察的验收证据。和 DSH Chat 一样，面板会在提交 prompt 前打开 Session 事件窗口。在 DSH 0.1.1-rc.2 上，它从 `ConversationSnapshot.chat.legacy` 投影已完成节点、partial 内容和运行中调用，仅把原有顶层字段保留为升级回退。DSH 已公开的思考摘要、工具和文件活动、任务与子 Agent 会按时间显示为进行中/完成/失败卡片，最终回答继续通过 `MarkdownText` 流式渲染。未知内容会被安全忽略，页面不会声称显示隐藏思维链。长历史通过滚动展示，不再压缩较早的轮次；超长消息和活动正文使用有界的内部滚动，流式输出也只在开发者停留底部时跟随，向上阅读后可用**回到最新**恢复跟随。面板还会报告 Session 错误，并可停止生成。角色提示明确禁止实现、生命周期归档、批准记录写入和实现文件修改。独立会话仍使用当前 DSH Agent 组合，因此操作系统级能力隔离仍是未来强化边界，不是当前版本的安全承诺。

助手默认使用**简明模式**：开发者只需提供中文产品框架，审核助手会在后台自动整理章节、工程约束、验收编号、验证细节和可从仓库确定的选择；只有某个选择会改变可见行为或业务边界时，它才会用普通中文提出问题，而且最多三个。需要时可以切换到**技术细节**模式，查看字段、配置、验收编号和测试问题。助手回复使用 DSH 面向不可信输出的 `MarkdownText` 组件安全、增量地渲染 Markdown。即使复用同一个 Session，每次提交也会携带两份功能说明和两份 Spec 的最新正文。存在 proposed Spec 时，点击**直接优化并写入 Spec**会明确授权 Agent 只同步编辑这些当前配对，并保证每个文件只使用指定语言。最终助手回复出现时，或者没有最终正文的工具型回合在 Session 结束时，dashboard 都会且只会自动重载一次，使左侧正文、生命周期状态和新的双语审阅哈希无需复制粘贴即可出现；同时保留**刷新结果**作为恢复动作。

### 一键初始化

当当前工作区是尚未配置的 Git 根目录，或包含可识别的技术栈标记时，空白 Blueprint 视图会提供**初始化当前项目**。对于空目录或其他未被识别的起步工作区，界面会解释自动识别条件，并提供**确认此目录并初始化**。这个回退操作是开发者对当前精确 DSH 工作区路径的显式决定，不是模型根据文件名作出的猜测。文件系统根目录仍然不可用。

Host 会在写入前重新发现目标。强候选仍必须匹配发现结果；未识别工作区则必须携带显式确认位，并且仍然精确等于当前工作区。两条路径都会委托与 CLI 相同的非破坏性初始化器。得到的基线包含文档角色和翻译工具，但会明确说明产品架构和功能边界仍未完成记录；初始化绝不会虚构产品意图，也不会在未经审阅时翻译现有正文。**重新检查**会明确显示正在执行新的发现；条件仍不满足时，界面会列出确定性的 Git／技术栈标记规则。

已经配置过的项目可以使用 Blueprint 标题栏中的 **更新治理标准**。它会再次运行同一个可重复执行的初始化器，在保留现有正文与配置键的同时，补充新增的托管模板和缺失的文档配置。

只用于容纳仓库、备份或临时目录的父目录绝不会被自动选择。设置界面会列出直接子项目提示，并在显式确认当前目录前再次警告。插件绝不会递归选择并初始化偶然发现的第一个目录。

## 规格生命周期

拟议规格在实现前表达经过审阅的意图：

```markdown
# Spec: Staged Git snapshot

Status: proposed

## Problem
## Scope
- allow: `lib/**`
- deny: `lib/generated/**`
## Proposal
## Alternatives considered
## Acceptance criteria
- AC-1: The scanner reads staged content.
## Verification
- AC-1: test: `tests/staged-policy.test.js`
## Risks
```

已实现规格用 `Decision`、已交付的 `Verification` 和 `Consequences` 取代 `Proposal`、`Acceptance criteria` 与 `Risks`。已拒绝规格保留其提案，并记录 `Status: rejected — <reason>`。

生命周期目录必须与 `Status:` 一致。拟议规格的范围可以覆盖暂存实现。已实现规格只有在同一次暂存变更中被更新时才可以参与覆盖。一个文件若被零份或多份有效规格覆盖，扫描都会被阻止。

## Git 与验证语义

默认扫描器用 `git diff --cached --name-status -z` 读取变更集，用 `git ls-files -z --cached` 确定快照身份，并用 `git show :<path>` 读取内容。因此，检查针对 Git 将要提交的内容，而不是无关的未暂存编辑。

扫描器证明结构性事实：权威来源是否存在、生命周期格式、范围归属、稳定的 AC 标识符以及已声明的验证。它并不声称自然语言产品意图在语义上正确；人工审阅和所引用的测试仍然是这一判断的权威来源。

本地 hook 可以通过 `git commit --no-verify` 绕过。必须强制执行时，CI 应在合并前运行相同的暂存或仓库策略。

## DSH 组合方式

清单声明了 `dsh.bundle.patch` 和 `dsh.client`。`cordis.patch.yml` 插入 Host 函数插件。DSH Web Profile 提供 `commands`、`systemPrompt` 和 `webServer`；客户端声明在 `dsh-client-runtime` 和 `dsh-client-ui-conversation` 之后加载，再注册名为 `blueprint` 的 `conversation.view` 入口。

通过当前的 `dsh plugin --profile <name> add <package>` 流程将软件包安装到 DSH Profile，把 `@dsh-plugins/design-blueprint` 加入该 Profile 的 Bundle 列表，然后检查最终组合：

```sh
dsh --profile web --dump-config
```

修改已链接的开发副本后，应完全重启 DSH Web，使浏览器模块图重新构建。选择工作区包含 `design-blueprint.json` 的会话，再从常规会话视图旁选择 **Blueprint** 标签页。

## 模型体验

### 规格驱动开发指引

#### 模型看到什么

每个组装后的提示词都会收到一个顺序为 90 的固定部分，要求模型在修改文件前读取 `design-blueprint.json`、其中指定的权威文档和相关生命周期规格；把工作限制在 Scope 内；让 `AC-*` 条件与证据配对；并在扩大行为或文件范围前更新规格。

##### 原样指引

```markdown
## Spec-driven development

Before modifying workspace files, read design-blueprint.json, every authority document it names, and the relevant lifecycle specification under .specs/.
For non-trivial work, establish or update the specification before implementation. Keep changes inside its machine-readable Scope, satisfy each AC-* acceptance criterion with declared verification evidence, and update the public contract and architecture owners when their facts change.
For feature-catalog work, a planning request may fill only the Host-registered bilingual Product brief and proposed Spec artifacts and must then stop. Never invent or fuzzy-match artifact paths, and never hand-write or edit .blueprint/approvals. Direct developer approval normally comes from Blueprint Web; when Web is unavailable, the hash-bound design-blueprint approve CLI fallback may be invoked only after explicit developer authorization in the same task. Do not implement a Feature-linked proposal unless its exact current bilingual hash is approved; changing the proposal invalidates approval and requires another developer review.
For human-facing documentation, also read the configured documentation standard. Put each fact in its owning document tier, update every in-scope English/Chinese pair together, and never confirm a translation pair until semantic equivalence has been reviewed.
Do not treat a passing test alone as authority to expand scope. If implementation requires an unplanned file or behavior, update the specification and obtain review before continuing.
```

#### Token 影响

插件挂载期间，每次模型请求都会重复一个固定部分。规格正文不会复制进提示词；Agent 通过正常的工作区能力读取相关文件。

#### KV Cache 影响

只要文本和顺序不变，该部分的前缀就保持稳定。修改指引或改变注册顺序，可能让缓存从该提示词位置开始失效。

### 直接 `/blueprint` 状态

#### 模型看到什么

模型不会直接看到任何内容。命令在 DSH 的人工命令平面执行，并把报告返回交互适配器，不会创建模型消息。

#### Token 影响

直接 Token 数为零。

#### KV Cache 影响

没有影响；命令元数据、输入和输出都停留在模型请求之外。

## 已知限制与延期工作

- **语义审阅仍由审阅者负责** — 扫描器验证声明的对应关系与 Markdown 结构，不判断正文或翻译是否准确表达产品意图。
- **`scan` 不执行验证声明** — 测试和命令只作为证据引用被记录；项目 CI 或未来明确授权的运行器负责执行。
- **只支持一小组 glob 语法** — 有意不支持大括号展开、extglob、否定模式和 `.gitignore` 语义。
- **不自动转换生命周期** — 将拟议规格移动到已实现目录会改变文档含义，因此仍需明确审阅和编辑。
- **功能 Markdown 有意采用结构化格式** — 可视化表单拥有规范格式；手工编辑必须保留其标题和元数据。
- **架构组件位于同一个配置的根目录下** — `.blueprint/architecture/components/` 是唯一受支持的组件文件位置；跨根目录或拆分目录的目录需要开发者审阅配置更新。
- **架构图为逻辑图，不探测运行时拓扑** — 类型化依赖边来自开发者拥有的声明；Blueprint 不会通过爬取源码或容器清单来推断架构边界。
- **审核 Agent 和架构 Agent 依赖提示约束，而不是沙箱隔离** — 它们都拥有独立 Session 和收窄的角色/上下文提示，但仍使用当前 DSH Agent 组合及其工具面。
- **密集组件图可能难以阅读** — 大型目录依赖聚焦选择和审计面板；有界的高亮叠加与节点收缩属于未来的可用性工作。
- **类型化路径所有权可能暴露既有重叠** — Blueprint 会将有歧义的模式作为必报问题，但不会自动修复；是否采用由开发者决定。
- **DSH 仍处于开发者预览阶段** — 应固定 Peer 依赖版本，并针对实际使用这个仓库外 Bundle 的 Profile 进行测试。

## 开发

```sh
npm test
npm run lint:js
node lib/cli.js scan --all
```

组件职责见 [DESIGN.md](DESIGN.md)，决策与取舍见[已实现规格](.specs/implemented/2026-08-20-spec-driven-blueprint.md)。
