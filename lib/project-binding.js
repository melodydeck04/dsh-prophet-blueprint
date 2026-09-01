/**
 * Blueprint project resolution for DSH workspaces.
 *
 * @module @dsh-plugins/design-blueprint/project-binding
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { resolveBlueprintRoot } from "./project-root.js";

const MAX_PATH = 4_096;
const STORE_VERSION = 1;
let fallbacks = new Map();
let loaded = false;
let storePathOverride = null;
let workspaceStorePathOverride = null;

function validatePath(path, label) {
	if (typeof path !== "string" || path.trim().length === 0 || path.length > MAX_PATH) {
		throw new Error(`${label} must be a non-empty path`);
	}
	return path;
}

function optionalPath(path) {
	return typeof path === "string" && path.trim().length > 0 && path.length <= MAX_PATH ? path : null;
}

function workspaceKey(cwd) {
	return resolve(validatePath(cwd, "cwd")).toLowerCase();
}

function storePath() {
	return storePathOverride ?? join(homedir(), ".dsh", "design-blueprint-bindings.json");
}

function workspaceStorePath() {
	return workspaceStorePathOverride ?? join(homedir(), ".dsh", "storages", "workspace.json");
}

function publicBinding(entry) {
	return entry ? { cwd: entry.cwd, root: entry.root, boundAt: entry.boundAt } : null;
}

function parseStore(text) {
	let parsed;
	try { parsed = JSON.parse(text); }
	catch { return new Map(); }
	if (parsed?.version !== STORE_VERSION || !Array.isArray(parsed.fallbacks)) return new Map();
	const rows = new Map();
	for (const entry of parsed.fallbacks) {
		if (typeof entry?.cwd !== "string" || typeof entry?.root !== "string" || typeof entry?.boundAt !== "string") continue;
		try { rows.set(workspaceKey(entry.cwd), { cwd: resolve(entry.cwd), root: resolve(entry.root), boundAt: entry.boundAt }); }
		catch { /* ignore malformed persisted rows */ }
	}
	return rows;
}

async function loadFallbacks() {
	if (loaded) return fallbacks;
	try { fallbacks = parseStore(await readFile(storePath(), "utf8")); }
	catch (error) {
		if (error?.code !== "ENOENT") throw error;
		fallbacks = new Map();
	}
	loaded = true;
	return fallbacks;
}

