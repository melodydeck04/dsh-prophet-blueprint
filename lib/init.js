//#region lib/types/init.js
/**
 * Non-destructive project scaffold for spec-driven development.
 *
 * @module @dsh-plugins/design-blueprint/init
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CONFIG_FILE, DEFAULT_CONFIG } from "./config.js";
import { serializePairRecord } from "./docs.js";

const AGENTS_TEMPLATE = `# Project development instructions

This repository uses spec-driven development.

- Read \`design-blueprint.json\` and the authority documents it names before making changes.
- For every non-trivial change, create or update one specification under \`.specs/\` before implementation.
- Keep implementation changes inside the specification's machine-readable \`## Scope\`.
- Give every proposed acceptance criterion a stable \`AC-*\` id and a matching entry under \`## Verification\`.
- Do not claim completion until \`design-blueprint scan\` passes against the staged Git snapshot.
- Move a specification between lifecycle directories only when its \`Status:\` and body describe that lifecycle.
- Treat \`.blueprint/features/*.md\` as the developer-owned feature map. New Features use a developer-confirmed ASCII local key; Host-prepared artifact paths are authoritative and AI must never invent or fuzzy-match alternatives.
- A Feature-linked proposed spec requires a current exact-hash approval record before implementation. Blueprint Web is preferred; when Web is unavailable, the developer may explicitly authorize \`design-blueprint approve <feature-id> --spec-hash <sha256> --yes\`. AI must never hand-write or edit approval records.
`;

const SPECS_README = `# Specifications

This directory is the lifecycle inventory for design decisions.

- \`proposed/\`: reviewed intent before implementation.
- \`implemented/\`: decisions that describe shipped reality.
- \`rejected/\`: proposals retained with a rejection reason.

Run \`design-blueprint scan --all\` to validate the working tree and \`design-blueprint scan\` to validate the exact staged snapshot.
`;

const README_TEMPLATE = `# Project

English | [中文](README.zh.md)

This project uses Design Blueprint for spec-driven development. Replace this introduction with the project's public purpose and usage contract.
`;

const README_ZH_TEMPLATE = `# 项目

[English](README.md) | 中文

本项目使用 Design Blueprint 进行规格驱动开发。请将这段说明替换为项目对外公开的用途和使用契约。
`;

const DESIGN_TEMPLATE = `# Architecture

## Current system

The product architecture has not been documented yet. Record existing components and ownership here before changing their responsibilities.

## Change rule

Architecture changes must update this document and their owning lifecycle specification in the same change.
`;

const ADOPTION_SPEC = `# Spec: Adopt Blueprint governance

Status: implemented

## Problem

The project needs an explicit, inspectable development-governance baseline before later product changes are proposed.

## Scope

- allow: \`design-blueprint.json\`
- allow: \`AGENTS.md\`
- allow: \`DESIGN.md\`
- allow: \`README.md\`
- allow: \`.specs/**\`
- allow: \`.blueprint/**\`
- allow: \`.dsh/skills/**\`
- allow: \`docs/**\`

## Decision

The project adopts Design Blueprint authority documents, lifecycle-managed specifications, and a developer-owned feature catalog. This decision describes governance only and makes no claim about existing product behavior.

## Alternatives considered

**Rely on informal chat instructions.** Rejected because they do not provide durable scope ownership or reviewable project authority.

## Verification

- command: \`design-blueprint scan --all\`

## Consequences

Future non-trivial changes establish or update a scoped specification before implementation. Product architecture and feature boundaries remain to be documented by their owners.
`;

const DOCS_AGENTS_TEMPLATE = `# Documentation standard

This file owns document placement and writing responsibilities for human-facing documentation.

## One home per fact

- Root \`AGENTS.md\`: standing development orders needed in every AI session.
- \`DESIGN.md\`: current architecture, component ownership, seams, and extension points.
- \`.specs/\`: decision rationale, trade-offs, acceptance criteria, and verification evidence.
- Package or feature README: public configuration, behavior, limitations, and extension points owned there.
- \`docs/cookbook/\`: ordered tutorials that lead a reader to an outcome.
- \`docs/reference/\`: lookup-oriented current behavior and definitions.
- \`docs/user/\`: product-facing guides.
- Project-local Skills under \`.dsh/skills/\`: reusable AI workflows, never product contracts.

Put each durable fact in the lowest document that owns it and link to that owner elsewhere. Describe current state rather than change history. Classify each human-facing page as tutorial or reference, keep relative links machine-checkable, and update an owning specification with every non-trivial change.

## Bilingual work

Follow \`docs/i18n/README.md\`, \`docs/i18n/translation-rules.md\`, and \`docs/i18n/terminology.md\`. Update both sides in one change and run \`design-blueprint docs check\`. Only run \`design-blueprint docs confirm <file>\` after a person or capable AI has reviewed semantic equivalence.
`;

const I18N_README = `# Bilingual documentation

English | [中文](README.zh.md)

Every document selected by \`documentation.i18n.include\` in \`design-blueprint.json\` has equal-authority English and Simplified Chinese forms. A pair is three siblings: \`foo.md\`, \`foo.zh.md\`, and \`foo.i18n.yaml\`.

## Pairing contract

Either language may be authored first for an update. The counterpart must say the same thing, preserve the configured terminology, and retain the same Markdown structure. English places \`English | [中文](foo.zh.md)\` immediately after H1; Chinese places \`[English](foo.md) | 中文\` there.

The YAML record stores the full Git blob hash of both reviewed files. Run \`design-blueprint docs check\` to list violations and \`design-blueprint docs confirm <foo.md>\` only after semantic review. Confirmation records content identity; it does not translate text or prove its meaning.

For an existing pair, patch the counterpart from the edited side's smallest meaningful diff. Do not retranslate an untouched full document. The normal AI editing path follows this rule directly; the extended \`blueprint-translate-docs\` Skill runs only when explicitly requested.
`;

const I18N_README_ZH = `# 双语文档

[English](README.md) | 中文

\`design-blueprint.json\` 中 \`documentation.i18n.include\` 选中的每份文档都有同等权威的英文版和简体中文版。每组配对由三个同目录文件组成：\`foo.md\`、\`foo.zh.md\` 和 \`foo.i18n.yaml\`。

## 配对契约

每次更新都可以先编辑任意一种语言。对应文档必须表达相同含义、遵守配置的术语，并保持相同的 Markdown 结构。英文文档在 H1 后紧接 \`English | [中文](foo.zh.md)\`，中文文档在相同位置使用 \`[English](foo.md) | 中文\`。

YAML 记录保存两份已审阅文件的完整 Git blob 哈希。使用 \`design-blueprint docs check\` 列出违规项；只有完成语义审阅后，才能运行 \`design-blueprint docs confirm <foo.md>\`。确认命令只记录内容身份，不负责翻译，也不能证明语义一致。

更新已有配对时，应依据被编辑一侧的最小有效差异修补另一侧，不要重新翻译未改动的整篇文档。常规 AI 编辑直接遵守此规则；扩展的 \`blueprint-translate-docs\` Skill 仅在用户明确要求时运行。
`;

const TRANSLATION_RULES = `# Translation rules

English | [中文](translation-rules.zh.md)

## Fidelity

Add and remove no claims. Translate the idea rather than the idiom, keep the target language natural, preserve modality and warnings, and use \`terminology.md\` as the terminology authority.

## Structure

Preserve heading depths and order, list kinds and item counts, ordered-list starts, table shapes, link targets, and fenced-code info strings and bodies. Keep inline code and identifiers verbatim. The language switcher is the only language-specific link target.

## Update method

For a new pair, translate the complete reviewed source once. For an existing pair, recover the last confirmed state from the YAML hashes, identify the edited side's smallest meaningful change, and patch only the counterpart region. Move, rename, and delete all three pair artifacts together.

Chinese prose uses full-width Chinese punctuation and a half-width space between Chinese characters and adjacent Latin text or numerals where natural.
`;

const TRANSLATION_RULES_ZH = `# 翻译规则

[English](translation-rules.md) | 中文

## 忠实性

不要增加或删除主张。翻译含义而不是照搬习语，使目标语言自然，保留语气强度和警告，并将 \`terminology.md\` 作为术语权威来源。

## 结构

保留标题层级和顺序、列表类型和项目数量、有序列表起始编号、表格形状、链接目标，以及围栏代码块的信息字符串和正文。内联代码与标识符保持原样。语言切换链接是唯一允许因语言不同而改变的链接目标。

## 更新方法

创建新配对时，对已审阅的完整源文档翻译一次。更新已有配对时，根据 YAML 哈希找回上次确认的状态，识别被编辑一侧的最小有效变化，只修补对应文档的相关区域。移动、重命名或删除时，三个配对文件必须一起处理。

中文正文使用全角中文标点；中文与相邻的拉丁文字或数字之间按自然排版添加半角空格。
`;

const TERMINOLOGY = `# Bilingual terminology

This bilingual table is the project terminology source of truth. Add product-specific terms before translating prose that uses them.

| English | 简体中文 | First mention | Forbidden translations | Notes |
| --- | --- | --- | --- | --- |
| specification | 规格 | 规格（specification） | 说明书 | A lifecycle-managed development decision. |
| authority document | 权威文档 | 权威文档（authority document） | 权限文档 | The single owning source for a durable fact. |
| translation pair | 翻译配对 | 翻译配对（translation pair） | 翻译副本 | Two equal-authority language files and their record. |
| Git blob hash | Git blob 哈希 | Git blob 哈希 | 文件 SHA-1 | Hash over Git's blob object header and exact bytes. |
`;

const STYLE_SAMPLES = `# Translation style samples

Record short, reviewed project-specific English and Chinese prose samples here. Translation should match their voice without copying their factual claims.
`;

const DOC_STANDARDS_SKILL = `---
name: blueprint-doc-standards
description: Place, audit, and revise project documentation according to docs/AGENTS.md and the Blueprint authority map.
---

# Blueprint document standards

Read \`design-blueprint.json\`, \`docs/AGENTS.md\`, and the owning specification before editing human-facing documentation. Determine which document tier owns each fact, move lower-level detail to its owner, link instead of duplicating, and describe current state. Classify the page as tutorial or reference. Update an in-scope translation pair in the same change, then run \`design-blueprint docs check\` and the normal project verification.
`;

const TRANSLATE_DOCS_SKILL = `---
name: blueprint-translate-docs
description: Explicit extended workflow for creating, repairing, renaming, or deleting Blueprint bilingual document pairs.
disable-model-invocation: true
user-invocable: true
---

# Blueprint translation workflow

Use this Skill only when the user explicitly requests the extended translation workflow. Read \`docs/i18n/README.md\`, \`docs/i18n/translation-rules.md\`, \`docs/i18n/terminology.md\`, and the target pair before editing.

For an existing pair, compare the edited side with the content identified by its recorded Git blob hash and patch the counterpart at the smallest safely aligned region. Never retranslate an unchanged full document. For a new pair, translate the reviewed document once and add both switchers. Preserve headings, lists, tables, links, inline code, and fenced code exactly as required. Rename or delete all three artifacts together. Run \`design-blueprint docs check\`, review semantic equivalence, and only then run \`design-blueprint docs confirm <file>\`.
`;

async function writeIfMissing(path, content) {
	try {
		await readFile(path);
		return false;
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
	await writeFile(path, content, { encoding: "utf8", flag: "wx" });
	return true;
}

async function exists(path) {
	try { await readFile(path); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

async function writePairIfAbsent(cwd, owner, ownerContent, counterpart, counterpartContent, created) {
	const record = owner.replace(/\.md$/, ".i18n.yaml");
	const paths = [owner, counterpart, record].map((file) => join(cwd, ...file.split("/")));
	const present = await Promise.all(paths.map(exists));
	if (present.some(Boolean)) return;
	await writeFile(paths[0], ownerContent, { encoding: "utf8", flag: "wx" });
	await writeFile(paths[1], counterpartContent, { encoding: "utf8", flag: "wx" });
	await writeFile(paths[2], serializePairRecord(owner, ownerContent, counterpart, counterpartContent), { encoding: "utf8", flag: "wx" });
	created.push(owner, counterpart, record);
}

async function ensureConfig(cwd, created, updated) {
	const path = join(cwd, CONFIG_FILE);
	if (!(await exists(path))) {
		await writeFile(path, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
		created.push(CONFIG_FILE);
		return;
	}
	let raw;
	try { raw = JSON.parse(await readFile(path, "utf8")); } catch { return; }
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return;
	let changed = false;
	if (raw.documentation === undefined) {
		raw.documentation = structuredClone(DEFAULT_CONFIG.documentation);
		changed = true;
	}
	if (raw.features && typeof raw.features === "object" && raw.features.approvalsRoot === undefined) {
		raw.features.approvalsRoot = DEFAULT_CONFIG.features.approvalsRoot;
		changed = true;
	}
	if (Array.isArray(raw.changePolicy?.allowWithoutSpec) && !raw.changePolicy.allowWithoutSpec.includes(".blueprint/approvals/**")) {
		raw.changePolicy.allowWithoutSpec.push(".blueprint/approvals/**");
		changed = true;
	}
	if (Array.isArray(raw.changePolicy?.allowWithoutSpec) && !raw.changePolicy.allowWithoutSpec.includes(".blueprint/architecture/**")) {
		raw.changePolicy.allowWithoutSpec.push(".blueprint/architecture/**");
		changed = true;
	}
	if (raw.architecture === undefined) {
		raw.architecture = { root: DEFAULT_CONFIG.architecture.root };
		changed = true;
	} else if (raw.architecture && typeof raw.architecture === "object" && raw.architecture.root === undefined) {
		raw.architecture.root = DEFAULT_CONFIG.architecture.root;
		changed = true;
	}
	if (!changed) return;
	await writeFile(path, JSON.stringify(raw, null, 2) + "\n", "utf8");
	updated.push(CONFIG_FILE);
}

/** Create the minimal blueprint files without overwriting existing content. */
export async function initBlueprint(cwd = process.cwd()) {
	const specsRoot = join(cwd, DEFAULT_CONFIG.authority.specsRoot);
	const featuresRoot = join(cwd, DEFAULT_CONFIG.features.root);
	const approvalsRoot = join(cwd, DEFAULT_CONFIG.features.approvalsRoot);
	const architectureRoot = join(cwd, DEFAULT_CONFIG.architecture.root);
	const architectureComponents = join(architectureRoot, "components");
	await Promise.all([
		mkdir(join(specsRoot, "proposed"), { recursive: true }),
		mkdir(join(specsRoot, "implemented"), { recursive: true }),
		mkdir(join(specsRoot, "rejected"), { recursive: true }),
		mkdir(featuresRoot, { recursive: true }),
		mkdir(approvalsRoot, { recursive: true }),
		mkdir(architectureRoot, { recursive: true }),
		mkdir(architectureComponents, { recursive: true }),
		mkdir(join(cwd, "docs", "i18n"), { recursive: true }),
		mkdir(join(cwd, ".dsh", "skills", "blueprint-doc-standards"), { recursive: true }),
		mkdir(join(cwd, ".dsh", "skills", "blueprint-translate-docs"), { recursive: true }),
	]);
	const created = [];
	const updated = [];
	await ensureConfig(cwd, created, updated);
	if (await writeIfMissing(join(cwd, "AGENTS.md"), AGENTS_TEMPLATE)) created.push("AGENTS.md");
	await writePairIfAbsent(cwd, "README.md", README_TEMPLATE, "README.zh.md", README_ZH_TEMPLATE, created);
	if (await writeIfMissing(join(cwd, "DESIGN.md"), DESIGN_TEMPLATE)) created.push("DESIGN.md");
	if (await writeIfMissing(join(cwd, "docs", "AGENTS.md"), DOCS_AGENTS_TEMPLATE)) created.push("docs/AGENTS.md");
	await writePairIfAbsent(cwd, "docs/i18n/README.md", I18N_README, "docs/i18n/README.zh.md", I18N_README_ZH, created);
	await writePairIfAbsent(cwd, "docs/i18n/translation-rules.md", TRANSLATION_RULES, "docs/i18n/translation-rules.zh.md", TRANSLATION_RULES_ZH, created);
	if (await writeIfMissing(join(cwd, "docs", "i18n", "terminology.md"), TERMINOLOGY)) created.push("docs/i18n/terminology.md");
	if (await writeIfMissing(join(cwd, "docs", "i18n", "style-samples.md"), STYLE_SAMPLES)) created.push("docs/i18n/style-samples.md");
	if (await writeIfMissing(join(cwd, ".dsh", "skills", "blueprint-doc-standards", "SKILL.md"), DOC_STANDARDS_SKILL)) created.push(".dsh/skills/blueprint-doc-standards/SKILL.md");
	if (await writeIfMissing(join(cwd, ".dsh", "skills", "blueprint-translate-docs", "SKILL.md"), TRANSLATE_DOCS_SKILL)) created.push(".dsh/skills/blueprint-translate-docs/SKILL.md");
	if (await writeIfMissing(join(specsRoot, "README.md"), SPECS_README)) created.push(`${DEFAULT_CONFIG.authority.specsRoot}/README.md`);
	const adoptionFile = join(specsRoot, "implemented", "blueprint-adoption.md");
	if (await writeIfMissing(adoptionFile, ADOPTION_SPEC)) created.push(`${DEFAULT_CONFIG.authority.specsRoot}/implemented/blueprint-adoption.md`);
	return { cwd, created, updated };
}
//#endregion
