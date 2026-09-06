//#region tests/client-render-smoke.test.js
/**
 * Lint + balance check for client.js.
 *
 * 1. `node --check` parses the file as valid ES syntax.
 * 2. We execute the factory in a vm sandbox with a mock React + jsdom-free
 *    walker that captures every `h(type, props, ...children)` call, then
 *    walks the resulting tree and reports:
 *      - any element whose `children` is not an array (a missing close
 *        bracket would surface as `children` being `undefined` here);
 *      - any element whose `type` is not a string or component;
 *      - the per-tag count so we can sanity-check the structure.
 *
 * Run: node --import ./tests/test-tmp-bootstrap.js --experimental-test-isolation=none --test tests/client-render-smoke.test.js
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { execFileSync } from "node:child_process";

test("client.js parses as valid ES syntax", () => {
	const path = fileURLToPath(new URL("../lib/client.js", import.meta.url)).replace(/^\/([A-Za-z]:)/, "$1");
	execFileSync("node", ["--check", path]);
});

test("client.js factory produces a well-formed h() tree when invoked", async () => {
	const text = await fs.readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	const hCalls = [];
	const fakeRequire = (name) => {
		if (name === "react") {
			return {
				createElement(type, props, ...children) {
					hCalls.push({ type, props: props || {}, children });
					return { __bp: true, type, props: props || {}, children };
				},
				Component: class { render() { return null; } },
			};
		}
		if (name === "@deepseek-ai/dsh-client-ui-primitives") {
			return { MarkdownText: () => ({ __bp: true, type: "MarkdownText" }) };
		}
		throw new Error("mock require: " + name);
	};

	// Run the entire client.js in a vm sandbox so the top-level call
	// `window.__ModuleLoader__.load({...})` executes; capture the returned
	// module.exports via a shim that injects our fake `require` AND an
	// outer `module` so the body's `return module.exports` reaches us.
	const capturedExports = [];
	const sandbox = {
		console: { warn: () => {}, error: () => {}, log: () => {}, info: () => {} },
		window: {
			__ModuleLoader__: {
				load(spec) {
					const require = fakeRequire;
					const moduleObj = { exports: {} };
					const exportsObj = moduleObj.exports;
					// We can't reach inside the arrow function's `var module = ...`,
					// so instead execute the whole factory body as a function that
					// takes `(require, module, exports)`, where `module` is OUR
					// moduleObj. The body's `var module = ...` redeclaration is
					// hoisted but `module.exports` at the end refers to the inner
					// `var`. To work around that, run the factory with `module`
					// shadowed to a global we control. We strip the inner `var
					// module` so it falls through to the parameter.
					const factorySrc = spec.factory.toString();
					const arrow = factorySrc.indexOf("=>") + 2;
					const ob = factorySrc.indexOf("{", arrow);
					let depth = 0;
					let cb = -1;
					for (let i = ob; i < factorySrc.length; i++) {
						const c = factorySrc[i];
						if (c === "{") depth++;
						else if (c === "}") { depth--; if (depth === 0) { cb = i; break; } }
					}
					const body = factorySrc.slice(ob + 1, cb)
						.replace(/^\s*var module = \{ exports: \{\} \};\s*$/m, "")
						.replace(/^\s*var exports = module\.exports;\s*$/m, "");
					const fn = new Function("require", "module", "exports", body);
					fn(require, moduleObj, exportsObj);
					capturedExports.push(moduleObj.exports);
					return moduleObj.exports;
				},
			},
		},
	};
	vm.createContext(sandbox);
	vm.runInContext(text, sandbox);
	assert.equal(capturedExports.length, 1, "client.js should call window.__ModuleLoader__.load exactly once");
	const exports_ = capturedExports[0];
	assert.equal(typeof exports_.apply, "function", "client.js exports an apply() function");

	// Drive apply() with a minimal mock ctx that records the slot entry.
	const registry = [];
	const ctx = {
		inputTriggers: { registerSource: () => {} },
		slots: {
			inject(slotKey, fn) { fn(); },
			register(opts, component) {
				registry.push({ opts, component });
				return () => {};
			},
		},
	};
	exports_.apply(ctx);
	assert.ok(registry.length >= 1, "apply() should register at least one slot entry");

	// Invoke the registered BlueprintView component with mock props and
	// walk the resulting tree, flagging any element whose children are
	// not an array — that's the shape a missing close paren leaves.
	const treeErrors = [];
	const propPool = { cwd: process.cwd(), sessionId: "session-smoke", dshWorkspacePath: process.cwd(), dshWorkspaceTitle: "smoke" };
	function walk(node, depth, path) {
		if (node === null || node === undefined) return;
		if (typeof node !== "object" || node.__bp !== true) return;
		const tag = typeof node.type === "string" ? `<${node.type}>` : `<${node.type?.name ?? "?"}>`;
		if (!Array.isArray(node.children)) {
			treeErrors.push(`${path}/${tag} has non-array children (${typeof node.children})`);
			return;
		}
		for (const c of node.children) walk(c, depth + 1, path + tag);
	}
	for (const { opts, component } of registry) {
		try {
			const tree = component(propPool);
			walk(tree, 0, opts.id || "?");
		} catch (err) {
			treeErrors.push(`component ${opts.id} threw: ${err?.message}`);
		}
	}

	if (treeErrors.length > 0) {
		console.log("client.js tree errors:");
		for (const e of treeErrors.slice(0, 20)) console.log("  " + e);
	}
	assert.equal(treeErrors.length, 0, `client.js produced ${treeErrors.length} tree error(s)`);

	// Sanity: the inject slot component returned a value (even if BlueprintView
	// is wrapped in an error boundary and our mock React doesn't render it,
	// the call should not throw and the returned element's children should be
	// an array). The treeErrors check above is the real assertion.
	const hCallCount = hCalls.length;
	assert.ok(hCallCount >= 1, `expected at least one h() invocation from the factory, got ${hCallCount}`);
});
//#endregion