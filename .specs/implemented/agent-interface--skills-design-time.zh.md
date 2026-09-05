# Spec: Skills 设计时自动触发扩展(agent-interface--skills-layer,子 Spec D)

Status: proposed
Feature: agent-interface--skills-layer
Parent: spec-governance--architecture-design
Companion: agent-interface--skills-layer(子 Spec A,已实现)、agent-interface--skills-bundled(子 Spec B,已实现)、agent-interface--skills-conventions(子 Spec C,已实现)

## 问题

子 Spec B 已经发布五个捆绑 Skills,子 Spec C 发布了文档与约定。五个 Skill 覆盖读写时刻的 Spec 操作:`decompose-spec` 检测超预算 Spec、`todo-status` 返回进度、`verify-feature` 跑 AC 验收、`handoff-spec` 写可移植移交文档。`grill-spec` 在调用 ` `blueprint_dispatch refine` 之前带开发者走完四道细化门(defaults / persistence / surface / scope / risks),但它的 `description` 字段写的是 "Use when the user types `/grill-spec` or asks to think through a Spec before refining it."——两种表述都把自动触发门在**显式人类信号**上。

开发者处在架构或 Feature 设计工作中(添加新 Feature、决定模块边界、把超预算 Spec 拆成模块对齐的子 Spec、修订结构接缝)时,五个 Skill 没有任何一个会自动触发。模型要么等显式 `/grill-spec`(多数开发者不会敲),要么落到重型 `blueprint_dispatch refine` 工具,直接跳进正式完善、跳过轻量前置检查。**轻量设计时助手位置是空的**。

本 Spec 补这个空位。改写 `grill-spec` 的 `description`,让模型在开发者即将设计、重构或分解时自动触发它。新增一个 Skill `architect-feature`,body 通过 DSH 读工具直接读父 Feature brief、当前 Spec、`.blueprint/features/**`,**就地**提议模块对齐的分解方案——不靠 backing module 函数,不靠 Skill 串 Skill,不调用 `blueprint_dispatch`。两个 Skill 都保留 `user-invocable: true`(默认),让开发者可以继续用 `/<name>` 强制调用;`description` 才是主要的自动触发面。

## 范围

### 允许路径

- allow: `.specs/proposed/agent-interface--skills-design-time.md`
- allow: `.specs/proposed/agent-interface--skills-design-time.zh.md`

> 本 Spec 触到的其它所有文件(`skills/grill-spec/SKILL.md`、`skills/architect-feature/SKILL.md`、`tests/skills/grill-spec.test.js`、`tests/skills/architect-feature.test.js`、`tests/skills-loader.test.js`、`docs/user/skills/grill-spec.{md,zh.md}`、`docs/user/skills/architect-feature.{md,zh.md}`)都已被已实现的子 Spec B 和 C(`skills/**`、`tests/skills-loader.test.js`、`tests/skills/*.test.js`、`docs/user/skills/*`)覆盖。本 Spec 的独占 allow 列表只含两份 Spec body 文件;更新其它文件的权威继承自已批准的子 Spec,验收命令仍会检查改动。

### 禁止路径

- deny: `lib/skills.js`
- deny: `lib/skills/loader.js`
- deny: `lib/skills/frontmatter.js`
- deny: `lib/skills/cli.js`
- deny: `lib/skills/backing-modules.js`
- deny: `lib/index.js`
- deny: `lib/cli.js`
- deny: `skills/decompose-spec/**`
- deny: `skills/todo-status/**`
- deny: `skills/verify-feature/**`
- deny: `skills/handoff-spec/**`
- deny: `tests/skills/decompose-spec.test.js`
- deny: `tests/skills/todo-status.test.js`
- deny: `tests/skills/verify-feature.test.js`
- deny: `tests/skills/handoff-spec.test.js`
- deny: `tests/skills-cli.test.js`
- deny: `tests/plugin.test.js`
- deny: `.blueprint/**`
- deny: `.specs/**` 之外的 Spec 配对
- deny: `.adr/**`
- deny: `.out-of-scope/**`
- deny: `CONTEXT.md`
- deny: `package.json`
- deny: `cordis.patch.yml`
- deny: `AGENTS.md`
- deny: `README.md`
- deny: `README.zh.md`
- deny: `README.i18n.yaml`
- deny: `design-blueprint.json`
- deny: `docs/AGENTS.md`
- deny: `docs/i18n/**`
- deny: `docs/user/features/**`
- deny: `.claude-plugin/**`

## 决策
### `grill-spec` 在设计活动时自动触发

`skills/grill-spec/SKILL.md` 的 `description` 字段被改写,让模型识别四种自动触发上下文:

1. 开发者说他们即将设计新 Feature、搭建 Feature brief、或提出新子 Spec。
2. 开发者描述的变更触到架构边界(模块归属、公共契约、持久化、部署、权限、迁移、并发)。
3. 开发者贴入超预算 Spec 并问如何拆分。
4. 开发者问"我应该先规划吗?"或"scope 是什么?"在完善之前。

Skill body 和 backing module `lib/skills/backing-modules.js#grillSpecInterview` 不变。四道门访谈(defaults、persistence、surface、scope、risks)依然按相同门运行,在每道门解析或被显式跳过之前继续拒绝调用 `blueprint_dispatch refine`。唯一变更是自动触发面。

`user-invocable: true` 保留在 frontmatter,让开发者还能在任何上下文敲 `/grill-spec` 强制访谈。

### 新 `architect-feature` Skill

`skills/architect-feature/SKILL.md` 被创建。`description` 告诉模型在开发者决定模块边界、把 Spec 拆成子 Spec、按实现模块命名子 Spec、或提出新 Feature 层级时自动触发。Skill body 指示模型:

1. 用 DSH 读工具(不要 backing module 函数)读 `.blueprint/features/<parent-id>.md`、当前 active proposed Spec、若存在则读 `.blueprint/features/<parent-id>.children/**` 下紧邻兄弟。
2. 按实现模块族分组 proposed Spec 的 allowed paths:artifact I/O(`lib/specs.js`、`lib/features.js`、`lib/artifacts.js`、`lib/architecture.js`、`lib/docs.js`)、refinement engine(`lib/orchestration.js`、`lib/workflow.js`、`lib/config.js`、`lib/assistant-actions.js`、`lib/chat-commands.js`)、truth & verification(`lib/scan.js`、`lib/snapshot.js`、`lib/verification.js`、`lib/reconciliation.js`、`lib/project-binding.js`)、surface & plugin entry(`lib/web-api.js`、`lib/client.js`、`lib/index.js`、`lib/version.js`)、用户面文档(`DESIGN.md`、`README.*`、`docs/user/features/<id>.*`、`design-blueprint.json`、`cordis.patch.yml`)。
3. 每个模块族提议一个子 Spec,Scope 路径数不超过框架的 8-path 阈值(`design-blueprint.json#decomposition` 里的 loader 阈值)。
4. 输出简短 Markdown 预览:提议的子 Spec 标题、Scope 路径列表、继承的 REQ 分布。预览是建议;开发者拥有改写权。

Skill 没有 backing module 函数。所有逻辑都在 Skill body 里;模型直接读仓库文件。匹配 `.out-of-scope/skills-not-rpc.md` 的规则(Skill 不通过 Skills registry 串另一个 Skill),避免发明一个只为可测而存在的薄纯函数。

`user-invocable: true` 是默认、保持默认(true)。Skill 不带 `disable-model-invocation`,所以 `modelInvocable` 默认 true、`userInvocable` 默认 true。两个面都启用。

### Loader 行为

`lib/skills/loader.js#loadBundledSkills` 不变。它启动时走 `skills/` 一层深;新 `skills/architect-feature/SKILL.md` 由 loader 已经迭代每个子目录的同一行为自动发现。本 Spec 落地后,loader 返回六个候选而不是五个。`tests/skills-loader.test.js` 增加一条断言(替换现有五候选测试),验证 Spec 后 bundle 含六个候选。

### 文档

`docs/user/skills/grill-spec.md` 和 `docs/user/skills/grill-spec.zh.md` 在 "When to reach for it" 下加一段简短开发者语言描述四种自动触发上下文,在 "It's working if" 下加一条新 bullet,说明 Skill 在目录里以 `modelInvocable: true`、`userInvocable: true` 出现,无需显式 `/grill-spec` 即可自动触发。

`docs/user/skills/architect-feature.md` 和 `docs/user/skills/architect-feature.zh.md` 按相同 mattpocock 模板创建:`## What it does` / `## When to reach for it` / `## Common questions` / `## It's working if`。页面链向 `skills/architect-feature/SKILL.md` 和 `lib/skills.js` 的注册路径。中文页面镜像英文结构,术语按 `docs/i18n/terminology.md`。

### 为什么不带 backing module 函数

现有五个 Skill 各自重新导出或包装 `lib/skills/backing-modules.js` 里的一个函数,让 Skill body 拥有一个可测接缝。`architect-feature` 不需要可测接缝,因为它的输出是一份 Markdown 建议,由开发者读、接受、修改或拒绝——并不存在一个"正确"的分解可以被断言。backing module 要么返回占位("这里是建议分解"),只在模型读完文件后才有意义;要么复制 Skill body 已经指示模型做的读逻辑。添加它只会增加代码,不增加可测行为。Skill body 就是契约;`description` 就是触发器。

`.out-of-scope/skills-not-rpc.md` 规则("a Skill never chains another Skill through the Skills registry")被保留:`architect-feature` 不调用 `grill-spec`、`decompose-spec` 或任何其他 Skill;它读文件、输出建议。

## 验收条件

- AC-GRILL-DESC-001:`skills/grill-spec/SKILL.md` frontmatter `description:` 含字面词组 "auto-fire" 加上四种上下文中至少三种(新 Feature、架构边界、超预算 Spec 分解、"plan first" 问题)。[surface=repository; moment=static; evidence=static-unit]
- AC-GRILL-BODY-001:`skills/grill-spec/SKILL.md` body 在四道门访谈逻辑上不变;与子 Spec B 发布版本的唯一差异是 `description:` 行。[surface=repository; moment=static; evidence=static-unit]
- AC-GRILL-FLAG-001:`skills/grill-spec/SKILL.md` frontmatter 仍含 `user-invocable: true`(或省略让默认 `true` 生效),**不**含 `disable-model-invocation: true`。[surface=repository; moment=static; evidence=static-unit]
- AC-ARCH-FILE-001:`skills/architect-feature/SKILL.md` 存在于该路径,frontmatter 合法(`name: architect-feature`,`description:` 非空),body 含读路径与五个实现模块族名。[surface=repository; moment=static; evidence=static-unit]
- AC-ARCH-DESC-001:新 Skill 的 `description:` 含字面词组 "auto-fire" 加上四种触发上下文中至少两种(决定模块边界、分解 Spec、按实现模块命名子 Spec、提出新 Feature 层级)。[surface=repository; moment=static; evidence=static-unit]
- AC-ARCH-FLAG-001:新 Skill **不**含 `disable-model-invocation: true`。`user-invocable` 维持默认 true。[surface=repository; moment=static; evidence=static-unit]
- AC-ARCH-NO-BACKING-001:`lib/skills/backing-modules.js` **不**新增 `architectFeature` 导出。Skill body 是唯一契约。[surface=repository; moment=static; evidence=static-unit]
- AC-LOADER-COUNT-001:`tests/skills-loader.test.js` 断言 Spec 后 bundle 含六个候选(现有5 个加 `architect-feature`);之前的五候选断言被替换。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-GRILL-TEST-001:`tests/skills/grill-spec.test.js` 增加一条断言,frontmatter `description:` 含字面词组 "auto-fire" 且仍断言四道门访谈关键词(`defaults`、`persistence`、`surface`、`scope`、`risks`)。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-ARCH-TEST-001:`tests/skills/architect-feature.test.js` 存在,断言 frontmatter(`name`、`description` 非空、无 `disable-model-invocation`),加上 body 内容断言五个模块族名以及读路径模式 `\\.blueprint/features/.*\\.md` 存在。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-DOCS-GRILL-001:`docs/user/skills/grill-spec.md` 和 `docs/user/skills/grill-spec.zh.md` 在 "When to reach for it" 下各加一段,列出至少三种自动触发上下文,并在 "It's working if" 下加一条新 bullet 指明 `modelInvocable: true` 和 `userInvocable: true`。[surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-ARCH-001:`docs/user/skills/architect-feature.md` 和 `docs/user/skills/architect-feature.zh.md` 存在,各含四个 mattpocock 节标题(`## What it does`、`## When to reach for it`、`## Common questions`、`## It's working if`)。[surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-CHECK-001:对两份新增、两份更新的英文页各跑 `docs confirm` 后,`node lib/cli.js docs check --cwd .` 对受影响的 Skill 文档报 0 required 和 0 recommended issue。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-SCAN-001:本 Spec 落地后,`node lib/cli.js scan --cwd .` 报 0 required issue。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001:改动后,所有 199 条 host 测试继续通过。[surface=cli; moment=terminal; evidence=contract-integration]

## 验证

- AC-GRILL-DESC-001:命令 `grep -E "auto-fire|new Feature|architectural boundaries|over-budget Spec|decompose" skills/grill-spec/SKILL.md` [surface=repository; moment=static; evidence=static-unit]
- AC-GRILL-BODY-001:命令 `git diff skills/grill-spec/SKILL.md` 显示自子 Spec B 发布以来只有 `description:` 行变更。[surface=repository; moment=static; evidence=static-unit]
- AC-GRILL-FLAG-001:命令 `grep -E "user-invocable|disable-model-invocation" skills/grill-spec/SKILL.md` 显示 `user-invocable: true`(或两 flag 都缺省让默认生效),且无 `disable-model-invocation: true`。[surface=repository; moment=static; evidence=static-unit]
- AC-ARCH-FILE-001:命令 `test -f skills/architect-feature/SKILL.md` [surface=repository; moment=static; evidence=static-unit]
- AC-ARCH-DESC-001:命令 `grep -E "auto-fire|module boundary|implementation module|decompos" skills/architect-feature/SKILL.md` [surface=repository; moment=static; evidence=static-unit]
- AC-ARCH-FLAG-001:命令 `grep -E "disable-model-invocation: true|user-invocable: false" skills/architect-feature/SKILL.md` 返回无匹配。[surface=repository; moment=static; evidence=static-unit]
- AC-ARCH-NO-BACKING-001:命令 `grep -E "architectFeature" lib/skills/backing-modules.js` 返回无匹配。[surface=repository; moment=static; evidence=static-unit]
- AC-LOADER-COUNT-001:命令 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/skills-loader.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-GRILL-TEST-001:命令 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/skills/grill-spec.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-ARCH-TEST-001:命令 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/skills/architect-feature.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-DOCS-GRILL-001:命令 `grep -E "auto-fire|new Feature|architectural boundaries|over-budget Spec|modelInvocable|userInvocable" docs/user/skills/grill-spec.md docs/user/skills/grill-spec.zh.md` [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-ARCH-001:命令 `test -f docs/user/skills/architect-feature.md && test -f docs/user/skills/architect-feature.zh.md && grep -E "## What it does|## When to reach for it|## Common questions|## It's working if" docs/user/skills/architect-feature.md` [surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-CHECK-001:命令 `node lib/cli.js docs check --cwd .`,在每份受影响页跑 `design-blueprint docs confirm` 之后。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-SCAN-001:命令 `node lib/cli.js scan --cwd .` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001:命令 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js" "tests/**/*.test.js"` [surface=cli; moment=terminal; evidence=contract-integration]

