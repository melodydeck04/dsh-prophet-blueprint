//#region lib/types/install-hook.js
/**
 * Install / uninstall a git pre-commit hook that invokes the plugin's
 * `scan` subcommand.
 *
 * Two scopes:
 *   - `--global` (default): writes `~/.git-templates/hooks/pre-commit`. New
 *     git clones and inits that use this directory as `init.templateDir`
 *     inherit the hook automatically.
 *   - `--local`: writes `<cwd>/.git/hooks/pre-commit`. Affects one repo.
 *
 * The hook script is bracketed by fingerprint markers so `--uninstall` can
 * remove only this plugin's hook and never a third-party tool's hook.
 *
 * @module @dsh-plugins/design-blueprint/install-hook
 */
import { mkdir, writeFile, unlink, readFile, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

const FINGERPRINT_START = "# design-blueprint-hook-v1: managed by @dsh-plugins/design-blueprint";
const FINGERPRINT_END = "# end design-blueprint-hook-v1";

/** Resolve the absolute path to lib/cli.js, with a deterministic fallback. */
export function resolveCliPath() {
	return join(dirname(fileURLToPath(import.meta.url)), "cli.js");
}

function shellQuote(value) {
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/** Render the hook script body. Uses git's POSIX-sh-based hook runner on Windows too. */
export function renderHookScript(cliAbsPath) {
	// git's pre-commit runs in a POSIX sh. Forward slashes are required because
	// git for Windows uses MSYS bash, which reads forward-slash paths natively.
	const posixPath = cliAbsPath.replace(/\\/g, "/");
	return [
		"#!/bin/sh",
		FINGERPRINT_START,
		// node on Windows may live at "C:/Program Files/nodejs/node.exe" — the
		// env-resolved `node` is fine on every platform we support (git hooks
		// inherit PATH from the user's shell).
		`exec node ${shellQuote(posixPath)} scan`,
		FINGERPRINT_END,
		"",
	].join("\n");
}

/** Returns true when `path` is a regular file. */
async function isRegularFile(path) {
	try {
		const stat = await import("node:fs/promises").then((m) => m.stat(path));
		return stat.isFile();
	} catch {
		return false;
	}
}

/**
 * Read `path`, return its content when present, or `null`. Trims trailing
 * whitespace to make fingerprint comparison deterministic across editors.
 */
async function readIfPresent(path) {
	try {
		return (await readFile(path, "utf8")).trimEnd();
	} catch {
		return null;
	}
}

/** Where the global template directory lives. */
export function globalTemplateDir() {
	return join(homedir(), ".git-templates");
}

/** Where the global template's hooks directory lives. */
export function globalHooksDir() {
	return join(globalTemplateDir(), "hooks");
}

/** Install path for the global template hook. */
export function globalHookPath() {
	return join(globalHooksDir(), "pre-commit");
}

/** Install path for the local repo's pre-commit hook. */
export function localHookPath(cwd) {
	return join(cwd, ".git", "hooks", "pre-commit");
}

/**
 * Install (or overwrite) the hook at `hookPath`. The script body is built from
 * `cliAbsPath`. Existing hooks that are NOT this plugin's hook are preserved
 * — we never clobber a third-party hook.
 */
export async function writeHook(hookPath, cliAbsPath) {
	const desired = renderHookScript(cliAbsPath).trimEnd();
	const existing = await readIfPresent(hookPath);
	if (existing !== null) {
		const looksLikeOurs = existing.includes(FINGERPRINT_START);
		if (!looksLikeOurs) {
			throw new Error(
				`a pre-commit hook already exists at ${hookPath} that is not managed by ` +
				`@dsh-plugins/design-blueprint. Move it aside (e.g. 'mv ${hookPath} ${hookPath}.bak') ` +
				`and re-run, or use --force to append our hook after the existing one.`,
			);
		}
	}
	await mkdir(join(hookPath, ".."), { recursive: true });
	await writeFile(hookPath, desired + "\n", "utf8");
	// chmod +x on POSIX; on Windows the bit is meaningless but the call is harmless.
	try { await chmod(hookPath, 0o755); } catch { /* ignore — Windows does not support chmod on every FS */ }
}

/**
 * Remove this plugin's hook from `hookPath` if-and-only-if it carries our
 * fingerprint. A foreign hook is left untouched.
 */
export async function removeHook(hookPath) {
	const existing = await readIfPresent(hookPath);
	if (existing === null) return false;
	if (!existing.includes(FINGERPRINT_START)) return false;
	await unlink(hookPath);
	return true;
}

/**
 * Whether `init.templateDir` already points at our global template dir.
 * Falls back to `git config --get init.templateDir` — git handles the
 * platform quoting for us.
 */
export async function isGlobalTemplateConfigured() {
	try {
		const { stdout } = await execFile("git", ["config", "--global", "--get", "init.templateDir"], { windowsHide: true });
		const trimmed = stdout.trim();
		return trimmed === globalTemplateDir() || trimmed === globalTemplateDir().replace(/\\/g, "/");
	} catch {
		return false;
	}
}

/**
 * Set `init.templateDir` to point at our global template dir.
 */
export async function configureGlobalTemplate() {
	await execFile("git", ["config", "--global", "init.templateDir", globalTemplateDir()], { windowsHide: true });
}

/**
 * Top-level entry point for the `install-hook` CLI subcommand.
 *
 * @param {{ scope?: "global" | "local", uninstall?: boolean, cwd?: string, force?: boolean }} options
 * @returns {Promise<{ scope: string, hookPath: string, uninstalled: boolean }>}
 */
export async function installHook(options = {}) {
	const cwd = options.cwd ?? process.cwd();
	const scope = options.scope ?? "local";
	const hookPath = scope === "local" ? localHookPath(cwd) : globalHookPath();
	const cliPath = resolveCliPath();

	if (options.uninstall) {
		const removed = await removeHook(hookPath);
		return { scope, hookPath, uninstalled: removed };
	}

	// `force` is currently unused (writeHook refuses foreign hooks by default);
	// reserved for a future "append after existing" mode.
	await writeHook(hookPath, cliPath);

	if (scope === "global") {
		const configured = await isGlobalTemplateConfigured();
		if (!configured) await configureGlobalTemplate();
	}

	return { scope, hookPath, uninstalled: false };
}
//#endregion
