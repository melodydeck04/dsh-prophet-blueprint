# Blueprint 批准前预览

[English](blueprint-approve-preview.md) | 中文

## 实现什么

`design-blueprint approve <feature-id> --spec-hash <hash> --yes --show` 现在在写入审批记录 **之前** 把内容打到终端，让开发者不必离开 CLI 就能看清自己正在批准什么。第二个命令 `design-blueprint spec show <path>` 给任何一份 proposed Spec 加一基行号打印，方便在不进入审批流的情况下快速 review。

渲染逻辑封装在 `lib/cli.js` 的单一辅助 `renderSpecForReview(filePath, options)` 里。两个命令都调它，共享同一份行号 gutter 和同一份 ESC 字节安全检查（除非传 `--json`，渲染器拒绝任何含 `\u001b` 的内容，避免恶意 Spec 清掉开发者的终端）。

## 最终效果

- `design-blueprint spec show --spec .specs/proposed/foo.md` 打印文件内容带一基行号；第一个非空行是 `# Spec: <title>`；最后一行带换行收尾。
- `design-blueprint spec show --spec .specs/proposed/foo.md --no-line-numbers` 打印相同内容但不带左侧 gutter。
- `design-blueprint spec show --spec .specs/proposed/foo.md --json` 输出一个 JSON 对象，含 `file`、`lineCount`、`byteCount`、`content` 字段。
- `design-blueprint spec show --spec <missing>` 退出码非零，错误是 `spec file not found: <path>`。
- `design-blueprint approve <feature-id> --spec-hash <hash> --show` 打印一段头部（feature id、源路径、hash、行数和字节数）接 Spec 正文；只有开发者再传 `--yes` 时才写入审批记录。
- `design-blueprint approve <feature-id> --spec-hash <hash> --show --json` 输出一个 JSON 信封，含同样的数据并多一个完整 `content` 字段。

## 怎么使用

1. 不审批，只 review：
   ```bash
   design-blueprint spec show --spec .specs/proposed/foo.md
   ```
2. 审批的同时把 Spec 顺便看完：
   ```bash
   design-blueprint approve spec-governance \
     --spec-hash cd251b7f2c0fd87e0332401753a242c6d2357ff886bc52d96e195544be8d3d6e \
     --show --yes
   ```
3. 长 Spec 走 pager：
   ```bash
   design-blueprint spec show --spec .specs/proposed/foo.md | less -R
   ```

## 配套

本规格对第 1 阶段的持久 TODO 列表没有运行时依赖；它只是 CLI 本身 read 侧的补充。它是 `design-blueprint approve <feature-id> --spec-hash <hash> --yes` 的查看配套：开发者现在能「看见」而不只是「签字」自己要锁定的字节。