import test from "node:test";
import assert from "node:assert/strict";
import { validateVerificationPayload, validateVerificationEvidence } from "../lib/verification.js";

function makeSpec(targetSpecs) {
	const acceptance = new Map();
	for (const id of targetSpecs) acceptance.set(id, "outcome");
	const targets = targetSpecs.map((id) => ({
		id,
		surface: "cli",
		moment: "terminal",
		minimumEvidence: "contract-integration",
		requirementIds: [],
		entryPoint: null,
		trigger: null,
		oracle: "outcome",
		procedure: "",
	}));
	return {
		acceptance,
		changePackage: { verification: { targets } },
	};
}

function makeCommandCheck(targetAcId) {
	return { id: `command-check-${targetAcId}`, kind: "command", status: "passed", summary: "ok", surface: "cli", moment: "terminal", evidenceLevel: "contract-integration", environment: "", entryPoint: "", action: "", oracle: "", actual: "", acIds: [targetAcId], observations: [], artifacts: [] };
}

function makePayload(acIds, conclusion = "passed") {
	return {
		conclusion,
		summary: "ok",
		acResults: acIds.map((id) => ({ id, status: "passed", evidence: ["stub"] })),
		checks: acIds.map((id) => makeCommandCheck(id)),
		findings: [],
	};
}

test("validateVerificationPayload: well-formed payload returns ok (AC-VPAY-001)", () => {
	const spec = makeSpec(["AC-X-1", "AC-X-2"]);
	const payload = makePayload(["AC-X-1", "AC-X-2"]);
	const result = validateVerificationPayload(spec, payload);
	assert.equal(result.ok, true);
	assert.deepEqual(result.issues, []);
});

test("validateVerificationPayload: lists every missing AC (AC-VPAY-002)", () => {
	const spec = makeSpec(["AC-X-1", "AC-X-2", "AC-X-3"]);
	const payload = makePayload(["AC-X-1"]);
	const result = validateVerificationPayload(spec, payload);
	assert.equal(result.ok, false);
	const text = result.issues.join("\n");
	assert.match(text, /AC AC-X-2 is missing/);
	assert.match(text, /AC AC-X-3 is missing/);
});

test("validateVerificationPayload: lists unknown AC ids (AC-VPAY-002)", () => {
	const spec = makeSpec(["AC-X-1"]);
	const payload = makePayload(["AC-X-1", "AC-EXTRA"]);
	const result = validateVerificationPayload(spec, payload);
	assert.equal(result.ok, false);
	assert.match(result.issues.join("\n"), /AC AC-EXTRA is not declared/);
});

test("validateVerificationPayload: lists failing ACs and failing checks (AC-VPAY-002)", () => {
	const spec = makeSpec(["AC-X-1", "AC-X-2"]);
	const payload = makePayload(["AC-X-1", "AC-X-2"]);
	payload.acResults[0].status = "failed";
	payload.checks[0].status = "failed";
	const result = validateVerificationPayload(spec, payload);
	assert.equal(result.ok, false);
	const text = result.issues.join("\n");
	assert.match(text, /AC AC-X-1 status is 'failed'/);
	assert.match(text, /check command-check-AC-X-1 status is 'failed'/);
});

test("validateVerificationPayload: lists missing command check (AC-VPAY-002)", () => {
	const spec = makeSpec(["AC-X-1"]);
	const payload = makePayload(["AC-X-1"]);
	payload.checks = [{ id: "inspect-1", kind: "inspection", status: "passed", summary: "ok", surface: "repository", moment: "static", evidenceLevel: "static-unit", environment: "", entryPoint: "", action: "", oracle: "", actual: "", acIds: ["AC-X-1"], observations: [], artifacts: [] }];
	const result = validateVerificationPayload(spec, payload);
	assert.equal(result.ok, false);
	assert.ok(result.issues.some((line) => /command/.test(line) && /require/.test(line)), `issues: ${result.issues.join("\n")}`);
});

test("validateVerificationPayload: lists unsatisfied AC × check pairing (AC-VPAY-002)", () => {
	const spec = makeSpec(["AC-X-1", "AC-X-2", "AC-X-3"]);
	const payload = makePayload(["AC-X-1", "AC-X-2"]);
	const result = validateVerificationPayload(spec, payload);
	assert.equal(result.ok, false);
	assert.ok(result.issues.some((line) => line.includes("AC-X-3")));
});

test("validateVerificationPayload: accumulates across 5 invalid ACs (AC-VPAY-003)", () => {
	const spec = makeSpec(["AC-1", "AC-2", "AC-3", "AC-4", "AC-5", "AC-6"]);
	const payload = makePayload(["AC-1"]);
	const result = validateVerificationPayload(spec, payload);
	assert.equal(result.ok, false);
	const missingLines = result.issues.filter((line) => /AC AC-[2-6] is missing/.test(line));
	assert.equal(missingLines.length, 5);
});

test("validateVerificationPayload: failed conclusion without required finding lists the missing-finding issue (AC-VPAY-004)", () => {
	const spec = makeSpec(["AC-X-1"]);
	const payload = makePayload(["AC-X-1"], "failed");
	payload.acResults[0].status = "failed";
	payload.findings = [];
	const result = validateVerificationPayload(spec, payload);
	assert.equal(result.ok, false);
	assert.ok(result.issues.some((line) => line.includes("required finding")));
});

test("validateVerificationPayload: failed conclusion with required finding is ok (AC-VPAY-004)", () => {
	const spec = makeSpec(["AC-X-1"]);
	const payload = makePayload(["AC-X-1"], "failed");
	payload.acResults[0].status = "failed";
	payload.findings = [{ id: "f1", domain: "development", severity: "required", message: "nope" }];
	const result = validateVerificationPayload(spec, payload);
	assert.equal(result.ok, true, `unexpected issues: ${result.issues.join("\n")}`);
});

test("validateVerificationPayload: schema-invalid payload returns ok=false without throwing (AC-VPAY-002)", () => {
	const spec = makeSpec(["AC-X-1"]);
	const result = validateVerificationPayload(spec, { conclusion: "passed" });
	assert.equal(result.ok, false);
	assert.ok(result.issues.length > 0);
	assert.match(result.issues.join("\n"), /payload schema invalid/);
});

test("validateVerificationEvidence: still throws on invalid payload (AC-VPAY-005)", () => {
	const spec = makeSpec(["AC-X-1"]);
	assert.throws(
		() => validateVerificationEvidence(spec, { conclusion: "passed" }),
		/verification result acResults is invalid|verification result checks is invalid|verification result findings is invalid/,
	);
});

test("validateVerificationEvidence: throws on missing AC pairings (AC-VPAY-005)", () => {
	const spec = makeSpec(["AC-X-1", "AC-X-2"]);
	const payload = makePayload(["AC-X-1"]);
	assert.throws(
		() => validateVerificationEvidence(spec, payload),
		/must contain every and only the approved Spec AC ids/,
	);
});
