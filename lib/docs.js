//#region lib/types/docs.js
/**
 * Portable DSH-compatible documentation roles and bilingual pairing checks.
 *
 * Mechanical checks prove file pairing, confirmed Git blob identities, and
 * Markdown structure. They deliberately do not claim semantic equivalence.
 *
 * @module @dsh-plugins/design-blueprint/docs
 */
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, posix } from "node:path";
import { promisify } from "node:util";
import { matchesAny, normalizeRelativePath } from "./path-utils.js";
import { resolveBlueprintRoot } from "./project-root.js";
import { workingTreeSnapshot } from "./snapshot.js";
import { loadConfig } from "./config.js";

const execFile = promisify(execFileCallback);

function issue(file, message, fix, severity = "required", check = "translation-pairing") {
	return { file, check, severity, message, fix };
}

/** Compute the same object id as `git hash-object` for UTF-8 Markdown text. */
export function gitBlobHash(content) {
	const body = Buffer.from(content, "utf8");
	return createHash("sha1").update(`blob ${body.length}\0`).update(body).digest("hex");
}

function pairPaths(owner) {
	const directory = posix.dirname(owner);
	const stem = posix.basename(owner, ".md");
	const prefix = directory === "." ? "" : `${directory}/`;
	return {
		owner,
		counterpart: `${prefix}${stem}.zh.md`,
		record: `${prefix}${stem}.i18n.yaml`,
	};
}

function ownerFromArtifact(file) {
	if (file.endsWith(".zh.md")) return `${file.slice(0, -6)}.md`;
	if (file.endsWith(".i18n.yaml")) return `${file.slice(0, -10)}.md`;
	return file.endsWith(".md") ? file : null;
}

function inScope(owner, i18n) {
	return matchesAny(owner, i18n.include) && !matchesAny(owner, i18n.exclude);
}

function parseRecord(content) {
	const values = new Map();
	for (const rawLine of content.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#")) continue;
		const match = /^([^:#]+):\s*([a-f0-9]{40})\s*$/.exec(line);
		if (!match) return null;
		values.set(match[1].trim(), match[2]);
	}
	return values;
}

export function serializePairRecord(owner, ownerContent, counterpart, counterpartContent) {
	return `${basename(owner)}: ${gitBlobHash(ownerContent)}\n${basename(counterpart)}: ${gitBlobHash(counterpartContent)}\n`;
}

function withoutSwitcher(content) {
	return content.split(/\r?\n/).filter((line) => !/^\s*(?:English\s*\|\s*\[中文\]\([^)]*\.zh\.md\)|\[English\]\([^)]*\.md\)\s*\|\s*中文)\s*$/.test(line)).join("\n");
}

function codeFences(lines) {
	const fences = [];
	let current = null;
	for (const line of lines) {
		const opening = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
		if (current === null) {
			if (opening) current = { marker: opening[1][0], length: opening[1].length, info: opening[2].trim(), lines: [] };
			continue;
		}
		const closing = new RegExp(`^\\s*${current.marker}{${current.length},}\\s*$`).exec(line);
		if (closing) {
			fences.push({ info: current.info, content: current.lines.join("\n") });
			current = null;
		} else {
			current.lines.push(line);
		}
	}
	if (current !== null) fences.push({ info: current.info, content: current.lines.join("\n"), unclosed: true });
	return fences;
}

function tableShapes(lines) {
	const output = [];
	let current = [];
	const flush = () => {
		if (current.length >= 2 && /^\s*\|?\s*:?-{3,}/.test(current[1])) {
			output.push(current.map((line) => line.replace(/^\s*\|?|\|?\s*$/g, "").split("|").length));
		}
		current = [];
	};
	for (const line of lines) {
		if (line.includes("|") && line.trim() !== "") current.push(line);
		else flush();
	}
	flush();
	return output;
}

