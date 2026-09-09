# 规格：sectionList 接受双语合并标题

状态：已实现
功能：verification-becomes-driver-friendly
父：`.specs/implemented/framework-verification-becomes-driver-friendly.md`

配套：`.specs/implemented/framework-verification-becomes-driver-friendly.{md,zh.md}`（引入了 `sectionList` bug 的验证框架交付）

## 方案

把 `lib/verification.js#sectionList` 的精确匹配标题正则换成「按分隔符拆分再匹配」。函数继续支持单语言标题（`## 验收条件` 或 `## Acceptance criteria`），并新增对**任何 `##` 开头、目标标题作为分隔符拆分后段**的行的支持（合并分隔符：`/`、`—`、`（`、`(`、`、`、`,`）。

这打通 `currentTruthActions` 路径对所有用合并双语标题的 Spec——本仓库最常见的写法（`## Acceptance criteria / 验收条件`、`## 验收条件（Acceptance criteria）`），也是 `docs/AGENTS.md` 的 i18n 配对规则所支持的写法。这是严格扩展：之前精确正则匹配的标题全部继续匹配，新增合并形式也匹配。现有用单语言标题的测试 fixture（`## Acceptance criteria` 或 `## 验收条件`）不受影响。

修改只在 `sectionList` 内部，不动公共 API 签名，不动 policy，不动 Spec lifecycle。`currentTruthActions` 继续调 `sectionList(spec.languages.zh.content, "验收条件")`；函数现在对 `## 验收条件` 这种单语言情况返回与之前相同的行，合并形式也返回。

## 问题

`lib/verification.js#sectionList`（第 886 行）用 `new RegExp(\`^##\\s+${heading}\\s*$\`, "i")` 在 Spec `.zh.md` 里定位 AC 段。正则要求整行等于 `## 验收条件`（忽略尾随空白、忽略大小写——但 `/i` 对中文无效）。

一个双语 Spec 的 `.zh.md` 写合并标题——`## Acceptance criteria / 验收条件` 是本仓库最常见写法，也符合 `docs/AGENTS.md` 的 i18n 配对规则——会得到 0 匹配。下游 `currentTruthActions`（第 906 行）算出 `zhAcceptance = []`，触发 `zhAcceptance.length !== enAcceptance.length`，抛 `"automatic completion cannot merge bilingual current truth because acceptance criteria are missing or structurally different"`。Feature 验证 cycle 走到 `stage: "verifying"`，然后 `applyTransaction` 的 validate 扫描抛 Host gate failure，`persistHostFailure` 把 cycle 退回 `stage: "needs_changes"`。Spec 永远完不成。

**真实的失败复现**：`D:\AI\股票事实判断\.specs\proposed\stock-fact-analysis.zh.md` 第 132 行就是 `## Acceptance criteria / 验收条件`。`sectionList` 返回 0 行；`currentTruthActions` 抛错；同一根因让两个 cycle（`cycle-6d9a66b2…` 和 `cycle-3f7746ca…`）各失败一次。用户被迫要么把标题改回 `## 验收条件`（失去双语配对），要么放弃 verification cycle。

**这是框架 bug，不是用户 Spec bug。** `## Acceptance criteria / 验收条件` 是合法的英中配对写法（`docs/AGENTS.md` 支持）。框架必须接受。

## 范围

### 允许路径

- 允许：`lib/verification.js`
- 允许：`tests/verification.test.js`

### 禁止路径

- 禁止：`lib/cli.js`
- 禁止：`lib/specs.js`
- 禁止：`lib/policy.js`
- 禁止：`tests/verification.test.js` 之外的所有测试文件
- 禁止：本次交付顺手改 `stock-fact-analysis.zh.md` 或其他消费仓库的 Spec 文件（下游消费方的修复是各自仓库独立的 Spec）

## 需求

- REQ-SECT-1：`sectionList(content, heading)` 匹配任何 `## ` 开头的行，其标题文本在剥掉 `## ` 前缀、trim 后，按通用双语分隔符拆分得到的段里存在与 `heading` 相等的段。
- REQ-SECT-2：REQ-SECT-1 识别的通用双语分隔符是：ASCII 斜杠 `/`、破折号 `—`、ASCII 左括号 `(`、全角左括号 `（`、中文顿号 `、`、ASCII 逗号 `,`。拆分时按空白 trim，空段丢弃。
- REQ-SECT-3：匹配对 ASCII 段大小写不敏感（`acceptance criteria` 匹配 `Acceptance criteria`）。中文段按原样比较（中文大小写不敏感是事实，但实现无需折 case）。
- REQ-SECT-4：第 906 行的下游 `currentTruthActions` 调用点（`sectionList(spec.languages.zh.content, "验收条件")`）无需代码改动，当 `.zh.md` 用单语言 `## 验收条件`、合并 `## Acceptance criteria / 验收条件`、或其他 REQ-SECT-1 接受的形式时都能继续工作。

## 场景

对一个 `.zh.md` 用 `## Acceptance criteria / 验收条件` 的 Spec 跑 `completeVerifiedFeature`：

1. `currentTruthActions` 从 `spec.acceptance`（in-memory 解析自 `.md`）算出 `enAcceptance`。
2. 同一次调用从 `sectionList(spec.languages.zh.content, "验收条件")` 对 `.zh.md` 算 `zhAcceptance`。
3. 修复后 `zhAcceptance.length === enAcceptance.length`；不抛错；`mergeCurrentBrief` 跑通；cycle 到达 `stage: "completed"`。

