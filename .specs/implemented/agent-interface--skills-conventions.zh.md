# Spec: Skills 约定与文档(agent-interface--skills-layer,子 Spec C)

Status: proposed
Feature: agent-interface--skills-layer
Parent: spec-governance--architecture-design
Companion: agent-interface--skills-layer(子 Spec A,已实现)、agent-interface--skills-bundled(子 Spec B,已实现)

## 问题

子 Spec A 发布了 Skills loader,子 Spec B 发布了五个打包 Skills 加一个 CLI 子命令。但想要知道"为啥加 Skills 层"、"它明确不做啥"、"本插件的术语是啥"、"怎么在聊天框里用某个 Skill"的人,目前没有地方可读。Feature brief `docs/user/features/agent-interface--skills-layer.md` 已经承诺了四块配套文档:ADR、out-of-scope 条目、领域术语表、每个 Skill 的页面。这些都还不存在。本 Spec 把这四块落地,让一个新贡献者能在一遍阅读里就拿到 WHY、non-goals、术语、每 Skill 的指引,不用翻源代码树。

## 范围

### 允许路径

- allow: `.adr/0001-add-skills-layer.md`
- allow: `.out-of-scope/skills-not-rpc.md`
- allow: `CONTEXT.md`
- allow: `docs/user/skills/*`

### 拒绝路径

- deny: `lib/skills.js`
- deny: `lib/skills/loader.js`
- deny: `lib/skills/frontmatter.js`
- deny: `lib/skills/backing-modules.js`
- deny: `lib/skills/cli.js`
- deny: `lib/index.js`
- deny: `lib/cli.js`
- deny: `skills/**`
- deny: `tests/**`
- deny: `package.json`
- deny: `.blueprint/approvals/**`
- deny: `.blueprint/verifications/**`
- deny: `.specs/**` 除本 Spec 对之外
- deny: `docs/i18n/**`
- deny: `docs/i18n/**`
- deny: `docs/AGENTS.md`
- deny: `design-blueprint.json`
- deny: `AGENTS.md`
- deny: `README.md`
- deny: `README.zh.md`
- deny: `README.i18n.yaml`
- deny: `cordis.patch.yml`
- deny: `.claude-plugin/**`

## 决策

### `.adr/0001-add-skills-layer.md` 处的 ADR

一份 ADR 记录 WHY 加了 Skills 层。格式遵循轻量 MADR(`# ADR: ...` / `Status:` / `## Context and problem statement` / `## Decision` / `## Consequences`),让熟悉该约定的读者一眼能认出。`Status` 是 `Accepted`。Context 描述驱动加层的缺口:AI agent 此前只有重量级的 `blueprint_dispatch` 工具,做窄操作。Decision 描述选定的形状:harness-neutral 的 `SKILL.md`、通过 `ctx.skills.registerProvider(...)` 注册、显式的 model-invoked vs user-invoked 标记。Consequences 列明插件得到的(一个窄的 AI 表面,CLI 不回归)和付出的(一个要同步的小 bundle、一块单独的文档表面)。ADR **不** 描述实现 HOW — 那在子 Spec A 和 B。

### `.out-of-scope/skills-not-rpc.md` 处的 out-of-scope 条目

按 mattpocock 约定(标题,然后每条 non-goal 一段短声明)写一份简短文件,声明两条 non-goals:Skills 不是 CLI 之上的 RPC;Skill 不通过 Skills registry 链另一个 Skill。复杂多步工作由开发者或 agent 直接用 `blueprint_dispatch` 或 CLI。这份文件存在,是为了让想加一条跨 Spec 改状态的 Skill 的贡献者看到边界被写下来。

### 仓库根的 `CONTEXT.md` 领域术语表

`CONTEXT.md` 在仓库根,是领域术语表。用英文一行一词加一句话定义,按字母排序。包含的词:`Skill`、`Spec`、`Feature`、`ADR`、`Component`、`verification cycle`、`Scope`、`Acceptance criterion`、`evidence level`。每个词指向所属权威文档 — 比如 `Spec` 指向 `docs/AGENTS.md` 和 Spec schema,`Skill` 指向 `@deepseek-ai/dsh-skill`,`ADR` 指向 `.adr/0001-add-skills-layer.md`。`CONTEXT.md` 不重新定义别处已经规范定义过的词。