## 风险

- 自动触发 `description` 字段是启发式的:一个足够长或噪杂的上下文可能在开发者并不打算做设计时触发 `grill-spec` 或 `architect-feature`。Skill body 写得保守——先读,后提议,绝不未经开发者显式确认调用 `blueprint_dispatch refine`。误报的代价是多一次提示;漏报的代价是开发者错过设计助手。
- `architect-feature` 没有 backing module,所以行为依赖模型对 Skill body 的解释。模型未来的回归可能让 Skill 输出静默退化。`tests/skills/architect-feature.test.js` 静态测试守护 frontmatter 和 body 内容漂移,但守不住模型行为。"It's working if" 文档 bullet 陈述可见信号,让开发者察觉退化。
- 改写 `grill-spec` 的 `description` 让子 Spec B 的审批记录对该 Skill body 字段的覆盖失效。子 Spec B 的审批覆盖 Skill bundle 形状,而不是任何单条 `description:` 措辞。同时读两份 Spec 的审核者会看到子 Spec D 对子 Spec B 的差异是有意窄而加性的(一行)。
- `architect-feature` body 里的五模块族分组假设 orphan spec 列出的 `lib/` 文件确实映射到那些族。如果未来 Spec 把 `lib/docs.js` 从 artifact I/O 移走,或把 `lib/index.js` 在 surface 和 plugin entry 之间拆开,Skill body 必须更新。body 内容测试(`AC-ARCH-TEST-001`)守住族名,但守不住族组成;模块布局变化时需要显式人工审核。

