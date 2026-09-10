#!/usr/bin/env node
// Read local DSH session logs without starting DSH or changing any session file.
// DSH persists concatenated zstd frames of newline-delimited JSON at
// ~/.dsh/sessions/<storage-project>/<storage-session>/session.jsonl.zstd.

import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";

const ZSTD_MAGIC = 0xfd2fb528;
export const DEFAULT_ROOT = process.env.DSH_SESSIONS_ROOT
	|| join(process.env.USERPROFILE || process.env.HOME || "C:/Users/Windows", ".dsh", "sessions");

function safeJson(value) {
	try { return JSON.stringify(value); }
	catch { return "[unserializable]"; }
}

function textPreview(value, limit = 200) {
	if (typeof value === "string") return value.replace(/\s+/g, " ").slice(0, limit);
	if (Array.isArray(value)) return value.map((item) => textPreview(item, limit)).join(" ").slice(0, limit);
	if (value && typeof value === "object") {
		for (const key of ["text", "content", "message", "summary", "value"]) {
			if (key in value) return textPreview(value[key], limit);
		}
	}
	return safeJson(value).replace(/\s+/g, " ").slice(0, limit);
}

export function scanZstdFrames(buffer, maxFrames = Number.POSITIVE_INFINITY) {
	const frames = [];
	let offset = 0;
	while (offset < buffer.length) {
		const start = offset;
		if (buffer.length - offset < 4) return { frames, tornStart: start };
		if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) throw new Error(`invalid zstd frame magic at byte ${offset}`);
		offset += 4;
		if (offset === buffer.length) return { frames, tornStart: start };
		const descriptor = buffer.readUInt8(offset++);
		if ((descriptor & 24) !== 0) throw new Error(`reserved zstd frame-header bit at byte ${offset - 1}`);
		const contentSizeFlag = descriptor >>> 6;
		const singleSegment = (descriptor & 32) !== 0;
		const checksum = (descriptor & 4) !== 0;
		const dictionaryFlag = descriptor & 3;
		const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
		const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : (1 << contentSizeFlag);
		const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
		if (buffer.length - offset < remainingHeaderBytes) return { frames, tornStart: start };
		offset += remainingHeaderBytes;
		for (;;) {
			if (buffer.length - offset < 3) return { frames, tornStart: start };
			const blockHeader = buffer.readUIntLE(offset, 3);
			offset += 3;
			const lastBlock = (blockHeader & 1) !== 0;
			const blockType = (blockHeader >>> 1) & 3;
			const blockSize = blockHeader >>> 3;
			if (blockType === 3) throw new Error(`reserved zstd block type at byte ${offset - 3}`);
			const payloadBytes = blockType === 1 ? 1 : blockSize;
			if (buffer.length - offset < payloadBytes) return { frames, tornStart: start };
			offset += payloadBytes;
			if (lastBlock) break;
		}
		if (checksum) {
			if (buffer.length - offset < 4) return { frames, tornStart: start };
			offset += 4;
		}
		frames.push({ start, end: offset });
		if (frames.length >= maxFrames) return { frames, tornStart: null };
	}
	return { frames, tornStart: null };
}

export function decodeSessionBuffer(buffer) {
	if (typeof zlib.zstdDecompressSync !== "function") throw new Error("this Node.js runtime does not provide zstdDecompressSync; use the repository's supported Node.js version");
	const { frames, tornStart } = scanZstdFrames(buffer);
	const records = [];
	for (const frame of frames) {
		let text;
		try { text = zlib.zstdDecompressSync(buffer.subarray(frame.start, frame.end)).toString("utf8"); }
		catch (error) {
			records.push({ __decodeError: `frame[${frame.start}..${frame.end}]: ${error.message}` });
			continue;
		}
		for (const line of text.split("\n")) {
			if (line === "") continue;
			try { records.push(JSON.parse(line)); }
			catch { records.push({ __unparsable: line }); }
		}
	}
	return { records, frameCount: frames.length, tornStart };
}

