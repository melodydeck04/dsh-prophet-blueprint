# Spec: Skills 内容与 CLI(agent-interface--skills-layer,子 Spec B)

Status: proposed
Feature: agent-interface--skills-layer
Parent: spec-governance--architecture-design
Companion: agent-interface--skills-layer(子 Spec A,已实现)、agent-interface--skills-conventions(子 Spec C)

## 问题

子 Spec A 发布了一个 Skills loader,启动时读 `skills/<name>/SKILL.md` 文件并注册到 `ctx.skills`。Loader 在有 5 个文件时返回 5 个候选,在 `skills/` 为空时返回 0。今天 bundle 是空的:绑定了本插件的开发者启动 DSH 后看不到任何 Skill,自动触发逻辑没有东西可触发,人也没法在终端里查看 bundle 会暴露什么。在 AI 有东西可调用之前,五个具体 Skill(`decompose-spec`、`todo-status`、`verify-feature`、`grill-spec`、`handoff-spec`)必须先有;一个面向人的 CLI 子命令也得有,这样开发者不用在聊天框里打 `/<name>` 就能从终端审核 bundle。

## 范围

### 允许路径

- allow: `skills/**`
- allow: `lib/skills/backing-modules.js`
- allow: `lib/skills/cli.js`
- allow: `lib/index.js`
- allow: `lib/cli.js`
- allow: `tests/skills-loader.test.js`
- allow: `tests/skills/*.test.js`
- allow: `tests/skills-cli.test.js`
- allow: `tests/plugin.test.js`
- allow: `package.json`

### 拒绝路径

- deny: `lib/spec-decomposition.js`
- deny: `lib/spec-todos.js`
- deny: `lib/todo-events.js`
- deny: `lib/verification.js`
- deny: `lib/orchestration.js`
- deny: `lib/scan.js`
- deny: `lib/specs.js`
- deny: `lib/policy.js`
- deny: `lib/config.js`
- deny: `lib/features.js`
- deny: `lib/architecture.js`
- deny: `lib/artifacts.js`
- deny: `lib/reconciliation.js`
- deny: `lib/snapshot.js`
- deny: `lib/project-binding.js`
- deny: `lib/version.js`
- deny: `lib/stamps.js`
- deny: `lib/path-utils.js`
- deny: `lib/docs.js`
- deny: `lib/init.js`
- deny: `lib/project-root.js`
- deny: `lib/project-discovery.js`
- deny: `lib/invariant.js`
- deny: `lib/web-api.js`
- deny: `lib/client.js`
- deny: `lib/workflow.js`
- deny: `lib/chat-commands.js`
- deny: `lib/assistant-actions.js`
- deny: `lib/todo-store.js`
- deny: `lib/install-hook.js`
- deny: `lib/skills.js`
- deny: `lib/skills/loader.js`
- deny: `lib/skills/frontmatter.js`
- deny: `.adr/**`
- deny: `.out-of-scope/**`
- deny: `CONTEXT.md`
- deny: `.blueprint/**`
- deny: `.specs/**` 除本 Spec 对之外
- deny: `docs/user/skills/**`
- deny: `docs/user/features/agent-interface--skills-layer.**`
- deny: `docs/i18n/**`
- deny: `docs/AGENTS.md`
- deny: `design-blueprint.json` default or authority sections
- deny: `AGENTS.md`
- deny: `README.md`
- deny: `README.zh.md`
- deny: `README.i18n.yaml`
- deny: `cordis.patch.yml`
- deny: `.claude-plugin/**`

## 决策

### 五份打包 Skill

每份 Skill 是 `skills/<name>/SKILL.md` 文件。Frontmatter 含 `name`、`description` 和可选的 `disable-model-invocation` / `user-invocable` 布尔值(DSH 原生 schema)。正文含自动触发的触发语,以及模型要遵循的命令式指令。