## 需求

### REQ-GRILL-DESC-1 — `grill-spec` 的 description 覆盖四种自动触发上下文

`skills/grill-spec/SKILL.md` frontmatter `description:` 含 "auto-fire" 并引用四种上下文中至少三种(新 Feature 设计、架构边界、超预算 Spec 分解、"plan first" 问题)。Body 保留现有四道门访谈逻辑。`user-invocable: true`(或默认)被保留;不添加 `disable-model-invocation: true`。

### REQ-ARCH-1 — 新 `architect-feature` SKILL.md

`skills/architect-feature/SKILL.md` 存在,frontmatter 合法。`description:` 含 "auto-fire" 加上四种触发上下文中至少两种(决定模块边界、分解 Spec、按实现模块命名子 Spec、提出新 Feature 层级)。Body 命名读路径(`.blueprint/features/<parent-id>.md`、当前 active proposed Spec、`.blueprint/features/<parent-id>.children/**`)和五个实现模块族(artifact I/O、refinement engine、truth & verification、surface & plugin entry、用户面文档)。

### REQ-ARCH-2 — 调用策略同时支持模型和用户触发

`architect-feature` 不带 `disable-model-invocation` 标志(默认 `modelInvocable = true`),不带 `user-invocable: false` 标志(默认 `userInvocable = true`)。两个面都启用。

