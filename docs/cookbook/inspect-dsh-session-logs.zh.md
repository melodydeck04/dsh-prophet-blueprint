# 检查本地 DSH 会话日志

[English](inspect-dsh-session-logs.md) | 中文

`tools/peek-session.mjs` 是用于检查 DSH 会话日志的只读本地工具，也支持子代理会话。它直接读取 DSH 的 zstd 压缩 JSONL 文件；不会启动 DSH、改写会话文件、发起网络请求或向外发送日志内容。

## 列出会话

在本仓库中运行：

```powershell
node tools/peek-session.mjs --list
```

默认根目录是 `%USERPROFILE%\.dsh\sessions`。每行会显示持久化 workspace 的 `cwd`、会话 id、压缩大小、事件数量、preset，以及存在时的子代理父级／委派元数据。

可按 workspace 路径或存储目录文本过滤大量历史：

```powershell
node tools/peek-session.mjs --list --project design-blueprint
```

存储的项目目录名不是可逆的 workspace 路径：连字符既可能是分隔符，也可能是目录名的一部分。因此命令会使用持久化 session header 中的 `cwd` 作为显示值；只有缺少它时才回退到存储名称。

## 检查子代理谱系

将所有匹配会话显示为树形：

```powershell
node tools/peek-session.mjs --tree --project design-blueprint
```

DSH 在子代理 session header 中保存 `parentSession`、`origin: "subagent"` 和可选的 `delegationDepth`。树形视图按 id 关联这些 header。父级日志不在所选根目录时，子项仍会以 `orphan` 标记显示；工具绝不会从目录名猜测父级。

## 检查一个会话

从列表中复制一个 id。摘要是最安全的起点，因为它会报告元数据、事件数量、时间范围、压缩事件和直接子项 id，不会打印每条消息：

```powershell
node tools/peek-session.mjs session-01234567-89ab-cdef-0123-456789abcdef --summary
```

先缩小事件流再打印：

```powershell
node tools/peek-session.mjs session-01234567-89ab-cdef-0123-456789abcdef --type tool/call --last 20
node tools/peek-session.mjs session-01234567-89ab-cdef-0123-456789abcdef --grep prepare --last 10
node tools/peek-session.mjs session-01234567-89ab-cdef-0123-456789abcdef --tool web_search --last 10
```

`--json` 会输出完整的匹配持久化记录。会话日志可能包含提示词、工具参数、工具结果、路径和接近凭据的配置。请将 JSON 输出保留在本地，分享前先脱敏。

## 检查归档或测试 fixture

只为当前命令设置 `DSH_SESSIONS_ROOT`：

```powershell
$env:DSH_SESSIONS_ROOT = 'D:\archive\dsh-sessions'
node tools/peek-session.mjs --tree
Remove-Item Env:DSH_SESSIONS_ROOT
```

备用根目录必须使用与 DSH 本地会话目录相同的 `storage-project/storage-session/session.jsonl.zstd` 布局。

## 处理正在写入或不完整的日志

会话仍在运行时，DSH 可能还在追加最后一个 zstd 帧。读取器会保留此前所有完整帧，并以 `torn-tail` 标记结果。写入结束后重新执行同一读取。不要为了检查而解压、截断、修复或覆盖原始日志。