export async function readSession(file) {
	const buffer = await readFile(file);
	const decoded = decodeSessionBuffer(buffer);
	return { ...decoded, size: buffer.length };
}

export function sessionHeader(records) {
	return records.find((record) => record?.type === "session" && typeof record.id === "string") ?? null;
}

function metadataFrom(records, fallbackId) {
	const header = sessionHeader(records);
	return {
		id: header?.id ?? fallbackId,
		cwd: typeof header?.cwd === "string" && header.cwd.length > 0 ? header.cwd : null,
		parentSession: typeof header?.parentSession === "string" && header.parentSession.length > 0 ? header.parentSession : null,
		origin: header?.origin === "subagent" ? "subagent" : null,
		delegationDepth: Number.isFinite(header?.delegationDepth) ? header.delegationDepth : null,
		agentPreset: typeof header?.agentPreset === "string" ? header.agentPreset : null,
	};
}

function storageFallback(projectDir) {
	return `storage:${projectDir}`;
}

export async function findSessions(root = DEFAULT_ROOT) {
	const sessionsRoot = resolve(root);
	let projects;
	try { projects = await readdir(sessionsRoot, { withFileTypes: true }); }
	catch (error) { throw new Error(`cannot read sessions root ${sessionsRoot}: ${error.message}`); }
	const sessions = [];
	for (const project of projects) {
		if (!project.isDirectory()) continue;
		let sessionDirs;
		try { sessionDirs = await readdir(join(sessionsRoot, project.name), { withFileTypes: true }); }
		catch { continue; }
		for (const sessionDir of sessionDirs) {
			if (!sessionDir.isDirectory()) continue;
			const file = join(sessionsRoot, project.name, sessionDir.name, "session.jsonl.zstd");
			let fileStat;
			try { fileStat = await stat(file); }
			catch { continue; }
			let decoded = { records: [], frameCount: 0, tornStart: null, readError: null };
			try { decoded = { ...await readSession(file), readError: null }; }
			catch (error) { decoded.readError = error.message; }
			const metadata = metadataFrom(decoded.records, sessionDir.name);
			sessions.push({
				storageProject: project.name,
				storageSession: sessionDir.name,
				file,
				size: fileStat.size,
				mtime: fileStat.mtimeMs,
				eventCount: decoded.records.length,
				frameCount: decoded.frameCount,
				tornStart: decoded.tornStart,
				readError: decoded.readError,
				project: metadata.cwd ?? storageFallback(project.name),
				...metadata,
			});
		}
	}
	sessions.sort((left, right) => right.mtime - left.mtime || left.id.localeCompare(right.id));
	return sessions;
}

function shortId(id) {
	return typeof id === "string" && id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id ?? "?";
}

export function sessionChildren(sessions) {
	const byParent = new Map();
	for (const session of sessions) {
		if (!session.parentSession) continue;
		const list = byParent.get(session.parentSession) ?? [];
		list.push(session);
		byParent.set(session.parentSession, list);
	}
	for (const list of byParent.values()) list.sort((left, right) => left.mtime - right.mtime || left.id.localeCompare(right.id));
	return byParent;
}

export function formatSession(session, { treePrefix = "" } = {}) {
	const kind = session.origin === "subagent" ? "subagent" : "session";
	const depth = session.delegationDepth === null ? "" : ` depth=${session.delegationDepth}`;
	const parent = session.parentSession ? ` parent=${shortId(session.parentSession)}` : "";
	const preset = session.agentPreset ? ` preset=${session.agentPreset}` : "";
	const health = session.readError ? ` read-error=${session.readError}` : session.tornStart !== null ? " torn-tail" : "";
	return `${treePrefix}[${kind}] ${session.project}\t${session.id}\t${session.size}B\tevents=${session.eventCount}${depth}${parent}${preset}${health}`;
}

