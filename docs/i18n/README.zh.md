# 双语文档

[English](README.md) | 中文

`design-blueprint.json` 中 `documentation.i18n.include` 选中的每份文档都有同等权威的英文版和简体中文版。每组配对由三个同目录文件组成：`foo.md`、`foo.zh.md` 和 `foo.i18n.yaml`。

## 配对契约

每次更新都可以先编辑任意一种语言。对应文档必须表达相同含义、遵守配置的术语，并保持相同的 Markdown 结构。英文文档在 H1 后紧接 `English | [中文](foo.zh.md)`，中文文档在相同位置使用 `[English](foo.md) | 中文`。

YAML 记录保存两份已审阅文件的完整 Git blob 哈希。使用 `design-blueprint docs check` 列出违规项；只有完成语义审阅后，才能运行 `design-blueprint docs confirm <foo.md>`。确认命令只记录内容身份，不负责翻译，也不能证明语义一致。

更新已有配对时，应依据被编辑一侧的最小有效差异修补另一侧，不要重新翻译未改动的整篇文档。常规 AI 编辑直接遵守此规则；扩展的 `blueprint-translate-docs` Skill 仅在用户明确要求时运行。
