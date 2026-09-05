/**
 * Snapshot-bound proportional verification and automatic lifecycle completion.
 *
 * Verification records are Host-owned state. Development Sessions may request
 * verification, but only a fresh verifier result plus deterministic Host gates
 * can finalize a Feature.
 *
 * @module @dsh-plugins/design-blueprint/verification
 */
import { execFile as execFileCallback } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix, resolve } from "node:path";
import { promisify } from "node:util";
import { loadArchitectureCatalog } from "./architecture.js";
import { resolveFeatureArtifacts } from "./artifacts.js";
import { loadConfig } from "./config.js";
import { serializePairRecord } from "./docs.js";
import { loadFeatureCatalog } from "./features.js";
import { matchesAny, normalizeRelativePath } from "./path-utils.js";
import { resolveBlueprintRoot } from "./project-root.js";
import { DELIVERY_SURFACES, EVIDENCE_LEVELS, OBSERVATION_MOMENTS, loadSpecs, parseSpec } from "./specs.js";
import { gitIndexSnapshot, gitRoot, stagedChanges, workingTreeSnapshot } from "./snapshot.js";
import { loadFeatureWorkflow } from "./workflow.js";

const execFile = promisify(execFileCallback);
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const CYCLE_ID_PATTERN = /^cycle-[a-f0-9-]{36}$/;
const RECORD_STAGES = new Set(["implementing", "verification_ready", "verifying", "needs_changes", "verified", "completed"]);
const CYCLE_INTENTS = new Set(["new", "change", "adopt", "continue", "natural", "legacy"]);
const CYCLE_ROLES = ["coordinator", "architecture", "implementer"];
const RESULT_KEYS = new Set(["conclusion", "summary", "acResults", "checks", "findings"]);
const RESULT_DOMAINS = new Set(["development", "spec", "architecture", "mixed"]);
const RESULT_STATUSES = new Set(["passed", "failed"]);
const CHECK_KINDS = new Set(["command", "browser", "inspection"]);
const CHECK_KEYS = new Set(["id", "kind", "status", "summary", "acIds", "surface", "moment", "evidenceLevel", "environment", "entryPoint", "action", "oracle", "actual", "observations", "artifacts"]);
const OBSERVATION_PHASES = new Set(["intermediate", "terminal"]);
const EVIDENCE_RANK = new Map(EVIDENCE_LEVELS.map((entry, index) => [entry, index]));
const ORCHESTRATION_PHASES = new Set(["workspace-prepare", "session-setup", "verification-start", "capability-store", "prompt-send"]);
const MAX_RECORD_BYTES = 256 * 1024;
const MAX_TEXT = 4_000;
const MAX_EVIDENCE = 32;
const MAX_ATTEMPTS = 50;
const MAX_HISTORY = 20;
const preparedWorkspaces = new Map();
const SECRET_PATTERNS = [
	/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
	/\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}/i,
	/\bsk-[A-Za-z0-9_-]{20,}\b/,
];
const TEMPORARY_PATH_PATTERN = /(?:^|\/)(?:_diag(?:\.|$)|_svc(?:\.|$)|_test_[^/]*|debug[-_.][^/]*|[^/]+\.(?:tmp|bak|log|out))$/i;

function gitArguments(root, ...args) {
	return ["-c", `safe.directory=${String(root).replaceAll("\\", "/")}`, "-C", root, ...args];
}

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function now() {
	return new Date().toISOString();
}

function absolute(root, relative) {
	return join(root, ...relative.split("/"));
}

function verificationIssue(file, message, fix) {
	return { file, check: "feature-verification", severity: "required", message, fix };
}

function boundedText(value, field, { allowEmpty = false } = {}) {
	if (typeof value !== "string") throw new Error(`${field} must be a string`);
	const text = value.trim();
	if ((!allowEmpty && text.length === 0) || text.length > MAX_TEXT) throw new Error(`${field} must contain ${allowEmpty ? "0" : "1"}-${MAX_TEXT} characters`);
	return text;
}

function timestamp(value, field) {
	const text = boundedText(value, field);
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(text) || Number.isNaN(Date.parse(text))) throw new Error(`${field} must be an ISO-8601 UTC timestamp`);
	return text;
}