export function renderTree(sessions) {
	const byId = new Map(sessions.map((session) => [session.id, session]));
	const children = sessionChildren(sessions);
	const roots = sessions.filter((session) => !session.parentSession || !byId.has(session.parentSession));
	const lines = [];
	const visited = new Set();
	function visit(session, prefix, branch, orphan = false) {
		if (visited.has(session.id)) {
			lines.push(`${prefix}${branch}[cycle] ${session.id}`);
			return;
		}
		visited.add(session.id);
		const label = orphan ? "[orphan] " : "";
		lines.push(`${prefix}${branch}${label}${formatSession(session)}`);
		const nested = children.get(session.id) ?? [];
		for (let index = 0; index < nested.length; index++) {
			const last = index === nested.length - 1;
			visit(nested[index], `${prefix}${branch ? (branch === "└─ " ? "   " : "│  ") : ""}`, last ? "└─ " : "├─ ");
		}
	}
	for (const session of roots) visit(session, "", "", Boolean(session.parentSession));
	for (const session of sessions) if (!visited.has(session.id)) visit(session, "", "", true);
	return lines;
}

export function renderEvent(record, index) {
	if (record.__decodeError) return `[${index}] __decodeError: ${record.__decodeError}`;
	if (record.__unparsable) return `[${index}] __unparsable: ${textPreview(record.__unparsable)}`;
	const type = record.type ?? "?";
	const time = record.time ? new Date(Number(record.time)).toISOString() : "header";
	const data = record.data ?? {};
	let summary;
	switch (type) {
		case "session": summary = `id=${record.id ?? "?"} cwd=${record.cwd ?? "?"} origin=${record.origin ?? "session"} parent=${record.parentSession ?? "-"} depth=${record.delegationDepth ?? "?"}`; break;
		case "user/message": summary = textPreview(data); break;
		case "assistant/message": summary = textPreview(data.message ?? data); break;
		case "assistant/chunk": summary = textPreview(data.chunk ?? data); break;
		case "tool/call": summary = `tool=${data.name ?? "?"} args=${String(data.arguments ?? "").length}B`; break;
		case "tool/result": summary = `tool-result=${textPreview(data.message ?? data, 160)}${record.error ? ` error=${record.error.name ?? "?"}:${record.error.code ?? "?"}` : ""}`; break;
		case "compaction/summary": summary = `compaction=${data.compactionId ?? "?"} ${textPreview(data.summary, 160)}`; break;
		default: summary = textPreview(data, 200);
	}
	return `[${index}] ${time} ${type}${record.seq === undefined ? "" : ` seq=${record.seq}`}  ${summary}`;
}

function parseArgs(argv) {
	const options = { list: false, tree: false, summary: false, json: false, project: null, type: null, role: null, tool: null, action: null, grep: null, last: null };
	const valueOptions = new Set(["--project", "--type", "--role", "--tool", "--action", "--grep", "--last"]);
	const positionals = [];
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === "--help" || arg === "-h") return { ...options, help: true, sessionId: null };
		if (arg === "--list") { options.list = true; continue; }
		if (arg === "--tree") { options.tree = true; continue; }
		if (arg === "--summary") { options.summary = true; continue; }
		if (arg === "--json") { options.json = true; continue; }
		if (valueOptions.has(arg)) {
			const value = argv[++index];
			if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
			options[arg.slice(2)] = value;
			continue;
		}
		if (arg.startsWith("-")) throw new Error(`unknown option: ${arg}`);
		positionals.push(arg);
	}
	if (positionals.length > 1) throw new Error("only one session id may be supplied");
	if (options.tree && positionals.length > 0) throw new Error("--tree lists matching sessions; do not supply a session id");
	if (options.list && positionals.length > 0) throw new Error("--list and a session id cannot be combined");
	return { ...options, help: false, sessionId: positionals[0] ?? null };
}

function usage() {
	return [
		"usage:",
		"  peek-session.mjs [--list] [--project TEXT] [--tree]",
		"  peek-session.mjs <session-id> [--summary] [--type TYPE] [--role ROLE] [--tool NAME] [--action NAME] [--grep TEXT] [--last N] [--json]",
		"",
		"Reads local DSH zstd session logs only. --json can expose complete local message content.",
	].join("\n");
}

