//#region lib/types/stamps.js
/**
 * Stamp mechanism for `@dsh-plugins/design-blueprint`.
 *
 * A stamp is an inline annotation that records, at a point in time, the SHA-256
 * of a referenced file (or future: a region inside one). When the referenced
 * content changes, the stamp becomes stale — the scanner reports it; the
 * developer either re-verifies (`stamp --refresh`) or acknowledges the change
 * (`stamp --acknowledge`).
 *
 * Recognized comment shapes:
 *   - `// @stamp: sha256:<hex> of <target>`        (JS / TS / shell)
 *   - `/* @stamp: sha256:<hex> of <target> * /`     (JS / TS block)
 *   - `<!-- @stamp: sha256:<hex> of <target> -->`  (Markdown / HTML)
 *   - `# @stamp: sha256:<hex> of <target>`         (YAML / TOML)
 *   - JSON: special key `"_x-stamp": { "<target>": "sha256:<hex>", ... }`
 *
 * Targets are cwd-relative paths (no URL scheme in v1). Anchors like
 * `#region=foo` / `#function=bar` are reserved for v2; v1 hashes the whole
 * target file, which means unrelated edits will trip a stamp — see
 * `README.md` §Known Limitations for the accepted trade-off.
 *
 * @module @dsh-plugins/design-blueprint/stamps
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, win32 } from "node:path";

/** One parsed stamp instance extracted from a single file. */
function parseStampsFromContent(content) {
	const stamps = [];
	const lines = content.split(/\r?\n/);
	// Line-comment patterns
	const lineRe = /^[ \t]*(?:\/\/|<!--|#)[ \t]*@stamp:[ \t]*sha256:([0-9a-f]{64})[ \t]+of[ \t]+(\S+)[ \t]*(?:-->)?[ \t]*$/;
	// Block-comment pattern (single-line)
	const blockRe = /\/\*[ \t]*@stamp:[ \t]*sha256:([0-9a-f]{64})[ \t]+of[ \t]+(\S+)[ \t]*\*\//g;
	// JSON-style key pattern: "_x-stamp": { "<target>": "sha256:<hex>" }
	const jsonRe = /"_x-stamp"\s*:\s*\{([^}]*)\}/g;

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		const m = line.match(lineRe);
		if (m) {
			stamps.push({
				recordedSha: m[1],
				target: m[2],
				commentStyle: detectStyle(line),
				lineNumber: i + 1,
				lineText: line,
				rawMatch: m[0],
			});
			continue;
		}
		// Inline block comment on its own line
		const bm = line.match(/^[ \t]*\/\*[ \t]*@stamp:[ \t]*sha256:([0-9a-f]{64})[ \t]+of[ \t]+(\S+)[ \t]*\*\/[ \t]*$/);
		if (bm) {
			stamps.push({
				recordedSha: bm[1],
				target: bm[2],
				commentStyle: "block",
				lineNumber: i + 1,
				lineText: line,
				rawMatch: bm[0],
			});
		}
	}
	// JSON stamps (no line numbers, applied to whole content)
	let jm = jsonRe.exec(content);
	while (jm !== null) {
		const inner = jm[1];
		const entryRe = /"([^"]+)"\s*:\s*"sha256:([0-9a-f]{64})"/g;
		let e = entryRe.exec(inner);
		while (e !== null) {
			stamps.push({
				recordedSha: e[2],
				target: e[1],
				commentStyle: "json",
				lineNumber: null,
				lineText: jm[0],
				rawMatch: e[0],
			});
			e = entryRe.exec(inner);
		}
		jm = jsonRe.exec(content);
	}
	return stamps;
}

function detectStyle(line) {
	if (line.includes("<!--")) return "html";
	if (line.trimStart().startsWith("#")) return "yaml";
	return "line";
}

