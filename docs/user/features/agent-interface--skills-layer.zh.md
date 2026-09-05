# Agent interface Skills layer(代理接口 Skills 层)

[English](agent-interface--skills-layer.md) | 中文

## 它做什么

`@dsh-plugins/design-blueprint` 随 CLI 一起分发一组 DSH Skills。这些 Skills 把 CLI 给人的操作以 DSH 原生 `ctx.skills` 注册表的方式暴露给 AI 代理,让代理在任务契合时自动触发。CLI 仍然保留:开发者依然可以直接敲 `design-blueprint approve`、`design-blueprint todo mark`、`design-blueprint spec show`。Skills 是 AI 的对位,不是替代。

本插件里的 Skill 是一份带 YAML frontmatter 的 Markdown 文件(DSH 原生格式),打包在插件的 `skills/<name>/SKILL.md` 位置。插件启动时读取文件、解析 frontmatter,通过 `ctx.skills.registerProvider(...)` 注册,跟 `@deepseek-ai/dsh-skill-badge` 的做法一致。一个 Skill 包含 `name`、`description`,以及可选的 `disable-model-invocation` / `user-invocable` 标志——跟插件在 `init` 时写入的两个项目级 Skill(`blueprint-doc-standards`、`blueprint-translate-docs`)用的就是同一套标志。

## 预期结果

本 Feature 上线后,一个绑定本插件的新 DSH session 菜单里会出现 5 个 Skills:

| Skill | 触发方式 | 干什么 |
|---|---|---|
| `decompose-spec` | model-invocable | 检测一个 Spec 是否超过分解阈值(8 REQ / 5 scope paths / 1500 行),返回违规清单加一行建议。 |
| `todo-status` | model-invocable | 返回某个 Spec 的当前 TODO 列表和 verdict,不写任何东西。 |
| `verify-feature` | model-invocable | 跑验证流程(start → submit → complete),按 Feature 列出 AC 通过/失败。写一条 verification 记录;模型在宣告 Feature 完成前把 finding 转给用户看。 |
| `grill-spec` | model-invocable | 在代理调用 `blueprint_dispatch refine` 之前,带着开发者过一遍细化问题(默认值、持久化、交付面、scope、风险)。Skill 在每道门等人输入。 |
| `handoff-spec` | model-invocable | 把当前 Spec 的 lifecycle state 写成一份可移植的 Markdown 摘要到操作系统临时目录,让新代理接得上。 |

开发者另外可以用 CLI `design-blueprint skills list` / `show <name>` / `info <name>` 查插件会暴露什么。

## 怎么用

Skills 是被动的:DSH 的 skill filesystem provider 在启动时发现它们,Cordis 插件通过 `ctx.skills.registerProvider` 注册。**没有开关、没有配置**。要查:

```bash
design-blueprint skills list
design-blueprint skills show decompose-spec
design-blueprint skills info decompose-spec
```

聊天框里要触发,敲 `/<名字>`(比如 `/todo-status`);model-invoked 的 Skill 在代理判断契合时也会自动跑。

## 兼容性

插件在不包含 `@deepseek-ai/dsh-skill` 的 DSH 版本上仍然能跑——Cordis 注入 `skills` 这步会被跳过,`apply()` 在调用任何注册表前提前返回。CLI 子命令 `skills` 独立可用,永远在。

## 配套诊断

`design-blueprint skills list` 输出按 `@dsh-plugins/design-blueprint-diagnostics` 期望的格式写。未来的 Spec 可以加一个诊断检查:打包的 Skills 与 `.blueprint/features/agent-interface--skills-layer.md` 里声明的骨架 Skills 一一对应。

## 参考文档