### REQ-ARCH-3 — 不带 backing module 函数

`lib/skills/backing-modules.js` 不新增 `architectFeature` 导出。Skill body 是唯一契约。模型通过 DSH 读工具直接读仓库文件。

### REQ-LOADER-1 — Loader 自动识别新 Skill

`lib/skills/loader.js` 不变。本 Spec 落地后,`loadBundledSkills({ pluginRoot })` 返回六个候选。现有五候选测试被替换为六候选测试。

### REQ-DOCS-1 — 每 Skill 文档已更新或新增

`docs/user/skills/grill-spec.md` 和 `docs/user/skills/grill-spec.zh.md` 在 "When to reach for it" 下各加一段,列出至少三种自动触发上下文,在 "It's working if" 下加一条新 bullet 标明调用策略。`docs/user/skills/architect-feature.md` 和 `docs/user/skills/architect-feature.zh.md` 按 mattpocock 模板创建。每份跑完 `docs confirm` 后,`docs check` 对受影响页报 0 required 和 0 recommended issue。

### REQ-TESTS-1 — Skill 测试覆盖 frontmatter 和 body 内容

`tests/skills/grill-spec.test.js` 加一条断言,改写后的 `description:` 含 "auto-fire" 且仍断言四道门访谈关键词。`tests/skills/architect-feature.test.js` 被创建,断言 frontmatter(`name`、`description`、无 `disable-model-invocation`)加上 body 内容(五个模块族名和读路径正则)。`tests/skills-loader.test.js` 把五候选断言替换为六候选断言。

