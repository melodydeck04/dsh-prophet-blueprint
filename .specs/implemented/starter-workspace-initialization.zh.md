# 规格：起步工作区初始化

[English](starter-workspace-initialization.md) | 简体中文

Status: implemented

## 问题

Blueprint 首次运行发现目前只会把 Git 根目录或包含少量技术栈文件的目录视为项目。新项目目录通常是空的，开发者也经常只先创建 `README.md` 或 `.gitignore`。在这些有效工作区中，**重新检查**只会重复同一个没有解释的结果，浏览器也无法让开发者声明当前精确的 DSH 工作区就是预期项目根目录。

## 范围

- allow: `lib/project-discovery.js`
- allow: `lib/web-api.js`
- allow: `lib/client.js`
- allow: `lib/version.js`
- allow: `tests/project-discovery.test.js`
- allow: `tests/web-api.test.js`
- allow: `tests/client.test.js`
- allow: `README.md`
- allow: `README.zh.md`
- allow: `README.i18n.yaml`
- allow: `DESIGN.md`
- allow: `package.json`
- allow: `.specs/proposed/starter-workspace-initialization.md`
- allow: `.specs/proposed/starter-workspace-initialization.zh.md`
- allow: `.specs/proposed/starter-workspace-initialization.i18n.yaml`
- allow: `.specs/implemented/starter-workspace-initialization.md`
- allow: `.specs/implemented/starter-workspace-initialization.zh.md`
- allow: `.specs/implemented/starter-workspace-initialization.i18n.yaml`

## 决策

自动识别保持确定性：Git 根目录和现有技术栈标记是仅有的强候选。另外，只要当前 DSH 工作区是真实目录且不是文件系统根目录，发现流程就把这个精确目录作为需要开发者确认的目标提供。这个回退目标绝不由模型选择，也不根据任意文件名推断。

浏览器区分已识别项目和未识别的起步工作区。对于后者，界面解释识别结果、显示所有直接子项目提示，并提供**确认此目录并初始化**。该操作携带显式确认位，并通过浏览器确认框指出精确路径。Host 会重新发现工作区，只有请求目标仍然等于当前精确工作区时才接受回退目标；文件系统根目录不可用。

**重新检查**会显示进行中状态，并用新的发现响应替换设置结果，因此结果没有变化时也不会让人误以为按钮失效。

## 已考虑的替代方案

**把 `README.md` 和 `.gitignore` 加入自动标记列表。** 不采用，因为这些文件在聚合多个项目的目录中也很常见，不能可靠识别根目录。

**把每个当前目录都当作自动候选。** 不采用，因为这会抹去确定性发现与开发者决定项目根目录之间的区别。

**继续要求先初始化 Git 或创建技术栈清单。** 不采用，因为这会让 Blueprint 设置依赖无关的项目引导步骤，并阻止合法的空工作区。

## 验证

- AC-1: `tests/project-discovery.test.js` 覆盖把空工作区和通用起步工作区作为单独的确认目标返回。
- AC-2: `tests/project-discovery.test.js` 覆盖拒绝文件系统根目录和保留直接子项目提示。
- AC-3: `tests/web-api.test.js` 覆盖显式确认位、当前精确路径，以及拒绝未经确认或不同的路径。
- AC-4: `tests/client.test.js` 检查浏览器包中的确认载荷、确认操作和可见的重新检查状态。
- AC-5: `npm.cmd test` 报告 50 项测试通过；`npm.cmd run lint:js` 通过；完成 README 双语确认后，`node lib/cli.js scan --all` 通过。

## 后果

空工作区和早期工作区不再需要先完成无关的 Git 或技术栈引导才能设置 Blueprint。开发者可能显式选择包含无关内容的目录，因此产品会指出精确路径、保留直接子项目警告、要求独立确认位、拒绝文件系统根目录、写入前立即重新发现，并维持初始化器仅在文件缺失时创建的行为。
