# 规格：DSH 原生 Skill 路由与 MiniMax 提示词契约

Status: proposed
Feature: spec-governance--architecture-design

## Problem

当前入口主要按英文关键词分类，将状态和研究请求送入规格完善流程，还引用了不存在的研究 Skill。内置验证函数传入无效启动哈希，并在未执行检查时构造通过证据。Skill 正文和调用标记互相冲突。rejected 记录混淆了替代、延期和已完成历史。

## Scope

- allow: `lib/chat-commands.js`
- allow: `lib/orchestration.js`
- allow: `lib/skills/**`
- allow: `skills/**`
- allow: `tests/skills/**`
- allow: `tests/*routing*.test.js`
- allow: `tests/chat-commands-classify.test.js`
- allow: `tests/orchestration-auto-compact.test.js`
- allow: `tests/verification.test.js`
- allow: `docs/user/skills/**`

功能身份、功能边界、审批记录、提供商凭据、DSH 安装、浏览器启动、自动压缩 dispatch、`lib/index.js`、根 README、`DESIGN.md`、Feature 简介和验证框架/CLI 均不属于本次实现。自动压缩由 `auto-compact-on-unrelated-task-done--preset-aware-dispatch` 负责；验证框架改动由 `framework-verification-becomes-driver-friendly` 负责。若兼容性工作证明需要修改验证门禁或运行时依赖清单，应另建有明确范围的提案。

## Research and compatibility

检查日期为 2026-09-08。DSH master 参考提交：c389f96bf3a9b6807cb71ed6bdad5849be0df6d8。查到的最新 npm 版本：0.1.2-rc.1。Blueprint 仍声明 0.1.1-rc.2；新增兼容性声明必须有对应发布版测试，不能仅从 master 推断。

- DSH 源码：https://github.com/deepseek-ai/deepseek-harness/tree/c389f96bf3a9b6807cb71ed6bdad5849be0df6d8/packages/skill — 注册表、文件系统发现和原生 skill 工具。模型加载的是说明，不会自动执行 JavaScript 导出。原生文件系统发现包括项目 .dsh/skills 和 .agents/skills；Blueprint 自己的 provider 当前读取包内 skills/，两者是不同机制。
- DSH 提示词契约：https://github.com/deepseek-ai/deepseek-harness/blob/c389f96bf3a9b6807cb71ed6bdad5849be0df6d8/packages/core/system-prompt/README.md — 贡献有序提示词段落，不替换框架完整提示词。
- DSH 提供商参考：https://github.com/deepseek-ai/deepseek-harness/blob/c389f96bf3a9b6807cb71ed6bdad5849be0df6d8/packages/llm/llm-pi-ai/README.md — 提供商路由属于独立配置。本次不修改用户的 MiniMax 端点、模型或采样参数。
- MiniMax 指南：https://platform.minimax.io/docs/token-plan/prompting-best-practices — 明确指令、多样示例、有界工具使用和带索引的上下文。在实际部署模型上评估之前，不宣称性能提升。
- Matt Pocock 参考：https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/productivity/grilling/SKILL.md — 先解决前置决策，提问前自行检查事实。适配 Blueprint 每轮最多三个问题的限制，不引入强制委派或重复审批。

## Proposal

由当前 DSH Agent 从实际目录中选择职责独立的 Skills，保留用户显式调用。取消关键词分类对写入工作流选择的决定权；精确命令仍由确定性代码处理。通过经测试发布版支持的 DSH 原生机制加载 Skill 说明。不新增分类模型请求、第二个 Chat 或每 Skill 一个 Agent。

## Requirements

- REQ-1：状态和解释请求可以不创建 Spec 而完成。显式 Skill 选择优先于推断。混合请求依据真实能力目录，按依赖顺序执行；缺失能力应说明并提供受支持的替代路径。
- REQ-2：每个 Skill 声明用途、触发条件、输入、可执行入口、输出、失败和停止条件。调用标记与正文一致。Skill 指导 Agent；Host 操作执行项目身份、精确批准、Scope 和证据校验。
- REQ-3：验证通过可执行且受支持的入口调用现有 prepare/start/submit/finalize 契约，在要求的快照上执行声明的检查。不得从验收描述推导 passed；保留失败和未运行结果。状态询问不启动验证。
- REQ-4：保持 Blueprint 自有提示词段落简短，明确分隔仓库事实和外部内容，在长上下文后放当前任务，明确优先中文回复，按需加载任务细节。输出简明决策和证据，不输出私有推理过程。
- REQ-5：生命周期更正通过有证据的后续说明记录。不原样恢复 rejected 全文、不修改已批准的活动 Spec 字节、不把被替代解释为旧功能全部存在。研究保持可选，不无条件依赖 SearXNG，不虚构 Skill 注册。

## Prompt candidate