function matchesProject(session, project) {
	return !project || session.project.includes(project) || session.storageProject.includes(project);
}

function filterEvents(records, options) {
	let events = records.map((record, index) => ({ record, index }));
	if (options.type) events = events.filter(({ record }) => record?.type === options.type);
	if (options.role) events = events.filter(({ record }) => record?.role === options.role || record?.data?.role === options.role || record?.data?.message?.role === options.role);
	if (options.tool) events = events.filter(({ record }) => record?.data?.name === options.tool || record?.data?.tool === options.tool);
	if (options.action) events = events.filter(({ record }) => record?.data?.action === options.action);
	if (options.grep) events = events.filter(({ record }) => safeJson(record).includes(options.grep));
	if (options.last !== null) {
		const count = Number(options.last);
		if (!Number.isInteger(count) || count < 1) throw new Error("--last must be a positive integer");
		events = events.slice(-count);
	}
	return events;
}

function summaryFor(session, decoded, allSessions) {
	const byType = {};
	for (const record of decoded.records) {
		const type = record?.type ?? "?";
		byType[type] = (byType[type] ?? 0) + 1;
	}
	const children = sessionChildren(allSessions).get(session.id) ?? [];
	const dated = decoded.records.filter((record) => Number.isFinite(record?.time));
	return {
		sessionId: session.id,
		project: session.project,
		storageProject: session.storageProject,
		size: session.size,
		frames: decoded.frameCount,
		eventCount: decoded.records.length,
		tornFrame: decoded.tornStart !== null,
		cwd: session.cwd,
		origin: session.origin,
		parentSession: session.parentSession,
		delegationDepth: session.delegationDepth,
		agentPreset: session.agentPreset,
		childSessionIds: children.map((child) => child.id),
		firstEvent: dated.length ? new Date(Number(dated[0].time)).toISOString() : null,
		lastEvent: dated.length ? new Date(Number(dated.at(-1).time)).toISOString() : null,
		byType,
	};
}

export async function main(argv = process.argv.slice(2), { root = DEFAULT_ROOT, stdout = console.log, stderr = console.error } = {}) {
	let options;
	try { options = parseArgs(argv); }
	catch (error) { stderr(`${error.message}\n${usage()}`); return 2; }
	if (options.help) { stdout(usage()); return 0; }
	let sessions;
	try { sessions = await findSessions(root); }
	catch (error) { stderr(error.message); return 1; }
	const visible = sessions.filter((session) => matchesProject(session, options.project));
	if (options.list || options.tree || !options.sessionId) {
		if (visible.length === 0) {
			stderr(`no sessions under ${resolve(root)}${options.project ? ` matching --project ${options.project}` : ""}`);
			return 1;
		}
		for (const line of options.tree ? renderTree(visible) : visible.map((session) => formatSession(session))) stdout(line);
		return 0;
	}
	const matches = visible.filter((session) => session.id === options.sessionId || session.storageSession === options.sessionId);
	if (matches.length === 0) {
		stderr(`session not found: ${options.sessionId}\nhint: --list to find it. searched root: ${resolve(root)}`);
		return 1;
	}
	if (matches.length > 1) {
		stderr(`more than one session matches: ${options.sessionId}; use --project to narrow it.`);
		return 1;
	}
	const session = matches[0];
	let decoded;
	try { decoded = await readSession(session.file); }
	catch (error) { stderr(`cannot read session ${session.id}: ${error.message}`); return 1; }
	let events;
	try { events = filterEvents(decoded.records, options); }
	catch (error) { stderr(error.message); return 2; }
	if (options.summary) { stdout(JSON.stringify(summaryFor(session, decoded, sessions), null, 2)); return 0; }
	for (const { record, index } of events) stdout(options.json ? JSON.stringify(record) : renderEvent(record, index));
	return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	main().then((code) => { process.exitCode = code; }).catch((error) => { console.error(error); process.exitCode = 1; });
}
