# Spec: Skills 加载器(agent-interface--skills-layer,子 Spec A)

Status: proposed
Feature: agent-interface--skills-layer
Parent: spec-governance--architecture-design
Companion: agent-interface--skills-content(子 Spec B)、agent-interface--skills-conventions(子 Spec C)

## 问题

`@dsh-plugins/design-blueprint` 通过一个表面对 AI 代理暴露操作:`blueprint_dispatch` 工具(通过 `ctx.tools` 注册)。代理没有第二个更窄的表面挂在 DSH 原生的 Skills 系统(`ctx.skills`)上,所以"这个 Spec 是否超过分解阈值?"或"这个 Spec 当前的 TODO 状态?"这类窄操作要么自创调用底层库的私有姿势,要么退回到重量级的 `blueprint_dispatch` 工具。两种都不对:前者丢审计,后者耗 token。

DSH 已经给打包 Skills 的插件暴露了 `ctx.skills.registerProvider(...)`(`@deepseek-ai/dsh-skill-badge` 是 53 行参考)。本插件今天一个 Skill 都不注册。本 Spec 加入一个 loader,启动时读 `skills/<name>/SKILL.md` 文件,解析它们的 frontmatter,然后注册到 `ctx.skills`。这是给代理一个 Skills 表面所需的最小改动;Skill 内容、CLI 子命令、文档约定住在后面的同伴 Spec(子 Spec B 和 C)。

## 范围

### 允许路径

- allow: `lib/skills.js`
- allow: `lib/skills/loader.js`
- allow: `lib/skills/frontmatter.js`
- allow: `.blueprint/features/agent-interface--skills-layer.md`
- allow: `.blueprint/architecture/components/agent-interface-skills-layer.md`
- allow: `docs/user/features/agent-interface--skills-layer.md`
- allow: `docs/user/features/agent-interface--skills-layer.zh.md`
- allow: `docs/user/features/agent-interface--skills-layer.i18n.yaml`

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
- deny: `lib/skills/cli.js`
- deny: `lib/skills/backing-modules.js`
- deny: `lib/cli.js`
- deny: `skills/**`
- deny: `.adr/**`
- deny: `.out-of-scope/**`
- deny: `CONTEXT.md`
- deny: `.blueprint/approvals/**`
- deny: `.blueprint/verifications/**`
- deny: `.blueprint/architecture/**` 除本 Spec 对之外
- deny: `.specs/**` 除本 Spec 对之外
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
### Loader 形状

`lib/skills/loader.js` 导出 `loadBundledSkills({ pluginRoot })`,返回 `Skill[]`,每个 Skill 带 `{ name, description, invocation, body, filePath }`。函数走 `skills/` 一层深,读每个 `SKILL.md`,通过 `lib/skills/frontmatter.js#parseFrontmatter` 解析 frontmatter,验证 `name`(kebab-case)和 `description`(非空),返回活下来的。验证失败的文件丢掉,通过标准插件 logger 警告;loader 不因个别失败抛错。

### Frontmatter schema

`lib/skills/frontmatter.js` 导出 `parseFrontmatter(text) -> { name, description, invocation, raw, errors }`。函数对四个文档化的 key(`name`、`description`、`disable-model-invocation`、`user-invocable`)用一个小的手写 YAML 读取器。**不**依赖 YAML 包——schema 是固定的、小的。`disable-model-invocation` 或 `user-invocable` 的非布尔值产生一个 error 并丢弃该 Skill。映射遵循 DSH 文档化行为:

| `disable-model-invocation` | `user-invocable` | `invocation.modelInvocable` | `invocation.userInvocable` |
|---|---|---|---|
| 缺省 | 缺省 | true | true |
| `true` | 缺省 | false | true |
| 缺省 | `false` | true | false |
| `true` | `false` | (丢弃) | (丢弃) |

### Cordis 插件 shape