async function saveFallbacks(rows) {
	const path = storePath();
	await mkdir(dirname(path), { recursive: true });
	const payload = { version: STORE_VERSION, fallbacks: [...rows.values()].sort((a, b) => a.cwd.localeCompare(b.cwd)) };
	await writeFile(path, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function sessionKeys(sessionId) {
	if (typeof sessionId !== "string" || sessionId.trim().length === 0) return [];
	const value = sessionId.trim();
	const keys = new Set([value]);
	if (value.startsWith("session-")) keys.add(value.slice("session-".length));
	else keys.add(`session-${value}`);
	return [...keys];
}

function workspaceRows(snapshot) {
	const candidates = [
		snapshot?.tables?.workspaces,
		snapshot?.workspaces,
		snapshot?.byId,
	];
	for (const rows of candidates) {
		if (rows && typeof rows === "object" && !Array.isArray(rows)) return rows;
	}
	return {};
}

function sessionRows(snapshot) {
	const candidates = [
		snapshot?.tables?.sessions,
		snapshot?.sessions?.byId,
		snapshot?.sessions,
	];
	for (const rows of candidates) {
		if (rows && typeof rows === "object" && !Array.isArray(rows)) return rows;
	}
	return {};
}

function normalizeWorkspace(id, row, source) {
	const path = optionalPath(row?.path ?? row?.cwd ?? row?.root);
	if (!path) return null;
	return {
		id,
		title: typeof row?.title === "string" && row.title.trim().length > 0 ? row.title : null,
		path: resolve(path),
		source,
	};
}

/** Resolve a DSH workspace from an in-memory DSH snapshot shape when one is available. */
export function workspaceFromDshSnapshot(sessionId, snapshot) {
	const keys = sessionKeys(sessionId);
	if (keys.length === 0 || !snapshot || typeof snapshot !== "object") return null;
	const sessions = sessionRows(snapshot);
	const workspaces = workspaceRows(snapshot);
	for (const key of keys) {
		const row = sessions[key];
		const direct = normalizeWorkspace(row?.workspace?.id ?? row?.workspaceId ?? key, row?.workspace, "dsh-session-snapshot");
		if (direct) return direct;
		const workspaceId = typeof row?.workspaceId === "string" ? row.workspaceId : typeof row?.workspace?.id === "string" ? row.workspace.id : null;
		if (workspaceId && workspaces[workspaceId]) {
			const resolved = normalizeWorkspace(workspaceId, workspaces[workspaceId], "dsh-session-snapshot");
			if (resolved) return resolved;
		}
	}
	for (const [id, row] of Object.entries(workspaces)) {
		const sessionIds = Array.isArray(row?.sessionIds) ? row.sessionIds : [];
		if (sessionIds.some((value) => keys.includes(String(value)))) {
			const resolved = normalizeWorkspace(id, row, "dsh-workspace-snapshot");
			if (resolved) return resolved;
		}
	}
	return null;
}

/** Resolve a DSH workspace by reading DSH's persisted workspace table. */
export async function resolveDshWorkspaceForSession(sessionId) {
	const keys = sessionKeys(sessionId);
	if (keys.length === 0) return null;
	let parsed;
	try { parsed = JSON.parse(await readFile(workspaceStorePath(), "utf8")); }
	catch (error) {
		if (error?.code === "ENOENT") return null;
		throw error;
	}
	const workspace = workspaceFromDshSnapshot(keys[0], parsed);
	return workspace ? { ...workspace, source: "dsh-workspace-store" } : null;
}

function explicitWorkspace({ dshWorkspacePath, dshWorkspaceTitle = null }) {
	const path = optionalPath(dshWorkspacePath);
	if (!path) return null;
	return {
		id: null,
		title: typeof dshWorkspaceTitle === "string" && dshWorkspaceTitle.trim().length > 0 ? dshWorkspaceTitle : null,
		path: resolve(path),
		source: "dsh-workspace-context",
	};
}

/** Return the path Blueprint should inspect before requiring a configured Blueprint root. */
export async function resolveBlueprintEntryPath({ cwd = null, sessionId = null, dshWorkspacePath = null, dshWorkspaceTitle = null } = {}) {
	const workspace = explicitWorkspace({ dshWorkspacePath, dshWorkspaceTitle }) ?? await resolveDshWorkspaceForSession(sessionId);
	if (workspace) return { path: workspace.path, source: workspace.source, workspace, sessionCwd: optionalPath(cwd) ? resolve(cwd) : null };
	const sessionCwd = optionalPath(cwd);
	if (sessionCwd) return { path: resolve(sessionCwd), source: "session-cwd", workspace: null, sessionCwd: resolve(sessionCwd) };
	return { path: process.cwd(), source: "process-cwd", workspace: null, sessionCwd: null };
}

/** Set one projectless cwd's manual fallback to an existing Blueprint project root. */
export async function bindSessionBlueprintRoot({ cwd = process.cwd(), target }) {
	const root = await resolveBlueprintRoot(validatePath(target, "target"));
	const rows = await loadFallbacks();
	const entry = { cwd: resolve(cwd), root, boundAt: new Date().toISOString() };
	rows.set(workspaceKey(cwd), entry);
	await saveFallbacks(rows);
	return publicBinding(entry);
}

/** Clear one projectless cwd's persistent Blueprint fallback. */
export async function clearSessionBlueprintRoot({ cwd = process.cwd() }) {
	const rows = await loadFallbacks();
	const key = workspaceKey(cwd);
	const removed = rows.delete(key);
	if (removed) await saveFallbacks(rows);
	return { cwd: resolve(cwd), removed };
}

/** Return the current loaded fallback without resolving the filesystem. */
export function getSessionBlueprintBinding(_sessionId, cwd) {
	if (typeof cwd !== "string" || cwd.trim().length === 0 || cwd.length > MAX_PATH) return null;
	if (!loaded) return null;
	return publicBinding(fallbacks.get(workspaceKey(cwd)) ?? null);
}

async function resolveCandidate(candidate) {
	const root = await resolveBlueprintRoot(candidate.path);
	return {
		root,
		source: candidate.source,
		entryPath: candidate.path,
		workspace: candidate.workspace,
		sessionCwd: candidate.sessionCwd,
		binding: null,
		bound: false,
	};
}

/**
 * Resolve the effective Blueprint root for a request.
 *
 * DSH workspace identity is authoritative. Session cwd keeps Unix-style
 * discovery only when DSH exposes no workspace path. Manual fallback is an
 * escape hatch for projectless or legacy Sessions.
 */
export async function resolveEffectiveBlueprintRoot({ cwd = null, sessionId = null, dshWorkspacePath = null, dshWorkspaceTitle = null } = {}) {
	const entry = await resolveBlueprintEntryPath({ cwd, sessionId, dshWorkspacePath, dshWorkspaceTitle });
	const candidate = { ...entry, workspace: entry.workspace };
	try {
		return await resolveCandidate(candidate);
	} catch (error) {
		if (entry.workspace) throw error;
		const sessionCwd = optionalPath(cwd);
		if (entry.source === "process-cwd" && sessionCwd && resolve(sessionCwd) !== resolve(process.cwd())) {
			try { return await resolveCandidate({ path: resolve(sessionCwd), source: "session-cwd", workspace: null, sessionCwd: resolve(sessionCwd) }); }
			catch { /* use the original process cwd error below */ }
		}
		const fallbackKeyPath = sessionCwd ?? process.cwd();
		const fallback = (await loadFallbacks()).get(workspaceKey(fallbackKeyPath));
		if (fallback) {
			try {
				return {
					root: await resolveBlueprintRoot(fallback.root),
					source: "manual-fallback",
					entryPath: fallback.root,
					workspace: null,
					sessionCwd: sessionCwd ? resolve(sessionCwd) : null,
					binding: publicBinding(fallback),
					bound: true,
				};
			} catch {
				fallbacks.delete(workspaceKey(fallbackKeyPath));
				await saveFallbacks(fallbacks);
			}
		}
		throw error;
	}
}

export function resetSessionBlueprintBindingsForTest() {
	fallbacks = new Map();
	loaded = true;
	workspaceStorePathOverride = null;
}

export function setSessionBlueprintBindingStoreForTest(path) {
	storePathOverride = path;
	fallbacks = new Map();
	loaded = false;
}

export function setDshWorkspaceStoreForTest(path) {
	workspaceStorePathOverride = path;
}