/** Compute the SHA-256 of a string. Returned as lowercase 64-hex. */
export function sha256(text) {
	return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Read a file as UTF-8 text or return `null` if absent. */
function tryReadFile(absPath) {
	try {
		return readFileSync(absPath, "utf8");
	} catch (error) {
		if (error && error.code === "ENOENT") return null;
		throw error;
	}
}

/**
 * Resolve the current SHA-256 of a stamp's target. v1: hash the whole target
 * file. Returns `{ exists, sha, error? }`. `error` is non-null when the file
 * is missing or unreadable.
 *
 * @param {string} target
 * @param {string} cwd
 */
export function resolveTargetSha(target, cwd) {
	// Anchors reserved for v2 — strip and ignore (the whole-file hash will
	// include the anchor location anyway, so this is a safe degradation).
	const pathPart = target.split("#")[0];
	if (!pathPart || isAbsolute(pathPart) || win32.isAbsolute(pathPart)) {
		return { exists: false, sha: null, error: `target must be repository-relative: ${pathPart}` };
	}
	const root = realpathSync(resolve(cwd));
	const candidate = resolve(root, pathPart);
	const lexicalRelative = relative(root, candidate);
	if (lexicalRelative === ".." || lexicalRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(lexicalRelative)) {
		return { exists: false, sha: null, error: `target escapes the repository root: ${pathPart}` };
	}
	const abs = candidate;
	if (!existsSync(abs)) return { exists: false, sha: null, error: `target file not found: ${pathPart}` };
	const realTarget = realpathSync(abs);
	const canonicalRelative = relative(root, realTarget);
	if (canonicalRelative === ".." || canonicalRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(canonicalRelative)) {
		return { exists: false, sha: null, error: `target resolves outside the repository root: ${pathPart}` };
	}
	const stat = statSync(realTarget);
	if (!stat.isFile()) return { exists: false, sha: null, error: `target is not a regular file: ${pathPart}` };
	const text = tryReadFile(realTarget);
	if (text === null) return { exists: false, sha: null, error: `target file not readable: ${pathPart}` };
	return { exists: true, sha: sha256(text), error: null };
}

/**
 * Parse every stamp embedded in `fileContent` (one file's worth).
 * @param {string} fileContent
 * @returns {Array<{ recordedSha: string, target: string, commentStyle: string, lineNumber: number|null, lineText: string, rawMatch: string }>}
 */
export function parseStamps(fileContent) {
	return parseStampsFromContent(fileContent);
}

/**
 * Verify all stamps in a file against current state. Returns one Issue per
 * stale or missing-target stamp. The caller decides whether to surface this
 * as a scan rule or a `stamp --verify` run.
 *
 * @param {string} file - repo-relative path (used in the Issue message).
 * @param {string} fileContent - the file's current UTF-8 text.
 * @param {string} cwd - project root for resolving stamp targets.
 */
export function checkStamps(file, fileContent, cwd) {
	const stamps = parseStampsFromContent(fileContent);
	/** @type {Array<{ file: string, check: string, severity: "required" | "recommended", message: string, fix?: string }>} */
	const out = [];
	for (const stamp of stamps) {
		const target = resolveTargetSha(stamp.target, cwd);
		if (!target.exists) {
			out.push({
				file,
				check: "stamps-current",
				severity: "required",
				message: `stamp on line ${stamp.lineNumber ?? "?"} references missing target '${stamp.target}': ${target.error}`,
				fix: `Either restore the target file or remove the @stamp line`,
			});
			continue;
		}
		if (target.sha !== stamp.recordedSha) {
			out.push({
				file,
				check: "stamps-current",
				severity: "required",
				message: `stamp on line ${stamp.lineNumber ?? "?"} is stale: recorded sha256:${stamp.recordedSha.slice(0, 12)}… but target '${stamp.target}' is now sha256:${target.sha.slice(0, 12)}…`,
				fix: `Re-verify the doc and run 'design-blueprint stamp ${file} --refresh', or acknowledge with '--acknowledge'`,
			});
		}
	}
	return out;
}

/**
 * Compute what the new content would look like with all stamps refreshed to
 * current SHAs. Pure function — does not touch the filesystem. Useful for
 * `stamp --refresh` to preview before writing.
 *
 * @param {string} fileContent
 * @param {string} cwd
 */
export function refreshStampsInContent(fileContent, cwd) {
	const stamps = parseStampsFromContent(fileContent);
	let updated = fileContent;
	const lines = updated.split(/\r?\n/);
	const replacementByLine = new Map();
	for (const stamp of stamps) {
		if (stamp.lineNumber === null) continue; // JSON stamps handled separately below
		const target = resolveTargetSha(stamp.target, cwd);
		if (!target.exists) continue; // can't refresh a stamp whose target is gone
		if (target.sha === stamp.recordedSha) continue; // already current
		const oldLine = lines[stamp.lineNumber - 1];
		const newLine = oldLine.replace(stamp.recordedSha, target.sha);
		replacementByLine.set(stamp.lineNumber - 1, newLine);
	}
	if (replacementByLine.size > 0) {
		const newLines = lines.slice();
		for (const [idx, line] of replacementByLine) newLines[idx] = line;
		updated = newLines.join(updated.includes("\r\n") ? "\r\n" : "\n");
	}
	// JSON stamps
	const jsonRe = /"_x-stamp"\s*:\s*\{([^}]*)\}/g;
	let match = jsonRe.exec(updated);
	while (match !== null) {
		const inner = match[1];
		let replacedInner = inner;
		const entryRe = /"([^"]+)"\s*:\s*"sha256:([0-9a-f]{64})"/g;
		let e = entryRe.exec(replacedInner);
		while (e !== null) {
			const target = resolveTargetSha(e[1], cwd);
			if (target.exists && target.sha !== e[2]) {
				replacedInner = replacedInner.replace(`"sha256:${e[2]}"`, `"sha256:${target.sha}"`);
			}
			e = entryRe.exec(replacedInner);
		}
		updated = updated.replace(match[0], `"_x-stamp": {${replacedInner}}`);
		match = jsonRe.exec(updated);
	}
	return updated;
}