## 场景

[scenario=grill-spec-auto-fires-on-design]
给定开发者在 DSH chat 里贴入 "I want to add a new Feature for spec deprecation. What's the architecture?",
当 DSH Skills runtime 评估 Skill 目录时,
那么 `grill-spec` 的 `description:` 匹配上下文,Skill 自动触发而无需开发者敲 `/grill-spec`。

[scenario=architect-feature-proposes-module-decomposition]
给定开发者贴入一份超预算 Spec(Scope > 8 paths)并问 "how should I split this?",
当 `architect-feature` 自动触发,
那么 Skill body 指示模型读 `.blueprint/features/<parent>.md` 加 Spec,
而且模型提议每个实现模块族一个子 Spec,每个 Scope ≤ 8 paths,
而且模型输出一份 Markdown 预览,开发者可以接受、修改或拒绝。

[scenario=grill-spec-body-unchanged]
给定子 Spec B 发布版本的 `skills/grill-spec/SKILL.md`,
当本 Spec 落地时,
那么 `git diff skills/grill-spec/SKILL.md` 只显示 `description:` 行变更;四道门访谈 body 字节相同。

[scenario=architect-feature-no-backing-module]
给定子 Spec B 之后的 `lib/skills/backing-modules.js`,
当本 Spec 落地时,
那么文件不新增 `architectFeature` 导出;Skill body 是唯一契约。