- `docs/user/skills/<name>.md` — 每个 promoted Skill 的人读页面(mattpocock 模板:What it does / When to reach for it / Common questions / It's working if)。
- `.adr/0001-add-skills-layer.md` — 为什么加 Skills 层(WHY,跟实现 Spec 解耦)。
- `.out-of-scope/` — 显式声明本插件不做什么,按 mattpocock 约定。
- `CONTEXT.md` — 本插件自有词汇的 domain glossary。

## 已验证的当前行为

<!-- blueprint-current:agent-interface--skills-layer.md -->

### Spec: Skills 加载器(agent-interface--skills-layer,子 Spec A)

- AC-LOADER-001:`lib/skills/loader.js` 导出 `loadBundledSkills`。给一个 fixture 目录含一份有效 SKILL.md(带 name + description)和一份无效 SKILL.md(`disable-model-invocation: "yes"`),`loadBundledSkills` 返回一个 Skill(有效那份)并对无效那份记录一个警告。[surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-002:`lib/skills/frontmatter.js` 正确解析四个 key,对两个 flag key 的非布尔值以清晰的 error 信息拒绝。[surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-003:`lib/skills.js` 导出 `apply`、`inject`、`name`;`inject` 是 `["skills"]`;`name` 是 `"skills-layer"`。[surface=api; moment=static; evidence=static-unit]
- AC-LOADER-004:`apply(ctx)` 当 `ctx.skills = undefined` 时返回不抛错、不注册任何东西。[surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-005:`apply(ctx)` 当插件带空 `skills/` 目录时,用一个记录调用的 stub `ctx.skills`,调一次 `registerProvider(...)`,工厂的 `list()` 返回 `[]`。[surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-006:`lib/index.js` 在 `["commands", "systemPrompt", "webServer", "tools"]` 之外注入 `"skills"`。[surface=api; moment=static; evidence=static-unit]
- AC-LOADER-007:`lib/index.js` 的 `apply()` 加一个 `ctx.effect` 步骤,在已有注册之前跑 Skills loader。[surface=api; moment=terminal; evidence=contract-integration]
- AC-LOADER-008:所有现有测试继续通过。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-LOADER-009:`design-blueprint scan --all --cwd .` 报告 0 required issues。[surface=cli; moment=terminal; evidence=contract-integration]

## 已验证的当前行为

<!-- blueprint-current:agent-interface--skills-bundled.md -->

### Spec: Skills 内容与 CLI(agent-interface--skills-layer,子 Spec B)

- AC-SKILL-001:`skills/decompose-spec/SKILL.md` 存在,frontmatter 含 `name: decompose-spec`、`description: <text>`,无 `disable-model-invocation` 标记(`modelInvocable` 默认 true),正文引用 `lib/skills/backing-modules.js#decomposeSpec`。[surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-002:`skills/todo-status/SKILL.md` 存在,frontmatter 含 `name: todo-status`、`description: <text>`,无 `disable-model-invocation` 标记(`modelInvocable` 默认 true),正文引用 `lib/skills/backing-modules.js#todoStatus`。[surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-003:`skills/verify-feature/SKILL.md` 存在,frontmatter 含 `name: verify-feature`、`user-invocable: true`(无 `disable-model-invocation`),正文引用 `lib/skills/backing-modules.js#verifyFeature`。[surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-004:`skills/grill-spec/SKILL.md` 存在,frontmatter 含 `name: grill-spec`、`user-invocable: true`(无 `disable-model-invocation`),正文引用 `lib/skills/backing-modules.js#grillSpecInterview`。[surface=repository; moment=static; evidence=static-unit]
- AC-SKILL-005:`skills/handoff-spec/SKILL.md` 存在,frontmatter 含 `name: handoff-spec`、`user-invocable: true`(无 `disable-model-invocation`),正文引用 `lib/skills/backing-modules.js#writeHandoffDoc`。[surface=repository; moment=static; evidence=static-unit]
- AC-CLI-001:`node lib/cli.js skills list` 退出码 0,打印一个 Markdown 表,其 `name` 列包含全部 5 个 Skill 名。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-CLI-002:`node lib/cli.js skills show decompose-spec` 打印带行号的 SKILL.md 正文(或者当文件含嵌入 NUL 字节时,在没加 `--json` 的情况下拒绝,与 `spec show` 一致)。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-CLI-003:`node lib/cli.js skills info decompose-spec` 打印 `modelInvocable: true` 和 `userInvocable: true` 加 backing module 的解析路径。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-PKG-001:`package.json#files` 含 `skills/**`。`package.json#exports` 含 `./skills/*` 和 `./skills/<name>` 项。`package.json#lint:js` 包含新文件。[surface=repository; moment=static; evidence=static-unit]
- AC-REGISTER-001:本 Spec 落地后,`node lib/cli.js scan --cwd .` 报告 0 required issues,loader 注册 5 个候选(通过 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/skills-loader.test.js` 验证,该测试增加一条断言 bundle 有 5 个候选)。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001:改动后,所有现有 173 条 host 测试继续通过。[surface=cli; moment=terminal; evidence=contract-integration]

## 已验证的当前行为

<!-- blueprint-current:agent-interface--skills-conventions.md -->

### Skills 约定与文档(agent-interface--skills-layer,子 Spec C)

- AC-ADR-001:`.adr/0001-add-skills-layer.md` 存在,含 MADR 四个必需节(`## Context and problem statement`、`## Decision`、`## Consequences`,加一行 `Status:` 设为 `Accepted`)。[surface=repository; moment=static; evidence=static-unit]
- AC-OOS-001:`.out-of-scope/skills-not-rpc.md` 存在,声明 Skills 不是 CLI 之上的 RPC,以及 Skill 不通过 Skills registry 链另一个 Skill。[surface=repository; moment=static; evidence=static-unit]
- AC-CONTEXT-001:仓库根的 `CONTEXT.md` 存在,列出 `Skill`、`Spec`、`Feature`、`ADR`、`Component`、`verification cycle`、`Scope`、`Acceptance criterion`、`evidence level`,每个一句话定义,加 `Skill`、`Spec`、`ADR` 三个词指向所属权威文档。[surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-001 至 AC-DOCS-005:五个 Skill 名(`decompose-spec`、`todo-status`、`verify-feature`、`grill-spec`、`handoff-spec`)各有一份 `docs/user/skills/<name>.{md,zh.md}`。每份英文页面含四个 mattpocock 节标题。[surface=repository; moment=static; evidence=static-unit]
- AC-DOCS-006:`node lib/cli.js docs check --cwd .` 对新的 `docs/user/skills/**` 对报 0 required issue。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-DOCS-007:在每份 `docs/user/skills/<name>.md` 上跑 `design-blueprint docs confirm` 后,`node lib/cli.js docs check --cwd .` 对 Skill 文档报 0 required 和 0 recommended issue。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-BRIEF-001:本 `## 已验证的当前行为` 子节列出至少 AC-ADR-001、AC-OOS-001、AC-CONTEXT-001、AC-DOCS-001 至 AC-DOCS-007。[surface=repository; moment=static; evidence=static-unit]
- AC-FEATURE-001:`.blueprint/features/agent-interface--skills-layer.md` 和 `.blueprint/architecture/components/agent-interface-skills-layer.md` 引用 `.adr/0001-add-skills-layer.md`、`.out-of-scope/skills-not-rpc.md`、`CONTEXT.md` 和 `docs/user/skills/<name>.md`。[surface=repository; moment=static; evidence=static-unit]
- AC-SCAN-001:本 Spec 落地后,`node lib/cli.js scan --cwd .` 报 0 required issue。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-REGRESSION-001:本 Spec 落地后,所有 199 条 host 测试继续通过。[surface=cli; moment=terminal; evidence=contract-integration]

## 已验证的当前行为

<!-- blueprint-current:agent-interface--skills-design-time.md -->

### Spec: Skills 设计时自动触发扩展(agent-interface--skills-layer,子 Spec D)

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
