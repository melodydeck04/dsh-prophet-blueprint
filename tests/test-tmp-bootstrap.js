/**
 * Pre-load hook for `node --test` that redirects the `TMP`/`TEMP` env
 * vars to a workspace-relative `.blueprint-test-tmp` directory when the
 * system temp dir is denied by the verifier sandbox.
 *
 * This module must be loaded with `--import` BEFORE any test file. It
 * mutates `process.env` so that when Node's `node:os` module captures
 * `tmpdir()`, the writable workspace path is captured instead of the
 * sandbox-denied system path.
 */
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";

const FALLBACK_ROOT = join(process.cwd(), ".blueprint-test-tmp");

async function probeWritable(base) {
	try {
		const stamp = randomBytes(8).toString("hex");
		await mkdir(base, { recursive: true });
		const probe = join(base, `.probe-${stamp}`);
		await writeFile(probe, stamp);
		await unlink(probe);
		return true;
	} catch {
		return false;
	}
}

const systemTmp = os.tmpdir();
let target = systemTmp;
if (!(await probeWritable(systemTmp))) {
	await mkdir(FALLBACK_ROOT, { recursive: true });
	target = FALLBACK_ROOT;
}

if (target !== systemTmp) {
	process.env.TMPDIR = target;
	process.env.TMP = target;
	process.env.TEMP = target;
}