[scenario=loader-counts-six-after-this-spec]
给定插件源码树包含六份有效 `skills/<name>/SKILL.md` 文件(现有5 份加 `architect-feature`),
当 `loadBundledSkills({ pluginRoot })` 跑起来,
那么结果含六个候选,name 分别为 `decompose-spec`、`todo-status`、`verify-feature`、`grill-spec`、`handoff-spec`、`architect-feature`。

[scenario=docs-check-clean-after-confirm]
给定四份更新或新增的 `docs/user/skills/<name>.{md,zh.md}` 页面以及它们的 `docs confirm` 记录,
当 `node lib/cli.js docs check --cwd .` 跑起来,
那么输出对受影响的 Skill 文档报 0 required 和 0 recommended issue。

## 假设

1. `lib/skills/loader.js` 启动时走 `skills/` 一层深(子 Spec A)。新 `skills/architect-feature/SKILL.md` 被同一 walker 自动拾取,无需 loader 改动。
2. `architect-feature` body 里硬编码的五个模块族足够稳定。如果未来 Spec 移动 `lib/docs.js` 或拆分 `lib/index.js`,Skill body 必须更新;本 Spec 信任当前的模块布局。
3. DSH 读工具(模型在 Skill body 内能读仓库文件)在已验证的 DSH release 线上保持稳定。如果未来 DSH 版本从 Skill body 上下文移除文件读访问,`architect-feature` 会静默退化;Skill 的 "It's working if" bullet 仍会显现退化,因为开发者会停止收到建议。
4. Skill body 是纯 Markdown;DSH 在 `<skill_content>` 块内渲染。无需 HTML 或特殊字符。
5. `docs confirm` 记录内容身份,不记录翻译质量。开发者或具备能力的 AI 在 `docs confirm` 跑之前审核语义等价。

## 非目标

- 为 `architect-feature` 添加 backing module 函数。Skill body 是契约。
- 从 `architect-feature` 调用 `blueprint_dispatch refine`、`lib/spec-decomposition.js#evaluateSpec` 或任何其他库函数。Skill 输出提议;开发者决定是否调用完善。
- 修改除 `grill-spec` 的 `description:` 行外的任何现有 5 个 Skill。`decompose-spec`、`todo-status`、`verify-feature`、`handoff-spec` 在本 Spec 后字节不变。
- 添加 `agents/openai.yaml` 配套文件。DSH 不读它们;运行时调用策略在代码中声明。
- 更新 `docs/user/features/agent-interface--skills-layer.{md,zh.md,i18n.yaml}`。Feature brief 在后续 Spec 中加子 Spec D 的 `## Verified current behavior` 子节,那个 Spec 负责该路径。
- 翻译现有术语表之外的 per-Skill 文档。中文页用项目现有翻译术语库。
- 重排 Skill 目录。loader 按 `skills/` 目录序迭代;`architect-feature` 出现在它出现的位置。
- 修改 `.out-of-scope/skills-not-rpc.md`。该规则("a Skill never chains another Skill through the Skills registry")已覆盖新 Skill 的行为。

## 考虑过的替代方案

**添加 `lib/skills/backing-modules.js#architectFeature` 函数,返回占位提议。** 拒绝,因为占位只在模型读完父 Feature brief 和 active Spec 之后才有意义——而这正是 Skill body 已经指示模型做的事。函数要么复制读逻辑,要么返回非承诺值。添加它只会增加代码,不增加可测行为。

**在 `architect-feature` 里复用 `lib/spec-decomposition.js#evaluateSpec`。** 拒绝,因为 `evaluateSpec` 报告 Spec 是否超预算;它不提议分解。串它会让 `architect-feature` 成为校验器的薄壳,且校验器输出是违规清单,不是建议。`evaluateSpec` 由 `decompose-spec` 独立可达,`decompose-spec` 仍独立自动触发。

**让 `architect-feature` 直接写提议的子 Spec 文件。** 拒绝,因为写文件越过"Skills 不是 RPC"边界;`architect-feature` 必须保持读和提议,文件由开发者移动。写属于 `blueprint_dispatch` 或实现 Agent。

**只更新 `grill-spec` 的 description、跳过新增 `architect-feature` Skill。** 拒绝,因为用户的产品意图是让两个 Skill 在设计活动时自动触发。`grill-spec` 单独覆盖细化前的问题;`architect-feature` 覆盖更上层的"这个 Spec 应该拆吗?"问题。两个 Skill body 不重叠,互补。

