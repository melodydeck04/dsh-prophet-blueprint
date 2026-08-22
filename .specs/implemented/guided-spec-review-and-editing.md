# Spec: Guided Chinese Spec review and direct editing

Status: implemented

## Problem

Spec 审核助手当前默认输出工程师视角的逐条缺口，容易把目录、字段名、环境变量、AC 编号和测试生成器等实现细节直接抛给只想确认产品框架的开发者。技术约束、后续工作和真正风险也可能混在一起，导致开发者无法判断自己需要回答什么。

审核消息目前按纯文本显示，Markdown 标题、列表和代码不能形成清晰层级。虽然独立 Agent 的提示允许在明确确认后编辑当前 proposed Spec，但页面没有直接应用入口；Agent 完成文件修改后 Blueprint 也不会自动重新读取，开发者仍要手工复制或刷新才能看到结果。

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

审核栏提供“简明模式”和“技术细节”两个层级，默认简明模式。简明模式把开发者当作产品意图的确认者：Agent 自动整理 Spec 章节、机器字段、AC、验证、配置默认值以及可从仓库确定的实现细节，只追问会改变用户可见行为、业务边界或不可逆取舍的问题。默认回复使用中文，最多提出三个问题，并按“我理解的目标 / 我会自动补齐 / 只需你确认 / 优化后的中文方案”组织；除非不可避免，不显示文件路径、代码标识符、环境变量、AC 编号或测试术语。技术细节模式保留完整工程审查能力。

每条用户消息都携带当前输出模式，因此在同一个审核 Session 中切换后立即生效。审核上下文要求 Agent 正确区分风险、实现约束、公共契约和后续工作，避免把不同性质的内容全部归入风险。

审核助手使用 DSH `@deepseek-ai/dsh-client-ui-primitives` 公开的 `MarkdownText` 渲染 assistant 内容，继承其面向不可信 Markdown 的安全策略和流式增量解析；用户输入继续按纯文本显示。

当当前功能存在 proposed Spec 时，审核栏显示“直接优化 Spec”。点击即发送一条明确授权消息，要求 Agent 根据已确认意图自动打磨并直接编辑上下文中指定的 proposed Spec。普通自然语言中的“帮我改、直接应用、写入 Spec”等同样视为明确授权；Agent 不再要求第二次确认。写入权限仍限于当前 proposed Spec，不能修改批准记录、实现文件或归档生命周期。

面板检测到审核 Session 从运行中转为完成后，自动重新加载 Blueprint dashboard。若 Spec 已改变，新哈希会驱动详情、中文分析和审核会话版本一起更新；页面也提供“刷新结果”作为手动恢复动作。插件版本升级为 `0.9.0`。

## Alternatives considered

**始终隐藏技术细节。** 拒绝。部分开发者需要检查字段、测试和兼容性；显式切换比删除能力更合适。

**让 Agent 只返回可复制的完整 Spec。** 拒绝。复制粘贴仍把文件操作转嫁给开发者，也无法自动触发哈希、批准失效和页面更新。

**自行实现 Markdown 正则替换器。** 拒绝。自制渲染器难以正确处理流式未闭合语法和不可信链接；DSH 已提供经过 Chat 使用的公开安全组件。

## Acceptance criteria

- AC-1: 审核栏默认使用简明模式并可切换技术细节；每次发送都把当前模式写入 prompt。
- AC-2: 简明模式要求 Agent 自动打磨工程细节、只询问最多三个产品决策，并使用固定中文结构，避免默认输出代码级术语。
- AC-3: assistant 的已完成和 partial 内容均由 DSH `MarkdownText` 渲染，partial 启用 streaming；用户消息保持纯文本。
- AC-4: proposed Spec 存在时显示“直接优化 Spec”，点击后明确授权 Agent 直接编辑该文件且不要求二次确认；提示继续禁止批准、实现与归档操作。
- AC-5: 审核 Session 一轮完成后自动重新加载 dashboard，并保留可手动触发的“刷新结果”动作，使修改后的 Spec 内容与哈希出现在 Blueprint。
- AC-6: Host、Client 和 package 版本统一为 `0.9.0`，中英文公开文档与架构说明同步更新。

## Verification

- AC-1: test: `tests/client-runtime.test.js`, `tests/reviewer.test.js`, `tests/client.test.js`
- AC-2: test: `tests/reviewer.test.js`
- AC-3: test: `tests/client-runtime.test.js`, `tests/client.test.js`
- AC-4: test: `tests/reviewer.test.js`, `tests/client.test.js`
- AC-5: test: `tests/reviewer.test.js`, `tests/client.test.js`
- AC-6: test: `tests/client.test.js`, command: `node lib/cli.js docs check --cwd .`
- command: `npm test`
- command: `npm run lint:js`
- command: `node lib/cli.js scan --all --cwd .`

Shipped verification on 2026-08-21: all 28 Node tests passed; every JavaScript entry passed `node --check`; all three bilingual documentation pairs passed `docs check`; the working-tree Blueprint scan reported zero required and zero recommended issues; the installed DSH rc.7 package inspection confirmed the public `MarkdownText` export and its untrusted incremental rendering contract; and the `0.9.0` package dry run contained the client, peer declaration, documentation, feature map, tests, and implemented specification.

## Consequences

独立 Agent 仍使用当前 DSH Agent 的完整工具组合，文件边界主要由角色提示约束，而非操作系统沙箱。直接编辑动作因此必须清楚限定目标文件，并在修改后依赖 Spec 哈希变化使旧批准失效。自动刷新可能在纯讨论轮次产生一次无害的额外 dashboard 请求；它换取了无需猜测 Agent 是否真正写文件的稳定可见性。DSH primitives 属于 rc.7 peer dependency，未来导出变化需要随 DSH 升级一起验证。