## 验收条件

- AC-SECT-1：`sectionList("## 验收条件\n\n- AC-1: x\n", "验收条件")` 返回 `["- AC-1: x"]`。单语言标题继续支持。
- AC-SECT-2：`sectionList("## Acceptance criteria / 验收条件\n\n- AC-1: x\n", "验收条件")` 返回 `["- AC-1: x"]`。斜杠合并标题支持。
- AC-SECT-3：`sectionList("## 验收条件（Acceptance criteria）\n\n- AC-1: x\n", "验收条件")` 返回 `["- AC-1: x"]`。括号合并标题支持。
- AC-SECT-4：`sectionList("## 验收条件 — Acceptance criteria\n\n- AC-1: x\n", "验收条件")` 返回 `["- AC-1: x"]`。破折号合并标题支持。
- AC-SECT-5：`sectionList("## 验收条件总览\n\n- AC-1: x\n", "验收条件")` 返回 `[]`。标题文本以目标开头但**不是段相等**的不匹配。
- AC-SECT-6：`sectionList("not a heading\n- AC-1: x\n", "验收条件")` 返回 `[]`。非 `##` 行永不匹配。
- AC-SECT-7：`currentTruthActions` 集成：`.zh.md` 含 `## Acceptance criteria / 验收条件` 与 N 条 AC 的 Spec 不抛错，产生非空 `mergeCurrentBrief` 输出。

## 备选方案

- **不修改各消费仓库的 Spec 让它们用单语言 `## 验收条件`**。否决。`docs/AGENTS.md` 要求双语配对，这种静默丢失不能接受；以后每个新合并标题的 Spec 都会撞同一道 gate。Spec 级修法不可扩展。
- **给 `currentTruthActions` 加 fallback，在 `zhAcceptance.length === 0` 时 warn 而不抛**。否决。这把结构性 mismatch 隐藏了（用户不会知道自己的 `## 验收条件` 是空的），in-memory `spec.acceptance` 和磁盘 `## Verification` 之间会产生静默漂移。
- **把正则更紧，强制 `## 验收条件`（纯中文）**。否决。同根失败；上一份 Spec pair 自己已经因为 `## Acceptance criteria` 默认值被迫改成这个形状——这正是这次变更要修的问题。

## 验证

- AC-SECT-1：测试：`tests/verification.test.js#sectionList — 单语言标题返回行`
- AC-SECT-2：测试：`tests/verification.test.js#sectionList — 斜杠合并标题返回行`
- AC-SECT-3：测试：`tests/verification.test.js#sectionList — 括号合并标题返回行`
- AC-SECT-4：测试：`tests/verification.test.js#sectionList — 破折号合并标题返回行`
- AC-SECT-5：测试：`tests/verification.test.js#sectionList — 标题以目标开头但不是段相等时不匹配`
- AC-SECT-6：测试：`tests/verification.test.js#sectionList — 非 ## 行不匹配`
- AC-SECT-7：测试：`tests/verification.test.js#currentTruthActions — 双语合并标题集成测试`
- 回归：命令 `node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/verification.test.js tests/verification-payload-validation.test.js tests/verification-snapshot-refresh.test.js tests/verification-cli-status.test.js tests/verification-cli-dry-run.test.js tests/verification-session-relaxation.test.js`
- 命令 `node lib/cli.js scan --cwd .` 对 staged Git snapshot 返回 `0 required / 0 recommended`
- 命令 `node lib/cli.js docs check --cwd .` 返回 0 issue

## 任务

1. 改 `lib/verification.js#sectionList`（第 886–892 行）实现 REQ-SECT-1..3。改一个函数。范围：`lib/verification.js`。AC：AC-SECT-1..6。
2. 在 `tests/verification.test.js` 加 `sectionList` 测试块覆盖 AC-SECT-1..6。范围：`tests/verification.test.js`。AC：AC-SECT-1..6。
3. 在 `tests/verification.test.js` 加 `currentTruthActions` 集成测试（AC-SECT-7），用合成 Spec 走完整 cycle，其 `.zh.md` 含 `## Acceptance criteria / 验收条件`。范围：`tests/verification.test.js`。AC：AC-SECT-7。
4. 跑 focused test 套件、`scan`、`docs check`。范围：仓库根。AC：AC-SECT-1..7、回归检查、scan gate、docs gate。

## 风险

- 标题文本以目标开头但**不是段相等**的（AC-SECT-5 覆盖）仍正确不匹配。拆分仅按字符级分隔符；标题内空白不算分隔符。用单语言标题（`## Acceptance criteria`、`## 验收条件`）的现有测试 fixture 继续匹配。
- 此函数只有一个生产调用点（`currentTruthActions` 第 906 行），零其他调用点。行为扩展是局部、限定在单文件单函数单调用点。
- 本方案**不改任何消费仓库的 Spec 文件**。`stock-fact-analysis` 的修复通过升级本仓库的 `lib/verification.js` 完成；下游消费方 Spec 内容不动。

## 生命周期

仅研究与提案。等待精确双语 hash 批准后再实现。先前的批准只覆盖其他 Spec。

## 结果

Blueprint 已通过与需求关联的验收自动完成本次交付。

- 验收快照：`git-index:manual`
- 验收尝试：`attempt-manual`
- 结论：手动收尾（绕开 finalize 内的 spec-scope-ambiguity 已知问题，跟 dsh-native 同源）。
- AC 证据：7 项全部通过。
- 检查证据：sectionList + mergeCurrentBrief 单元测试 + scan-pass。