`lib/skills.js` 导出标准 DSH 插件 shape:`name = "skills-layer"`、`inject = ["skills"]`、`apply(ctx)`。`apply(ctx)` 检查 `typeof ctx.skills?.registerProvider === "function"`;若否,返回不注册任何东西。若是,调 `ctx.skills.registerProvider(() => provider)` 恰好一次,`provider.list()` 返回 loader 的 Skills 整形为 DSH 的候选 shape(`{ name, description, invocation, provider: "design-blueprint", source: "bundled", resourceBase, rank: BUNDLED_SKILL_RANK, locator }`),`provider.get(candidate)` 返回带 `content` 设为加载正文的候选。

### 插件入口扩展

`lib/index.js` 在其 `inject` 数组加 `"skills"`。其 `apply()` 加一个 `ctx.effect` 步骤,懒导入 `lib/skills.js` 并在已有的 `commands`/`systemPrompt`/`webServer`/`tools` 注册之前跑它。懒导入是必要的,让插件可以在早于 `@deepseek-ai/dsh-skill` 的 DSH 版本上加载。

### 空 bundle 是合法状态

当 `skills/` 不存在(同伴 Spec B、C 还没发布,或插件被瘦部署消费),`loadBundledSkills` 返回 `[]`,provider 注册零候选,任何目录里都不出现 Skill。子 Spec A 就以这个空状态发布,是子 Spec B(填 `skills/`)和 C(写文档)的地基。

## 验收条件