**让 `architect-feature` 仅用户触发(`disable-model-invocation: true`)。** 拒绝,因为用户的产品意图是设计时助手自动触发。`user-invocable` 标志保留默认 `true`;两个面都启用。

## 任务

1. 重写 `skills/grill-spec/SKILL.md` 的 `description:` 行,使其覆盖四种自动触发上下文(新 Feature、架构边界、超预算 Spec、"plan first" 问题)。body 保持字节相同。REQ:REQ-GRILL-DESC-1。Scope:`skills/grill-spec/SKILL.md`。AC:AC-GRILL-DESC-001、AC-GRILL-BODY-001、AC-GRILL-FLAG-001。
2. 编写 `skills/architect-feature/SKILL.md`,按 REQ-ARCH-1 和 REQ-ARCH-2 描述的 frontmatter 和 body。REQ:REQ-ARCH-1、REQ-ARCH-2、REQ-ARCH-3。Scope:`skills/architect-feature/SKILL.md`。AC:AC-ARCH-FILE-001、AC-ARCH-DESC-001、AC-ARCH-FLAG-001、AC-ARCH-NO-BACKING-001。
3. 扩展 `tests/skills/grill-spec.test.js`,增加一条断言,`description:` 含 "auto-fire" 加四道门访谈关键词。REQ:REQ-TESTS-1。Scope:`tests/skills/grill-spec.test.js`。AC:AC-GRILL-TEST-001。
4. 编写 `tests/skills/architect-feature.test.js`,frontmatter 检查加 body 内容正则,匹配五个模块族和 `.blueprint/features/.*\\.md` 读路径。REQ:REQ-TESTS-1。Scope:`tests/skills/architect-feature.test.js`。AC:AC-ARCH-TEST-001。
5. 替换 `tests/skills-loader.test.js` 中现有五候选断言为六候选断言。REQ:REQ-LOADER-1。Scope:`tests/skills-loader.test.js`。AC:AC-LOADER-COUNT-001。
6. 修补 `docs/user/skills/grill-spec.md` 和 `docs/user/skills/grill-spec.zh.md`,在 "When to reach for it" 下加一段,列出至少三种自动触发上下文,在 "It's working if" 下加一条新 bullet,标明 `modelInvocable: true` 和 `userInvocable: true`。REQ:REQ-DOCS-1。Scope:`docs/user/skills/grill-spec.md`、`docs/user/skills/grill-spec.zh.md`。AC:AC-DOCS-GRILL-001。
7. 按 mattpocock 模板编写 `docs/user/skills/architect-feature.md` 和 `docs/user/skills/architect-feature.zh.md`。REQ:REQ-DOCS-1。Scope:`docs/user/skills/architect-feature.md`、`docs/user/skills/architect-feature.zh.md`。AC:AC-DOCS-ARCH-001。
8. 对每份受影响的四份页面跑 `design-blueprint docs confirm <page>.md`。REQ:REQ-DOCS-1。Scope:`docs/user/skills/<name>.i18n.yaml`(由框架创建,非手写)。AC:AC-DOCS-CHECK-001。
9. 跑 `node lib/cli.js scan --cwd .`、`node lib/cli.js docs check --cwd .`,以及完整 host 测试套件。REQ:全部。Scope:-。AC:AC-DOCS-CHECK-001、AC-SCAN-001、AC-REGRESSION-001。

## 生命周期

- Status: proposed
- 批准后的目标状态:implemented(文件移至 `.specs/implemented/agent-interface--skills-design-time.md`)

## 事实变化

新增事实:
- `skills/architect-feature/SKILL.md` 存在,带 REQ-ARCH-1 和 REQ-ARCH-2 描述的 frontmatter 和 body。
- `tests/skills/architect-feature.test.js` 存在,断言新 Skill 的 frontmatter 和 body 内容。
- `docs/user/skills/architect-feature.{md,zh.md}` 存在,带 mattpocock 模板小节,过 `docs check`。
- 本 Spec 落地后,`lib/skills.js` 注册六个候选而不是五个。

保留事实:
- 五个现有 Skill(`decompose-spec`、`todo-status`、`verify-feature`、`handoff-spec`)在本 Spec 后字节不变。
- `grill-spec` 的 body(四道门访谈逻辑)字节不变;只改 `description:` 行。
- `lib/skills/backing-modules.js` 不变;不新增函数。
- `lib/skills/loader.js` 不变;新 Skill 被自动拾取。
- `.out-of-scope/skills-not-rpc.md` 规则保留;`architect-feature` 直接读文件,输出建议,不调用其他 Skill。
- `blueprint_dispatch refine` 保持为权威 Spec 生命周期工具;`architect-feature` 提议,开发者调用完善。

