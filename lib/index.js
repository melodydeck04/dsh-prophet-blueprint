//#region lib/types/index.js
/**
 * DSH host plugin for spec-driven development guidance and status inspection.
 *
 * @module @dsh-plugins/design-blueprint
 */
import { formatScanSummary, scan } from "./scan.js";
import { BLUEPRINT_API_PATH, handleBlueprintRequest } from "./web-api.js";

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

const name = "design-blueprint";
const inject = ["commands", "systemPrompt", "webServer"];

export const MODEL_GUIDANCE = `## Spec-driven development

Before modifying workspace files, read design-blueprint.json, every authority document it names, and the relevant lifecycle specification under .specs/.
For non-trivial work, establish or update the specification before implementation. Keep changes inside its machine-readable Scope, satisfy each AC-* acceptance criterion with declared verification evidence, and update the public contract and architecture owners when their facts change.
For feature-catalog work, a planning request may fill only the Host-registered bilingual Product brief and proposed Spec artifacts prepared for that Feature, plus necessary feature-document references, then must stop. Keep each language in its own file and never invent or fuzzy-match artifact paths. Never hand-write or edit .blueprint/approvals: direct developer approval normally comes from Blueprint Web; when Web is unavailable, the hash-bound design-blueprint approve CLI fallback may be invoked only after explicit developer authorization in the same task. Do not implement a Feature-linked proposal unless the exact combined bilingual hash is approved; changing either Spec language invalidates approval and requires another developer review.
For human-facing documentation, also read the configured documentation standard. Put each fact in its owning document tier, update every in-scope English/Chinese pair together, and never confirm a translation pair until semantic equivalence has been reviewed.
Do not treat a passing test alone as authority to expand scope. If implementation requires an unplanned file or behavior, update the specification and obtain review before continuing.`;

/** Register one model-visible guidance section and the direct `/blueprint` command. */
function apply(ctx) {
	ctx.effect(function* () {
		const active = new Set();
		yield async () => {
			await Promise.allSettled(active);
		};
		yield ctx.systemPrompt.section({
			name: "design-blueprint:spec-driven-development",
			order: 90,
			text: MODEL_GUIDANCE,
		});
		yield ctx.commands.register({
			name: "blueprint",
			description: "Check the current workspace against its lifecycle specifications.",
			input: { hint: "all" },
			handler(invocation) {
				const operation = invokeBlueprint(invocation);
				active.add(operation);
				const retire = () => active.delete(operation);
				operation.then(retire, retire);
				return operation;
			},
		});
		yield ctx.webServer.register({
			kind: "exact",
			path: BLUEPRINT_API_PATH,
			handler: handleBlueprintRequest,
		});
	}, "design-blueprint.registrations");
}

async function invokeBlueprint({ agent, rawInput }) {
	const argument = rawInput.trim();
	if (argument !== "" && argument !== "all") {
		return { kind: "error", text: "Usage: /blueprint [all]" };
	}
	const cwd = agent.session.cwd ?? process.cwd();
	try {
		const result = await scan({ cwd, all: argument === "all" });
		return { kind: "success", text: formatScanSummary(result) };
	} catch (error) {
		return {
			kind: "error",
			text: `Blueprint could not identify the current project.\n${error instanceof Error ? error.message : String(error)}\nCurrent DSH workspace: ${cwd}`,
		};
	}
}

export { apply, inject, name };
//#endregion
