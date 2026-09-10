import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";

const MAX_DIRECT_CHILDREN = 3;

export function classifyExecutionFailure(error) {
	const text = String(error?.message ?? error ?? "unknown failure");
	const category = /rate[ _-]?limit|429/i.test(text) ? "RATE_LIMIT"
		: /(?:server|http)[ _-]?529|\b529\b/i.test(text) ? "SERVER_529"
		: /missing|unavailable|unsupported.*capability/i.test(text) ? "MISSING_CAPABILITY"
		: /spec|scope|approval|authority|hash/i.test(text) ? "SPEC_AUTHORITY_MISMATCH"
		: "EXECUTION_FAILURE";
	const recovery = {
		RATE_LIMIT: "Wait for the rate-limit window, then retry only the interrupted operation.",
		SERVER_529: "Wait for service recovery, then retry only the interrupted operation.",
		MISSING_CAPABILITY: "Restore the required DSH capability or choose an available supported action.",
		SPEC_AUTHORITY_MISMATCH: "Refresh the current Spec and approval state; do not replay verification.",
		EXECUTION_FAILURE: "Inspect the retained evidence and repair the declared failure before one new attempt.",
	}[category];
	return Object.freeze({ category, fingerprint: createHash("sha256").update(`${category}\n${text.replace(/\b[0-9a-f]{16,}\b/gi, "<id>")}`).digest("hex"), recovery });
}

export function createDelegationBudget({ maxDirectChildren = MAX_DIRECT_CHILDREN } = {}) {
	let used = 0;
	return Object.freeze({
		authorize(request = {}) {
			if (request.parentKind === "child") throw new Error("child-originated delegation is not allowed");
			if (typeof request.deliverable !== "string" || request.deliverable.trim().length === 0) throw new Error("each child request requires one deliverable");
			if (request.mode === "fork" && typeof request.requiresParentHistory !== "string") throw new Error("fork requires an explicit requiresParentHistory reason");
			if (used >= maxDirectChildren) throw new Error(`direct child budget exhausted (${maxDirectChildren})`);
			used += 1;
			return Object.freeze({ mode: request.mode ?? "spawn", deliverable: request.deliverable.trim(), remaining: maxDirectChildren - used });
		},
		remaining: () => maxDirectChildren - used,
	});
}

export function repeatedFailureState(observations, error) {
	const current = classifyExecutionFailure(error);
	const previous = observations?.at(-1);
	return Object.freeze({ ...current, blocked: previous?.fingerprint === current.fingerprint, nextAction: current.recovery });
}

export async function writeExecutionCheckpoint({ cwd, featureId, completed = [], remaining = [], changedFiles = [], checks = [], failure = null, nextAction = null }) {
	if (!/^[a-z][a-z0-9-]*$/.test(featureId)) throw new Error("featureId is invalid");
	const directory = join(cwd, ".blueprint", "checkpoints");
	await mkdir(directory, { recursive: true });
	const checkpoint = { version: 1, id: `checkpoint-${randomUUID()}`, featureId, completed, remaining, changedFiles, checks, failure, nextAction, createdAt: new Date().toISOString() };
	const target = join(directory, `${featureId}.json`);
	const temporary = `${target}.${randomUUID()}.tmp`;
	await writeFile(temporary, JSON.stringify(checkpoint, null, 2) + "\n", "utf8");
	await rename(temporary, target);
	return Object.freeze({ file: `.blueprint/checkpoints/${featureId}.json`, checkpoint });
}