## 可追溯性

REQ-GRILL-DESC-1 → scenario[grill-spec-auto-fires-on-design]、[grill-spec-body-unchanged] → task 1 → AC-GRILL-DESC-001、AC-GRILL-BODY-001、AC-GRILL-FLAG-001 → verification grep + git diff
REQ-ARCH-1 → scenario[architect-feature-proposes-module-decomposition] → task 2 → AC-ARCH-FILE-001、AC-ARCH-DESC-001 → verification test -f + grep
REQ-ARCH-2 → scenario[architect-feature-proposes-module-decomposition] → task 2 → AC-ARCH-FLAG-001 → verification grep flags
REQ-ARCH-3 → scenario[architect-feature-no-backing-module] → task 2 → AC-ARCH-NO-BACKING-001 → verification grep backing module
REQ-LOADER-1 → scenario[loader-counts-six-after-this-spec] → task 5 → AC-LOADER-COUNT-001 → verification tests/skills-loader.test.js
REQ-DOCS-1 → scenario[docs-check-clean-after-confirm] → task 6、7、8 → AC-DOCS-GRILL-001、AC-DOCS-ARCH-001、AC-DOCS-CHECK-001 → verification grep + docs check
REQ-TESTS-1 → scenario[grill-spec-auto-fires-on-design]、[architect-feature-proposes-module-decomposition] → task 3、4 → AC-GRILL-TEST-001、AC-ARCH-TEST-001 → verification tests/skills/<name>.test.js

## 未决决策

无。五个实质问题已解决:`grill-spec` description 改写(body 不变)、`architect-feature` Skill 创建但无 backing module、调用策略同时支持模型和用户触发、loader 不变、文档按现有 mattpocock 模板。

## 质量自检

- 需求完整:是(7 个 REQ,覆盖 grill-spec description、architect-feature Skill、调用策略、无 backing module、loader 计数、文档、测试)
- 需求无歧义:是(每个 REQ 命名文件与契约)
- 需求有边界:是(单一 Feature 子 Spec D;9 个允许路径;无新库代码;无新依赖)
- 需求能感知失败:是(loader 保持空 bundle 行为;Skill body 不抛错;`architect-feature` 在读工具不可用时静默退化,但开发者仍能观察到缺少建议)
- 需求可测:是(每个 AC 映射到验证命令或测试)
- 需求无矛盾:是(没有 AC 同时说"重写"和"保留"同一行;`grill-spec` body 保留、description 重写,分开命名)

## 跨工件分析

- 需求到场景:是(7 个 REQ 覆盖 6 个场景)
- 需求到影响:是(7 个 REQ 映射到 ## Scope 一个或多个文件)
- 需求到任务:是(每个任务列出 REQ)
- 需求到验收:是(每个 AC 注明 REQ)
- 需求到验证:是(每个 AC 注明验证命令或测试)
- 任务到范围:是(每个任务命名 Scope 路径)
- 设计到范围:不适用(designRequired: false;本 Spec 改一行 description 加一份新 Skill 文件)
- 范围到路径:是(每个 Scope 路径对应真实路径;无虚构路径)

## 结果

Blueprint 已通过与需求关联的验收自动完成本次交付。

- 验收快照：`git-index:047e45f6e5e7381e113f83efc5aa71f0190bbdf7a592fa637e03ff27bbe0b443`
- 验收尝试：`attempt-2`
- 结论：Skills sub-spec D lands. grill-spec description rewritten for auto-fire. New architect-feature Skill. Loader unchanged. Bundle 5 to 6 candidates. docs updated. All 206 host tests pass; scan 0 required / 0 recommended; docs check 17/17 confirmed.
- AC 证据：15 项全部通过。
- 检查证据：grill-spec-description（inspection）、grill-spec-body（inspection）、grill-spec-flag（inspection）、arch-file（inspection）、arch-desc（inspection）、arch-flag（inspection）、arch-no-backing（inspection）、loader（command）、grill-test（command）、arch-test（command）、docs-grill（inspection）、docs-arch（inspection）、docs-check（command）、scan（command）、full-test（command）。