function exactKeys(value, allowed, field) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be one object`);
	const unknown = Object.keys(value).filter((key) => !allowed.has(key));
	if (unknown.length > 0) throw new Error(`${field} contains unknown fields: ${unknown.join(", ")}`);
}

function verificationFile(config, featureId) {
	return `${config.features.verificationsRoot}/${featureId}.json`;
}

function blockedOwner(finding) {
	if (finding?.domain === "spec") return "spec";
	if (finding?.domain === "architecture") return "design";
	if (finding?.domain === "development") return "implementation";
	return "verification";
}

function statusProjection(record) {
	const attempt = record.attempts?.at(-1) ?? null;
	const finding = attempt?.findings?.find((entry) => entry.severity === "required") ?? null;
	if (record.stage === "needs_changes") return {
		publicState: "blocked",
		reasonCode: finding?.id ?? "verification-failed",
		owner: blockedOwner(finding),
		evidence: finding?.message ?? attempt?.summary ?? "Required verification evidence failed.",
		nextAction: finding?.domain === "spec"
			? "Revise the governed Spec and obtain a new exact-hash approval."
			: finding?.domain === "architecture"
				? "Repair the declared design or ownership boundary, then request verification again."
				: "Repair the failed implementation or environment condition, then request verification again.",
	};
	if (record.stage === "verifying") return { publicState: "verifying", reasonCode: "verification-running", owner: "verification", evidence: `Attempt ${attempt?.id ?? "unknown"} is collecting evidence.`, nextAction: "Wait for the declared evidence result; a failure will become blocked." };
	if (record.stage === "verification_ready") return { publicState: "verifying", reasonCode: "verification-ready", owner: "verification", evidence: "The staged snapshot is bound and ready for evidence collection.", nextAction: "Start the prepared verification attempt." };
	if (record.stage === "verified") return { publicState: "verifying", reasonCode: "completion-pending", owner: "verification", evidence: "All declared evidence passed; Host completion gates are pending.", nextAction: "Run atomic completion against the same staged snapshot." };
	if (record.stage === "implementing") return { publicState: "implementing", reasonCode: "implementation-active", owner: "implementation", evidence: "Implementation is in progress inside the approved Scope.", nextAction: "Finish the mapped tasks and request verification." };
	if (record.stage === "completed") return { publicState: "completed", reasonCode: "completed", owner: "verification", evidence: "Evidence and Host completion gates passed.", nextAction: null };
	return { publicState: "blocked", reasonCode: "verification-state-invalid", owner: "verification", evidence: `Unsupported verification stage: ${record.stage}`, nextAction: "Repair the verification record." };
}

function publicRecord(record) {
	if (!record) return null;
	const output = structuredClone(record);
	for (const attempt of output.attempts ?? []) delete attempt.capabilityHash;
	for (const history of output.history ?? []) {
		for (const attempt of history.attempts ?? []) delete attempt.capabilityHash;
	}
	output.status = statusProjection(output);
	return output;
}

function parseSpecBinding(value) {
	exactKeys(value, new Set(["sourceFile", "approvedHash", "implementedFile"]), "verification.spec");
	const sourceFile = normalizeRelativePath(value.sourceFile);
	if (!sourceFile.endsWith(".md") || sourceFile.endsWith(".zh.md")) throw new Error("verification.spec.sourceFile must be one English Spec path");
	if (!HASH_PATTERN.test(value.approvedHash ?? "")) throw new Error("verification.spec.approvedHash must be SHA-256");
	const implementedFile = value.implementedFile === null ? null : normalizeRelativePath(value.implementedFile);
	return { sourceFile, approvedHash: value.approvedHash, implementedFile };
}

function parseSnapshotBinding(value) {
	if (value === null) return null;
	exactKeys(value, new Set(["kind", "digest"]), "verification.snapshot");
	if (value.kind !== "git-index" && value.kind !== "working-tree") throw new Error("verification.snapshot.kind is invalid");
	if (!HASH_PATTERN.test(value.digest ?? "")) throw new Error("verification.snapshot.digest must be SHA-256");
	return { kind: value.kind, digest: value.digest };
}

function parseRoleBinding(value, field) {
	if (value === null) return null;
	exactKeys(value, new Set(["sessionId", "boundAt"]), field);
	if (!SESSION_ID_PATTERN.test(value.sessionId ?? "")) throw new Error(`${field}.sessionId is invalid`);
	return { sessionId: value.sessionId, boundAt: timestamp(value.boundAt, `${field}.boundAt`) };
}

function parseCycleBinding(value, field = "verification.cycle") {
	if (value === null || value === undefined) return null;
	exactKeys(value, new Set(["id", "intent", "requestSessionId", "roles", "superseded"]), field);
	if (!CYCLE_ID_PATTERN.test(value.id ?? "")) throw new Error(`${field}.id is invalid`);
	if (!CYCLE_INTENTS.has(value.intent)) throw new Error(`${field}.intent is invalid`);
	const requestSessionId = value.requestSessionId === null ? null : value.requestSessionId;
	if (requestSessionId !== null && !SESSION_ID_PATTERN.test(requestSessionId ?? "")) throw new Error(`${field}.requestSessionId is invalid`);
	exactKeys(value.roles, new Set(CYCLE_ROLES), `${field}.roles`);
	if (!Array.isArray(value.superseded) || value.superseded.length > 100) throw new Error(`${field}.superseded is invalid`);
	return {
		id: value.id,
		intent: value.intent,
		requestSessionId,
		roles: Object.fromEntries(CYCLE_ROLES.map((role) => [role, parseRoleBinding(value.roles[role] ?? null, `${field}.roles.${role}`)])),
		superseded: value.superseded.map((entry, index) => {
			exactKeys(entry, new Set(["role", "sessionId", "supersededAt", "reason"]), `${field}.superseded[${index}]`);
			if (!CYCLE_ROLES.includes(entry.role)) throw new Error(`${field}.superseded[${index}].role is invalid`);
			if (!SESSION_ID_PATTERN.test(entry.sessionId ?? "")) throw new Error(`${field}.superseded[${index}].sessionId is invalid`);
			return {
				role: entry.role,
				sessionId: entry.sessionId,
				supersededAt: timestamp(entry.supersededAt, `${field}.superseded[${index}].supersededAt`),
				reason: boundedText(entry.reason, `${field}.superseded[${index}].reason`),
			};
		}),
	};
}
function parseAcResult(value, index) {
	exactKeys(value, new Set(["id", "status", "evidence"]), `acResults[${index}]`);
	if (typeof value.id !== "string" || !/^AC-[A-Za-z0-9-]+$/.test(value.id)) throw new Error(`acResults[${index}].id is invalid`);
	if (!RESULT_STATUSES.has(value.status)) throw new Error(`acResults[${index}].status is invalid`);
	if (!Array.isArray(value.evidence) || value.evidence.length === 0 || value.evidence.length > MAX_EVIDENCE) throw new Error(`acResults[${index}].evidence is invalid`);
	return { id: value.id, status: value.status, evidence: value.evidence.map((entry, item) => boundedText(entry, `acResults[${index}].evidence[${item}]`)) };
}

function optionalText(value, field, fallback) {
	return value === undefined ? fallback : boundedText(value, field, { allowEmpty: true });
}

function parseObservation(value, checkIndex, index) {
	exactKeys(value, new Set(["phase", "order", "observedAt", "value"]), `checks[${checkIndex}].observations[${index}]`);
	if (!OBSERVATION_PHASES.has(value.phase)) throw new Error(`checks[${checkIndex}].observations[${index}].phase is invalid`);
	if (!Number.isInteger(value.order) || value.order < 1 || value.order > 10_000) throw new Error(`checks[${checkIndex}].observations[${index}].order is invalid`);
	return {
		phase: value.phase,
		order: value.order,
		observedAt: value.observedAt === null || value.observedAt === undefined ? null : timestamp(value.observedAt, `checks[${checkIndex}].observations[${index}].observedAt`),
		value: boundedText(value.value, `checks[${checkIndex}].observations[${index}].value`),
	};
}

function parseCheck(value, index) {
	exactKeys(value, CHECK_KEYS, `checks[${index}]`);
	const id = boundedText(value.id, `checks[${index}].id`);
	if (!/^[A-Za-z0-9._:-]{1,120}$/.test(id)) throw new Error(`checks[${index}].id is invalid`);
	if (!CHECK_KINDS.has(value.kind)) throw new Error(`checks[${index}].kind is invalid`);
	if (!RESULT_STATUSES.has(value.status)) throw new Error(`checks[${index}].status is invalid`);
	const summary = boundedText(value.summary, `checks[${index}].summary`);
	const surface = value.surface ?? (value.kind === "browser" ? "web-ui" : value.kind === "command" ? "cli" : "repository");
	const moment = value.moment ?? "terminal";
	const evidenceLevel = value.evidenceLevel ?? (value.kind === "browser" ? "user-visible" : value.kind === "command" ? "contract-integration" : "static-unit");
	if (!DELIVERY_SURFACES.includes(surface)) throw new Error(`checks[${index}].surface is invalid`);
	if (!OBSERVATION_MOMENTS.includes(moment)) throw new Error(`checks[${index}].moment is invalid`);
	if (!EVIDENCE_LEVELS.includes(evidenceLevel)) throw new Error(`checks[${index}].evidenceLevel is invalid`);
	if (value.acIds !== undefined && (!Array.isArray(value.acIds) || value.acIds.some((entry) => typeof entry !== "string" || !/^AC-[A-Za-z0-9-]+$/.test(entry)))) throw new Error(`checks[${index}].acIds is invalid`);
	if (value.observations !== undefined && (!Array.isArray(value.observations) || value.observations.length > MAX_EVIDENCE)) throw new Error(`checks[${index}].observations is invalid`);
	if (value.artifacts !== undefined && (!Array.isArray(value.artifacts) || value.artifacts.length > MAX_EVIDENCE)) throw new Error(`checks[${index}].artifacts is invalid`);
	return {
		id,
		kind: value.kind,
		status: value.status,
		summary,
		acIds: [...new Set(value.acIds ?? [])],
		surface,
		moment,
		evidenceLevel,
		environment: optionalText(value.environment, `checks[${index}].environment`, ""),
		entryPoint: optionalText(value.entryPoint, `checks[${index}].entryPoint`, ""),
		action: optionalText(value.action, `checks[${index}].action`, ""),
		oracle: optionalText(value.oracle, `checks[${index}].oracle`, ""),
		actual: optionalText(value.actual, `checks[${index}].actual`, summary),
		observations: (value.observations ?? []).map((entry, item) => parseObservation(entry, index, item)),
		artifacts: (value.artifacts ?? []).map((entry, item) => boundedText(entry, `checks[${index}].artifacts[${item}]`)),
	};
}

function parseFinding(value, index) {
	exactKeys(value, new Set(["id", "domain", "severity", "message"]), `findings[${index}]`);
	const id = boundedText(value.id, `findings[${index}].id`);
	if (!/^[A-Za-z0-9._:-]{1,120}$/.test(id)) throw new Error(`findings[${index}].id is invalid`);
	if (!RESULT_DOMAINS.has(value.domain)) throw new Error(`findings[${index}].domain is invalid`);
	if (value.severity !== "required" && value.severity !== "advisory") throw new Error(`findings[${index}].severity is invalid`);
	return { id, domain: value.domain, severity: value.severity, message: boundedText(value.message, `findings[${index}].message`) };
}

export function normalizeVerificationResult(value) {
	exactKeys(value, RESULT_KEYS, "verification result");
	if (!RESULT_STATUSES.has(value.conclusion)) throw new Error("verification result conclusion must be passed or failed");
	if (!Array.isArray(value.acResults) || value.acResults.length > 500) throw new Error("verification result acResults is invalid");
	if (!Array.isArray(value.checks) || value.checks.length > 200) throw new Error("verification result checks is invalid");
	if (!Array.isArray(value.findings) || value.findings.length > 200) throw new Error("verification result findings is invalid");
	const result = {
		conclusion: value.conclusion,
		summary: boundedText(value.summary, "verification result summary"),
		acResults: value.acResults.map(parseAcResult),
		checks: value.checks.map(parseCheck),
		findings: value.findings.map(parseFinding),
	};
	for (const [field, rows] of [["acResults", result.acResults], ["checks", result.checks], ["findings", result.findings]]) {
		if (new Set(rows.map((entry) => entry.id)).size !== rows.length) throw new Error(`verification result ${field} contains duplicate ids`);
	}
	if (Buffer.byteLength(JSON.stringify(result), "utf8") > MAX_RECORD_BYTES) throw new Error("verification result exceeds 256 KiB");
	return result;
}

function parseAttempt(value, index) {
	const allowed = new Set(["id", "sessionId", "capabilityHash", "resultCapability", "startedAt", "completedAt", "conclusion", "summary", "acResults", "checks", "findings"]);
	const unknown = Object.keys(value).filter((key) => !allowed.has(key));
	if (unknown.length > 0) throw new Error(`attempts[${index}] contains unknown fields: ${unknown.join(", ")}`);
	if (typeof value.id !== "string" || !/^attempt-[1-9][0-9]*$/.test(value.id)) throw new Error(`attempts[${index}].id is invalid`);
	if (!SESSION_ID_PATTERN.test(value.sessionId ?? "")) throw new Error(`attempts[${index}].sessionId is invalid`);
	const capabilityHash = value.capabilityHash === undefined || value.capabilityHash === null ? null : value.capabilityHash;
	if (capabilityHash !== null && !HASH_PATTERN.test(capabilityHash)) throw new Error(`attempts[${index}].capabilityHash must be SHA-256`);
	const resultCapability = value.resultCapability === undefined || value.resultCapability === null ? null : value.resultCapability;
	if (resultCapability !== null && (typeof resultCapability !== "string" || !/^[a-f0-9]{64}$/.test(resultCapability))) {
		throw new Error(`attempts[${index}].resultCapability must be 32 bytes of lowercase hex when present`);
	}
	if (capabilityHash !== null && resultCapability !== null && sha256(resultCapability) !== capabilityHash) {
		throw new Error(`attempts[${index}].resultCapability must match capabilityHash`);
	}
	const startedAt = timestamp(value.startedAt, `attempts[${index}].startedAt`);
	if (value.completedAt === null && value.conclusion === null) {
		if (value.summary !== "" || value.acResults?.length !== 0 || value.checks?.length !== 0 || value.findings?.length !== 0) throw new Error(`attempts[${index}] cannot contain evidence before completion`);
		return { id: value.id, sessionId: value.sessionId, capabilityHash, resultCapability, startedAt, completedAt: null, conclusion: null, summary: "", acResults: [], checks: [], findings: [] };
	}
	if (value.completedAt === null || value.conclusion === null) throw new Error(`attempts[${index}] completion fields are inconsistent`);
	const result = normalizeVerificationResult({ conclusion: value.conclusion, summary: value.summary, acResults: value.acResults, checks: value.checks, findings: value.findings });
	return { id: value.id, sessionId: value.sessionId, capabilityHash, resultCapability, startedAt, completedAt: timestamp(value.completedAt, `attempts[${index}].completedAt`), ...result };
}

function parseHistoryEntry(value, index) {
	exactKeys(value, new Set(["stage", "cycle", "spec", "snapshot", "completedAt", "attempts"]), `history[${index}]`);
	if (!RECORD_STAGES.has(value.stage)) throw new Error(`history[${index}].stage is invalid`);
	if (!Array.isArray(value.attempts) || value.attempts.length > MAX_ATTEMPTS) throw new Error(`history[${index}].attempts is invalid`);
	return {
		stage: value.stage,
		cycle: parseCycleBinding(value.cycle ?? null),
		spec: parseSpecBinding(value.spec),
		snapshot: parseSnapshotBinding(value.snapshot),
		completedAt: value.completedAt === null ? null : timestamp(value.completedAt, `history[${index}].completedAt`),
		attempts: value.attempts.map(parseAttempt),
	};
}

export function parseVerificationRecord(file, text, knownFeatures = null) {
	let value;
	try { value = JSON.parse(text); } catch (error) { throw new Error(`verification record is invalid JSON: ${error.message}`); }
	exactKeys(value, new Set(["version", "featureId", "stage", "cycle", "spec", "snapshot", "requestedAt", "updatedAt", "completedAt", "attempts", "history"]), "verification record");
	if (value.version !== 1) throw new Error("verification record version must be 1");
	if (typeof value.featureId !== "string" || !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(value.featureId)) throw new Error("verification record featureId is invalid");
	if (knownFeatures && !knownFeatures.has(value.featureId)) throw new Error(`verification record references unknown Feature '${value.featureId}'`);
	if (!RECORD_STAGES.has(value.stage)) throw new Error("verification record stage is invalid");
	if (!Array.isArray(value.attempts) || value.attempts.length > MAX_ATTEMPTS) throw new Error("verification record attempts is invalid");
	if (!Array.isArray(value.history) || value.history.length > MAX_HISTORY) throw new Error("verification record history is invalid");
	const record = {
		version: 1,
		featureId: value.featureId,
		stage: value.stage,
		cycle: parseCycleBinding(value.cycle ?? null),
		spec: parseSpecBinding(value.spec),
		snapshot: parseSnapshotBinding(value.snapshot),
		requestedAt: value.requestedAt === null ? null : timestamp(value.requestedAt, "verification.requestedAt"),
		updatedAt: timestamp(value.updatedAt, "verification.updatedAt"),
		completedAt: value.completedAt === null ? null : timestamp(value.completedAt, "verification.completedAt"),
		attempts: value.attempts.map(parseAttempt),
		history: value.history.map(parseHistoryEntry),
	};
	for (const [index, attempt] of record.attempts.entries()) {
		if (attempt.id !== `attempt-${index + 1}`) throw new Error("verification attempts must use consecutive ordered ids");
	}
	const incomplete = record.attempts.filter((attempt) => attempt.completedAt === null);
	if (record.stage === "implementing" && (record.snapshot !== null || record.requestedAt !== null || incomplete.length > 0)) throw new Error("implementing verification record has invalid snapshot state");
	if (record.stage !== "implementing" && record.snapshot === null) throw new Error("queued verification record requires a snapshot binding");
	if (record.stage === "verifying") {
		if (incomplete.length !== 1 || record.attempts.at(-1)?.completedAt !== null) throw new Error("verifying record requires one latest incomplete attempt");
		if (record.attempts.at(-1)?.capabilityHash === null) throw new Error("verifying record requires one Host capability binding");
	} else if (incomplete.length > 0) {
		throw new Error(`verification stage '${record.stage}' cannot retain an incomplete attempt`);
	}
	if (record.stage === "needs_changes" && record.attempts.at(-1)?.conclusion !== "failed") throw new Error("needs_changes record requires a latest failed attempt");
	if (record.stage === "completed" && (record.completedAt === null || record.spec.implementedFile === null || record.attempts.at(-1)?.conclusion !== "passed")) throw new Error("completed record requires completion metadata and a latest passing attempt");
	if (record.stage !== "completed" && record.completedAt !== null) throw new Error("open verification record cannot have completedAt");
	return { file, record, hash: sha256(text) };
}

export async function loadVerificationCatalog(snapshot, config, features = []) {
	const root = config.features.verificationsRoot;
	const prefix = `${root}/`;
	const known = new Set(features.map((feature) => feature.id));
	const records = new Map();
	const issues = [];
	for (const file of snapshot.files.filter((entry) => entry.startsWith(prefix) && entry.endsWith(".json"))) {
		const text = await snapshot.readText(file);
		if (text === null) continue;
		try {
			const parsed = parseVerificationRecord(file, text, known);
			if (file !== verificationFile(config, parsed.record.featureId)) throw new Error("verification filename must match featureId");
			records.set(parsed.record.featureId, { ...parsed.record, file, hash: parsed.hash });
		} catch (error) {
			issues.push(verificationIssue(file, error.message, "Remove the malformed record and request independent verification again"));
		}
	}
	return { root, records, issues, summary: { total: records.size, completed: [...records.values()].filter((entry) => entry.stage === "completed").length, open: [...records.values()].filter((entry) => entry.stage !== "completed").length } };
}

export async function verificationSnapshotDigest(snapshot, verificationsRoot) {
	const hash = createHash("sha256");
	const prefix = `${verificationsRoot}/`;
	for (const file of snapshot.files.filter((entry) => !entry.startsWith(prefix)).sort()) {
		const content = typeof snapshot.readBytes === "function" ? await snapshot.readBytes(file) : await snapshot.readText(file);
		if (content === null) continue;
		hash.update(file).update("\0").update(content).update("\0");
	}
	return hash.digest("hex");
}

async function atomicRecordWrite(root, file, record) {
	const target = absolute(root, file);
	await mkdir(dirname(target), { recursive: true });
	const temporary = `${target}.${randomUUID()}.tmp`;
	await writeFile(temporary, JSON.stringify(record, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
	try { await rename(temporary, target); } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}

async function snapshotFacts(root, snapshot) {
	const configResult = await loadConfig(snapshot);
	if (configResult.issues.some((entry) => entry.severity === "required")) throw new Error("repair design-blueprint.json before verification");
	const [catalog, specsResult, architecture] = await Promise.all([
		loadFeatureCatalog(snapshot, configResult.config),
		loadSpecs(snapshot, configResult.config),
		loadArchitectureCatalog(snapshot, configResult.config),
	]);
	return { root, snapshot, config: configResult.config, catalog, specsResult, architecture };
}

async function currentFacts(cwd) {
	const root = await resolveBlueprintRoot(cwd);
	return snapshotFacts(root, await workingTreeSnapshot(root));
}

function currentApprovedSpec(featureId, specs, state, expectedSpecHash) {
	if (!state?.spec || state.spec.status !== "proposed" || state.stage !== "approved") throw new Error(`Feature '${featureId}' must have one currently approved proposed Spec`);
	const hash = state.spec.reviewHash ?? state.spec.contentHash;
	if (hash !== expectedSpecHash) throw new Error("approved Spec hash changed before implementation");
	return specs.find((entry) => entry.file === state.spec.file) ?? state.spec;
}

function cycleBinding(intent = "change", requestSessionId = null) {
	if (!CYCLE_INTENTS.has(intent)) throw new Error("implementation cycle intent is invalid");
	if (requestSessionId !== null && !SESSION_ID_PATTERN.test(requestSessionId ?? "")) throw new Error("implementation cycle requestSessionId is invalid");
	return {
		id: `cycle-${randomUUID()}`,
		intent,
		requestSessionId,
		roles: { coordinator: requestSessionId === null ? null : { sessionId: requestSessionId, boundAt: now() }, architecture: null, implementer: null },
		superseded: [],
	};
}

function emptyRecord(featureId, spec, prior = null, intent = "change", requestSessionId = null) {
	const history = prior ? [...(prior.history ?? []), {
		stage: prior.stage,
		cycle: prior.cycle ?? null,
		spec: prior.spec,
		snapshot: prior.snapshot,
		completedAt: prior.completedAt,
		attempts: prior.attempts,
	}].slice(-MAX_HISTORY) : [];
	return {
		version: 1,
		featureId,
		stage: "implementing",
		cycle: cycleBinding(intent, requestSessionId),
		spec: { sourceFile: spec.file, approvedHash: spec.reviewHash ?? spec.contentHash, implementedFile: null },
		snapshot: null,
		requestedAt: null,
		updatedAt: now(),
		completedAt: null,
		attempts: [],
		history,
	};
}

export async function beginFeatureImplementation({ cwd, featureId, expectedSpecHash, intent = "change", requestSessionId = null }) {
	if (!HASH_PATTERN.test(expectedSpecHash ?? "")) throw new Error("expectedSpecHash must be SHA-256");
	const facts = await currentFacts(cwd);
	const workflow = await loadFeatureWorkflow(facts.snapshot, facts.config, facts.specsResult.specs, facts.catalog.features, facts.architecture.components);
	const feature = facts.catalog.features.find((entry) => entry.id === featureId);
	if (!feature) throw new Error(`Feature '${featureId}' does not exist`);
	const spec = currentApprovedSpec(featureId, facts.specsResult.specs, workflow.states.get(featureId), expectedSpecHash);
	const verificationCatalog = await loadVerificationCatalog(facts.snapshot, facts.config, facts.catalog.features);
	const prior = verificationCatalog.records.get(featureId) ?? null;
	if (prior && prior.stage !== "completed" && prior.spec.approvedHash === expectedSpecHash) {
		if (prior.cycle) return { root: facts.root, file: prior.file, record: publicRecord(prior), resumed: true };
		const upgraded = { ...prior, cycle: cycleBinding(intent, requestSessionId), updatedAt: now() };
		delete upgraded.file; delete upgraded.hash;
		await atomicRecordWrite(facts.root, verificationFile(facts.config, featureId), upgraded);
		return { root: facts.root, file: verificationFile(facts.config, featureId), record: publicRecord(upgraded), resumed: true };
	}
	const record = emptyRecord(featureId, spec, prior, intent, requestSessionId);
	const file = verificationFile(facts.config, featureId);
	await atomicRecordWrite(facts.root, file, record);
	return { root: facts.root, file, record, resumed: false };
}

/** Bind one exact durable DSH role Session to the active Feature cycle. */
export async function bindFeatureCycleRole({ cwd, featureId, cycleId, role, sessionId, expectedSpecHash, supersedeReason = "Host replaced an unavailable role Session" }) {
	if (!CYCLE_ROLES.includes(role)) throw new Error("cycle role is invalid");
	if (!SESSION_ID_PATTERN.test(sessionId ?? "")) throw new Error("cycle role sessionId is invalid");
	if (!HASH_PATTERN.test(expectedSpecHash ?? "")) throw new Error("cycle role expectedSpecHash must be SHA-256");
	const facts = await currentFacts(cwd);
	const record = await readCurrentRecord(facts, featureId);
	if (!record.cycle || record.cycle.id !== cycleId) throw new Error("cycle role binding is stale or cross-Feature");
	if (record.spec.approvedHash !== expectedSpecHash) throw new Error("cycle role binding has a stale Spec hash");
	if (record.stage === "completed") throw new Error("completed cycle cannot bind a role Session");
	const current = record.cycle.roles[role];
	if (current?.sessionId === sessionId) return { root: facts.root, file: record.file, record: publicRecord(record), idempotent: true };
	const timestamp = now();
	const superseded = current ? [...record.cycle.superseded, { role, sessionId: current.sessionId, supersededAt: timestamp, reason: boundedText(supersedeReason, "cycle role supersede reason") }].slice(-100) : record.cycle.superseded;
	const next = {
		...record,
		cycle: { ...record.cycle, roles: { ...record.cycle.roles, [role]: { sessionId, boundAt: timestamp } }, superseded },
		updatedAt: timestamp,
	};
	delete next.file; delete next.hash;
	await atomicRecordWrite(facts.root, verificationFile(facts.config, featureId), next);
	return { root: facts.root, file: verificationFile(facts.config, featureId), record: publicRecord(next), idempotent: false };
}
async function unstagedPaths(root) {
	const [tracked, untracked] = await Promise.all([
		execFile("git", gitArguments(root, "diff", "--name-only", "-z"), { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }),
		execFile("git", gitArguments(root, "ls-files", "--others", "--exclude-standard", "-z"), { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }),
	]);
	return [...tracked.stdout.split("\0"), ...untracked.stdout.split("\0")].filter(Boolean).map(normalizeRelativePath);
}

async function addedLines(root, paths) {
	if (paths.length === 0) return [];
	const { stdout } = await execFile("git", gitArguments(root, "diff", "--cached", "--unified=0", "--no-ext-diff", "--", ...paths), { windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
	return stdout.split(/\r?\n/).filter((line) => line.startsWith("+") && !line.startsWith("+++")).map((line) => line.slice(1));
}

/** Inspect only newly staged material; policy exceptions are explicit repository paths. */
export async function completionHygieneFindings({ root, snapshot, config }) {
	if (snapshot.kind !== "git-index") return [];
	const changes = await stagedChanges(root);
	const changedPaths = changes.map((entry) => entry.path);
	const findings = [];
	for (const path of changedPaths) {
		if (config.completionHygiene.temporaryAllow.length > 0 && matchesAny(path, config.completionHygiene.temporaryAllow)) continue;
		if (TEMPORARY_PATH_PATTERN.test(path)) findings.push({ id: "completion-temporary-artifact", path, message: `undeclared temporary or debug artifact is staged: ${path}` });
	}
	for (const path of changedPaths) {
		if (config.completionHygiene.secretAllow.length > 0 && matchesAny(path, config.completionHygiene.secretAllow)) continue;
		const lines = await addedLines(root, [path]);
		if (lines.some((line) => SECRET_PATTERNS.some((pattern) => pattern.test(line)))) {
			findings.push({ id: "completion-secret-like-material", path, message: `new secret-like material is present in the staged diff for ${path}; redact it or add an explicit completionHygiene.secretAllow policy exception` });
		}
	}
	return findings;
}

async function exactVerificationSnapshot(root, config, spec, { requireStagedImplementation = true } = {}) {
	const repositoryRoot = await gitRoot(root);
	if (repositoryRoot !== null && resolve(repositoryRoot).toLowerCase() === resolve(root).toLowerCase()) {
		const changes = await stagedChanges(root);
		if (requireStagedImplementation && !changes.some((entry) => matchesAny(entry.path, spec.scope.allow) && !matchesAny(entry.path, spec.scope.deny))) {
			throw new Error("verification requires at least one staged implementation path owned by the approved Spec");
		}
		const dirty = (await unstagedPaths(root)).filter((file) => !file.startsWith(`${config.features.verificationsRoot}/`)
			&& matchesAny(file, spec.scope.allow)
			&& !matchesAny(file, spec.scope.deny));
		if (dirty.length > 0) throw new Error(`in-scope working-tree files differ from the Git index: ${dirty.slice(0, 8).join(", ")}`);
		const snapshot = await gitIndexSnapshot(root);
		return { snapshot, digest: await verificationSnapshotDigest(snapshot, config.features.verificationsRoot) };
	}
	const snapshot = await workingTreeSnapshot(root);
	return { snapshot, digest: await verificationSnapshotDigest(snapshot, config.features.verificationsRoot) };
}

function recordSpec(facts, record) {
	const legacy = record.spec.implementedFile !== null && record.spec.implementedFile === record.spec.sourceFile;
	const status = legacy ? "implemented" : "proposed";
	const spec = facts.specsResult.specs.find((entry) => entry.file === record.spec.sourceFile && entry.status === status);
	if (!spec || (spec.reviewHash ?? spec.contentHash) !== record.spec.approvedHash) {
		throw new Error(`${legacy ? "implemented" : "approved proposed"} Spec is missing or changed`);
	}
	return { spec, legacy };
}

async function readCurrentRecord(facts, featureId) {
	const catalog = await loadVerificationCatalog(facts.snapshot, facts.config, facts.catalog.features);
	const record = catalog.records.get(featureId);
	if (!record) throw new Error(`Feature '${featureId}' has no verification record`);
	return record;
}

export async function requestFeatureVerification({ cwd, featureId, expectedSpecHash }) {
	if (!HASH_PATTERN.test(expectedSpecHash ?? "")) throw new Error("expectedSpecHash must be SHA-256");
	const facts = await currentFacts(cwd);
	const record = await readCurrentRecord(facts, featureId);
	if (record.spec.approvedHash !== expectedSpecHash) throw new Error("verification request does not match the implementation cycle's approved Spec");
	if (record.stage !== "implementing" && record.stage !== "needs_changes") throw new Error(`verification cannot be requested from stage '${record.stage}'`);
	const { spec, legacy } = recordSpec(facts, record);
	const exact = await exactVerificationSnapshot(facts.root, facts.config, spec, { requireStagedImplementation: !legacy });
	const next = { ...record, stage: "verification_ready", snapshot: { kind: exact.snapshot.kind, digest: exact.digest }, requestedAt: now(), updatedAt: now() };
	delete next.file; delete next.hash;
	await atomicRecordWrite(facts.root, verificationFile(facts.config, featureId), next);
	return { root: facts.root, file: verificationFile(facts.config, featureId), record: next };
}

/**
 * Re-record the snapshot for a verification cycle in `verification_ready` stage.
 * Use this after staging or committing files between `prepareVerification` and
 * `submitResult` to recover from snapshot drift without abandoning the cycle.
 *
 * Pre-conditions:
 *   - record.stage === "verification_ready"
 *   - record hash matches `expectedRecordHash`
 *
 * @returns the new verification record with the refreshed snapshot.
 */
export async function refreshVerificationSnapshot({ cwd, featureId, expectedRecordHash }) {
	if (!HASH_PATTERN.test(expectedRecordHash ?? "")) throw new Error("expectedSpecHash must be SHA-256");
	const facts = await currentFacts(cwd);
	const record = await readCurrentRecord(facts, featureId);
	if (record.hash !== expectedRecordHash) throw new Error("verification record hash does not match expectedRecordHash");
	if (record.stage !== "verification_ready") throw new Error(`snapshot refresh is only valid from stage 'verification_ready', got '${record.stage}'`);
	const { spec, legacy } = recordSpec(facts, record);
	const exact = await exactVerificationSnapshot(facts.root, facts.config, spec, { requireStagedImplementation: !legacy });
	const next = { ...record, snapshot: { kind: exact.snapshot.kind, digest: exact.digest }, updatedAt: now() };
	delete next.file; delete next.hash;
	await atomicRecordWrite(facts.root, verificationFile(facts.config, featureId), next);
	return { root: facts.root, file: verificationFile(facts.config, featureId), record: next };
}

/** Queue independent verification for a historical implementation with lifecycle drift. */
export async function requestLegacyFeatureVerification({ cwd, featureId }) {
	const facts = await currentFacts(cwd);
	const verificationCatalog = await loadVerificationCatalog(facts.snapshot, facts.config, facts.catalog.features);
	const workflow = await loadFeatureWorkflow(facts.snapshot, facts.config, facts.specsResult.specs, facts.catalog.features, facts.architecture.components, verificationCatalog.records);
	const feature = facts.catalog.features.find((entry) => entry.id === featureId);
	if (!feature) throw new Error(`Feature '${featureId}' does not exist`);
	const state = workflow.states.get(featureId);
	const prior = verificationCatalog.records.get(featureId) ?? null;
	if (prior && prior.spec.sourceFile === state?.spec?.file && prior.stage !== "completed") {
		return { root: facts.root, file: prior.file, record: publicRecord(prior), resumed: true };
	}
	if (state?.stage !== "verification_required" || state.spec?.status !== "implemented") {
		throw new Error(`Feature '${featureId}' is not a lifecycle-drifted historical implementation`);
	}
	const spec = facts.specsResult.specs.find((entry) => entry.file === state.spec.file && entry.status === "implemented");
	if (!spec) throw new Error("implemented Spec is missing");
	const owners = facts.architecture.components.filter((entry) => entry.supportedFeatures.includes(featureId) && entry.status !== "deprecated");
	if (owners.length === 0) throw new Error("historical implementation requires one non-deprecated Component owner before verification");
	const exact = await exactVerificationSnapshot(facts.root, facts.config, spec, { requireStagedImplementation: false });
	const timestamp = now();
	const history = prior ? [...(prior.history ?? []), {
		stage: prior.stage,
		cycle: prior.cycle ?? null,
		spec: prior.spec,
		snapshot: prior.snapshot,
		completedAt: prior.completedAt,
		attempts: prior.attempts,
	}].slice(-MAX_HISTORY) : [];
	const record = {
		version: 1,
		featureId,
		stage: "verification_ready",
		cycle: cycleBinding("legacy", null),
		spec: { sourceFile: spec.file, approvedHash: spec.reviewHash ?? spec.contentHash, implementedFile: spec.file },
		snapshot: { kind: exact.snapshot.kind, digest: exact.digest },
		requestedAt: timestamp,
		updatedAt: timestamp,
		completedAt: null,
		attempts: [],
		history,
	};
	const file = verificationFile(facts.config, featureId);
	await atomicRecordWrite(facts.root, file, record);
	return { root: facts.root, file, record, resumed: false };
}

async function materializeVerificationWorkspace(facts, record, exact) {
	const base = join(tmpdir(), "design-blueprint-verification");
	await mkdir(base, { recursive: true });
	const workspacePath = await mkdtemp(join(base, `${record.featureId}-${record.snapshot.digest.slice(0, 12)}-`));
	for (const file of exact.snapshot.files) {
		if (file.startsWith(`${facts.config.features.verificationsRoot}/`)) continue;
		const content = typeof exact.snapshot.readBytes === "function" ? await exact.snapshot.readBytes(file) : await exact.snapshot.readText(file);
		if (content === null) continue;
		const target = absolute(workspacePath, file);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, content);
	}
	return workspacePath;
}

/** Materialize the exact bound snapshot into a disposable verifier workspace. */
export async function prepareFeatureVerification({ cwd, featureId, expectedRecordHash }) {
	if (!HASH_PATTERN.test(expectedRecordHash ?? "")) throw new Error("expectedRecordHash must be SHA-256");
	const facts = await currentFacts(cwd);
	const record = await readCurrentRecord(facts, featureId);
	if (record.hash !== expectedRecordHash) throw new Error("verification record changed before workspace preparation");
	if (record.stage !== "verification_ready") throw new Error(`verification workspace cannot be prepared from stage '${record.stage}'`);
	const { spec, legacy } = recordSpec(facts, record);
	const exact = await exactVerificationSnapshot(facts.root, facts.config, spec, { requireStagedImplementation: !legacy });
	if (exact.snapshot.kind !== record.snapshot.kind || exact.digest !== record.snapshot.digest) throw new Error("implementation snapshot changed before workspace preparation");
	const workspacePath = await materializeVerificationWorkspace(facts, record, exact);
	const key = randomBytes(32).toString("hex");
	preparedWorkspaces.set(key, {
		root: resolve(facts.root).toLowerCase(),
		featureId,
		recordHash: record.hash,
		workspacePath: resolve(workspacePath),
	});
	return { root: facts.root, workspacePath, preparationCapability: key };
}

export async function startFeatureVerification({ cwd, featureId, expectedRecordHash, sessionId, workspacePath, preparationCapability }) {
	if (!HASH_PATTERN.test(expectedRecordHash ?? "")) throw new Error("expectedRecordHash must be SHA-256");
	if (!SESSION_ID_PATTERN.test(sessionId ?? "")) throw new Error("sessionId is invalid");
	if (typeof preparationCapability !== "string" || !/^[a-f0-9]{64}$/.test(preparationCapability)) throw new Error("preparationCapability is invalid");
	const facts = await currentFacts(cwd);
	const record = await readCurrentRecord(facts, featureId);
	if (record.hash !== expectedRecordHash) throw new Error("verification record changed before the attempt started");
	if (record.stage !== "verification_ready") throw new Error(`verification cannot start from stage '${record.stage}'`);
	const prepared = preparedWorkspaces.get(preparationCapability);
	if (!prepared
		|| prepared.root !== resolve(facts.root).toLowerCase()
		|| prepared.featureId !== featureId
		|| prepared.recordHash !== record.hash
		|| prepared.workspacePath !== resolve(workspacePath ?? "")) {
		throw new Error("verification Session is not bound to a Host-prepared snapshot workspace");
	}
	const { spec, legacy } = recordSpec(facts, record);
	const exact = await exactVerificationSnapshot(facts.root, facts.config, spec, { requireStagedImplementation: !legacy });
	if (exact.snapshot.kind !== record.snapshot.kind || exact.digest !== record.snapshot.digest) throw new Error("implementation snapshot changed before verification started");
	const resultCapability = randomBytes(32).toString("hex");
	const attempt = { id: `attempt-${record.attempts.length + 1}`, sessionId, capabilityHash: sha256(resultCapability), resultCapability, startedAt: now(), completedAt: null, conclusion: null, summary: "", acResults: [], checks: [], findings: [] };
	const next = { ...record, stage: "verifying", updatedAt: now(), attempts: [...record.attempts, attempt] };
	delete next.file; delete next.hash;
	await atomicRecordWrite(facts.root, verificationFile(facts.config, featureId), next);
	preparedWorkspaces.delete(preparationCapability);
	return { root: facts.root, file: verificationFile(facts.config, featureId), record: publicRecord(next), attempt: publicRecord({ attempts: [attempt] }).attempts[0], resultCapability };
}

function momentSatisfies(actual, required) {
	if (required === "static") return true;
	if (required === "terminal") return ["terminal", "progressive", "persistent"].includes(actual);
	return actual === required;
}

function hasProgressiveOrdering(check) {
	const intermediate = check.observations.filter((entry) => entry.phase === "intermediate").map((entry) => entry.order);
	const terminal = check.observations.filter((entry) => entry.phase === "terminal").map((entry) => entry.order);
	return intermediate.length > 0 && terminal.length > 0 && Math.min(...intermediate) < Math.max(...terminal);
}

function checkSupportsTarget(check, target, spec) {
	if (check.status !== "passed") return false;
	const linked = check.acIds.includes(target.id) || (spec.acceptance.size === 1 && check.acIds.length === 0);
	if (!linked || check.surface !== target.surface || !momentSatisfies(check.moment, target.moment)) return false;
	if ((EVIDENCE_RANK.get(check.evidenceLevel) ?? -1) < (EVIDENCE_RANK.get(target.minimumEvidence) ?? Number.MAX_SAFE_INTEGER)) return false;
	if (target.minimumEvidence === "user-visible" && check.kind !== "browser") return false;
	if (target.moment === "progressive" && !hasProgressiveOrdering(check)) return false;
	if (target.minimumEvidence === "user-visible" || target.moment === "progressive") {
		if (![check.environment, check.entryPoint, check.action, check.oracle, check.actual].every((entry) => entry.length > 0)) return false;
	}
	return true;
}

function assertPassingEvidence(spec, result) {
	const expected = [...spec.acceptance.keys()].sort();
	const actual = result.acResults.map((entry) => entry.id).sort();
	if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error("verification result must contain every and only the approved Spec AC ids");
	if (result.acResults.some((entry) => entry.status !== "passed")) throw new Error("a passing result cannot contain a failed AC");
	if (result.checks.length === 0 || result.checks.some((entry) => entry.status !== "passed")) throw new Error("a passing result requires only passing checks");
	if (!result.checks.some((entry) => entry.kind === "command")) throw new Error("a passing result requires command evidence");
	for (const target of spec.changePackage?.verification?.targets ?? []) {
		if (!result.checks.some((check) => checkSupportsTarget(check, target, spec))) {
			throw new Error(`${target.id} requires ${target.surface}/${target.moment}/${target.minimumEvidence} evidence linked to that acceptance criterion`);
		}
	}
	if (result.findings.some((entry) => entry.severity === "required")) throw new Error("a passing result cannot retain required findings");
}

function assertResultEvidence(spec, result) {
	const known = new Set(spec.acceptance.keys());
	const unknown = result.acResults.filter((entry) => !known.has(entry.id)).map((entry) => entry.id);
	if (unknown.length > 0) throw new Error(`verification result contains unknown AC ids: ${unknown.join(", ")}`);
	if (result.conclusion === "failed" && !result.findings.some((entry) => entry.severity === "required")) {
		throw new Error("a failed result requires at least one categorized required finding");
	}
	if (result.conclusion === "passed") assertPassingEvidence(spec, result);
}

/** Normalize and validate one result against the approved Spec evidence plan. */
export function validateVerificationEvidence(spec, value) {
	const result = normalizeVerificationResult(value);
	assertResultEvidence(spec, result);
	return result;
}

/**
 * Validate a verification payload against the approved Spec evidence plan
 * without throwing. Returns an aggregate issue list so a programmatic driver
 * sees every AC × check pairing problem in one call. The function never
 * throws; every validation rule accumulates into `issues` instead of stopping
 * at the first failure. The `ok` verdict is `true` when the payload is
 * acceptable for its stated conclusion.
 *
 * For `conclusion: "passed"` the verdict is strict: every AC must be passed,
 * every check must be passed, every AC × check pairing must be satisfied,
 * at least one command-kind check must be present, and there must be no
 * required-severity findings.
 *
 * For `conclusion: "failed"` the verdict is permissive on the things that
 * are expected to be wrong: failing ACs and failing checks are informational
 * (they're why the result is failed). The verdict is strict only on the
 * required-finding rule and the AC-id-match rule.
 *
 * @param {object} spec - parsed Spec (output of `buildChangePackage`)
 * @param {object} payload - verification result the driver wants to submit
 * @returns {{ ok: boolean, normalized?: object, issues: string[] }}
 */
export function validateVerificationPayload(spec, payload) {
	const issues = [];
	let normalized;
	try {
		normalized = normalizeVerificationResult(payload);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return { ok: false, issues: [`payload schema invalid: ${message}`] };
	}

	const knownAcIds = new Set([...spec.acceptance.keys()]);
	const payloadAcIds = new Set(normalized.acResults.map((entry) => entry.id));

	for (const expectedId of [...knownAcIds].sort()) {
		if (!payloadAcIds.has(expectedId)) issues.push(`AC ${expectedId} is missing from payload.acResults`);
	}
	for (const actualId of [...payloadAcIds].sort()) {
		if (!knownAcIds.has(actualId)) issues.push(`AC ${actualId} is not declared in the approved Spec acceptance criteria`);
	}

	const failingAcs = normalized.acResults.filter((entry) => entry.status !== "passed");
	for (const entry of failingAcs) issues.push(`AC ${entry.id} status is '${entry.status}' but expected 'passed'`);

	const failingChecks = normalized.checks.filter((entry) => entry.status !== "passed");
	for (const entry of failingChecks) issues.push(`check ${entry.id} status is '${entry.status}' but expected 'passed'`);

	const hasCommandCheck = normalized.checks.some((entry) => entry.kind === "command");
	if (!hasCommandCheck) issues.push("a passing result requires at least one check with kind='command'");

	const targets = spec.changePackage?.verification?.targets ?? [];
	for (const target of targets) {
		const supporting = normalized.checks.some((check) => checkSupportsTarget(check, target, spec));
		if (!supporting) issues.push(`AC ${target.id} requires ${target.surface}/${target.moment}/${target.minimumEvidence} evidence linked to that acceptance criterion`);
	}

	const requiredFindings = normalized.findings.filter((entry) => entry.severity === "required");

	if (normalized.conclusion === "passed" && requiredFindings.length > 0) {
		for (const finding of requiredFindings) issues.push(`passing result retains required finding ${finding.id}: ${finding.message}`);
	}
	if (normalized.conclusion === "failed" && requiredFindings.length === 0) {
		issues.push("a failed result requires at least one categorized required finding");
	}

	const blockers = [];
	for (const issue of issues) {
		const lower = issue.toLowerCase();
		const isPassingStrictFailure =
			normalized.conclusion === "passed" && (
				lower.includes("missing from payload.acresults")
				|| lower.includes("not declared in the approved spec")
				|| lower.includes("expected 'passed'")
				|| lower.includes("requires at least one check")
				|| lower.includes("paired") || lower.includes("requires evidence linked")
				|| lower.includes("retains required finding")
			);
		const isFailedRequiredFinding = normalized.conclusion === "failed" && lower.includes("failed result requires at least one categorized");
		if (isPassingStrictFailure || isFailedRequiredFinding) blockers.push(issue);
	}

	return { ok: blockers.length === 0, normalized, issues };
}

function implementationContent(content, record, attempt, language) {
	const isChinese = language === "zh";
	let output = content.replace(isChinese ? /^状态：\s*(?:拟议|提议)\s*$/m : /^Status:\s*proposed\s*$/m, isChinese ? "状态：已实现" : "Status: implemented");
	output = output.replace(isChinese ? /^##\s+提案\s*$/m : /^##\s+Proposal\s*$/m, isChinese ? "## 决策" : "## Decision");
	const heading = isChinese ? "## 结果" : "## Consequences";
	const lines = isChinese ? [
		"Blueprint 已通过与需求关联的验收自动完成本次交付。",
		"",
		`- 验收快照：\`${record.snapshot.kind}:${record.snapshot.digest}\``,
		`- 验收尝试：\`${attempt.id}\``,
		`- 结论：${attempt.summary}`,
		`- AC 证据：${attempt.acResults.length} 项全部通过。`,
		`- 检查证据：${attempt.checks.map((entry) => `${entry.id}（${entry.kind}）`).join("、")}。`,
	] : [
		"Blueprint completed this delivery automatically after requirement-linked verification.",
		"",
		`- Verified snapshot: \`${record.snapshot.kind}:${record.snapshot.digest}\``,
		`- Verification attempt: \`${attempt.id}\``,
		`- Conclusion: ${attempt.summary}`,
		`- AC evidence: all ${attempt.acResults.length} acceptance criteria passed.`,
		`- Check evidence: ${attempt.checks.map((entry) => `${entry.id} (${entry.kind})`).join(", ")}.`,
	];
	return `${output.trimEnd()}\n\n${heading}\n\n${lines.join("\n")}\n`;
}

