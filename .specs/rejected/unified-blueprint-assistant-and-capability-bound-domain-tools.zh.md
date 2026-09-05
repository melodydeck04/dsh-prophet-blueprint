# 规格:统一 Blueprint 助手与能力受限的领域工具

Status: rejected — superseded by the Skills sub-specs A, B, C, D which own the lib/ subtree more narrowly
Feature: spec-governance--architecture-design

## 提案

本 Spec 已被拒绝。lib/ 子树现在由 `agent-interface--skills-layer` 的 Skills 子 Spec A、B、C、D 更窄地拥有,各自声言一组聚焦路径(loader、内容 + CLI、约定、设计时自动触发)。后续若需重新实施,应另起新的 proposed Spec,不要恢复本 Spec。

## 问题

Blueprint 当前在"优化 Spec"中提供 Spec 审核助手,又在"架构设计"中提供单独的架构助手。两个角色的概念分工是合理的,但两个可见对话迫使开发者选择系统内部专家、理解何时切换,并维护重复的草稿、历史、聚焦目标与交接状态。最新交接卡减少了重复描述,却没有消除这份认知负担。

两个 Session 还依赖提示而不是可执行的能力边界。Spec 审核助手虽然被告知只能编辑当前功能说明与 proposed Spec,但仍然使用当前 DSH Agent 的完整工具面。"把仓库遗漏补齐"之类宽泛请求因此可能被解释为允许修改选中提案之外的 Feature 记录或生命周期文件。扫描器又进一步制造歧义:即使 Component `Supported features` 已被声明为规范来源,它仍建议把 Component 分配复制回 Feature 侧历史镜像。一次失败的生命周期移动因此可能把源文件截断,而这种清理本来就不应成为 Spec 审核的有效动作。
