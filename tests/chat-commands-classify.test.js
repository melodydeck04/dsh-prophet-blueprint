//#region tests/chat-commands-classify.test.js
/**
 * AC-CLASS-001..007 — input intent classifier on the `/blueprint` path.
 *
 * Each test pins one AC from the proposed sub-spec A. The classifier is
 * heuristic and synchronous; the persistence contract lives on
 * `createRefinementPacket` under `intent.class` / `intent.confidence` /
 * `intent.evidence` / `intent.clarifyingQuestions`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { classifyIntent, coordinatorMessage, createRefinementPacket } from "../lib/chat-commands.js";

test("AC-CLASS-001: research input returns class research", () => {
	const result = classifyIntent({ text: "how do I configure Docker mirrors in China?", features: [], source: "command" });
	assert.equal(result.class, "research");
	assert.equal(result.confidence, "high");
	assert.deepEqual(result.evidence, ["how", "configure", "mirrors"]);
});

test("AC-CLASS-002: new-feature input returns class new-feature", () => {
	const result = classifyIntent({ text: "add a new Approve button to the Blueprint tab", features: [], source: "command" });
	assert.equal(result.class, "new-feature");
	assert.equal(result.confidence, "high");
	assert.deepEqual(result.evidence, ["add", "new", "blueprint"]);
});

test("AC-CLASS-003: fix input returns class fix", () => {
	const result = classifyIntent({ text: "fix the broken Approve button", features: [], source: "command" });
	assert.equal(result.class, "fix");
	assert.equal(result.confidence, "high");
	assert.deepEqual(result.evidence, ["fix", "broken"]);
});

test("AC-CLASS-004: ambiguous input returns clarifyingQuestions length <= 2", () => {
	const result = classifyIntent({ text: "I want to research how to add a feature", features: [], source: "command" });
	assert.equal(result.class, "unknown");
	assert.equal(result.ambiguous, true);
	assert.ok(Array.isArray(result.clarifyingQuestions));
	assert.ok(result.clarifyingQuestions.length <= 2);
	assert.ok(result.clarifyingQuestions.length >= 1);
});

test("AC-CLASS-005: status input returns class status", () => {
	const result = classifyIntent({ text: "what is the current Feature stage", features: [], source: "command" });
	assert.equal(result.class, "status");
	assert.equal(result.confidence, "high");
	assert.deepEqual(result.evidence, ["what is", "current", "stage"]);
});

test("AC-CLASS-006: packet persists intent fields", () => {
	const packet = createRefinementPacket({
		text: "how do I configure Docker mirrors in China?",
		features: [],
		sessionId: "session-classify",
		source: "command",
	});
	assert.ok(packet.intent, "packet.intent must exist");
	assert.equal(packet.intent.class, "research");
	assert.equal(packet.intent.confidence, "high");
	assert.deepEqual(packet.intent.evidence, ["how", "configure", "mirrors"]);
	assert.equal(Object.isFrozen(packet.intent), true);

	const ambiguousPacket = createRefinementPacket({
		text: "I want to research how to add a feature",
		features: [],
		sessionId: "session-classify",
		source: "command",
	});
	assert.equal(ambiguousPacket.intent.class, "unknown");
	assert.equal(ambiguousPacket.intent.ambiguous, true);
	assert.ok(Array.isArray(ambiguousPacket.intent.clarifyingQuestions));
	assert.ok(ambiguousPacket.intent.clarifyingQuestions.length <= 2);
});

test("AC-CLASS-007: total clarifying questions per round remains <= 3", () => {
	// The intent classifier contributes 1 or 2 questions; the existing refine
	// dimensions contribute at most 3 total, so the classifier must stay within
	// its 1-2 share to keep the per-round budget <= 3.
	const samples = [
		"I want to research how to add a feature",
		"should I add a fix or a research task",
		"alternatives for the new feature fix",
		"what is the current vs proposed stage",
	];
	for (const text of samples) {
		const result = classifyIntent({ text, features: [], source: "command" });
		if (result.ambiguous) {
			assert.ok(result.clarifyingQuestions.length <= 2, `text=${text}: classifier asked ${result.clarifyingQuestions.length}`);
		}
	}
	const packet = createRefinementPacket({
		text: "I want to research how to add a feature",
		features: [],
		sessionId: "session-classify-budget",
		source: "command",
	});
	const total = packet.intent.clarifyingQuestions.length;
	assert.ok(total <= 3, `total clarifying questions must stay <= 3, got ${total}`);
});

test("AC-CLASS-COORDINATOR: coordinator treats classification as advisory without inventing research capabilities", () => {
	const research = createRefinementPacket({ text: "how do I configure Docker mirrors in China?", features: [], sessionId: "s", source: "command" });
	const researchMessage = coordinatorMessage(research);
	assert.match(researchMessage, /legacy advisory hint/);
	assert.doesNotMatch(researchMessage, /research-before-refine/);

	const newFeature = createRefinementPacket({ text: "add a new Approve button to the Blueprint tab", features: [], sessionId: "s", source: "command" });
	const newFeatureMessage = coordinatorMessage(newFeature);
	assert.doesNotMatch(newFeatureMessage, /## Research notes/);
	assert.match(newFeatureMessage, /Intent: new-feature \(high\)\./);
});

test("classifyIntent is pure and synchronous", () => {
	const input = { text: "add a new Approve button", features: [], source: "command" };
	const a = classifyIntent(input);
	const b = classifyIntent(input);
	assert.deepEqual(a, b);
});

test("/blueprint-status exact input short-circuits to status", () => {
	const result = classifyIntent({ text: "/blueprint-status", features: [], source: "command" });
	assert.equal(result.class, "status");
	assert.equal(result.confidence, "high");
	assert.deepEqual(result.evidence, ["/blueprint-status"]);
});
//#endregion