| Skill | 触发方式 | 一句话正文 |
|---|---|---|
| `decompose-spec` | model-invoked | 在引用的 Spec 上跑 `evaluateSpec`,返回 `{ ok, violations, suggestion }`。不写盘。 |
| `todo-status` | model-invoked | 加载引用 Spec 的 `.todos.yaml` 和最近的 `task/done` 事件;返回 TODO 表加 segment 字节数。不写盘。 |
| `verify-feature` | user-invoked | 对一个 Feature id 跑 `startFeatureVerification` → `submitFeatureVerificationResult` → `complete`;返回 AC 通过/失败。写一条 verification 记录。 |
| `grill-spec` | user-invoked | 跑四道门访谈(默认值、持久性、表面、Scope、风险);在每道门没解决或跳过之前拒绝调用 `blueprint_dispatch refine`。 |
| `handoff-spec` | user-invoked | 把引用 Spec 的生命周期状态渲染成可移植的 Markdown 摘要,写到 `os.tmpdir()`。 |

### Backing 模块

`lib/skills/backing-modules.js` 暴露五个纯函数,在运行时给 Skill 正文调用:`decomposeSpec(specPath, config)`、`todoStatus(specPath, sessionPath)`、`verifyFeature(featureId)`、`grillSpecInterview(specPath, answers)`、`writeHandoffDoc(specPath)`。前三个从已有模块再导出(`lib/spec-decomposition.js#evaluateSpec`、`lib/spec-todos.js#loadTodosForSpec`、verification orchestration)。后两个是新纯函数;`writeHandoffDoc` 写到 `os.tmpdir()`,用 `lib/todo-events.js#locateSessionPath` 做 segment 查找。

### CLI 子命令

`lib/skills/cli.js` 导出 `runSkillsCommand(args, cwd)`,把 `list`、`show <name>`、`info <name>` 分派到启动时使用的同一个 loader。`lib/cli.js` 在它的命令表面注册这个子命令(一行 `import` 加一个注册项),这样人类操作员能跑 `design-blueprint skills list` 而不用写斜杠命令。子命令是信息性的,不是权威的:它从来不写盘。

### 插件导出表面

`package.json` 在 `files` 里加 `skills/**`,这样 bundle 跟插件一起发布;在 `exports` 里加 `./skills/*` 和 `./skills/<name>` 项,这样消费者可以编程式地 import 正文。`lint:js` 脚本加上新的 `lib/skills/cli.js` 和 `lib/skills/backing-modules.js` 文件。

### 空 bundle 行为保留

当未来的开发者删掉一份 Skill 文件时,loader 少返回一个候选。`skills list` 在下一次 CLI 调用时立即反映这一点。

## 验收条件

