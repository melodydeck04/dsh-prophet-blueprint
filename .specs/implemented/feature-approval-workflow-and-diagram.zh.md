# 规格：功能审批工作流、层级图与审核助手

状态：已实现
功能：web-dashboard

## 问题

功能目录已经可以保存需求、展示层级并把 proposed Spec 与开发者审批绑定，但审核体验仍有两个缺口。产品意图和工程细节混在很长的 Markdown 文档中；开发者发现歧义后还必须离开 Blueprint，在主开发对话里重新组织上下文。仪表盘需要更易读的产品视图和专用 Spec 助手，同时不能削弱开发者直接审批边界。

## 范围

- 允许：`lib/features.js`
- 允许：`lib/specs.js`
- 允许：`lib/workflow.js`
- 允许：`lib/version.js`
- 允许：`lib/policy.js`
- 允许：`lib/scan.js`
- 允许：`lib/web-api.js`
- 允许：`lib/client.js`
- 允许：`lib/index.js`
- 允许：`tests/**`
- 允许：`package.json`
- 允许：`design-blueprint.json`
- 允许：`cordis.patch.yml`
- 允许：`AGENTS.md`
- 允许：`DESIGN.md`
- 允许：`README.md`
- 允许：`README.zh.md`
- 允许：`README.i18n.yaml`
- 允许：`.blueprint/features/**`
- 允许：`.specs/**`

## 决策

### 开发者直接审批闸门

与功能关联的 proposed Spec 使用 `Feature: <id>`。Blueprint 根据仓库中的生命周期 Spec、明确审批记录和 implemented 状态推导功能阶段。只有开发者在 Blueprint Web 中的操作可以创建 `.blueprint/approvals/<feature-id>.json`；记录绑定功能 ID、英文主 Spec 路径、精确审阅哈希和审批时间。双语 Spec 中任意一份发生变化都会使旧审批失效。

暂存策略不允许未审批的 Feature-linked proposal 授权实现文件。规划阶段可以创建一组双语功能说明和一组 proposed Spec，但必须在实现或自行审批之前停止。只有精确审阅哈希得到审批后才能开始开发；实现必须位于 Spec Scope 内，运行已声明验证，并且只有成功后才能把两个语言文件一起移到 `implemented`。

### 面向产品的需求视图

Blueprint 默认使用中文呈现导航、状态、操作、错误和审核说明。当前功能把四段式“功能说明”与正式“开发 Spec”分开，并提供真实的中英文文件。仓库事实始终与助手建议分离；缺少的内容明确显示为尚未说明，浏览器不会自行编造。

Blueprint 标题显示 Host 和 Client 实际加载的插件版本。版本一致时只显示一次；不一致时同时显示两端版本，并要求完整重启 DSH Web。页面继续显示解析到的项目根目录，从而区分浏览器包过期和工作区选择错误。

### 独立 Spec 审核助手

“优化 Spec”工作区把独立 DSH Session/Agent 放在当前文档旁边。Session 每轮接收当前功能定义、两种语言的功能说明、两种语言的 Spec、展示模式和开发者消息，不继承主开发对话。默认中文简明模式会自动补齐可从仓库确定的工程细节，最多只询问三个会改变可见产品行为或业务边界的问题；技术模式可以展示字段、配置、验收编号和验证细节。

角色提示禁止实现、生命周期归档、审批记录写入和实现文件修改。仓库正文会被分隔并标记为不可信审核材料。得到明确的直接写入授权后，助手只可以同步编辑当前功能说明和 proposed Spec 配对，并确保每个文件只使用指定语言。真正的工具能力仍来自当前 DSH Agent 组合，因此这里是提示边界，而不是操作系统沙箱。

每个项目、功能和审核协议只使用一个稳定助手 Session。Spec 修改后会刷新文档和最新上下文，不会再把当前对话判为过期。开发者可以明确点击“新建对话”，旧 DSH Session 仍作为历史保留。面板会显示 DSH 已公开的思考摘要、工具和文件活动、任务和子 Agent、错误、取消状态，以及流式 Markdown 最终回答；它不会声称暴露隐藏思维链。

### 功能层级图

“项目结构”工作区可以在紧凑目录和无额外依赖的 React/SVG 树之间切换。层级图自上而下，节点尺寸一致，正交连接线位于节点后方，只突出当前选中项。鼠标和键盘操作都会选择文档与助手共用的同一个功能。

## 其他方案

**复用主开发对话。** 不采用，因为实现历史会与审核意图混合，也无法形成稳定的功能级审核记录。

**允许助手自行审批修改。** 不采用，因为这会移除开发者直接决策边界。

**只生成一次性审核摘要。** 不采用，因为它无法通过多轮对话澄清产品意图，也不能直接维护配对文件。

**继续使用一份中英文混写 Spec。** 不采用，因为产品说明、机器结构、中文和英文会继续挤在一份难以阅读的产物中。

**从源码目录推断功能，或渲染 Mermaid 文本。** 不采用，因为源码布局不是产品权威，而且仪表盘需要选择、状态、无障碍和主题集成。

## 验证

- 审批与过期哈希行为：`tests/workflow.test.js`、`tests/web-api.test.js`、`tests/staged-policy.test.js`。
- 功能说明和 Spec 语言切换：`tests/spec-workspace.test.js`、`tests/specs.test.js`。
- 稳定独立 Session、最新上下文提交、活动投影、流式输出、取消和直接刷新：`tests/client-runtime.test.js`、`tests/dsh-compatibility.test.js`、`tests/reviewer.test.js`。
- 层级图、版本显示、规划边界和 DSH 加载契约：`tests/client.test.js`。
- 命令：`npm.cmd test`、`npm.cmd run lint:js`、`node lib/cli.js docs check --cwd .` 和 `node lib/cli.js scan --all --cwd .`。

## 后果

开发者可以先审核产品意图，按需查看正式工程细节，并在同一段可见对话里持续优化 Spec；仓库仍然是工作流权威。直接编辑会使审批失效，但不会再使助手对话失效。英文生命周期文件仍是机器解析主文件，中文文件是一等的展示对应文件。

助手仍使用当前 DSH Agent 的工具面。角色限制、精确产物上下文、明确写入授权、哈希审批和失败关闭扫描可以降低正常工作流漂移，但不构成能力沙箱。DSH 的预览契约每次升级后都需要重新验证；很大或很深的功能树可能需要滚动查看。
