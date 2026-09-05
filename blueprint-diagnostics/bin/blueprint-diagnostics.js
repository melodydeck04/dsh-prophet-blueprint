#!/usr/bin/env node
/**
 * `blueprint-diagnostics` CLI entry.
 *
 * Subcommands:
 *   audit <path> [--json <out>]   print the Markdown report; optionally
 *                                 write the JSON sidecar.
 *   compare <a> <b> [--label-a <l>] [--label-b <l>]
 *                                 print the two-session diff table.
 *
 * Never opens a network socket, never reads anything outside the
 * arguments, and never writes except to the optional --json target.
 *
 * @module @dsh-plugins/design-blueprint-diagnostics/cli
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { audit } from "../lib/audit.js";
import { renderMarkdown } from "../lib/report.js";
import { compare, renderCompareMarkdown } from "../lib/compare.js";

const USAGE = `Usage:
  blueprint-diagnostics audit <session.jsonl> [--json <out>]
  blueprint-diagnostics compare <a.jsonl> <b.jsonl> [--label-a <l>] [--label-b <l>]
`;

async function main(argv) {
	const args = parseArgs(argv);
	const command = args._[0];
	if (!command || command === "--help" || command === "-h") {
		process.stdout.write(USAGE);
		return;
	}
	if (command === "audit") {
		await runAudit(args);
		return;
	}
	if (command === "compare") {
		await runCompare(args);
		return;
	}
	throw new Error(`unknown subcommand '${command}'\n${USAGE}`);
}

async function runAudit(args) {
	const target = args._[1];
	if (!target) throw new Error(`audit requires one session.jsonl path\n${USAGE}`);
	const report = await audit(resolve(target));
	const markdown = renderMarkdown(report, { label: target });
	process.stdout.write(markdown + "\n");
	if (args.json) {
		await writeFile(resolve(args.json), JSON.stringify(report, null, 2) + "\n", "utf8");
	}
}

async function runCompare(args) {
	const leftPath = args._[1];
	const rightPath = args._[2];
	if (!leftPath || !rightPath) throw new Error(`compare requires two session.jsonl paths\n${USAGE}`);
	const [leftReport, rightReport] = await Promise.all([audit(resolve(leftPath)), audit(resolve(rightPath))]);
	const rows = compare(leftReport, rightReport, {
		labelLeft: args["label-a"] ?? "left",
		labelRight: args["label-b"] ?? "right",
	});
	process.stdout.write(renderCompareMarkdown(rows, args["label-a"] ?? "left", args["label-b"] ?? "right"));
}

function parseArgs(argv) {
	const args = { _: [] };
	for (let i = 0; i < argv.length; i += 1) {
		const tok = argv[i];
		if (tok.startsWith("--")) {
			const eq = tok.indexOf("=");
			if (eq >= 0) args[tok.slice(2, eq)] = tok.slice(eq + 1);
			else {
				const next = argv[i + 1];
				if (next === undefined || next.startsWith("--")) {
					args[tok.slice(2)] = true;
				} else {
					args[tok.slice(2)] = next;
					i += 1;
				}
			}
		} else {
			args._.push(tok);
		}
	}
	return args;
}

main(process.argv.slice(2)).catch((error) => {
	process.stderr.write(`error: ${error.message}\n`);
	process.exitCode = 1;
});
