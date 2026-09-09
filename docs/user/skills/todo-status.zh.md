# todo-status

[English](todo-status.md) | 中文

## 行为

Spec 任务进度的只读参考。返回 TODO 条目和计数；任务完成不代表 AC 验收通过。读取近期事件需要明确的会话 ID。缺少 TODO 时返回空列表，缺少 Spec 时报告错误。不会推进任务或启动验收。

## 入口

按名称调用 DSH 中可用的 Skill。DSH 加载指令；可选适配函数需要可用的执行工具。参见 [Skill 指令](../../../skills/todo-status/SKILL.md)。