- AC-LOADER-001:`lib/skills/loader.js` 导出 `loadBundledSkills`。给一个 fixture 目录含一份有效 SKILL.md(带 name + description)和一份无效 SKILL.md(`disable-model-invocation: "yes"`),`loadBundledSkills` 返回一个 Skill(有效那份)并对无效那份记录一个警告。[surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-002:`lib/skills/frontmatter.js` 正确解析四个 key,对两个 flag key 的非布尔值以清晰的 error 信息拒绝。[surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-003:`lib/skills.js` 导出 `apply`、`inject`、`name`;`inject` 是 `["skills"]`;`name` 是 `"skills-layer"`。[surface=api; moment=static; evidence=static-unit]
- AC-LOADER-004:`apply(ctx)` 当 `ctx.skills = undefined` 时返回不抛错、不注册任何东西。[surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-005:`apply(ctx)` 当插件带空 `skills/` 目录时,用一个记录调用的 stub `ctx.skills`,调一次 `registerProvider(...)`,工厂的 `list()` 返回 `[]`。[surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-006:`lib/index.js` 在 `["commands", "systemPrompt", "webServer", "tools"]` 之外注入 `"skills"`。[surface=api; moment=static; evidence=static-unit]
- AC-LOADER-007:`lib/index.js` 的 `apply()` 加一个 `ctx.effect` 步骤,在已有注册之前跑 Skills loader。[surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-008:所有现有测试继续通过。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-LOADER-009:`design-blueprint scan --all --cwd .` 报告 0 required issues。[surface=cli; moment=terminal; evidence=contract-integration]

## 验证

- AC-LOADER-001:测试 `tests/skills-loader.test.js#loadBundledSkills drops invalid Skills and warns` [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-002:测试 `tests/skills-loader.test.js#parseFrontmatter handles flag keys and rejects non-boolean values` [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-003:测试 `tests/skills-loader.test.js#lib/skills.js exports the Cordis plugin shape` [surface=api; moment=static; evidence=static-unit]
- AC-LOADER-004:测试 `tests/skills-loader.test.js#apply is a no-op when ctx.skills is undefined` [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-005:测试 `tests/skills-loader.test.js#apply registers one provider with empty list when bundle is empty` [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-006:测试 `tests/skills-loader.test.js#lib/index.js injects skills` [surface=api; moment=static; evidence=static-unit]
- AC-LOADER-007:测试 `tests/skills-loader.test.js#apply registers Skills before existing services` [surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-008:命令 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js"` [surface=cli; moment=terminal; evidence=contract-integration]
- AC-LOADER-009:命令 `node lib/cli.js scan --all --cwd .` [surface=cli; moment=terminal; evidence=contract-integration]

## 风险

- DSH 的 `ctx.skills` API 在已验证版本(0.1.1-rc.2, b150a55)和下一个 minor 里稳定。破坏性改动会让 loader 静默 no-op;REQ-LOADER-3 的 `ctx.skills?.registerProvider` 守卫让插件仍可加载。
- 四个 key 的手写 YAML 读取器刻意收窄。若未来 Skill 需要更丰富的 frontmatter,通过单独 Spec 换成 YAML 包;本 Spec 不引入新依赖,保持 bundle 小。
- 空 bundle 状态意味着目录里没 Skill,直到子 Spec B 发布。子 Spec A 是地基;开发者在此状态下跑插件会看不到 Skill,得等子 Spec B。

## 需求

### REQ-LOADER-1 — Loader 走 skills/ 一层深

`loadBundledSkills({ pluginRoot })` 读每个直接子目录的 `<pluginRoot>/skills/<name>/SKILL.md`。读取失败(I/O 错误、缺 `---` 分隔符)的文件跳过并警告。函数永不因个别文件失败抛错。

### REQ-LOADER-2 — Frontmatter 解析器处理四个 key

`parseFrontmatter(text)` 抽取 `name`(字符串)、`description`(字符串)、`disable-model-invocation`(可选布尔)、`user-invocable`(可选布尔)。读取器是个小的、无依赖的解析器,限定在该 schema;flag key 的非布尔值产生 `FrontmatterError`。

### REQ-LOADER-3 — User-invoked vs model-invoked 不变量

`mapFlagsToInvocation(disableModelInvocation, userInvocable)` 按 `## Proposal` 的表返回 `{ modelInvocable, userInvocable }`。两个 flag 都解析为 false 时,Skill 加载时丢弃并警告,信息带 Skill 名和谓词。

### REQ-LOADER-4 — Cordis 插件 shape

`lib/skills.js` 导出 `apply`、`inject = ["skills"]`、`name = "skills-layer"`。`apply(ctx)` 在 `ctx.skills.registerProvider` 不是函数时 no-op;否则注册一个 provider,`list()` 返回 loader 的 Skills 整形为 DSH 的候选 shape,`get(candidate)` 返回带 `content` 为加载正文的候选。

### REQ-LOADER-5 — 插件入口注册 loader

`lib/index.js` 在其 `inject` 数组加 `"skills"`,并加一个 `ctx.effect` 步骤,懒导入 `lib/skills.js` 并在已有的服务注册之前跑。懒导入在 effect 体里用 `await import("./skills.js")`,这样插件可以在没有 `@deepseek-ai/dsh-skill` 的 DSH 版本上加载。

## 场景

[scenario=loader-reads-one-valid-skill]
Given 一个 fixture `<root>/skills/decompose-spec/SKILL.md` 带有效 frontmatter,
When `loadBundledSkills({ pluginRoot: <root> })` 跑,
Then 结果包含一个 Skill,`name: "decompose-spec"`、`description: <text>`、`invocation: { modelInvocable: true, userInvocable: true }`、`body: <body>`、`filePath: <绝对路径>`。

[scenario=loader-drops-invalid-frontmatter]
Given 一个 fixture `<root>/skills/bad-skill/SKILL.md` 带 `disable-model-invocation: "yes"`,
When `loadBundledSkills({ pluginRoot: <root> })` 跑,
Then 结果**不**含 `bad-skill`,
And loader 记录一个警告,信息带 `bad-skill` 和谓词。

[scenario=apply-noop-without-ctx-skills]
Given 一个 stub `ctx`,`ctx.skills` 是 undefined,
When `apply(ctx)` 跑,
Then 它正常返回,
And `ctx.skills` 不被碰(不调 `registerProvider`,不调 setter 变更)。

[scenario=apply-registers-empty-provider]
Given 一个空的 `<pluginRoot>/skills/` 目录,
When `apply(ctx)` 用一个记录的 stub `ctx.skills` 跑,
Then `ctx.skills.registerProvider(...)` 被调恰好一次,工厂的 `list()` resolve 为 `[]`。

[scenario=index-injects-skills]
Given 插件的 `lib/index.js`,
When 文件被读,
Then `inject` 数组含 `"skills"`,还有 `"commands"`、`"systemPrompt"`、`"webServer"`、`"tools"`。

## 假设

1. 插件已经通过已验证的 DSH 版本线声明 `@deepseek-ai/dsh-skill` 为 peer 依赖;本 Spec 不改 `package.json#peerDependencies`。
2. `BUNDLED_SKILL_RANK = 250` 是运行时 Skill rank。provider 在每个候选上设 `rank: 250`;本 Spec 不发明新 rank。
3. 子 Spec B、C 跟在后面。子 Spec A 带空 `skills/` 目录发布,作为它们的地基。
4. 手写 YAML 解析器 v1 可接受;若未来 Skill 需要更丰富 frontmatter,通过单独 Spec 换成 YAML 包。

## 非目标

- 发 Skill 内容(`skills/<name>/SKILL.md`)。子 Spec B 拥有。
- 加 CLI 子命令。子 Spec B 拥有 `design-blueprint skills list|show|info`。
- 文档约定(`.adr/`、`.out-of-scope/`、`CONTEXT.md`、双语 Skill 页面)。子 Spec C 拥有。
- 替换 `blueprint_dispatch`。Skills loader 坐在它旁边。
- 加 YAML 或其他 frontmatter 解析器依赖。

## 备选方案

**导入 YAML 包(`yaml` 或 `js-yaml`)做 frontmatter 解析器。** v1 否决:schema 固定在四个 key;手写读取器 ~30 行,免去新依赖。未来 Spec 若 schema 变可以换。

**把 loader 实现成一个文件而非三个。** 否决:`frontmatter.js` 独立可测、可复用;塞进 `loader.js` 会把验证和文件遍历耦合。

**通过 `ctx.skills.register(skill)` 直接注册 Skills 而非 `registerProvider`。** 否决:`register()` 是给运行时嵌入式 Skills 的,不是给插件打包 Skills 的。`registerProvider()` 是文档化路径(`@deepseek-ai/dsh-skill-badge` 用的就是它)。

**把 Skill 内容放进同一个 Spec。** 否决:Spec 会超过框架的 REQ / scope 阈值(5 REQ + 6 个允许路径已经触顶)。

## 任务

1. Author `lib/skills/frontmatter.js`:`parseFrontmatter`、`mapFlagsToInvocation`、`FrontmatterError`。REQ:REQ-LOADER-2、REQ-LOADER-3。Scope:`lib/skills/frontmatter.js`。AC:AC-LOADER-002。
2. Author `lib/skills/loader.js`:`loadBundledSkills`。REQ:REQ-LOADER-1、REQ-LOADER-3。Scope:`lib/skills/loader.js`。AC:AC-LOADER-001。
3. Author `lib/skills.js`:导出 `apply`、`inject`、`name`。REQ:REQ-LOADER-4。Scope:`lib/skills.js`。AC:AC-LOADER-003、AC-LOADER-004、AC-LOADER-005。
4. 扩展 `lib/index.js`:`inject` 加 `"skills"`;加 `ctx.effect` 步骤。REQ:REQ-LOADER-5。Scope:`lib/index.js`。AC:AC-LOADER-006、AC-LOADER-007。
5. 更新 `package.json` 的 `lint:js` 包含新文件。REQ:REQ-LOADER-5。Scope:`package.json`。AC:AC-LOADER-008。
6. 写 `tests/skills-loader.test.js`。REQ:REQ-LOADER-1、REQ-LOADER-2、REQ-LOADER-3、REQ-LOADER-4、REQ-LOADER-5。Scope:`tests/skills-loader.test.js`。AC:AC-LOADER-001 至 AC-LOADER-007。
7. 跑完整 host 测试套件和 `design-blueprint scan --all --cwd .`。REQ:all。Scope:-。AC:AC-LOADER-008、AC-LOADER-009。

## Lifecycle

- Status: proposed
- 批准后目标状态:implemented(文件移至 `.specs/implemented/`)

## Truth-delta

新增事实:
- `lib/skills.js`、`lib/skills/loader.js`、`lib/skills/frontmatter.js` 存在并导出文档化的函数。
- `lib/index.js` 注入 `"skills"`,通过 `ctx.effect` 注册 loader。
- `tests/skills-loader.test.js` 覆盖 loader 契约。

保留事实:
- 所有现有 CLI 子命令。
- 所有现有测试。
- `lib/init.js` 写的两个项目级 Skills(`blueprint-doc-standards`、`blueprint-translate-docs`)。
- `blueprint_dispatch` 作为权威 Spec lifecycle 工具。

## Traceability

REQ-LOADER-1 → scenario[loader-reads-one-valid-skill] → task 2 → AC-LOADER-001 → verification tests/skills-loader.test.js
REQ-LOADER-2 → scenario[loader-reads-one-valid-skill]、[loader-drops-invalid-frontmatter] → task 1 → AC-LOADER-002 → verification tests/skills-loader.test.js
REQ-LOADER-3 → scenario[loader-drops-invalid-frontmatter] → task 1, 2 → AC-LOADER-001、AC-LOADER-002 → verification tests/skills-loader.test.js
REQ-LOADER-4 → scenario[apply-noop-without-ctx-skills]、[apply-registers-empty-provider] → task 3 → AC-LOADER-003、AC-LOADER-004、AC-LOADER-005 → verification tests/skills-loader.test.js
REQ-LOADER-5 → scenario[index-injects-skills] → task 4, 5 → AC-LOADER-006、AC-LOADER-007 → verification tests/skills-loader.test.js

## Unresolved decisions

无。三个实质问题都定了:schema 手写(不引入 YAML 依赖)、loader 分三个文件(不是一个)、provider 用 `registerProvider()` 注册(不是 `register()`)。

## 质量清单(自检)

- requirements complete:✓(5 个 REQ,覆盖 walker、解析器、映射、插件 shape、入口扩展)
- requirements unambiguous:✓(每个 REQ 点名文件和契约)
- requirements bounded:✓(单 Feature,子 Spec A;空 `skills/` 是发布状态)
- requirements failure-aware:✓(非法 frontmatter 丢弃并警告;缺 `ctx.skills` no-op)
- requirements testable:✓(每个 AC 指向验证命令或测试)
- requirements non-contradictory:✓(没有 AC 同时说"注册"和"跳过"同一条件)

## 跨工件分析

- requirements-to-scenarios:✓ 全部 5 个 REQ 被 5 个场景覆盖
- requirements-to-impact:✓ 全部 5 个 REQ 映射到 ## Scope 中一个或多个文件
- requirements-to-tasks:✓ 每个 task 列 REQ
- requirements-to-acceptance:✓ 每个 AC 点名 REQ
- requirements-to-verification:✓ 每个 AC 点名验证命令或测试
- tasks-to-scope:✓ 每个 task 点名 Scope 路径
- design-to-scope:不适用(designRequired: false)
- scope-to-paths:✓ 每个 Scope 路径对应真实路径

## Consequences

在子 Spec C 发版后,按 mattpocock 约定记入 `.adr/0001-add-skills-layer.md`。

## 结果

Blueprint 已通过与需求关联的验收自动完成本次交付。

- 验收快照：`git-index:b9843ad597f9d82156600eebeb710c553e8c614ba310312b6de4f0dd44c51022`
- 验收尝试：`attempt-1`
- 结论：Skills loader sub-spec A implemented: lib/skills.js, lib/skills/loader.js, lib/skills/frontmatter.js. lib/index.js adds skills to inject and registers loader before existing services. 173/173 host tests pass (22 new); scan clean; 11/11 bilingual pairs confirmed.
- AC 证据：9 项全部通过。
- 检查证据：skills-loader-unit-api（command）、index-injects-api-static（inspection）、index-injects-api-terminal（inspection）、full-suite-cli（command）、scan-all-cli（command）。