- AC-SKILL-001:`skills/decompose-spec/SKILL.md` 存在,frontmatter 含 `name: decompose-spec`、`description: <text>`、`disable-model-invocation: true`,正文引用 `lib/skills/backing-modules.js#decomposeSpec`。[surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-002:`skills/todo-status/SKILL.md` 存在,frontmatter 含 `name: todo-status`、`description: <text>`、`disable-model-invocation: true`,正文引用 `lib/skills/backing-modules.js#todoStatus`。[surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-003:`skills/verify-feature/SKILL.md` 存在,frontmatter 含 `name: verify-feature`、`user-invocable: true`,正文引用 `lib/skills/backing-modules.js#verifyFeature`。[surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-004:`skills/grill-spec/SKILL.md` 存在,frontmatter 含 `name: grill-spec`、`user-invocable: true`,正文引用 `lib/skills/backing-modules.js#grillSpecInterview`。[surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-005:`skills/handoff-spec/SKILL.md` 存在,frontmatter 含 `name: handoff-spec`、`user-invocable: true`,正文引用 `lib/skills/backing-modules.js#writeHandoffDoc`。[surface=repository; moment=static; evidence=static-unit]
- AC-CLI-001:`node lib/cli.js skills list` 退出码 0,打印一个 Markdown 表,其 `name` 列包含全部 5 个 Skill 名。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-CLI-002:`node lib/cli.js skills show decompose-spec` 打印带行号的 SKILL.md 正文(或者当文件含嵌入 NUL 字节时,在没加 `--json` 的情况下拒绝,与 `spec show` 一致)。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-CLI-003:`node lib/cli.js skills info decompose-spec` 打印 `modelInvocable: false` 和 `userInvocable: true` 加 backing module 的解析路径。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-PKG-001:`package.json#files` 含 `skills/**`。`package.json#exports` 含 `./skills/*` 和 `./skills/<name>` 项。`package.json#lint:js` 包含新文件。[surface=repository; moment=static; evidence=static-unit]
- AC-REGISTER-001:本 Spec 落地后,`node lib/cli.js scan --cwd .` 报告 0 required issues,loader 注册 5 个候选(通过 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/skills-loader.test.js` 验证,该测试增加一条断言 bundle 有 5 个候选)。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001:改动后,所有现有 173 条 host 测试继续通过。[surface=cli; moment=terminal; evidence=contract-integration]

## 验证

- AC-SKILL-001:命令 `test -f skills/decompose-spec/SKILL.md` [surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-002:命令 `test -f skills/todo-status/SKILL.md` [surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-003:命令 `test -f skills/verify-feature/SKILL.md` [surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-004:命令 `test -f skills/grill-spec/SKILL.md` [surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-005:命令 `test -f skills/handoff-spec/SKILL.md` [surface=repository; moment=static; evidence=static-unit]
- AC-CLI-001:命令 `node lib/cli.js skills list` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-CLI-002:命令 `node lib/cli.js skills show decompose-spec` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-CLI-003:命令 `node lib/cli.js skills info decompose-spec` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-PKG-001:命令 `node -e "import('./package.json', { with: { type: 'json' } }).then(p => assert(p.default.files.includes('skills/**')))"` [surface=repository; moment=static; evidence=static-unit]
- AC-REGISTER-001:命令 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/skills-loader.test.js` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001:命令 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js" "tests/**/*.test.js"` [surface=cli; moment=terminal; evidence=contract-integration]

## 风险

- Skill 正文是模型唯一能看到的表面;一份坏掉的 Skill 会让代理误派工作。每份 Skill 正文手工写,用 `tests/skills/<name>.test.js` 测试,断言正文含预期的命令式指令。
- `writeHandoffDoc` 写 `os.tmpdir()`,在硬化系统上可能被拒。路径通过 `lib/todo-events.js#locateSessionPath` 捕获,它已经处理沙箱情况,失败时绕路到 `.blueprint-test-tmp`。
- `verifyFeature` 写 verification 记录。对同一 Feature 调用两次,第二次是 no-op(framework 的 verification flow 在 active cycle 上幂等)。Skill 正文里写明这点,让模型不会无谓重试。
- CLI 子命令只是信息性的;靠它做状态变更的人会读到旧数据。Skill 正文和 brief 告诉人,任何权威操作都用规范命令。

## 需求

### REQ-SKILL-1 — 五份 SKILL.md 文件带合法 frontmatter

每份 Skill 文件位于 `skills/<name>/SKILL.md`,带 `name`(kebab-case)、`description`(非空)和明确的 invocation policy。这五份文件在本 Spec 落地后存在,并在 `design-blueprint scan --cwd .` 中不报警告。

### REQ-SKILL-2 — Model-invoked Skills 从用户目录消失

`decompose-spec` 和 `todo-status` 带 `disable-model-invocation: true`,所以它们出现在模型侧目录,但不出现在用户斜杠命令菜单里。

### REQ-SKILL-3 — User-invoked Skills 留在模型目录之外

`verify-feature`、`grill-spec`、`handoff-spec` 带 `user-invocable: true`(且不带 `disable-model-invocation`),所以它们出现在用户菜单里,只能由人显式键入触发,不会自动触发。

### REQ-CLI-1 — CLI 子命令分派到 loader

`design-blueprint skills <list|show|info>` 在 `lib/cli.js` 上注册。`list` 打印 Markdown 表。`show <name>` 打印带行号的 SKILL.md 正文,除非加 `--json`。`info <name>` 打印 invocation policy 加 backing module 的解析路径。

### REQ-CLI-2 — CLI 子命令只读

CLI 子命令从来不写盘。它复用子 Spec A 的 `loadBundledSkills`。没有 CLI flag 改状态。

### REQ-PKG-1 — Skills 跟插件一起发布

`package.json#files` 含 `skills/**`。`package.json#exports` 加 `./skills/*` 和一个按名条目。`package.json#lint:js` 含新的 Skill 代码。

### REQ-LOADER-1 — 本 Spec 落地后 loader 注册 5 个候选

`lib/skills.js` 在启动时读 `skills/`。本 Spec 落地后,staged 的 `skills/` 目录含 5 个 Skill 目录,loader 向 `provider.list()` 返回 5 个候选。

## 场景

[scenario=loader-registers-five-skills]
Given staged 插件源代码树含 5 份合法 `skills/<name>/SKILL.md` 文件,
When `lib/skills.js` 跑 `loadBundledSkills({ pluginRoot })`,
Then 结果含 5 个 Skill,名分别为 `decompose-spec`、`todo-status`、`verify-feature`、`grill-spec`、`handoff-spec`。

[scenario=cli-list-shows-five-rows]
Given 插件源代码树含 5 份打包 Skill,
When `node lib/cli.js skills list` 跑,
Then stdout 含一个 Markdown 表,其 `name` 列列出这 5 个 Skill,其 `model-invocable` 列对 `decompose-spec` 和 `todo-status` 显示 `false`,对其余三个显示 `true`。

[scenario=cli-show-prints-body]
Given `skills/decompose-spec/SKILL.md` 存在,
When `node lib/cli.js skills show decompose-spec` 跑,
Then stdout 含带行号的 Skill 正文,frontmatter 在顶部。

[scenario=cli-info-shows-policy]
Given Skill `decompose-spec` 的 frontmatter 是 `disable-model-invocation: true`,
When `node lib/cli.js skills info decompose-spec` 跑,
Then stdout 打印 `modelInvocable: false` 和 `userInvocable: true` 加 `lib/skills/backing-modules.js` 的解析路径。

[scenario=package-skills-ship]
Given `package.json#files` 含 `skills/**`,
When `npm pack` 跑(或任何从 `npm install` 取插件的消费者),
Then 产物 tarball 含 5 份 `skills/<name>/SKILL.md`。

[scenario=bundle-has-five-candidates-after-this-spec]
Given `lib/skills.js` 对 Spec 后的树跑,
When `provider.list()` resolve,
Then 数组长度 5,每个名匹配这 5 个 Skill 名之一。

## 假设

1. `lib/cli.js` 可以扩展以注册新 `skills` 子命令而不改现有 CLI 表面(改动是一行 `import` 加一条 `commands` 数组项)。
2. 现存的 `lib/spec-decomposition.js#evaluateSpec`、`lib/spec-todos.js#loadTodosForSpec`、`lib/todo-events.js#recentTaskDoneEvents`、`lib/verification.js#startFeatureVerification` / `submitFeatureVerificationResult`、`lib/orchestration.js#complete` 足够稳定,可以复用而无需再导出;若其中任意一个改了,Skill 正文就坏,那就坏了 Spec。
3. `writeHandoffDoc` 的 `os.tmpdir()` 路径在 DSH Web profile 下可写;test harness 用 `lib/todo-events.js#locateSessionPath`,被拒绝时已绕路到可写目录。
4. Skill 正文是纯 Markdown;DSH 在 `<skill_content>` 块里渲染它。无需 HTML 或特殊字符。

## 非目标

- 替换 `blueprint_dispatch` 作为权威的 Spec lifecycle 工具。Skills 是一层薄而窄的操作。
- 加 `agents/openai.yaml` 伴随文件。DSH 不读它们;运行时的 invocation 策略在代码里声明。
- 给每个 Skill 写一份人读的 docs 页。子 Spec C 拥有 `docs/user/skills/<name>.{md,zh.md}`。
- 替换 `lib/init.js` 写的项目级 Skills。它们是另一层;本 Spec 把新 Skills 打包在它们旁边。
- 加改状态的 CLI flag。Skills 子命令是信息性的。

## 备选方案

**把 Skills 绑在 Cordis 子插件下,而不是 loader 的 `skills/` walk。** 拒绝:loader 已经在走 `skills/`,注册路径定了;再开一个 mount 会把目录拆到两个 provider。

**把 `verify-feature` 设为 model-invoked。** 拒绝:verification 会写 `.blueprint/verifications/<feature-id>.json`;model-invoked 的 Skill 可能在没有人类显式批准时触发。user-invoked 不变量保留人在回路的检查点。

**只对带 approved Spec 的 Feature 跑 `verify-feature`。** 拒绝:verification flow 已经对没有 approved Spec 的 Feature 拒绝(framework 的 `startFeatureVerification` 抛错)。在 Skill 正文里写明就够。

## 任务

1. Author `skills/decompose-spec/SKILL.md`、`skills/todo-status/SKILL.md`、`skills/verify-feature/SKILL.md`、`skills/grill-spec/SKILL.md`、`skills/handoff-spec/SKILL.md`。REQ:REQ-SKILL-1、REQ-SKILL-2、REQ-SKILL-3。Scope:`skills/**`。AC:AC-SKILL-001 至 AC-SKILL-005。
2. Author `lib/skills/backing-modules.js`:`decomposeSpec`、`todoStatus`、`verifyFeature`、`grillSpecInterview`、`writeHandoffDoc`。前三个从已有模块再导出;后两个是新纯函数。REQ:REQ-SKILL-1。Scope:`lib/skills/backing-modules.js`。AC:AC-SKILL-001 至 AC-SKILL-005。
3. Author `lib/skills/cli.js`:`runSkillsCommand(args, cwd)`,把 `list|show|info` 分派到 loader。REQ:REQ-CLI-1、REQ-CLI-2。Scope:`lib/skills/cli.js`。AC:AC-CLI-001、AC-CLI-002、AC-CLI-003。
4. 扩展 `lib/cli.js` 注册 `skills` 子命令。REQ:REQ-CLI-1。Scope:`lib/cli.js`。AC:AC-CLI-001、AC-CLI-002、AC-CLI-003。
5. 更新 `package.json`:`files` 加 `skills/**`,`exports` 加 `./skills/*` 和 `./skills/<name>`,`lint:js` 加新文件。REQ:REQ-PKG-1。Scope:`package.json`。AC:AC-PKG-001。
6. 写 `tests/skills/<name>.test.js` 给每个 Skill(断言 frontmatter flags 和正文引用 backing module)。REQ:REQ-SKILL-1、REQ-SKILL-2、REQ-SKILL-3。Scope:`tests/skills/<name>.test.js`。AC:AC-SKILL-001 至 AC-SKILL-005。
7. 写 `tests/skills-cli.test.js` 覆盖 `list`、`show`、`info`。REQ:REQ-CLI-1、REQ-CLI-2。Scope:`tests/skills-cli.test.js`。AC:AC-CLI-001、AC-CLI-002、AC-CLI-003、AC-PKG-001。
8. 扩展 `tests/skills-loader.test.js` 加第 6 条 test,断言 Spec B 后的 bundle 有 5 个候选。REQ:REQ-LOADER-1。Scope:`tests/skills-loader.test.js`。AC:AC-REGISTER-001。
9. 跑 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js" "tests/**/*.test.js"` 和 `node lib/cli.js scan --cwd .`。REQ:all。Scope:-。AC:AC-REGRESSION-001、AC-REGISTER-001。

## Lifecycle

- Status: proposed
- 批准后目标状态:implemented(文件移至 `.specs/implemented/agent-interface--skills-bundled.md`)

## Truth-delta

新增事实:
- 五个 Skill 名各有一份 `skills/<name>/SKILL.md`,通过 `package.json#files` 跟 `npm install` 一起发布。
- `lib/skills/backing-modules.js` 暴露 `decomposeSpec`、`todoStatus`、`verifyFeature`、`grillSpecInterview`、`writeHandoffDoc`。
- `lib/skills/cli.js` 暴露 `runSkillsCommand(args, cwd)`。
- `lib/cli.js` 注册 `skills` 子命令;`design-blueprint skills list|show|info` 工作。
- `package.json` 在 `files` 含 `skills/**`,在 `exports` 含 `./skills/*` 和按名条目,在 `lint:js` 含新文件。
- 本 Spec 落地后,`lib/skills.js` 在 `ctx.skills` 注册 5 个候选。

保留事实:
- 所有现有 CLI 子命令。
- 所有现有测试。
- `lib/init.js` 写的两个项目级 Skills(`blueprint-doc-standards`、`blueprint-translate-docs`)。
- `blueprint_dispatch` 作为权威的 Spec lifecycle 工具。
- 子 Spec A 的 Skills loader 行为不变。

## Traceability

REQ-SKILL-1 -> scenario[loader-registers-five-skills] -> task 1, 2 -> AC-SKILL-001 至 AC-SKILL-005 -> verification tests/skills/<name>.test.js
REQ-SKILL-2 -> scenario[loader-registers-five-skills] -> task 1 -> AC-SKILL-001, AC-SKILL-002 -> verification tests/skills/<name>.test.js
REQ-SKILL-3 -> scenario[loader-registers-five-skills] -> task 1 -> AC-SKILL-003, AC-SKILL-004, AC-SKILL-005 -> verification tests/skills/<name>.test.js
REQ-CLI-1 -> scenario[cli-list-shows-five-rows] -> task 3, 4 -> AC-CLI-001, AC-CLI-002, AC-CLI-003 -> verification tests/skills-cli.test.js
REQ-CLI-2 -> scenario[cli-list-shows-five-rows] -> task 3 -> AC-CLI-001 -> verification tests/skills-cli.test.js
REQ-PKG-1 -> scenario[package-skills-ship] -> task 5 -> AC-PKG-001 -> verification tests/skills-cli.test.js (package.json inspection)
REQ-LOADER-1 -> scenario[bundle-has-five-candidates-after-this-spec] -> task 8 -> AC-REGISTER-001 -> verification tests/skills-loader.test.js (extended)

## Unresolved decisions

无。四个实质问题都定了:Skills 打包在 `skills/<name>/SKILL.md` 下;backing 模块在 `lib/skills/backing-modules.js`;CLI 子命令在 `lib/skills/cli.js`;loader 不变。

## 质量清单(自检)

- requirements complete:yes(7 个 REQ,覆盖 Skills、CLI、package、loader)
- requirements unambiguous:yes(每个 REQ 点名文件和契约)
- requirements bounded:yes(单 Feature 子 Spec B;五个 Skills;无新依赖)
- requirements failure-aware:yes(bundle 为空时 loader 返回空列表;CLI 只读;writeHandoffDoc 用 locateSessionPath)
- requirements testable:yes(每个 AC 指向一条验证命令或测试)
- requirements non-contradictory:yes(没有 AC 同时说"注册"和"跳过"同一条件)

## 跨工件分析

- requirements-to-scenarios:yes(全部 7 个 REQ 被 6 个场景覆盖)
- requirements-to-impact:yes(全部 7 个 REQ 映射到 ## Scope 中的一个或多个文件)
- requirements-to-tasks:yes(每个 task 列 REQ)
- requirements-to-acceptance:yes(每个 AC 点名 REQ)
- requirements-to-verification:yes(每个 AC 点名验证命令或测试)
- tasks-to-scope:yes(每个 task 点名 Scope 路径)
- design-to-scope:不适用(designRequired: false)
- scope-to-paths:yes(每个 Scope 路径对应真实路径)

## Consequences

按 mattpocock 约定,在子 Spec C 落地后记入 `.adr/0001-add-skills-layer.md`。

## 结果

Blueprint 已通过与需求关联的验收自动完成本次交付。

- 验收快照：`git-index:575b0d58935fa1d141979bd109293a00d063cc43d7c4303b6a69699e3e66de08`
- 验收尝试：`attempt-12`
- 结论：Sub-spec B lands the Skills content bundle (5 SKILL.md files) and the CLI subcommand. The host-verification-gate that previously blocked this delivery on filename collision is now satisfied by renaming the proposed Spec pair to agent-interface--skills-bundled.{md,zh.md}. All 199 host tests pass; scan reports 0 required issues.
- AC 证据：11 项全部通过。
- 检查证据：skills-content-repository（inspection）、skills-cli-cli-contract（command）、loader-extended-cli-contract（command）、regression-suite-cli-contract（command）、scan-cli-hygiene（command）。
