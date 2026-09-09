# decompose-spec

[English](decompose-spec.md) | 中文

## 行为

按 design-blueprint.json 拆分配置审查指定 Spec 的参考说明。报告违规项，不改写 Spec。目标必须明确，修改时间不能确定归属。缺少文件时报告错误。阈值来自配置，不采用 Skill 中固定的数字。

## 入口

按名称调用 DSH 中可用的 Skill。DSH 加载指令；可选适配函数需要可用的执行工具。参见 [Skill 指令](../../../skills/decompose-spec/SKILL.md)。