/**
 * Atomic file write: read → modify → write to .tmp → rename. Returns the new
 * content. Throws if the file changed between read and write (best-effort
 * check via stat mtime).
 *
 * @param {string} absPath
 * @param {string} newContent
 */
export function atomicWrite(absPath, newContent, expectedContent) {
	if (expectedContent !== undefined && readFileSync(absPath, "utf8") !== expectedContent) {
		throw new Error(`refusing to overwrite a concurrently changed file: ${absPath}`);
	}
	const tmp = `${absPath}.stamp.${process.pid}.${Date.now()}.tmp`;
	try {
		writeFileSync(tmp, newContent, { encoding: "utf8", flag: "wx" });
		renameSync(tmp, absPath);
	} catch (error) {
		try { unlinkSync(tmp); } catch (cleanupError) { if (cleanupError?.code !== "ENOENT") throw cleanupError; }
		throw error;
	}
}

/**
 * Verify all stamps under `cwd` and return one row per stamp. Used by the
 * `stamp --verify` CLI subcommand for human-readable output.
 *
 * @param {string[]} files - cwd-relative file paths to scan.
 * @param {string} cwd
 */
export function verifyAllStamps(files, cwd) {
	/** @type {Array<{ file: string, lineNumber: number|null, target: string, recorded: string, current: string|null, status: "current" | "stale" | "missing-target" | "malformed", message: string }>} */
	const out = [];
	for (const file of files) {
		const abs = join(cwd, file);
		const content = tryReadFile(abs);
		if (content === null) continue;
		const stamps = parseStampsFromContent(content);
		for (const stamp of stamps) {
			const target = resolveTargetSha(stamp.target, cwd);
			if (!target.exists) {
				out.push({ file, lineNumber: stamp.lineNumber, target: stamp.target, recorded: stamp.recordedSha, current: null, status: "missing-target", message: target.error ?? "" });
				continue;
			}
			if (target.sha === stamp.recordedSha) {
				out.push({ file, lineNumber: stamp.lineNumber, target: stamp.target, recorded: stamp.recordedSha, current: target.sha, status: "current", message: "" });
				continue;
			}
			out.push({ file, lineNumber: stamp.lineNumber, target: stamp.target, recorded: stamp.recordedSha, current: target.sha, status: "stale", message: `recorded sha256:${stamp.recordedSha.slice(0, 12)}…, current sha256:${target.sha.slice(0, 12)}…` });
		}
	}
	return out;
}
//#endregion
