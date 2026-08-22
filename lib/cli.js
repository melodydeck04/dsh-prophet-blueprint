#!/usr/bin/env node
//#region lib/types/cli.js
/** CLI for blueprint initialization, staged audits, stamps, and hook setup. */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { confirmTranslationPair, inspectDocumentation } from "./docs.js";
import { initBlueprint } from "./init.js";
import { installHook } from "./install-hook.js";
import { resolveBlueprintRoot } from "./project-root.js";
import { formatScanSummary, scan } from "./scan.js";
import { workingTreeSnapshot } from "./snapshot.js";
import { atomicWrite, refreshStampsInContent, verifyAllStamps } from "./stamps.js";
import { approveFeatureProposal } from "./workflow.js";

const USAGE = `design-blueprint — spec lifecycle and correspondence checks

Usage:
  design-blueprint init [--cwd <path>]
  design-blueprint scan [--cwd <path>] [--all] [--json] [--severity <level>]
  design-blueprint docs {list | check | confirm <file>} [--cwd <path>] [--json]
  design-blueprint approve <feature-id> --spec-hash <sha256> --yes [--cwd <path>] [--json]
  design-blueprint stamp {--verify | --refresh | --acknowledge} [--cwd <path>] [--force]
  design-blueprint install-hook [--local | --global] [--uninstall] [--cwd <path>]
  design-blueprint --version

scan checks the exact Git index by default. --all checks the working tree.
The local pre-commit hook is the default; global installation must be explicit.
docs confirm records reviewed semantic equivalence; mechanical checks cannot prove translation quality.
approve is the hash-bound fallback for an explicit developer decision when Blueprint Web is unavailable.
`;

function parseArgs(argv) {
	const output = { command: argv[0] ?? null, flags: {}, positional: [] };
	for (let index = 1; index < argv.length; index += 1) {
		const token = argv[index];
		if (!token.startsWith("--")) {
			output.positional.push(token);
			continue;
		}
		const equal = token.indexOf("=");
		if (equal >= 0) {
			output.flags[token.slice(2, equal)] = token.slice(equal + 1);
			continue;
		}
		const key = token.slice(2);
		if (key === "cwd" || key === "severity" || key === "spec-hash") {
			const value = argv[++index];
			if (!value || value.startsWith("--")) throw new Error(`--${key} requires a value`);
			output.flags[key] = value;
		} else {
			output.flags[key] = true;
		}
	}
	return output;
}

function filterIssues(issues, severity) {
	if (severity === "all") return issues;
	if (severity === "required" || severity === "recommended") return issues.filter((issue) => issue.severity === severity);
	throw new Error(`unknown --severity value: ${severity}`);
}

async function runScan(flags) {
	const result = await scan({ cwd: flags.cwd, all: flags.all === true });
	const issues = filterIssues(result.issues, flags.severity ?? "all");
	if (flags.json) process.stdout.write(JSON.stringify({ ...result, issues }, null, 2) + "\n");
	else process.stdout.write(formatScanSummary(result, issues));
	return issues.some((issue) => issue.severity === "required") ? 1 : 0;
}

async function runStamp(flags) {
	const cwd = flags.cwd ?? process.cwd();
	const modes = ["verify", "refresh", "acknowledge"].filter((mode) => flags[mode]);
	if (modes.length !== 1) throw new Error("stamp requires exactly one of --verify, --refresh, or --acknowledge");
	const { workingTreeSnapshot } = await import("./snapshot.js");
	const snapshot = await workingTreeSnapshot(cwd);
	if (modes[0] === "verify") {
		const rows = verifyAllStamps(snapshot.files, cwd);
		for (const row of rows) process.stdout.write(`${row.status === "current" ? "✓" : "⚠"} ${row.file}${row.lineNumber ? `:${row.lineNumber}` : ""} → ${row.target} (${row.status})\n`);
		return rows.some((row) => row.status !== "current") ? 1 : 0;
	}
	const updates = [];
	for (const file of snapshot.files) {
		const absolute = join(cwd, ...file.split("/"));
		if (!existsSync(absolute)) continue;
		let content;
		try { content = await readFile(absolute, "utf8"); } catch { continue; }
		const updated = refreshStampsInContent(content, cwd);
		if (updated !== content) updates.push({ file, absolute, content, updated });
	}
	if (updates.length === 0) {
		process.stdout.write("No stale stamps found.\n");
		return 0;
	}
	if (modes[0] === "refresh" && !flags.force) {
		process.stdout.write(`Preview: ${updates.length} file(s) would change. Re-run with --force to apply.\n`);
		return 0;
	}
	for (const update of updates) atomicWrite(update.absolute, update.updated, update.content);
	process.stdout.write(`${modes[0] === "acknowledge" ? "Acknowledged" : "Refreshed"} ${updates.length} file(s).\n`);
	return 0;
}

