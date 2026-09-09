# verify-feature

[English](verify-feature.md) | 中文

## 行为

在 Host 准备的快照上执行用户要求的验收检查。只询问状态时读取已有结论，不启动尝试。支持原生模型选择及显式调用。辅助函数要求提供 runChecks 回调，不会从 Spec 文本推导通过证据。使用带精确哈希和凭据的 prepare/start/result/finalize 流程。检查失败和中断保持可见，不承诺自动成功或无条件重试。

## 入口

从 DSH Skill 目录加载 `verify-feature`。加载说明不代表执行或授权。参见 `skills/verify-feature/SKILL.md`。