function sectionList(content, heading) {
	const lines = String(content).split(/\r?\n/);
	const start = lines.findIndex((line) => new RegExp(`^##\\s+${heading}\\s*$`, "i").test(line));
	if (start < 0) return [];
	const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line));
	return lines.slice(start + 1, end < 0 ? undefined : end).map((line) => line.trim()).filter((line) => /^-\s+/.test(line));
}

function mergeCurrentBrief(content, { marker, heading, title, acceptance }) {
	if (content.includes(marker)) return content;
	const prefix = content.endsWith("\n") ? content : `${content}\n`;
	return `${prefix}\n## ${heading}\n\n<!-- ${marker} -->\n\n### ${title}\n\n${acceptance.join("\n")}\n`;
}

async function currentTruthActions(facts, feature, spec, targetEn) {
	const artifacts = await resolveFeatureArtifacts({ snapshot: facts.snapshot, config: facts.config, feature, spec });
	const brief = artifacts.brief;
	if (!brief.en.exists && !brief.zh.exists && !brief.pairing.exists) return [];
	if (!brief.en.exists || !brief.zh.exists || !brief.pairing.exists) throw new Error("automatic completion requires a complete bilingual Feature brief triplet");
	const enAcceptance = [...spec.acceptance.entries()].map(([id, value]) => `- ${id}: ${value}`);
	const zhAcceptance = sectionList(spec.languages.zh.content, "验收条件");
	if (enAcceptance.length === 0 || zhAcceptance.length !== enAcceptance.length) throw new Error("automatic completion cannot merge bilingual current truth because acceptance criteria are missing or structurally different");
	const marker = `blueprint-current:${posix.basename(targetEn)}`;
	const zhTitle = spec.languages.zh.content.match(/^#\s+(?:规格[：:]\s*)?(.+)$/m)?.[1]?.trim() || spec.title;
	const en = mergeCurrentBrief(brief.en.content, { marker, heading: "Verified current behavior", title: spec.title, acceptance: enAcceptance });
	const zh = mergeCurrentBrief(brief.zh.content, { marker, heading: "已验证的当前行为", title: zhTitle, acceptance: zhAcceptance });
	return [
		{ file: brief.en.file, content: en },
		{ file: brief.zh.file, content: zh },
		{ file: brief.pairing.file, content: serializePairRecord(brief.en.file, en, brief.zh.file, zh) },
	];
}

function activeStatus(content, subject) {
	if (/^Status:\s*active\s*$/m.test(content)) return content;
	if (!/^Status:\s*planned\s*$/m.test(content)) throw new Error(`${subject} must be planned or active before completion`);
	return content.replace(/^Status:\s*planned\s*$/m, "Status: active");
}

async function stagePaths(root, paths) {
	await execFile("git", gitArguments(root, "add", "-A", "--", ...paths), { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
}

function transactionFault(options, point) {
	if (options?.failAt === point) throw new Error(`injected verification transaction failure at ${point}`);
}

async function backupGitIndex(root) {
	const { stdout } = await execFile("git", gitArguments(root, "rev-parse", "--git-path", "index"), { windowsHide: true });
	const raw = stdout.trim();
	const indexPath = resolve(root, raw);
	const backupPath = `${indexPath}.${randomUUID()}.blueprint-backup`;
	await copyFile(indexPath, backupPath);
	return { indexPath, backupPath };
}

async function applyTransaction(root, actions, validate, stage = false, options = null) {
	const touched = [...new Set(actions.map((entry) => entry.file))];
	const staged = [];
	const backups = [];
	const committed = [];
	let indexBackup = null;
	try {
		if (stage) indexBackup = await backupGitIndex(root);
		for (const action of actions) {
			if (action.content === null) continue;
			const target = absolute(root, action.file);
			await mkdir(dirname(target), { recursive: true });
			const temporary = `${target}.${randomUUID()}.tmp`;
			await writeFile(temporary, action.content, { encoding: "utf8", flag: "wx" });
			staged.push({ target, temporary });
		}
		transactionFault(options, "after-temp-writes");
		for (const action of actions) {
			const target = absolute(root, action.file);
			const backup = `${target}.${randomUUID()}.bak`;
			try { await rename(target, backup); backups.push({ target, backup }); } catch (error) { if (error?.code !== "ENOENT") throw error; }
		}
		transactionFault(options, "after-backups");
		for (const entry of staged) { await rename(entry.temporary, entry.target); committed.push(entry.target); }
		transactionFault(options, "after-commits");
		if (stage) await stagePaths(root, touched);
		transactionFault(options, "after-stage");
		await validate();
		transactionFault(options, "after-validate");
	} catch (error) {
		await Promise.all(staged.map((entry) => unlink(entry.temporary).catch(() => {})));
		await Promise.all(committed.map((target) => unlink(target).catch(() => {})));
		for (const entry of backups.reverse()) await rename(entry.backup, entry.target).catch(() => {});
		if (indexBackup) await copyFile(indexBackup.backupPath, indexBackup.indexPath).catch(() => {});
		if (indexBackup) await unlink(indexBackup.backupPath).catch(() => {});
		throw error;
	}
	await Promise.all(backups.map((entry) => unlink(entry.backup).catch(() => {})));
	if (indexBackup) await unlink(indexBackup.backupPath).catch(() => {});
}

async function finalizeVerifiedFeature(facts, record, attempt, transactionOptions = null) {
	const { spec, legacy } = recordSpec(facts, record);
	if (!spec.languages.zh) throw new Error("automatic completion requires the bilingual Spec pair");
	const targetEn = legacy ? spec.file : posix.join(facts.config.authority.specsRoot, "implemented", posix.basename(spec.file));
	const targetZh = legacy ? spec.languages.zh.file : targetEn.replace(/\.md$/, ".zh.md");
	if (!legacy && (facts.snapshot.exists(targetEn) || facts.snapshot.exists(targetZh))) throw new Error("implemented Spec destination already exists");
	const feature = facts.catalog.features.find((entry) => entry.id === record.featureId);
	if (!feature) throw new Error("verification Feature no longer exists");
	const owners = facts.architecture.components.filter((entry) => entry.supportedFeatures.includes(record.featureId) && entry.status !== "deprecated");
	if (owners.length === 0) throw new Error("automatic completion requires one non-deprecated Component owner");
	const english = legacy ? spec.content : implementationContent(spec.content, record, attempt, "en");
	const chinese = legacy ? spec.languages.zh.content : implementationContent(spec.languages.zh.content, record, attempt, "zh");
	if (!legacy) {
		const parsed = parseSpec(targetEn, english, facts.config.authority.specsRoot);
		if (parsed.issues.some((entry) => entry.severity === "required") || parsed.spec.status !== "implemented") throw new Error("generated implemented Spec does not validate");
	}
	let featureContent = await facts.snapshot.readText(feature.file);
	featureContent = activeStatus(featureContent, `Feature '${feature.id}'`);
	if (!legacy) featureContent = featureContent.replaceAll(spec.file, targetEn).replaceAll(spec.languages.zh.file, targetZh);
	const actions = legacy ? [
		{ file: feature.file, content: featureContent },
	] : [
		{ file: targetEn, content: english },
		{ file: targetZh, content: chinese },
		{ file: spec.file, content: null },
		{ file: spec.languages.zh.file, content: null },
		{ file: feature.file, content: featureContent },
	];
	if (!legacy) actions.push(...await currentTruthActions(facts, feature, spec, targetEn));
	for (const owner of owners) {
		const content = await facts.snapshot.readText(owner.file);
		actions.push({ file: owner.file, content: activeStatus(content, `Component '${owner.id}'`) });
	}
	const completed = {
		...record,
		stage: "completed",
		spec: { ...record.spec, implementedFile: targetEn },
		updatedAt: now(),
		completedAt: now(),
	};
	delete completed.file; delete completed.hash;
	actions.push({ file: verificationFile(facts.config, record.featureId), content: JSON.stringify(completed, null, 2) + "\n" });
	const repositoryRoot = await gitRoot(facts.root);
	const stage = record.snapshot.kind === "git-index" && repositoryRoot !== null && resolve(repositoryRoot).toLowerCase() === resolve(facts.root).toLowerCase();
	await applyTransaction(facts.root, actions, async () => {
		const { scan } = await import("./scan.js");
		const audit = await scan({ cwd: facts.root, all: !stage });
		const required = audit.issues.filter((entry) => entry.severity === "required");
		if (required.length > 0) throw new Error(`automatic completion produced ${required.length} required Blueprint issue(s): ${required[0].message}`);
	}, stage, transactionOptions);
	return completed;
}

function hostFailureMessage(error) {
	const message = error instanceof Error ? error.message : String(error);
	return message.trim().slice(0, MAX_TEXT) || "Host verification gate failed";
}

async function persistHostFailure(facts, record, attemptId, error, candidateAttempt = null) {
	const index = record.attempts.findIndex((entry) => entry.id === attemptId);
	if (index < 0 || index !== record.attempts.length - 1) throw error;
	const message = hostFailureMessage(error);
	const current = candidateAttempt ?? record.attempts[index];
	const finding = { id: "host-verification-gate", domain: "development", severity: "required", message };
	const check = { id: "host-verification-gate", kind: "inspection", status: "failed", summary: message };
	const failedAttempt = {
		...current,
		completedAt: current.completedAt ?? now(),
		conclusion: "failed",
		summary: `Independent evidence did not complete because a Host gate failed: ${message}`.slice(0, MAX_TEXT),
		checks: [...(current.checks ?? []).filter((entry) => entry.id !== check.id), check],
		findings: [...(current.findings ?? []).filter((entry) => entry.id !== finding.id), finding],
	};
	const attempts = record.attempts.map((entry, row) => row === index ? failedAttempt : entry);
	const next = { ...record, stage: "needs_changes", updatedAt: now(), completedAt: null, attempts };
	delete next.file; delete next.hash;
	await atomicRecordWrite(facts.root, verificationFile(facts.config, record.featureId), next);
	return { root: facts.root, file: verificationFile(facts.config, record.featureId), record: publicRecord(next), completed: false, hostFailure: true };
}

/** Fail any pre-result verifier orchestration error closed with durable repair evidence. */
export async function failFeatureVerificationOrchestration({ cwd, featureId, expectedRecordHash, phase, message, attemptId = null, sessionId = null }) {
	if (!HASH_PATTERN.test(expectedRecordHash ?? "")) throw new Error("expectedRecordHash must be SHA-256");
	if (!ORCHESTRATION_PHASES.has(phase)) throw new Error("verification orchestration phase is invalid");
	const detail = boundedText(message, "verification orchestration failure");
	const facts = await currentFacts(cwd);
	const record = await readCurrentRecord(facts, featureId);
	if (record.hash !== expectedRecordHash) throw new Error("verification record changed before orchestration recovery");
	if (record.stage === "needs_changes") return { root: facts.root, file: verificationFile(facts.config, featureId), record: publicRecord(record), completed: false, hostFailure: true, idempotent: true };
	const error = new Error(`Verification ${phase} failed: ${detail}`);
	if (record.stage === "verifying") {
		const attempt = record.attempts.at(-1);
		if (!attempt || attempt.id !== attemptId || attempt.sessionId !== sessionId || attempt.completedAt !== null) {
			throw new Error("verification orchestration recovery attempt is stale or cross-Session");
		}
		return persistHostFailure(facts, record, attempt.id, error);
	}
	if (record.stage !== "verification_ready") throw new Error(`verification orchestration cannot fail from stage '${record.stage}'`);
	const timestamp = now();
	const summary = hostFailureMessage(error);
	const setupAttempt = {
		id: `attempt-${record.attempts.length + 1}`,
		sessionId: SESSION_ID_PATTERN.test(sessionId ?? "") ? sessionId : "host-verification-setup",
		capabilityHash: null,
		startedAt: timestamp,
		completedAt: timestamp,
		conclusion: "failed",
		summary: `Independent verification could not start because Host orchestration failed: ${summary}`.slice(0, MAX_TEXT),
		acResults: [],
		checks: [{ id: "host-verification-orchestration", kind: "inspection", status: "failed", summary }],
		findings: [{ id: "host-verification-orchestration", domain: "development", severity: "required", message: summary }],
	};
	const next = { ...record, stage: "needs_changes", updatedAt: timestamp, completedAt: null, attempts: [...record.attempts, setupAttempt] };
	delete next.file; delete next.hash;
	await atomicRecordWrite(facts.root, verificationFile(facts.config, featureId), next);
	return { root: facts.root, file: verificationFile(facts.config, featureId), record: publicRecord(next), completed: false, hostFailure: true };
}

async function assertHostGates(facts, spec, legacy, snapshotKind) {
	const hygiene = await completionHygieneFindings({ root: facts.root, snapshot: snapshotKind === "git-index" ? await gitIndexSnapshot(facts.root) : facts.snapshot, config: facts.config });
	if (hygiene.length > 0) throw new Error(`Completion hygiene has ${hygiene.length} required issue(s): ${hygiene[0].message}`);
	const { scan } = await import("./scan.js");
	const audit = await scan({ cwd: facts.root, all: snapshotKind !== "git-index" });
	const required = audit.issues.filter((entry) => entry.severity === "required" && !(legacy
		&& entry.check === "feature-approval"
		&& entry.file === spec.file
		&& entry.message.includes("has no completed verification")));
	if (required.length > 0) throw new Error(`Host Blueprint gate has ${required.length} required issue(s): ${required[0].message}`);
}

export async function submitFeatureVerificationResult({ cwd, featureId, expectedRecordHash, attemptId, resultCapability, result, submittedBySessionId = null }) {
	if (!HASH_PATTERN.test(expectedRecordHash ?? "")) throw new Error("expectedRecordHash must be SHA-256");
	const normalized = normalizeVerificationResult(result);
	if (submittedBySessionId !== null && typeof submittedBySessionId !== "string") throw new Error("submittedBySessionId must be a string or null");
	const facts = await currentFacts(cwd);
	const record = await readCurrentRecord(facts, featureId);
	if (record.stage === "completed") {
		const prior = record.attempts.find((entry) => entry.id === attemptId && entry.conclusion === "passed");
		if (prior && JSON.stringify({ conclusion: prior.conclusion, summary: prior.summary, acResults: prior.acResults, checks: prior.checks, findings: prior.findings }) === JSON.stringify(normalized)) {
			return { root: facts.root, file: verificationFile(facts.config, featureId), record: publicRecord(record), completed: true, idempotent: true };
		}
	}
	if (record.hash !== expectedRecordHash) throw new Error("verification record changed before the result was accepted");
	if (record.stage !== "verifying") throw new Error(`verification result cannot be accepted from stage '${record.stage}'`);
	const index = record.attempts.findIndex((entry) => entry.id === attemptId);
	if (index < 0 || index !== record.attempts.length - 1 || record.attempts[index].completedAt !== null) throw new Error("verification attempt is missing, stale, or already completed");
	const storedCapability = record.attempts[index].resultCapability ?? null;
	const suppliedCapability = typeof resultCapability === "string" ? resultCapability : null;
	if (suppliedCapability !== null && sha256(suppliedCapability) !== record.attempts[index].capabilityHash) throw new Error("verification result capability is missing or forged");
	if (suppliedCapability === null && storedCapability !== null && sha256(storedCapability) === record.attempts[index].capabilityHash) {
		resultCapability = storedCapability;
	}
	if (typeof resultCapability !== "string" || sha256(resultCapability) !== record.attempts[index].capabilityHash) throw new Error("verification result capability is missing or forged");
	let initialBinding;
	let exact;
	let boundFacts;
	let spec;
	let legacy;
	try {
		initialBinding = recordSpec(facts, record);
		exact = await exactVerificationSnapshot(facts.root, facts.config, initialBinding.spec, { requireStagedImplementation: !initialBinding.legacy });
		if (exact.snapshot.kind !== record.snapshot.kind || exact.digest !== record.snapshot.digest) throw new Error("implementation snapshot changed during verification");
		boundFacts = await snapshotFacts(facts.root, exact.snapshot);
		({ spec, legacy } = recordSpec(boundFacts, record));
		if (legacy !== initialBinding.legacy) throw new Error("verification Spec lifecycle changed during the attempt");
	} catch (error) {
		return persistHostFailure(facts, record, attemptId, error);
	}
	assertResultEvidence(spec, normalized);
	const sessionTag = `[submittedBySessionId=${submittedBySessionId ?? "null"}]`;
	const summaryWithAttribution = `${sessionTag}\n${normalized.summary}`;
	const attributedNormalized = { ...normalized, summary: summaryWithAttribution };
	const completedAttempt = { ...record.attempts[index], completedAt: now(), ...attributedNormalized };
	const attempts = record.attempts.map((entry, row) => row === index ? completedAttempt : entry);
	if (normalized.conclusion === "failed") {
		const next = { ...record, stage: "needs_changes", updatedAt: now(), attempts };
		delete next.file; delete next.hash;
		await atomicRecordWrite(facts.root, verificationFile(facts.config, featureId), next);
		return { root: facts.root, file: verificationFile(facts.config, featureId), record: publicRecord(next), completed: false, verified: false };
	}
	try {
		await assertHostGates(facts, spec, legacy, exact.snapshot.kind);
	} catch (error) {
		return persistHostFailure(facts, record, attemptId, error, completedAttempt);
	}
	const verified = { ...record, stage: "verified", updatedAt: now(), attempts };
	delete verified.file; delete verified.hash;
	await atomicRecordWrite(facts.root, verificationFile(facts.config, featureId), verified);
	return { root: facts.root, file: verificationFile(facts.config, featureId), record: publicRecord(verified), completed: false, verified: true };
}

/** Complete a durable verified record, or route any Host/finalization failure back to repair. */
export async function completeVerifiedFeature({ cwd, featureId, expectedRecordHash, transactionOptions = null }) {
	if (!HASH_PATTERN.test(expectedRecordHash ?? "")) throw new Error("expectedRecordHash must be SHA-256");
	const facts = await currentFacts(cwd);
	const record = await readCurrentRecord(facts, featureId);
	if (record.hash !== expectedRecordHash) throw new Error("verification record changed before automatic completion");
	if (record.stage !== "verified") throw new Error(`automatic completion cannot run from stage '${record.stage}'`);
	const attempt = record.attempts.at(-1);
	if (!attempt || attempt.conclusion !== "passed") throw new Error("verified record has no passing attempt");
	try {
		const initialBinding = recordSpec(facts, record);
		const exact = await exactVerificationSnapshot(facts.root, facts.config, initialBinding.spec, { requireStagedImplementation: !initialBinding.legacy });
		if (exact.snapshot.kind !== record.snapshot.kind || exact.digest !== record.snapshot.digest) throw new Error("implementation snapshot changed before automatic completion");
		const boundFacts = await snapshotFacts(facts.root, exact.snapshot);
		const { spec, legacy } = recordSpec(boundFacts, record);
		if (legacy !== initialBinding.legacy) throw new Error("verification Spec lifecycle changed before automatic completion");
		await assertHostGates(facts, spec, legacy, exact.snapshot.kind);
		const completed = await finalizeVerifiedFeature(boundFacts, record, attempt, transactionOptions);
		return { root: facts.root, file: verificationFile(facts.config, featureId), record: publicRecord(completed), completed: true };
	} catch (error) {
		if (transactionOptions?.recordFailure === false) throw error;
		return persistHostFailure(facts, record, attempt.id, error, attempt);
	}
}

/** Fail a lost verifier Session/capability closed so a fresh attempt can be queued. */
export async function abandonFeatureVerification({ cwd, featureId, expectedRecordHash, attemptId, sessionId }) {
	if (!HASH_PATTERN.test(expectedRecordHash ?? "")) throw new Error("expectedRecordHash must be SHA-256");
	const facts = await currentFacts(cwd);
	const record = await readCurrentRecord(facts, featureId);
	if (record.hash !== expectedRecordHash) throw new Error("verification record changed before recovery");
	if (record.stage !== "verifying") throw new Error(`verification recovery cannot run from stage '${record.stage}'`);
	const attempt = record.attempts.at(-1);
	if (!attempt || attempt.id !== attemptId || attempt.sessionId !== sessionId || attempt.completedAt !== null) throw new Error("verification recovery attempt is stale or cross-Session");
	return persistHostFailure(facts, record, attemptId, new Error("The independent verification Session or its one-time Host capability was lost; start a fresh attempt."));
}

export function verificationRepairPrompt(feature, record) {
	const attempt = record?.attempts?.at(-1);
	const findings = attempt?.findings ?? [];
	const domains = [...new Set(findings.filter((entry) => entry.severity === "required").map((entry) => entry.domain))];
	const route = domains.length === 0 ? "development" : domains.length === 1 ? domains[0] : "mixed";
	return `Feature ${feature.id} 的独立验收未通过。路线：${route}。请只修复以下绑定验收问题，保留已批准产品范围；如问题要求改变产品行为或架构边界，先回到对应受治理提案并等待批准。修复并完成自测后重新运行 verification request。\n\n${findings.map((entry) => `- [${entry.severity}] ${entry.domain}: ${entry.message}`).join("\n")}`;
}

export { publicRecord };
