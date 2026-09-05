# 规格：Blueprint 批准前预览

状态：已实现
功能：spec-governance

## 问题

`design-blueprint approve <feature-id> --spec-hash <hash> --yes` 接收一个 hash 并写入审批记录，但 CLI 从不展示被批准的内容。开发者必须去另一个工具里打开 proposed Spec，自己算它的 hash，再手工对一遍。Web 仪表盘的 `getBlueprintDashboard` 已经在 `artifacts.brief.{en,zh}.content` 里为每个 Feature 返回了 Spec 内容，所以数据是有的；缺的只是 CLI 的渲染。本规格在 CLI 这一层补上这个渲染。

同一份渲染单独用也很有用：开发者可以通过 `design-blueprint spec show <path>` 不走审批流程直接 review 任何一份 proposed Spec。

## 范围

### 允许路径

- 允许：`docs/user/features/blueprint-approve-preview.md`
- 允许：`docs/user/features/blueprint-approve-preview.zh.md`
- 允许：`docs/user/features/blueprint-approve-preview.i18n.yaml`

### 禁止路径

- 禁止：`lib/scan.js`
- 禁止：`lib/web-api.js`
- 禁止：`lib/orchestration.js`
- 禁止：`lib/verification.js`
- 禁止：`lib/chat-commands.js`
- 禁止：`lib/client.js`
- 禁止：`lib/workflow.js`
- 禁止：`lib/specs.js`
- 禁止：`lib/policy.js`
- 禁止：`lib/config.js`
- 禁止：`lib/features.js`
- 禁止：`lib/architecture.js`
- 禁止：`lib/artifacts.js`
- 禁止：`lib/reconciliation.js`
- 禁止：`lib/snapshot.js`
- 禁止：`lib/project-binding.js`
- 禁止：`lib/version.js`
- 禁止：`lib/stamps.js`
- 禁止：`lib/path-utils.js`
- 禁止：`lib/docs.js`
- 禁止：`lib/assistant-actions.js`
- 禁止：`lib/init.js`
- 禁止：`lib/project-root.js`
- 禁止：`lib/project-discovery.js`
- 禁止：`lib/invariant.js`
- 禁止：`.blueprint/approvals/**`
- 禁止：`.blueprint/verifications/**`
- 禁止：本 Spec 配对文件以外的 `.specs/**`
- 禁止：`docs/i18n/**`
- 禁止：`design-blueprint.json` 的 default 或 authority 段

## 方案

### `spec show <path> [--no-line-numbers] [--json]`

读取 Spec 文件并把内容带一基行号打到 stdout。打印结果适合 `less` 或任何 pager。

`--no-line-numbers` 去掉左侧的 gutter，供希望得到纯净 Markdown 的消费方使用（例如接入 Markdown 渲染器）。

`--json` 输出一个 JSON 对象，包含 `{ file, lineCount, byteCount, content }`。方便工具链接入。

该命令只读，不动文件系统，也不触碰任何审批/验证记录。

### `approve <feature-id> --spec-hash <hash> --yes --show`

在写入审批记录 **之前** 把 proposed Spec 打到 stdout。头部包含 hash、源文件路径、一行摘要；正文是完整 Spec。审批只在打印完整 Spec 之后才落盘，所以开发者读输出时如果想中止（Ctrl-C），审批就不会被提交。

`--show` 与 `--yes` 互相独立。开发者可以 `approve --show` 但不传 `--yes` 来只读 Spec 不审批；真实审批仍然要 `--yes`。

### 共享渲染辅助

`lib/cli.js` 新增一个内部辅助 `renderSpecForReview(filePath, options)`，两个子命令都调用它。辅助负责解析文件路径、读内容、算行数和字节数、输出带 gutter 的文本。不公开导出；两个命令保持自洽。

## 验收条件

- AC-AP-001：`design-blueprint spec show --spec .specs/proposed/foo.md` 打印文件内容带行号；第一个非空行是 `# Spec: <title>`；最后一行是末尾换行。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-AP-002：`design-blueprint spec show --spec <missing>` 退出码非零，并清楚提示"文件未找到"并指向解析后的路径。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-AP-003：`design-blueprint spec show --spec <file> --no-line-numbers` 打印相同内容但不带左侧 gutter。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-AP-004：`design-blueprint spec show --spec <file> --json` 输出合法 JSON，含 `file`、`lineCount`、`byteCount`、`content` 字段。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-AP-005：`design-blueprint approve <feature-id> --spec-hash <hash> --show` 向 stdout 打印 Spec 源文件路径、hash、一行摘要、完整正文；审批仅在打印完成后才落盘。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-AP-006：`design-blueprint approve <feature-id> --spec-hash <hash> --show` 不传 `--yes` 时打印 Spec 但不写审批记录。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-AP-007：`design-blueprint approve <feature-id> --spec-hash <hash> --yes` 不传 `--show` 时不打印 Spec 正文，保留现有的一行审批输出。[surface=cli; moment=terminal; evidence=contract-integration]
- AC-AP-008：所有现有 `tests/*.test.js` 在改动后继续通过。[surface=cli; moment=terminal; evidence=contract-integration]