/** Return the DSH-observable Markdown structure used for bilingual comparison. */
export function markdownSignature(content) {
	const text = withoutSwitcher(content);
	const lines = text.split(/\r?\n/);
	const headings = [];
	const lists = [];
	const links = [];
	let inFence = false;
	let fenceMarker = "";
	for (const line of lines) {
		const fence = /^\s*(`{3,}|~{3,})/.exec(line);
		if (fence) {
			if (!inFence) { inFence = true; fenceMarker = fence[1][0]; }
			else if (fence[1][0] === fenceMarker) inFence = false;
			continue;
		}
		if (inFence) continue;
		const heading = /^\s{0,3}(#{1,6})\s+/.exec(line);
		if (heading) headings.push(heading[1].length);
		const unordered = /^(\s*)[-+*]\s+/.exec(line);
		const ordered = /^(\s*)(\d+)[.)]\s+/.exec(line);
		if (unordered) lists.push({ indent: unordered[1].length, kind: "unordered" });
		if (ordered) lists.push({ indent: ordered[1].length, kind: "ordered", start: Number(ordered[2]) });
		for (const match of line.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^)]*)?\)/g)) links.push(match[1]);
	}
	return { headings, lists, tables: tableShapes(lines), links, fences: codeFences(lines) };
}

function switcherIssue(paths, ownerContent, counterpartContent) {
	const englishLines = ownerContent.split(/\r?\n/);
	const chineseLines = counterpartContent.split(/\r?\n/);
	const firstAfterH1 = (lines) => {
		const h1 = lines.findIndex((line) => /^#\s+/.test(line));
		if (h1 < 0) return "";
		return lines.slice(h1 + 1).find((line) => line.trim() !== "")?.trim() ?? "";
	};
	const expectedEnglish = `English | [中文](${basename(paths.counterpart)})`;
	const expectedChinese = `[English](${basename(paths.owner)}) | 中文`;
	if (firstAfterH1(englishLines) !== expectedEnglish) return `English document must place '${expectedEnglish}' immediately after its H1`;
	if (firstAfterH1(chineseLines) !== expectedChinese) return `Chinese document must place '${expectedChinese}' immediately after its H1`;
	return null;
}

async function inspectPair(snapshot, owner, i18n) {
	const paths = pairPaths(owner);
	const exists = {
		owner: snapshot.exists(paths.owner),
		counterpart: snapshot.exists(paths.counterpart),
		record: snapshot.exists(paths.record),
	};
	const present = Object.values(exists).filter(Boolean).length;
	if (present === 0) return null;
	if (present === 1 && exists.owner) {
		return {
			...paths,
			status: "missing",
			issues: [issue(paths.owner, `bilingual counterpart '${paths.counterpart}' and consistency record are missing`, `Translate the document, add its language switchers, then run 'design-blueprint docs confirm ${paths.owner}'`, i18n.migrationSeverity)],
		};
	}
	if (present !== 3) {
		const missing = Object.entries(exists).filter(([, value]) => !value).map(([key]) => paths[key]);
		return {
			...paths,
			status: "missing",
			issues: [issue(paths.owner, `incomplete bilingual triplet; missing ${missing.join(", ")}`, "Restore all three pair artifacts or remove the partial pair")],
		};
	}
	const [ownerContent, counterpartContent, recordContent] = await Promise.all([
		snapshot.readText(paths.owner), snapshot.readText(paths.counterpart), snapshot.readText(paths.record),
	]);
	const issues = [];
	const record = parseRecord(recordContent ?? "");
	if (record === null) {
		issues.push(issue(paths.record, "consistency record is not a two-entry Git blob hash map", `Run 'design-blueprint docs confirm ${paths.owner}' after reviewing the translation`));
	} else {
		for (const [file, content] of [[paths.owner, ownerContent], [paths.counterpart, counterpartContent]]) {
			const expected = record.get(basename(file));
			const actual = gitBlobHash(content ?? "");
			if (expected !== actual) issues.push(issue(paths.record, `${file} does not match its last confirmed Git blob hash`, `Synchronize the pair and run 'design-blueprint docs confirm ${paths.owner}'`));
		}
	}
	const switcher = switcherIssue(paths, ownerContent ?? "", counterpartContent ?? "");
	if (switcher) issues.push(issue(paths.owner, switcher, "Repair both language switchers"));
	if (JSON.stringify(markdownSignature(ownerContent ?? "")) !== JSON.stringify(markdownSignature(counterpartContent ?? ""))) {
		issues.push(issue(paths.owner, "English and Chinese Markdown structures do not match", "Mirror heading depths, lists, tables, link targets, and verbatim code fences before confirming"));
	}
	return { ...paths, status: issues.length === 0 ? "ok" : "out-of-sync", issues };
}

/** Inspect document standards and every configured bilingual pair in a snapshot. */
export async function inspectDocumentation(snapshot, config) {
	if (config.documentation === null) return { pairs: [], issues: [], summary: { enabled: false, total: 0, ok: 0, missing: 0, outOfSync: 0 } };
	const issues = [];
	for (const file of config.documentation.standards) {
		if (!snapshot.exists(file)) issues.push(issue(file, "documentation standard is missing", `Run 'design-blueprint init' to create '${file}'`, "required", "documentation-standard"));
	}
	if (!config.documentation.i18n.enabled) return { pairs: [], issues, summary: { enabled: false, total: 0, ok: 0, missing: 0, outOfSync: 0 } };
	const i18n = config.documentation.i18n;
	const owners = new Set();
	for (const file of snapshot.files) {
		const owner = ownerFromArtifact(file);
		if (owner && inScope(owner, i18n)) owners.add(owner);
		if (owner && matchesAny(owner, i18n.exclude) && (file.endsWith(".zh.md") || file.endsWith(".i18n.yaml"))) {
			issues.push(issue(file, "excluded document must not have bilingual pair artifacts", `Remove '${file}' or remove '${owner}' from documentation.i18n.exclude`));
		}
	}
	const pairs = [];
	for (const owner of [...owners].sort()) {
		const pair = await inspectPair(snapshot, owner, i18n);
		if (pair) { pairs.push(pair); issues.push(...pair.issues); }
	}
	return {
		pairs,
		issues,
		summary: {
			enabled: true,
			total: pairs.length,
			ok: pairs.filter((pair) => pair.status === "ok").length,
			missing: pairs.filter((pair) => pair.status === "missing").length,
			outOfSync: pairs.filter((pair) => pair.status === "out-of-sync").length,
		},
	};
}

async function storeGitBlob(root, relative) {
	try {
		const { stdout } = await execFile("git", ["-C", root, "hash-object", "-w", "--", relative], { windowsHide: true });
		const hash = stdout.trim();
		if (/^[a-f0-9]{40}$/.test(hash)) {
			await execFile("git", ["-C", root, "update-ref", `refs/design-blueprint/translation-pairing/snapshots/${hash}`, hash], { windowsHide: true });
			return hash;
		}
	} catch {
		// A non-Git project still gets the identical deterministic blob id.
	}
	return null;
}

/** Explicitly record one reviewed working-tree pair as semantically consistent. */
export async function confirmTranslationPair(cwd, requestedOwner) {
	const root = await resolveBlueprintRoot(cwd);
	let owner = normalizeRelativePath(requestedOwner);
	owner = ownerFromArtifact(owner);
	if (!owner || !owner.endsWith(".md")) throw new Error("docs confirm requires an English .md, Chinese .zh.md, or .i18n.yaml path");
	const snapshot = await workingTreeSnapshot(root);
	const configResult = await loadConfig(snapshot);
	if (configResult.config.documentation === null || !configResult.config.documentation.i18n.enabled) throw new Error("bilingual documentation is not enabled in design-blueprint.json");
	if (!inScope(owner, configResult.config.documentation.i18n)) throw new Error(`${owner} is outside documentation.i18n scope`);
	const paths = pairPaths(owner);
	if (!snapshot.exists(paths.owner) || !snapshot.exists(paths.counterpart)) throw new Error(`both ${paths.owner} and ${paths.counterpart} must exist before confirmation`);
	const [ownerContent, counterpartContent] = await Promise.all([
		readFile(join(root, ...paths.owner.split("/")), "utf8"),
		readFile(join(root, ...paths.counterpart.split("/")), "utf8"),
	]);
	const switcher = switcherIssue(paths, ownerContent, counterpartContent);
	if (switcher) throw new Error(switcher);
	if (JSON.stringify(markdownSignature(ownerContent)) !== JSON.stringify(markdownSignature(counterpartContent))) {
		throw new Error("English and Chinese Markdown structures do not match");
	}
	const [storedOwner, storedCounterpart] = await Promise.all([
		storeGitBlob(root, paths.owner), storeGitBlob(root, paths.counterpart),
	]);
	const record = `${basename(paths.owner)}: ${storedOwner ?? gitBlobHash(ownerContent)}\n${basename(paths.counterpart)}: ${storedCounterpart ?? gitBlobHash(counterpartContent)}\n`;
	await writeFile(join(root, ...paths.record.split("/")), record, "utf8");
	return { root, ...paths, hashes: { owner: gitBlobHash(ownerContent), counterpart: gitBlobHash(counterpartContent) } };
}
//#endregion