async function runDocs(flags, positional) {
	const action = positional[0] ?? "check";
	if (!new Set(["list", "check", "confirm"]).has(action)) throw new Error("docs action must be list, check, or confirm");
	const cwd = flags.cwd ?? process.cwd();
	if (action === "confirm") {
		if (positional.length !== 2) throw new Error("docs confirm requires exactly one pair path");
		const result = await confirmTranslationPair(cwd, positional[1]);
		if (flags.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
		else process.stdout.write(`Confirmed translation pair: ${result.owner} ↔ ${result.counterpart}\n`);
		return 0;
	}
	if (positional.length > 1) throw new Error(`docs ${action} does not accept a pair path`);
	const root = await resolveBlueprintRoot(cwd);
	const snapshot = await workingTreeSnapshot(root);
	const configResult = await loadConfig(snapshot);
	const result = await inspectDocumentation(snapshot, configResult.config);
	if (flags.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
	else {
		for (const pair of result.pairs) process.stdout.write(`${pair.status}\t${pair.owner}\n`);
		if (result.pairs.length === 0) process.stdout.write("No bilingual document pairs are configured.\n");
		if (action === "check") {
			for (const entry of result.issues) process.stdout.write(`- [${entry.severity}] ${entry.file}: ${entry.message}\n`);
		}
	}
	return action === "check" && result.issues.some((entry) => entry.severity === "required") ? 1 : 0;
}

async function runApprove(flags, positional) {
	if (positional.length !== 1) throw new Error("approve requires exactly one feature id");
	if (flags.yes !== true) throw new Error("approve requires --yes to confirm the direct developer decision");
	if (typeof flags["spec-hash"] !== "string") throw new Error("approve requires --spec-hash <sha256>");
	const result = await approveFeatureProposal({
		cwd: flags.cwd ?? process.cwd(),
		featureId: positional[0],
		expectedSpecHash: flags["spec-hash"],
	});
	if (flags.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
	else process.stdout.write(`Approved ${result.record.featureId} at ${result.record.specHash}: ${result.file}\n`);
	return 0;
}

async function version() {
	const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
	return manifest.version;
}

async function main() {
	const parsed = parseArgs(process.argv.slice(2));
	if (parsed.flags.help || parsed.command === null || parsed.command === "help" || parsed.command === "--help" || parsed.command === "-h") {
		process.stdout.write(USAGE);
		return 0;
	}
	if (parsed.command !== "docs" && parsed.command !== "approve" && parsed.positional.length > 0) throw new Error(`unexpected positional arguments: ${parsed.positional.join(" ")}`);
	if (parsed.command === "init") {
		const result = await initBlueprint(parsed.flags.cwd ?? process.cwd());
		if (result.created.length > 0) process.stdout.write(`Created: ${result.created.join(", ")}\n`);
		if (result.updated.length > 0) process.stdout.write(`Updated: ${result.updated.join(", ")}\n`);
		if (result.created.length === 0 && result.updated.length === 0) process.stdout.write("Blueprint files already exist; nothing changed.\n");
		return 0;
	}
	if (parsed.command === "scan") return runScan(parsed.flags);
	if (parsed.command === "docs") return runDocs(parsed.flags, parsed.positional);
	if (parsed.command === "approve") return runApprove(parsed.flags, parsed.positional);
	if (parsed.command === "stamp") return runStamp(parsed.flags);
	if (parsed.command === "install-hook") {
		if (parsed.flags.local && parsed.flags.global) throw new Error("choose either --local or --global");
		const scope = parsed.flags.global ? "global" : "local";
		const result = await installHook({ scope, uninstall: parsed.flags.uninstall === true, cwd: parsed.flags.cwd ?? process.cwd() });
		process.stdout.write(`${result.uninstalled ? "Removed" : "Installed"} ${scope} hook: ${result.hookPath}\n`);
		return 0;
	}
	if (parsed.command === "--version" || parsed.command === "-V") {
		process.stdout.write(`design-blueprint ${await version()}\n`);
		return 0;
	}
	throw new Error(`unknown subcommand: ${parsed.command}`);
}

try {
	process.exitCode = await main();
} catch (error) {
	process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 2;
}
//#endregion
