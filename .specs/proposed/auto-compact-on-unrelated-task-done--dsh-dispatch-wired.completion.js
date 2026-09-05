// .specs/proposed/auto-compact-on-unrelated-task-done--dsh-dispatch-wired.completion.js
import { createBlueprintOrchestrator } from "../../lib/orchestration.js";

const cwd = process.cwd();
const featureId = "spec-governance";
const specHash = "0e6f4bef809f07ec5dfd43b3e1e8f417c6bbc02b1757a97d20bbad8f76427653";

const agent = {
	id: "session-fda4447f-29d8-4595-aeba-00f50099abaa",
	session: { id: "session-fda4447f-29d8-4595-aeba-00f50099abaa", cwd },
	steer() {},
};

const orchestrator = createBlueprintOrchestrator({});

const result = await orchestrator.dispatchNatural({ action: "complete", featureId, specHash, verification: {
	conclusion: "passed",
	summary: "Auto-compact on Feature switch DSH dispatch wired. Host-side session-file watcher (lib/auto-compact-watcher.js) is registered inside the plugin's cordis effect block with compaction in inject; the watcher calls ctx.compaction.compactNow(agent, signal, commandId) directly when the Feature-switch + 200 KiB predicate fires. The orchestrator stashes the active session's agent via watcher.captureAgent on every /blueprint invocation; watcher.tick processes any new task/done events the CLI wrote since the last tick. CLI's emitAutoCompact still passes dispatch: null (CLI is a subprocess) but its six outcome lines stay valid for human feedback. 13 REQ; 16 AC; 8 scenarios; 0 required / 0 recommended scan issues; 18/18 docs confirmed; 244/244 host tests pass (+18 new: 10 watcher + 3 orchestrator + 4 plugin + 1 CLI).",
	acResults: [
		{ id: "AC-WATCH-001", status: "passed", evidence: ["tests/auto-compact-watcher.test.js createAutoCompactWatcher factory returns captureAgent/tick/dispose"] },
		{ id: "AC-WATCH-002", status: "passed", evidence: ["tests/auto-compact-watcher.test.js fires compactNow on Feature switch + >= 200 KiB"] },
		{ id: "AC-WATCH-003", status: "passed", evidence: ["tests/auto-compact-watcher.test.js same-feature / under-threshold / no-prior-task cases"] },
		{ id: "AC-WATCH-004", status: "passed", evidence: ["tests/auto-compact-watcher.test.js dedups replays"] },
		{ id: "AC-WATCH-005", status: "passed", evidence: ["tests/auto-compact-watcher.test.js catches compactNow errors"] },
		{ id: "AC-WATCH-006", status: "passed", evidence: ["tests/auto-compact-watcher.test.js dispose clears agent stash"] },
		{ id: "AC-INDEX-001", status: "passed", evidence: ["tests/plugin.test.js inject includes compaction"] },
		{ id: "AC-INDEX-002", status: "passed", evidence: ["tests/plugin.test.js watcher registration + no-compaction fallback"] },
		{ id: "AC-INDEX-003", status: "passed", evidence: ["tests/plugin.test.js disposer registration"] },
		{ id: "AC-ORCH-001", status: "passed", evidence: ["tests/orchestration-auto-compact.test.js dispatchCommand forwards capture + tick"] },
		{ id: "AC-ORCH-002", status: "passed", evidence: ["tests/orchestration-auto-compact.test.js tolerates watcher=null"] },
		{ id: "AC-CLI-006", status: "passed", evidence: ["tests/cli-todo.test.js CLI prints; host watcher dispatches"] },
		{ id: "AC-DOCS-003", status: "passed", evidence: ["node lib/cli.js docs check --cwd . reports 18/18 confirmed"] },
		{ id: "AC-PARENT-001", status: "passed", evidence: ["inspection of .specs/implemented/auto-compact-on-unrelated-task-done.md follow-up paragraph"] },
		{ id: "AC-SCAN-002", status: "passed", evidence: ["node lib/cli.js scan --all --cwd . reports 0/0"] },
		{ id: "AC-REGRESSION-002", status: "passed", evidence: ["244/244 host tests pass"] },
	],
	checks: [
		{ id: "watcher-factory-shape", kind: "inspection", status: "passed", summary: "createAutoCompactWatcher returns captureAgent/tick/dispose", acIds: ["AC-WATCH-001"], surface: "api", moment: "static", evidenceLevel: "static-unit", environment: "node 22 win11", entryPoint: "lib/auto-compact-watcher.js", action: "node --check lib/auto-compact-watcher.js", oracle: "factory exports three methods", actual: "factory exports three methods", observations: [], artifacts: [] },
		{ id: "watcher-suite-api", kind: "command", status: "passed", summary: "10 watcher tests (api/terminal)", acIds: ["AC-WATCH-002", "AC-WATCH-003", "AC-WATCH-004", "AC-WATCH-005", "AC-WATCH-006"], surface: "api", moment: "terminal", evidenceLevel: "contract-integration", environment: "node 22 win11", entryPoint: "tests/auto-compact-watcher.test.js", action: "node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/auto-compact-watcher.test.js", oracle: "10/10 pass", actual: "10/10 pass", observations: [], artifacts: [] },
		{ id: "plugin-inject-static", kind: "inspection", status: "passed", summary: "inject includes compaction", acIds: ["AC-INDEX-001"], surface: "repository", moment: "static", evidenceLevel: "static-unit", environment: "node 22 win11", entryPoint: "lib/index.js", action: "grep -c '\"compaction\"' lib/index.js", oracle: "matches >= 1", actual: "matches 1", observations: [], artifacts: [] },
		{ id: "plugin-suite-terminal", kind: "command", status: "passed", summary: "plugin watcher-registration + no-compaction-fallback (repository/terminal)", acIds: ["AC-INDEX-002"], surface: "repository", moment: "terminal", evidenceLevel: "contract-integration", environment: "node 22 win11", entryPoint: "tests/plugin.test.js", action: "node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/plugin.test.js", oracle: "watcher registration + fallback tests pass", actual: "watcher registration + fallback tests pass", observations: [], artifacts: [] },
		{ id: "plugin-suite-static", kind: "command", status: "passed", summary: "plugin disposer-registration (repository/static)", acIds: ["AC-INDEX-003"], surface: "repository", moment: "static", evidenceLevel: "contract-integration", environment: "node 22 win11", entryPoint: "tests/plugin.test.js", action: "node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/plugin.test.js", oracle: "disposer registration test passes", actual: "disposer registration test passes", observations: [], artifacts: [] },
		{ id: "orchestrator-suite", kind: "command", status: "passed", summary: "3 orchestrator cases (api/terminal)", acIds: ["AC-ORCH-001", "AC-ORCH-002"], surface: "api", moment: "terminal", evidenceLevel: "contract-integration", environment: "node 22 win11", entryPoint: "tests/orchestration-auto-compact.test.js", action: "node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/orchestration-auto-compact.test.js", oracle: "3/3 pass", actual: "3/3 pass", observations: [], artifacts: [] },
		{ id: "cli-suite", kind: "command", status: "passed", summary: "11 CLI cases including AC-CLI-006", acIds: ["AC-CLI-006"], surface: "cli", moment: "terminal", evidenceLevel: "contract-integration", environment: "node 22 win11", entryPoint: "tests/cli-todo.test.js", action: "node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/cli-todo.test.js", oracle: "11/11 pass", actual: "11/11 pass", observations: [], artifacts: [] },
		{ id: "docs-check", kind: "command", status: "passed", summary: "18/18 bilingual pairs confirmed", acIds: ["AC-DOCS-003"], surface: "cli", moment: "static", evidenceLevel: "completion-hygiene", environment: "node 22 win11", entryPoint: "node lib/cli.js docs check --cwd .", action: "node lib/cli.js docs check --cwd .", oracle: "0 required / 0 recommended", actual: "0 required / 0 recommended", observations: [], artifacts: [] },
		{ id: "scan", kind: "command", status: "passed", summary: "scan 0/0", acIds: ["AC-SCAN-002"], surface: "cli", moment: "terminal", evidenceLevel: "contract-integration", environment: "node 22 win11", entryPoint: "node lib/cli.js scan --all --cwd .", action: "node lib/cli.js scan --all --cwd .", oracle: "0 required / 0 recommended", actual: "0 required / 0 recommended", observations: [], artifacts: [] },
		{ id: "full-test", kind: "command", status: "passed", summary: "244/244 host tests pass", acIds: ["AC-REGRESSION-002"], surface: "cli", moment: "terminal", evidenceLevel: "contract-integration", environment: "node 22 win11", entryPoint: "node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test \"tests/*.test.js\" \"tests/**/*.test.js\"", action: "node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test \"tests/*.test.js\" \"tests/**/*.test.js\"", oracle: "244/244 pass", actual: "244/244 pass", observations: [], artifacts: [] },
		{ id: "parent-spec-followup", kind: "inspection", status: "passed", summary: "parent Spec ## Consequences follow-up paragraph exists", acIds: ["AC-PARENT-001"], surface: "repository", moment: "static", evidenceLevel: "static-unit", environment: "node 22 win11", entryPoint: ".specs/implemented/auto-compact-on-unrelated-task-done.md", action: "grep -c 'Follow-up: DSH dispatch wired' .specs/implemented/auto-compact-on-unrelated-task-done.md", oracle: "matches >= 1", actual: "matches 1", observations: [], artifacts: [] },
	],
	findings: [
		{ id: "phase-7-clean", domain: "development", severity: "advisory", message: "Implementation matches Spec. lib/auto-compact-watcher.js provides createAutoCompactWatcher; lib/index.js wires it inside the effect block with compaction in inject; lib/orchestration.js forwards captureAgent + tick from dispatchCommand. CLI's emitAutoCompact outcome lines preserved; no CLI-side changes. New tests cover all 16 ACs. No regressions." },
	],
} }, { agent });

console.log(JSON.stringify(result, null, 2));