## 验证

- AC-AP-001：测试 `tests/cli-spec-show.test.js`
- AC-AP-002：测试 `tests/cli-spec-show.test.js`
- AC-AP-003：测试 `tests/cli-spec-show.test.js`
- AC-AP-004：测试 `tests/cli-spec-show.test.js`
- AC-AP-005：测试 `tests/cli-approve-preview.test.js`
- AC-AP-006：测试 `tests/cli-approve-preview.test.js`
- AC-AP-007：测试 `tests/cli-approve-preview.test.js`
- AC-AP-008：命令 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js"`

## 风险

- 渲染会把 proposed Spec 的原始 Markdown 直接打到开发者终端。一份恶意 Spec 可能嵌入 ANSI 转义（比如 `\u001b[2J` 清屏）来迷惑开发者。所以渲染辅助必须做最小转义：剥掉 CR（`\r`）防日志注入；除非传 `--json`，否则拒绝包含 ESC 字节（`\u001b`）的内容。Spec 语言是 Markdown，没有任何合法的 ESC 用途。
- `--show` 在审批写入之前同步打印，所以一份长 Spec（Phase 2 的 12 000 字符的分解 Spec 是合理的）会向 stdout 输出长流。框架已经走 stdout 流式输出；不引入缓冲。后续规格可加 `--show | head -N` 之类的分页钩子。
- 实现新增子命令（`spec show`）和一条新 flag（`approve` 上的 `--show`）。两条都走同一个 CLI 解析器，所以未知 flag 报错路径继续由现有测试覆盖。

## 其他方案

**直接用 `cat`（Windows 上 `Get-Content`）。** 拒绝。理由：gutter 和 ESC 字节拒绝必须对所有调用方保持一致；用 `cat` 管道没办法提供这些。一份原生渲染还能让后续 Web 面板预览复用同一份辅助，不用复制安全规则。

**在 Web 审批路由上加 `?show=1` 查询 flag，删掉 CLI flag。** 拒绝。理由：Blueprint Web 当前在本 session 里不可达，开发者已经明确授权了 CLI fallback 路径完成本工作。CLI flag 是当下唯一的表面；Web flag 是后续规格。

**渲染到临时文件再 `xdg-open`。** 拒绝。理由：为一处微小的 UX 改进加上临时文件生命周期（创建、删除、错误路径）不值。终端渲染足够。

## 任务

1. 在 `lib/cli.js` 实现 `runSpecShow` 子命令加 `renderSpecForReview` 辅助；在 `main()` 注册新的 `spec show` 分发。REQ：AC-AP-001..AC-AP-004。Scope：`tests/cli-spec-show.test.js`、`docs/user/features/blueprint-approve-preview.{md,zh.md,i18n.yaml}`。
2. 在 `lib/cli.js` 的 `runApprove` 加 `--show` flag；设置时在写审批记录之前打印 Spec。REQ：AC-AP-005..AC-AP-007。Scope：`tests/cli-approve-preview.test.js`。
3. 扩展 `package.json` 的 lint:js 脚本包含两个新测试文件。REQ：AC-AP-008。Scope：`package.json`。
4. 编写 `docs/user/features/blueprint-approve-preview.md` + `.zh.md` + `.i18n.yaml`；写完后跑 `node lib/cli.js docs confirm <owner>`。REQ：AC-AP-001..AC-AP-008。Scope：docs。
5. 跑 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test "tests/*.test.js"` 和 `node lib/cli.js scan --all --cwd .`；确认 scan 报 `0 required`，完整测试套件继续通过。REQ：AC-AP-008。Scope：-。

## 结果

Blueprint 已通过与需求关联的验收自动完成本次交付。

- 验收快照：`git-index:089cc57b4dd1159998989b7e7eea5cfe0b56de48752e911fe03866f976a337d3`
- 验收尝试：`attempt-1`
- 结论：blueprint-approve-preview implementation complete. lib/cli.js adds spec show subcommand (with --no-line-numbers and --json options) and --show flag to approve. renderSpecForReview helper guards against ESC byte injection. 10 new tests pass; bilingual docs pair confirmed.
- AC 证据：8 项全部通过。
- 检查证据：spec-show-unit（command）、approve-preview-unit（command）、full-suite（command）、docs-check（command）。
