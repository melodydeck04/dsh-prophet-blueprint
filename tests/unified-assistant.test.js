import test from "node:test";
import assert from "node:assert/strict";
import { createRefinementPacket, extractFeatureReferences, parseNaturalDispatch, parseWorkCommand, resolveRequirementOwner } from "../lib/chat-commands.js";

const features = [
	{ id: "search", title: "Search", summary: "Search project files", parentId: null, scope: ["src/search/**"], workflow: { stage: "ready" } },
	{ id: "export", title: "Export", summary: "Export reports", parentId: null, scope: ["src/export/**"], workflow: { stage: "refining" } },
];

test("/blueprint and ordinary Chat dispatch share one refinement packet", () => {
	const fixed = { requestId: "request-1", createdAt: "2026-08-25T00:00:00.000Z" };
	const command = parseWorkCommand({ commandName: "blueprint", rawInput: "@feature:search 调整搜索失败提示", features, sessionId: "chat-1", ...fixed });
	const natural = parseNaturalDispatch({ featureId: "search", text: "调整搜索失败提示", features, sessionId: "chat-1", ...fixed });
	assert.deepEqual({ ...command, source: "same" }, { ...natural, source: "same" });
	assert.equal(command.owner.selected.id, "search");
	assert.equal(command.originalRequest, "调整搜索失败提示");
});

test("owning Feature selection is exact, bounded, and fails closed", () => {
	assert.deepEqual(extractFeatureReferences("@feature:search and @feature:export"), ["search", "export"]);
	assert.equal(resolveRequirementOwner({ text: "@feature:export add PDF", features }).feature.id, "export");
	assert.equal(resolveRequirementOwner({ text: "improve project file search", features }).feature.id, "search");
	const unresolved = resolveRequirementOwner({ text: "add a new billing capability", features });
	assert.equal(unresolved.status, "unresolved");
	assert.ok(unresolved.candidates.length <= 3);
	assert.throws(() => resolveRequirementOwner({ text: "@feature:search @feature:export merge", features }), /只能有一个/);
	assert.throws(() => resolveRequirementOwner({ text: "@feature:missing edit", features }), /不存在/);
});

test("refinement requires traceable requirements and limits material questions", () => {
	const packet = createRefinementPacket({ text: "@feature:search add permission checks and failure handling", features, sessionId: "chat-1", source: "tool" });
	assert.equal(packet.refinement.requirementIdFormat, "REQ-*");
	assert.equal(packet.refinement.scenarioFormat, "Given/When/Then");
	assert.equal(packet.refinement.questionLimitPerRound, 3);
	assert.equal(packet.refinement.persistIn, "feature-linked-proposed-spec");
	assert.ok(packet.refinement.persistedEvidence.includes("clarification-answers"));
	assert.ok(packet.refinement.persistedEvidence.includes("checklist-results"));
	assert.ok(packet.refinement.dimensions.includes("failures-and-edge-cases"));
	assert.ok(packet.qualityGates.crossArtifactAnalysis.includes("requirements-to-verification"));
	assert.ok(packet.qualityGates.crossArtifactAnalysis.includes("tasks-to-scope"));
	assert.deepEqual(packet.qualityGates.approvalPrerequisites, [
		"zero-blocking-decisions",
		"all-checklist-items-pass",
		"every-task-maps-to-requirement-scope-and-verification",
	]);
	assert.equal(packet.planning.designRequired, true);
	assert.equal(packet.planning.defaultExecution, "current-dsh-agent");
});