### `docs/user/skills/<name>.{md,zh.md}` 处的每 Skill 文档

五份双语页面,每个 Skill 一份,遵循 Feature brief 引用的 mattpocock 模板:`What it does` / `When to reach for it` / `Common questions` / `It's working if`。每份页面简短(一屏),链回 Skill 的 `SKILL.md` 源码、backing module 路径、和 Feature brief。每份中文版镜像英文版的结构、保留 mattpocock 标题顺序;术语遵循 `docs/i18n/terminology.md`。每对写完后,跑 `design-blueprint docs confirm <name>.md` 让框架在 `.i18n.yaml` 里记录 Git blob 哈希。

### Brief 更新

`docs/user/features/agent-interface--skills-layer.{md,zh.md}` 增一个 `## Verified current behavior` 子节,列出子 Spec C 的新 AC(ADR 存在、out-of-scope 存在、CONTEXT.md 存在、每 Skill 页面存在、`docs check` 报 0 required)。`.blueprint/features/agent-interface--skills-layer.md` 和 `.blueprint/architecture/components/agent-interface-skills-layer.md` 在对应 Reference / Companion 节加上对 ADR 和 out-of-scope 的引用,跟在现有对子 Spec A 和 B 的引用旁。

## 验收条件

- AC-ADR-001:`.adr/0001-add-skills-layer.md` 存在,含 MADR 四个必需节(`## Context and problem statement`、`## Decision`、`## Consequences`,加一行 `Status:` 设为 `Accepted`)。[surface=repository; moment=static; evidence=static-unit]
- AC-OOS-001:`.out-of-scope/skills-not-rpc.md` 存在,声明 Skills 不是 CLI 之上的 RPC,以及 Skill 不通过 Skills registry 链另一个 Skill。[surface=repository; moment=static; evidence=static-unit]
- AC-CONTEXT-001:仓库根的 `CONTEXT.md` 存在,列出 `Skill`、`Spec`、`Feature`、`ADR`、`Component`、`verification cycle`、`Scope`、`Acceptance criterion`、`evidence level`,每个一句话定义,加 `Skill`、`Spec`、`ADR` 三个词指向所属权威文档。[surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-001:`docs/user/skills/decompose-spec.{md,zh.md}` 存在。英文页面含四个 mattpocock 节标题。[surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-002:`docs/user/skills/todo-status.{md,zh.md}` 存在。英文页面含四个 mattpocock 节标题。[surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-003:`docs/user/skills/verify-feature.{md,zh.md}` 存在。英文页面含四个 mattpocock 节标题。[surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-004:`docs/user/skills/grill-spec.{md,zh.md}` 存在。英文页面含四个 mattpocock 节标题。[surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-005:`docs/user/skills/handoff-spec.{md,zh.md}` 存在。英文页面含四个 mattpocock 节标题。[surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-006:`node lib/cli.js docs check --cwd .` 对新的 `docs/user/skills/**` 对报 0 required issue(YAML 在 `docs confirm` 跑前可能缺失;缺失 YAML 是 `recommended` 不是 `required`)。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-DOCS-007:在每份 `docs/user/skills/<name>.md` 上跑 `design-blueprint docs confirm` 后,`node lib/cli.js docs check --cwd .` 对 Skill 文档报 0 required 和 0 recommended issue。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-BRIEF-001:`docs/user/features/agent-interface--skills-layer.{md,zh.md}` 增一个 `## Verified current behavior` 子节,列出至少 AC-ADR-001、AC-OOS-001、AC-CONTEXT-001、AC-DOCS-001 至 AC-DOCS-007。[surface=repository; moment=static; evidence=static-unit]
- AC-FEATURE-001:`.blueprint/features/agent-interface--skills-layer.md` 和 `.blueprint/architecture/components/agent-interface-skills-layer.md` 在对应 Reference / Companion 节引用 `.adr/0001-add-skills-layer.md`、`.out-of-scope/skills-not-rpc.md`、`CONTEXT.md` 和 `docs/user/skills/<name>.md`。[surface=repository; moment=static; evidence=static-unit]
- AC-SCAN-001:本 Spec 落地后,`node lib/cli.js scan --cwd .` 报 0 required issue。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001:本 Spec 落地后,所有 199 条 host 测试继续通过。[surface=cli; moment=terminal; evidence=contract-integration]

## 验证

- AC-ADR-001:命令 `grep -E "Status: Accepted|## Context and problem statement|## Decision|## Consequences" .adr/0001-add-skills-layer.md` [surface=repository; moment=static; evidence=static-unit]
- AC-OOS-001:命令 `grep -E "不是 RPC|不会链|不通过 Skills registry 链" .out-of-scope/skills-not-rpc.md` [surface=repository; moment=static; evidence=static-unit]
- AC-CONTEXT-001:命令 `grep -E "^Skill$|^Spec$|^Feature$|^ADR$|^Component$|^verification cycle$|^Scope$|^Acceptance criterion$|^evidence level$" CONTEXT.md` [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-001:命令 `test -f docs/user/skills/decompose-spec.md && test -f docs/user/skills/decompose-spec.zh.md && grep -E "## What it does|## When to reach for it|## Common questions|## It's working if" docs/user/skills/decompose-spec.md` [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-002:命令 `test -f docs/user/skills/todo-status.md && test -f docs/user/skills/todo-status.zh.md && grep -E "## What it does|## When to reach for it|## Common questions|## It's working if" docs/user/skills/todo-status.md` [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-003:命令 `test -f docs/user/skills/verify-feature.md && test -f docs/user/skills/verify-feature.zh.md && grep -E "## What it does|## When to reach for it|## Common questions|## It's working if" docs/user/skills/verify-feature.md` [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-004:命令 `test -f docs/user/skills/grill-spec.md && test -f docs/user/skills/grill-spec.zh.md && grep -E "## What it does|## When to reach for it|## Common questions|## It's working if" docs/user/skills/grill-spec.md` [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-005:命令 `test -f docs/user/skills/handoff-spec.md && test -f docs/user/skills/handoff-spec.zh.md && grep -E "## What it does|## When to reach for it|## Common questions|## It's working if" docs/user/skills/handoff-spec.md` [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-006:命令 `node lib/cli.js docs check --cwd .` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-DOCS-007:命令 `node lib/cli.js docs check --cwd .`(在每份 Skill 页跑 `design-blueprint docs confirm` 之后)[surface=cli; moment=terminal; evidence=contract-integration]
- AC-BRIEF-001:命令 `grep -E "子 Spec C|AC-ADR-001|AC-OOS-001|AC-CONTEXT-001|AC-DOCS-" docs/user/features/agent-interface--skills-layer.md` [surface=repository; moment=static; evidence=static-unit]
- AC-FEATURE-001:命令 `grep -E "0001-add-skills-layer|skills-not-rpc|CONTEXT.md|docs/user/skills" .blueprint/features/agent-interface--skills-layer.md .blueprint/architecture/components/agent-interface-skills-layer.md` [surface=repository; moment=static; evidence=static-unit]
- AC-SCAN-001:命令 `node lib/cli.js scan --cwd .` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001:命令 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js" "tests/**/*.test.js"` [surface=cli; moment=terminal; evidence=contract-integration]

## 风险

- ADR 描述的是写作时理解的 rationale;如果 rationale 之后变了,ADR 由新 ADR 取代而非编辑,所以本 Spec 只写初始记录。
- `docs confirm` 记录内容身份,不是翻译质量。人或可胜任的 AI 在 `docs confirm` 跑前要审语义对等。如果中文翻译漂了,`docs check` 抓不到;本 Spec 信任人工审环节。
- `CONTEXT.md` 故意短。如果贡献者加的词跟 `docs/i18n/terminology.md` 撞,项目就有两份互相打架的术语表。本 Spec 把 `CONTEXT.md` 限定在插件内部术语,翻译术语指向 `docs/i18n/terminology.md`。

## 需求

### REQ-DOCS-1 — ADR 记录 WHY Skills 层

`.adr/0001-add-skills-layer.md` 存在,含 `Status: Accepted`、`## Context and problem statement`、`## Decision`、`## Consequences`。Decision 节点出 harness-neutral `SKILL.md` 形状和 `ctx.skills.registerProvider(...)`,并明确说明实现细节在子 Spec A 和 B 里,不在 ADR 里。

### REQ-DOCS-2 — Out-of-scope 条目声明边界

`.out-of-scope/skills-not-rpc.md` 按 mattpocock 约定声明两条 non-goals:Skills 不是 CLI 之上的 RPC;Skill 不通过 Skills registry 链另一个 Skill。复杂多步工作用 `blueprint_dispatch` 或 CLI。

### REQ-DOCS-3 — 领域术语表 `CONTEXT.md`

`CONTEXT.md` 列出插件内部词汇(Skill、Spec、Feature、ADR、Component、verification cycle、Scope、Acceptance criterion、evidence level),每个一句话定义,指向所属权威文档。

### REQ-DOCS-4 — 五份双语 Skill 页面

对每个 `decompose-spec`、`todo-status`、`verify-feature`、`grill-spec`、`handoff-spec`,存在一份 `docs/user/skills/<name>.md` 和 `<name>.zh.md` 对,含四个 mattpocock 节(`What it does` / `When to reach for it` / `Common questions` / `It's working if`)。

### REQ-DOCS-5 — `docs check` 干净

每 Skill 对跑完 `docs confirm` 后,`docs check` 对新 `docs/user/skills/**` 内容报 0 required 和 0 recommended issue。

### REQ-DOCS-6 — Feature brief 和 Component 引用新文档

Feature brief 和 Component 文档在对应节列出 `.adr/0001-add-skills-layer.md`、`.out-of-scope/skills-not-rpc.md`、`CONTEXT.md` 和 `docs/user/skills/<name>.md`,跟在现有对子 Spec A 和 B 的引用旁。

## 场景

[scenario=adr-readable]
Given 新贡献者打开 `.adr/0001-add-skills-layer.md`,
When 他们从头读到尾,
Then 他们知道为啥有 Skills 层,它长什么样,实现在别处。

[scenario=out-of-scope-readable]
Given 贡献者想加一条跨 Spec 改状态的 Skill,
When 他们读 `.out-of-scope/skills-not-rpc.md`,
Then 他们看到边界被写下来,转去用 `blueprint_dispatch`。

[scenario=context-glossary-readable]
Given 开发者在 Spec 里碰到术语 `verification cycle`,
When 他们打开 `CONTEXT.md`,
Then 他们找到一句话定义和指向所属权威文档的链接。

[scenario=skill-doc-readable]
Given 开发者想知道怎么在聊天框里调 `grill-spec`,
When 他们打开 `docs/user/skills/grill-spec.md`,
Then 他们看到四个 mattpocock 节,以及链向 Skill 的 `SKILL.md` 和 backing module 的链接。

[scenario=docs-check-clean]
Given 五份 Skill 页面和它们的 `docs confirm` 记录,
When `node lib/cli.js docs check --cwd .` 跑,
Then 输出对 `docs/user/skills/**` 报 0 required 和 0 recommended issue。

## 假设

1. `.adr/0001-add-skills-layer.md` 是本仓库的第一份 ADR;`.adr/` 目录还不存在,由本 Spec 创建。
2. `.out-of-scope/` 同理新;由本 Spec 创建。
3. 仓库根的 `CONTEXT.md` 是新文件;仓库里没别的文件占这条路径。
4. `docs/user/skills/<name>.i18n.yaml` 由 `design-blueprint docs confirm <name>.md` 创建,不在本 Spec 里手工写;`deny:` 规则显式禁止手工编辑那些文件。
5. `design-blueprint docs confirm` 在人或可胜任的 AI 审完语义对等后跑,按 `docs/i18n/README.md`。

## 非目标

- 翻译任何其他 Feature brief 或参考文档。Feature brief `docs/user/features/agent-interface--skills-layer.{md,zh.md}` 的现有翻译对就地打补丁加子 Spec C 节;现有内容大部分不重译。
- 重写 Feature brief,只加子 Spec C 的 `## Verified current behavior` 子节。
- 加新 Skill。本 Spec 不加第六个 Skill,也不改现有的五个。
- 在 `docs/i18n/terminology.md` 里写 `Skill` 或 `ADR` 条目;项目翻译术语表归 `docs/i18n/terminology.md` 管,在那编辑是另一次决策。

## 备选方案

**用一份总的"Skills 文档"页面代替五份每 Skill 页面。** 拒绝,因 Feature brief 已经把 `docs/user/skills/<name>.md` 列作规范格式,而且每个 Skill 的触发语、backing module、失败模式不同。一份总页逼读者扫过四个不相关的 Skill 才能找到自己关心的那个。

**把 `CONTEXT.md` 翻译成中文。** 拒绝,因 `CONTEXT.md` 是插件内部英文词汇的真理源,指向英文权威文档。翻译它会让 `CONTEXT.md` 和它指向的文档之间漂移。

**完全跳过 `CONTEXT.md`,靠 docs/AGENTS.md。** 拒绝,因 `docs/AGENTS.md` 是文档放置规范,不是词汇表。Skills 层引入了插件专有术语(Skill body、backing module、BUNDLED_SKILL_RANK、invocation policy),这些不在 `docs/AGENTS.md` 范围内。

## 任务

1. Author `.adr/0001-add-skills-layer.md`,含四个 MADR 节、`Status: Accepted`、显式指向子 Spec A 和 B 找实现细节。REQ:REQ-DOCS-1。Scope:`.adr/0001-add-skills-layer.md`。AC:AC-ADR-001。
2. Author `.out-of-scope/skills-not-rpc.md`,mattpocock 风格声明两条 non-goals。REQ:REQ-DOCS-2。Scope:`.out-of-scope/skills-not-rpc.md`。AC:AC-OOS-001。
3. Author 仓库根 `CONTEXT.md`,列九条词汇和指向。REQ:REQ-DOCS-3。Scope:`CONTEXT.md`。AC:AC-CONTEXT-001。
4. Author 五个 Skill 各自的 `docs/user/skills/<name>.md` 和 `<name>.zh.md`,按 mattpocock 模板。REQ:REQ-DOCS-4。Scope:`docs/user/skills/<name>.{md,zh.md}`。AC:AC-DOCS-001 至 AC-DOCS-005。
5. 在五份 Skill 页各跑 `design-blueprint docs confirm <name>.md`,让框架在对应 `.i18n.yaml` 里记 Git blob 哈希。REQ:REQ-DOCS-5。Scope:`docs/user/skills/<name>.i18n.yaml`(由框架创建,不手工写)。AC:AC-DOCS-006、AC-DOCS-007。
6. Patch `docs/user/features/agent-interface--skills-layer.{md,zh.md}`,加 `## Verified current behavior` 子节列子 Spec C 的新 AC。REQ:REQ-DOCS-6。Scope:`docs/user/features/agent-interface--skills-layer.{md,zh.md}`。AC:AC-BRIEF-001。
7. Patch `.blueprint/features/agent-interface--skills-layer.md` 和 `.blueprint/architecture/components/agent-interface-skills-layer.md`,引用 `.adr/0001-add-skills-layer.md`、`.out-of-scope/skills-not-rpc.md`、`CONTEXT.md` 和 `docs/user/skills/<name>.md`。REQ:REQ-DOCS-6。Scope:`.blueprint/features/agent-interface--skills-layer.md`、`.blueprint/architecture/components/agent-interface-skills-layer.md`。AC:AC-FEATURE-001。
8. 跑 `node lib/cli.js scan --cwd .`、`node lib/cli.js docs check --cwd .` 和全 host 测试套件。REQ:all。Scope:-。AC:AC-SCAN-001、AC-DOCS-006、AC-DOCS-007、AC-REGRESSION-001。

## Lifecycle

- Status: proposed
- 批准后目标状态:implemented(文件移至 `.specs/implemented/agent-interface--skills-conventions.md`)

## Truth-delta

新增事实:
- `.adr/0001-add-skills-layer.md` 存在,记录 Skills 层的 WHY。
- `.out-of-scope/skills-not-rpc.md` 声明 Skills 不是 CLI 之上的 RPC,Skill 不链另一个 Skill。
- `CONTEXT.md` 列本插件的领域词汇。
- 五份双语 Skill 文档页存在 `docs/user/skills/<name>.{md,zh.md}`,过 `docs check`。
- Feature brief 和 Component 文档引用新文档。

保留事实:
- 子 Spec A 和 B 的行为不变。
- `docs/user/features/agent-interface--skills-layer.md` 现有内容就地打补丁;文档大部分不重译。
- 五个 Skill 不动;本 Spec 加文档,不加 Skill 代码。
- `blueprint_dispatch` 仍是权威的 Spec lifecycle 工具。

## Traceability

REQ-DOCS-1 -> scenario[adr-readable] -> task 1 -> AC-ADR-001 -> verification grep Status/Context/Decision/Consequences
REQ-DOCS-2 -> scenario[out-of-scope-readable] -> task 2 -> AC-OOS-001 -> verification grep 不是 RPC / 不链
REQ-DOCS-3 -> scenario[context-glossary-readable] -> task 3 -> AC-CONTEXT-001 -> verification grep 词表
REQ-DOCS-4 -> scenario[skill-doc-readable] -> task 4 -> AC-DOCS-001 至 AC-DOCS-005 -> verification test -f 和 grep 节标题
REQ-DOCS-5 -> scenario[docs-check-clean] -> task 5 -> AC-DOCS-006、AC-DOCS-007 -> verification docs check
REQ-DOCS-6 -> scenario[adr-readable] / [skill-doc-readable] -> task 6、7 -> AC-BRIEF-001、AC-FEATURE-001 -> verification grep 引用

## Unresolved decisions

无。四块(ADR、out-of-scope、术语表、每 Skill 页面)由 Feature brief 和它引用的 mattpocock 约定决定。

## 质量清单(自检)

- requirements complete:yes(6 个 REQ,覆盖 ADR、out-of-scope、术语表、Skill 页面、docs check、Feature/Component 引用)
- requirements unambiguous:yes(每个 REQ 点名文件和契约)
- requirements bounded:yes(单 Feature 子 Spec C;无代码改动;无新 Skill)
- requirements failure-aware:yes(命令退出码写清;ADR 不能静默改写)
- requirements testable:yes(每个 AC 指向一条验证命令或测试)
- requirements non-contradictory:yes(没有 AC 同时说"存在"和"缺失"同一文件)

## 跨工件分析

- requirements-to-scenarios:yes(全部 6 个 REQ 被 5 个场景覆盖)
- requirements-to-impact:yes(全部 6 个 REQ 映射到 ## Scope 中一个或多个文件)
- requirements-to-tasks:yes(每个 task 列 REQ)
- requirements-to-acceptance:yes(每个 AC 点名 REQ)
- requirements-to-verification:yes(每个 AC 点名验证命令或测试)
- tasks-to-scope:yes(每个 task 点名 Scope 路径)
- design-to-scope:不适用(designRequired: false;本 Spec 只文档)
- scope-to-paths:yes(每个 Scope 路径对应真实路径;`.i18n.yaml` 上的 deny 规则显式声明不写契约)

## Consequences

`.adr/0001-add-skills-layer.md` 处的 ADR 是 WHY 的持久记录。`.out-of-scope/skills-not-rpc.md` 处的 out-of-scope 条目是 non-goals 的持久记录。`CONTEXT.md` 处的术语表是词汇的持久记录。五份 `docs/user/skills/<name>.md` 是怎么用每个 Skill 的持久记录。四块合在一起,让 Skills 层对新贡献者一目了然,不用翻源代码树。

## 结果

Blueprint 已通过与需求关联的验收自动完成本次交付。

- 验收快照：`git-index:272a65d3a86433a14e003df8a3109ee427ec621219ce80da331711ef6c16ad92`
- 验收尝试：`attempt-1`
- 结论：Sub-spec C lands the Skills conventions: ADR at .adr/0001-add-skills-layer.md, out-of-scope entry at .out-of-scope/skills-not-rpc.md, CONTEXT.md glossary, and 5 bilingual Skill docs pages at docs/user/skills/<name>.{md,zh.md}. docs check reports 0 required and 0 recommended issues for the new docs. scan reports 0 required issues.
- AC 证据：14 项全部通过。
- 检查证据：adr-content-repository（inspection）、oos-content-repository（inspection）、context-glossary-repository（inspection）、skill-docs-repository（inspection）、docs-check-cli-contract（command）、scan-cli-hygiene（command）、brief-sub-spec-c-section-repository（inspection）、feature-and-component-reference-repository（inspection）、regression-suite-cli-contract（command）。
