import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("DSH normal Chat is the only conversational surface", async () => {
	const client = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	for (const forbidden of [/ReviewerPanel/, /ArchitectureAssistant/, /UnifiedAssistant/, /textarea/, /sessions\.create/, /localStorage/, /session\.open/, /session\.cancel/]) assert.doesNotMatch(client, forbidden);
	assert.match(client, /在当前 DSH Chat 中工作/);
	assert.match(client, /\/blueprint @feature:/);
	assert.match(client, /bp-command/);
});

test("dashboard performs only deterministic bounded Host actions", async () => {
	const client = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	const actions = [...client.matchAll(/action:\s*"([^"]+)"/g)].map((match) => match[1]);
	assert.deepEqual([...new Set(actions)].sort(), ["approve", "bind", "dashboard", "discover", "document", "initialize"]);
	assert.match(client, /window\.confirm\(.+批准精确哈希/s);
	assert.match(client, /expectedSpecHash:feature\.workflow\.spec\.hash/);
	assert.doesNotMatch(client, /assistant-spec-apply|architecture-apply|verification-result|resultCapability/);
});