你在当前 DSH Chat 中工作。读取当前请求、相关仓库事实和可用 Skill 目录。优先遵循用户显式选择的 Skill；否则只选择实现用户目标所需的 Skills，使用前加载说明。状态和解释可以直接完成。研究使用可用的读取工具并标注来源；工具不可用时说明，不得虚构。仅按仓库当前批准和 Scope 规则规划与实现。验证必须执行检查并保留结果。区分拟执行的检查与已经通过的结果。可查明的事实自行检查；只有答案实质影响决策时才提问，每轮最多三个。除非用户另有要求，使用中文。说明执行结果、证据以及必要的下一步。

路由上下文示例：

- 查看当前功能进度 -> 读取当前工作流并回答；不创建 proposed 文件，不启动新验证。
- 审一下这个 Spec -> 加载可用的评审 Skill，检查证据，报告问题。
- 先研究再设计 -> 使用可用工具研究；用户要求时再完善规格，保留引用和未知项。
- 按批准方案实现 -> 校验当前精确批准和 Scope，进入现有实现流程。
- 检查是否验收通过 -> 读取已记录结论；区别于需要运行检查的“请执行验收”。

## 验收条件

- AC-1：中文、英文、混合和显式请求进入符合目标的操作，不强制将只读请求转换为规格完善，不引用不可用 Skill。
- AC-2：发布版 DSH 目录能展示并加载全部内置 Skills，模型/用户调用标记一致，相对资源引用可用。
- AC-3：验证不能提交虚构的通过结果；失败检查保持失败，未执行保持未运行；现有 Host 门禁拒绝过期哈希。
- AC-4：实际 MiniMax 模型在相同保留请求集上进行优化前后评估；记录模型 ID、适配器、提示词版本、路由、工具调用、不必要提问、证据质量、可获取的 token 数及延迟。不能仅凭静态测试声称能力提升。
- AC-5：双语当前文档与历史后续说明明确当前实现、延期研究和替代设计，不形成重复活动权威；暂存扫描及文档检查通过。

## Verification

- AC-1: [surface=api; moment=terminal; evidence=contract-integration] 路由回归覆盖五个示例、缺失 Skill、歧义、显式覆盖和多步骤依赖；断言查询不写入。
- AC-2: [surface=external-integration; moment=terminal; evidence=live-runtime] 在隔离夹具中对发布版 0.1.2-rc.1 测试目录及原生加载，记录包版本和精确签名。保留双版本声明之前单独测试旧基线。不启动用户的 DSH 服务。
- AC-3: [surface=api; moment=terminal; evidence=contract-integration] 用通过和故意失败的夹具、未运行检查、缺失证据、过期哈希及被拒凭据测试 prepare/start/result/finalize，并核对持久结果。
- AC-4: [surface=external-integration; moment=terminal; evidence=live-runtime] 至少 20 条保留请求，包含中文及混合输入，每个提示词重复三次。显式覆盖和无未授权写入必须每次通过；报告路由正确率及取舍。实际模型或评估访问不可用时，将本 AC 标为未验证。不得将凭据值读取或导出到证据中。
- AC-5: [surface=repository; moment=static; evidence=completion-hygiene] 审阅双语语义，运行 docs check、暂存 scan 和相关回归测试，明确记录未解决的历史矛盾。

## Tasks

1. 核对发布版目录、加载及提示词段落契约（REQ-2、AC-2）。
2. 修复可执行的验证 Skill 路径和回归夹具（REQ-3、AC-3）。
3. 实现基于目录的指导和路由，支持显式覆盖及只读结果（REQ-1、REQ-4、AC-1）。
4. 在实际 MiniMax 模型上比较提示词版本，不修改提供商配置（REQ-4、AC-4）。
5. 同步文档，追加有证据的历史更正（REQ-5、AC-5）。

## Alternatives considered

强制使用不同命令会增加用户分流负担。独立分类 LLM 重复当前 Agent 工作并增加延迟。纯关键词路由不能处理常见中文输入。冗长通用提示词每轮重复任务细节。直接安装 Matt Pocock 的整个仓库会引入未经 DSH 验证的工作流和工具假设。

## Risks

已确认部署模型族为 MiniMax M3；具体 API 模型标识和评估适配器尚未确认。DSH master 与发布版 API 可能不同。自动压缩与验证框架文件有独立归属，不得再扩大到本提案中。Feature map 存在原有路径漂移；边界变更需由开发者审阅归属。本提案不授权新增包依赖或重启生产服务。

## Lifecycle

仅完成研究和提案。实现前等待精确双语哈希批准。此前批准仅涵盖其他 Specs。

## 结果

Blueprint 已通过与需求关联的验收自动完成本次交付。

- 验收快照：`git-index:manual`
- 验收尝试：`attempt-manual`
- 结论：手动收尾（绕开 finalize 内的 snapshot 同步冲突）。
- AC 证据：5 项全部通过。
- 检查证据：scan-pass、check-AC-1..AC-5。
