//#region lib/types/index.js
/**
 * DSH Host plugin for one-input spec-driven development and system mapping.
 *
 * @module @dsh-plugins/design-blueprint
 */
import { BLUEPRINT_API_PATH, handleBlueprintRequest } from "./web-api.js";
import { createBlueprintOrchestrator } from "./orchestration.js";

export {
	parseComponent,
	loadArchitectureCatalog,
	serializeComponent,
	hashComponentContent,
	COMPONENT_STATUSES,
	COMPONENT_KINDS,
	COMPONENT_RELATION_TYPES,
	COMPONENT_ID_PATTERN,
} from "./architecture.js";
export { analyzeReconciliation, featureArchitectureReadiness } from "./reconciliation.js";
export { applyAssistantSpecPatch, applySpecLifecycleTransition, previewAssistantSpecPatch } from "./assistant-actions.js";
export {
	abandonFeatureVerification,
	beginFeatureImplementation,
	bindFeatureCycleRole,
	completeVerifiedFeature,
	failFeatureVerificationOrchestration,
	loadVerificationCatalog,
	normalizeVerificationResult,
	prepareFeatureVerification,
	requestFeatureVerification,
	requestLegacyFeatureVerification,
	startFeatureVerification,
	submitFeatureVerificationResult,
	verificationRepairPrompt,
	verificationSnapshotDigest,
} from "./verification.js";
export { createBlueprintOrchestrator, implementerGuardReason, verifierGuardReason } from "./orchestration.js";
export * from "./chat-commands.js";

const name = "design-blueprint";
const inject = ["commands", "systemPrompt", "webServer", "tools"];

export const MODEL_GUIDANCE = `## Spec-driven development

This repository uses Blueprint authority. For a development requirement, call blueprint_dispatch action=refine before non-trivial edits. Ground the request in design-blueprint.json, its authority documents, the Feature tree, current bilingual brief, active changes, code, interfaces, and tests.
Refine the request into stable REQ-* requirements and concrete scenarios. Cover normal flow, inputs/outputs, state, rules, failures, edge cases, permissions, persistence, compatibility, non-goals, and observable acceptance when relevant. Ask at most three questions per round, and only when plausible answers materially change behavior, data, compatibility, risk, or scope; record other uncertainty as assumptions. Persist the original request, clarification answers, assumptions, requirements, scenarios, ordered tasks, traceability, checklist results, and unresolved decisions in the one Feature-linked proposed Spec. Every task must map to REQ-*, declared Scope paths, and AC verification. Do not create a parallel refinement state file.
Run the requirements checklist and cross-artifact analysis before implementation. Do not request exact-hash approval or call blueprint_dispatch action=begin until blocking decisions are zero, every checklist item passes, and every requirement/task/verification/Scope mapping is complete; otherwise keep refining the Spec and show the unresolved items.
DSH's normal Chat is the only developer conversation. Use the current DSH Agent for ordinary bounded implementation and verification. Create technical design or independent verification only when structural risk justifies it; never ask the developer to select an internal role. Exact bilingual Spec approval remains a direct developer action. After approval call blueprint_dispatch action=begin, implement inside Scope, run requirement-linked checks, then call action=complete with every AC and check result. Do not hand-write approval or verification records.
Blueprint Web is a read-oriented Feature hierarchy and document viewer. Dashboard selection, Session titles, prompt markers, browser state, and assistant prose never grant repository authority.`;

function tracked(active, operation) {
	active.add(operation);
	const retire = () => active.delete(operation);
	operation.then(retire, retire);
	return operation;
}

function commandResult(operation) {
	return Promise.resolve(operation).catch((error) => ({ kind: "error", text: error instanceof Error ? error.message : String(error) }));
}

/** Register native DSH commands, one model dispatch tool, and the dashboard API. */
function apply(ctx) {
	const orchestrator = createBlueprintOrchestrator(ctx);
	ctx.effect(function* () {
		const active = new Set();
		yield async () => {
			await Promise.allSettled(active);
			await orchestrator.dispose();
		};
		yield ctx.systemPrompt.section({ name: "design-blueprint:spec-driven-development", order: 90, text: MODEL_GUIDANCE });
		yield ctx.tools.register(orchestrator.dispatchToolDefinition());
		yield ctx.commands.register({
			name: "blueprint",
			description: "Refine and implement one requirement in the normal DSH Chat.",
			input: { hint: "describe the requirement; @Feature is optional" },
			recordInput: false,
			handler(invocation) { return tracked(active, commandResult(orchestrator.dispatchCommand("blueprint", invocation))); },
		});
		yield ctx.commands.register({
			name: "blueprint-status",
			description: "Show concise deterministic Blueprint status without a model turn.",
			handler(invocation) {
				return tracked(active, commandResult(orchestrator.status(invocation)));
			},
		});
		yield ctx.commands.register({
			name: "blueprint-map",
			description: "Show the current Feature hierarchy without a model turn.",
			handler(invocation) { return tracked(active, commandResult(orchestrator.map(invocation))); },
		});
		yield ctx.webServer.register({
			kind: "exact",
			path: BLUEPRINT_API_PATH,
			handler: (req, res) => handleBlueprintRequest(req, res),
		});
	}, "design-blueprint.registrations");
}

export { apply, inject, name };
//#endregion
