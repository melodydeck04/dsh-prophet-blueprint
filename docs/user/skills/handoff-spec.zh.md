# handoff-spec

[English](handoff-spec.md) | 中文

## 行为

临时 Spec 快照的参考说明。在系统临时目录写入带时间戳的 Markdown 文件，包含 Spec 元数据、需求及最多 50 行验收章节内容。适配函数不会收集验收尝试、TODO 状态或会话片段。缺少文件或临时目录写入失败时报告错误，没有自动沙箱回退。输出是快照，不是验收证据。

## 入口

按名称调用 DSH 中可用的 Skill。DSH 加载指令；可选适配函数需要可用的执行工具。参见 [Skill 指令](../../../skills/handoff-spec/SKILL.md)。
