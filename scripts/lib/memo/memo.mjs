import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { captureCommand } from "../platform/process.mjs";
import { ensureParentDir, readTextIfExists, writeText } from "../platform/fs.mjs";
import { assertWorkspaceMemoryContentSafe } from "./safety.mjs";
import {
  ensurePersonaLayer,
  getPersonaLayerDisplayName,
  readPersonaLayer,
  resolvePersonaPath,
  resolveUserProfilePath,
  writePersonaLayer,
} from "./persona.mjs";
import {
  DEFAULT_WORKSPACE_MEMORY_SPACE,
  WORKSPACE_MEMORY_AGENT,
  WORKSPACE_MEMORY_SESSION_PREFIX,
  normalizeWorkspaceMemorySpace,
  sanitizeWorkspaceMemorySpaceForSessionId,
  workspaceMemoryEventsPath,
  workspaceMemoryMetaPath,
  workspaceMemoryPinnedPath,
  workspaceMemorySessionDir,
  workspaceMemorySessionId,
  workspaceMemoryStatePath,
} from "./workspace-memory.mjs";
import { resolveContextDbRoot } from "../aios/state-root.mjs";

const DEFAULT_LIST_LIMIT = 20;
const DEFAULT_RECALL_HIGHLIGHT_LIMIT = 3;
const MAX_PRINT_CHARS = 12_000;
const DEFAULT_WORKSPACE_MEMO_ENTRY_MAX_CHARS = 1400;
const DEFAULT_WORKSPACE_PINNED_MAX_CHARS = 5000;
const DEFAULT_AIOS_ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function usageError(message) {
  const error = new Error(`${message}\n\nRun: node scripts/aios.mjs memo --help`);
  error.code = "AIOS_MEMO_USAGE";
  return error;
}

function detectWorkspaceRoot(cwd = process.cwd()) {
  const result = captureCommand("git", ["-C", cwd, "rev-parse", "--show-toplevel"]);
  if (!result.error && result.status === 0) {
    const root = String(result.stdout || "").trim().split("\n")[0];
    if (root) return root;
  }
  return path.resolve(cwd);
}

function workspaceProjectName(workspaceRoot) {
  return path.basename(workspaceRoot);
}

function statePath(workspaceRoot) {
  return workspaceMemoryStatePath(workspaceRoot);
}

function readActiveSpaceFromState(workspaceRoot) {
  const raw = readTextIfExists(statePath(workspaceRoot)).trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.activeSpace === "string" ? parsed.activeSpace.trim() : "";
  } catch {
    return "";
  }
}

function writeActiveSpaceToState(workspaceRoot, space) {
  const filePath = statePath(workspaceRoot);
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify({ activeSpace: space }, null, 2)}\n`, "utf8");
}

function normalizeSpace(raw) {
  return normalizeWorkspaceMemorySpace(raw);
}

function resolveActiveSpace(workspaceRoot, env = process.env) {
  const envSpace = String(env.WORKSPACE_MEMORY_SPACE || "").trim();
  if (envSpace) return normalizeSpace(envSpace);
  const stored = readActiveSpaceFromState(workspaceRoot);
  if (stored) return normalizeSpace(stored);
  return DEFAULT_WORKSPACE_MEMORY_SPACE;
}

function sessionDir(workspaceRoot, sessionId) {
  return workspaceMemorySessionDir(workspaceRoot, sessionId);
}

function sessionMetaPath(workspaceRoot, sessionId) {
  return workspaceMemoryMetaPath(workspaceRoot, sessionId);
}

function hasWorkspaceMemorySession(workspaceRoot, space) {
  const sessionId = workspaceMemorySessionId(space);
  return fs.existsSync(sessionMetaPath(workspaceRoot, sessionId));
}

function ensureWorkspaceMemorySession(workspaceRoot, space) {
  const sessionId = workspaceMemorySessionId(space);
  if (fs.existsSync(sessionMetaPath(workspaceRoot, sessionId))) {
    return { sessionId, dir: sessionDir(workspaceRoot, sessionId) };
  }

  const dir = sessionDir(workspaceRoot, sessionId);
  const now = new Date().toISOString();
  fs.mkdirSync(dir, { recursive: true });
  writeText(sessionMetaPath(workspaceRoot, sessionId), `${JSON.stringify({
    schemaVersion: 1,
    sessionId,
    agent: WORKSPACE_MEMORY_AGENT,
    project: workspaceProjectName(workspaceRoot),
    goal: `Workspace memory space "${normalizeSpace(space)}"`,
    tags: [`space:${normalizeSpace(space)}`],
    status: "running",
    createdAt: now,
    updatedAt: now,
  }, null, 2)}\n`);

  const stateFile = path.join(dir, "state.json");
  if (!fs.existsSync(stateFile)) {
    writeText(stateFile, `${JSON.stringify({
      sessionId,
      lastEventAt: null,
      lastEventSeq: 0,
      lastCheckpointAt: null,
      lastCheckpointSeq: 0,
      status: "running",
      nextActions: [],
    }, null, 2)}\n`);
  }
  if (!fs.existsSync(pinnedPath(workspaceRoot, sessionId))) {
    writeText(pinnedPath(workspaceRoot, sessionId), "");
  }
  if (!fs.existsSync(workspaceMemoryEventsPath(workspaceRoot, sessionId))) {
    writeText(workspaceMemoryEventsPath(workspaceRoot, sessionId), "");
  }

  return { sessionId, dir };
}

function pinnedPath(workspaceRoot, sessionId) {
  return workspaceMemoryPinnedPath(workspaceRoot, sessionId);
}

function readPinned(workspaceRoot, sessionId) {
  return readTextIfExists(pinnedPath(workspaceRoot, sessionId));
}

function writePinned(workspaceRoot, sessionId, content) {
  const normalized = String(content ?? "").trimEnd();
  writeText(pinnedPath(workspaceRoot, sessionId), normalized ? `${normalized}\n` : "");
}

function appendPinned(workspaceRoot, sessionId, content) {
  const existing = readPinned(workspaceRoot, sessionId).trimEnd();
  const addition = String(content ?? "").trim();
  if (!addition) return;
  const next = existing ? `${existing}\n\n${addition}\n` : `${addition}\n`;
  writeText(pinnedPath(workspaceRoot, sessionId), next);
}

function extractTags(text) {
  const tags = new Set();
  const input = String(text ?? "");
  const matches = input.matchAll(/#([\p{L}\p{N}_-]+)/gu);
  for (const match of matches) {
    const tag = String(match[1] || "").trim();
    if (tag) tags.add(tag);
  }
  return Array.from(tags);
}

function createMemoTurnId(space = "") {
  const normalizedSpace = sanitizeWorkspaceMemorySpaceForSessionId(space) || "default";
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `memo:${normalizedSpace}:${stamp}`;
}

let memoStorageApiPromise;

function memoStorageUnavailableError(cause) {
  const error = new Error(
    "Memo storage module is not available. Expected scripts/lib/memo/storage.mjs exports from the memo-storage workstream."
  );
  error.code = "AIOS_MEMO_STORAGE_UNAVAILABLE";
  error.cause = cause;
  return error;
}

async function loadMemoStorageApi() {
  if (!memoStorageApiPromise) {
    memoStorageApiPromise = import("./storage.mjs").catch((error) => {
      memoStorageApiPromise = undefined;
      throw memoStorageUnavailableError(error);
    });
  }
  return memoStorageApiPromise;
}

async function getActiveMemoStorage(workspaceRoot, storageApi) {
  const status = await storageApi.getMemoStorageStatus(workspaceRoot);
  const active = String(status?.active || "file").trim().toLowerCase();
  return active || "file";
}

function legacyStateFilePath(workspaceRoot, sessionId) {
  return path.join(sessionDir(workspaceRoot, sessionId), "state.json");
}

function readLegacyMemoEvents(workspaceRoot, sessionId) {
  const raw = readTextIfExists(workspaceMemoryEventsPath(workspaceRoot, sessionId));
  if (!raw.trim()) return [];
  const events = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = String(line || "").trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      // Keep legacy compatibility tolerant of partially written context logs.
    }
  }
  return events;
}

function legacyMemoRows(workspaceRoot, space, { query = "", limit = DEFAULT_LIST_LIMIT } = {}) {
  const sessionId = workspaceMemorySessionId(space);
  if (!fs.existsSync(workspaceMemoryEventsPath(workspaceRoot, sessionId))) return [];
  const normalizedQuery = String(query || "").trim().toLowerCase();
  return readLegacyMemoEvents(workspaceRoot, sessionId)
    .filter((event) => event?.kind === "memo")
    .filter((event) => !event?.role || String(event.role) === "user")
    .filter((event) => !normalizedQuery || String(event?.text || "").toLowerCase().includes(normalizedQuery))
    .slice(-limit)
    .reverse();
}

function readLegacyLastEventSeq(workspaceRoot, sessionId) {
  const stateRaw = readTextIfExists(legacyStateFilePath(workspaceRoot, sessionId)).trim();
  if (stateRaw) {
    try {
      const parsed = JSON.parse(stateRaw);
      const seq = Number(parsed?.lastEventSeq);
      if (Number.isFinite(seq) && seq >= 0) return seq;
    } catch {
      // Fall back to scanning the JSONL log.
    }
  }
  return readLegacyMemoEvents(workspaceRoot, sessionId).reduce((max, event) => {
    const seq = Number(event?.seq);
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);
}

function updateLegacyStateAfterMemo(workspaceRoot, sessionId, seq, ts) {
  const stateFile = legacyStateFilePath(workspaceRoot, sessionId);
  let state = {};
  const raw = readTextIfExists(stateFile).trim();
  if (raw) {
    try {
      state = JSON.parse(raw);
    } catch {
      state = {};
    }
  }
  writeText(stateFile, `${JSON.stringify({
    sessionId,
    lastEventAt: ts,
    lastEventSeq: seq,
    lastCheckpointAt: state.lastCheckpointAt ?? null,
    lastCheckpointSeq: state.lastCheckpointSeq ?? 0,
    status: state.status || "running",
    nextActions: Array.isArray(state.nextActions) ? state.nextActions : [],
  }, null, 2)}\n`);
}

function mirrorMemoEventToLegacy(workspaceRoot, { space, text, refs = [], turnId = "", record = {} } = {}) {
  const { sessionId } = ensureWorkspaceMemorySession(workspaceRoot, space);
  const seq = readLegacyLastEventSeq(workspaceRoot, sessionId) + 1;
  const ts = String(record?.ts || record?.timestamp || new Date().toISOString());
  const legacyEvent = {
    ts,
    seq,
    role: "user",
    kind: "memo",
    text: String(record?.text || text || ""),
    refs: Array.isArray(record?.refs) ? record.refs : refs,
    turn: {
      turnId: turnId || createMemoTurnId(space),
      turnType: "side",
      environment: "memo",
      hindsightStatus: "na",
      outcome: "success",
    },
  };
  const eventsPath = workspaceMemoryEventsPath(workspaceRoot, sessionId);
  ensureParentDir(eventsPath);
  fs.appendFileSync(eventsPath, `${JSON.stringify(legacyEvent)}\n`, "utf8");
  updateLegacyStateAfterMemo(workspaceRoot, sessionId, seq, ts);
  return { sessionId, seq, eventId: `${sessionId}#${seq}`, event: legacyEvent };
}

function mirrorPinnedMemoToLegacy(workspaceRoot, { space, content }) {
  const sessionId = workspaceMemorySessionId(space);
  ensureWorkspaceMemorySession(workspaceRoot, space);
  writePinned(workspaceRoot, sessionId, content);
}

function getStorageAvailability(status, storageName) {
  const available = status?.available && typeof status.available === "object" ? status.available : {};
  const entry = available[storageName];
  if (!entry || typeof entry !== "object") return {};
  return entry;
}

function formatCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? ` records=${count}` : "";
}

function printMemoStorageStatus(io, status = {}) {
  const active = String(status.active || "file");
  const supported = Array.isArray(status.supported) && status.supported.length > 0
    ? status.supported
    : ["split", "file"];
  io.log("Memo storage status");
  io.log(`Active: ${active}`);
  io.log(`Supported: ${supported.join(", ")}`);
  for (const name of supported) {
    const availability = getStorageAvailability(status, name);
    const exists = availability.exists === true ? "exists" : "missing";
    io.log(`- ${name}: ${exists}${formatCount(availability.records ?? availability.count ?? availability.eventCount)}`);
  }
}

function printMemoDoctorReport(io, report = {}) {
  const checks = Array.isArray(report.checks) ? report.checks : [];
  io.log(`Memo storage doctor: ${report.ok === false ? "error" : "ok"}`);
  if (checks.length === 0) return;
  for (const check of checks) {
    const id = String(check?.id || "check");
    const status = String(check?.status || (check?.ok === false ? "error" : "ok"));
    const message = String(check?.message || check?.summary || check?.detail || "").trim();
    io.log(`- ${id}: ${status}${message ? ` - ${message}` : ""}`);
  }
}

function scoreMemoMatch(row, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (Number.isFinite(row?.matchScore)) return Number(row.matchScore);
  if (!normalizedQuery) return 1;
  const text = String(row?.text || "").toLowerCase();
  if (!text) return 0;
  if (text.includes(normalizedQuery)) return 1;
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 1;
  const hits = tokens.filter((token) => text.includes(token)).length;
  return hits / tokens.length;
}

function memoRecordToRecallRow(row, { workspaceRoot, space, query, highlightLimit }) {
  const text = String(row?.text || "").replace(/\s+/g, " ").trim();
  const score = scoreMemoMatch(row, query);
  const highlights = text
    ? [{
        label: "memo",
        text,
        score,
      }]
    : [];
  const refs = Array.isArray(row?.refs) ? row.refs.filter(Boolean).slice(0, Math.max(0, highlightLimit - highlights.length)) : [];
  for (const ref of refs) {
    highlights.push({ label: "ref", text: `#${ref}`, score });
  }
  return {
    status: "running",
    sessionId: workspaceMemorySessionId(space),
    project: workspaceProjectName(workspaceRoot),
    updatedAt: String(row?.ts || row?.timestamp || ""),
    goal: `Workspace memory space "${space}"`,
    summary: text,
    matchScore: score,
    highlights: highlights.slice(0, highlightLimit),
  };
}

function safePrintText(io, text) {
  const raw = String(text ?? "");
  if (!raw) {
    io.log("(none)");
    return;
  }
  const trimmed = raw.length > MAX_PRINT_CHARS ? `${raw.slice(0, MAX_PRINT_CHARS)}\n[truncated]` : raw;
  io.log(trimmed.trimEnd());
}

function parsePositiveLimit(raw) {
  const parsed = Number.parseInt(String(raw || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw usageError("--limit must be a positive integer");
  }
  return parsed;
}

function parsePositivePort(raw) {
  const parsed = Number.parseInt(String(raw || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    throw usageError("--port must be a positive TCP port");
  }
  return parsed;
}

function splitGuiFlags(argv) {
  const flags = {
    port: 3210,
    project: "",
    openBrowser: true,
  };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") break;
    if (arg === "--port") {
      flags.port = parsePositivePort(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--project") {
      const value = String(argv[index + 1] || "").trim();
      if (!value || value.startsWith("-")) throw usageError("--project requires a value");
      flags.project = value;
      index += 1;
      continue;
    }
    if (arg === "--no-open") {
      flags.openBrowser = false;
      continue;
    }
    throw usageError(`Unknown memo gui option: ${arg}`);
  }

  return flags;
}

export function buildMemoGuiLaunchPlan(argv = [], { workspaceRoot = detectWorkspaceRoot(process.cwd()), aiosRootDir = "" } = {}) {
  if (argv[0] !== "gui") {
    throw usageError("Usage: memo gui [--port N] [--project name] [--no-open]");
  }
  const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
  const resolvedAiosRootDir = aiosRootDir ? path.resolve(aiosRootDir) : DEFAULT_AIOS_ROOT_DIR;
  const flags = splitGuiFlags(argv);
  const project = flags.project || workspaceProjectName(resolvedWorkspaceRoot);
  const contextDbArgs = [
    "genealogy:serve",
    "--workspace", resolvedWorkspaceRoot,
    "--project", project,
    "--assets-root", resolvedAiosRootDir,
    "--port", String(flags.port),
  ];
  if (!flags.openBrowser) {
    contextDbArgs.push("--no-open");
  }

  return {
    workspaceRoot: resolvedWorkspaceRoot,
    aiosRootDir: resolvedAiosRootDir,
    project,
    port: flags.port,
    openBrowser: flags.openBrowser,
    contextDbArgs,
  };
}

export function runMemoGuiServer(plan) {
  return new Promise((resolve, reject) => {
    const tsxCli = path.join(plan.aiosRootDir, "mcp-server", "node_modules", "tsx", "dist", "cli.mjs");
    const contextDbCli = path.join(plan.aiosRootDir, "mcp-server", "src", "contextdb", "cli.ts");
    const child = spawn(process.execPath, [tsxCli, contextDbCli, ...plan.contextDbArgs], {
      cwd: plan.workspaceRoot,
      env: {
        ...process.env,
        AIOS_ROOT_DIR: plan.aiosRootDir,
      },
      stdio: "inherit",
    });

    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      process.off("SIGINT", forwardSigint);
      process.off("SIGTERM", forwardSigterm);
      if (error) reject(error);
      else resolve();
    };
    const forwardSignal = (signal) => {
      if (!child.killed) child.kill(signal);
    };
    const forwardSigint = () => forwardSignal("SIGINT");
    const forwardSigterm = () => forwardSignal("SIGTERM");
    process.once("SIGINT", forwardSigint);
    process.once("SIGTERM", forwardSigterm);

    child.once("error", finish);
    child.once("exit", (status, signal) => {
      if (signal) {
        finish();
        return;
      }
      if (status && status !== 0) {
        const error = new Error(`memo gui exited with status ${status}`);
        error.code = "AIOS_MEMO_GUI_FAILED";
        finish(error);
        return;
      }
      finish();
    });
  });
}

function parseBoundedIntegerEnv(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

function assertSafeMemoText(text, target = "memo content") {
  assertWorkspaceMemoryContentSafe(text, {
    allowEmpty: false,
    target,
  });
}

function assertMaxChars(text, maxChars, target = "memo content") {
  const content = String(text ?? "");
  if (content.length <= maxChars) return;
  const error = new Error(`${target} exceeds capacity (${content.length}/${maxChars} chars)`);
  error.code = "AIOS_MEMO_CAPACITY";
  throw error;
}

function splitFlags(argv) {
  const flags = {
    limit: DEFAULT_LIST_LIMIT,
    semantic: false,
  };
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg === "--limit") {
      flags.limit = parsePositiveLimit(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--semantic") {
      flags.semantic = true;
      continue;
    }
    positionals.push(arg);
  }
  return { positionals, flags };
}

function splitRecallFlags(argv) {
  const flags = {
    limit: DEFAULT_LIST_LIMIT,
    highlightLimit: DEFAULT_RECALL_HIGHLIGHT_LIMIT,
  };
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg === "--limit") {
      flags.limit = parsePositiveLimit(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === "--highlight-limit") {
      flags.highlightLimit = parsePositiveLimit(argv[i + 1]);
      i += 1;
      continue;
    }
    positionals.push(arg);
  }
  return { positionals, flags };
}

function formatRefs(refs = []) {
  if (!Array.isArray(refs) || refs.length === 0) return "";
  const tokens = refs
    .map((ref) => String(ref || "").trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((ref) => `#${ref}`);
  return tokens.length > 0 ? ` ${tokens.join(" ")}` : "";
}

function renderMemoRow(row) {
  const ts = row?.ts ? String(row.ts) : "";
  const eventId = row?.eventId ? String(row.eventId) : "";
  const text = row?.text ? String(row.text).replace(/\s+/g, " ").trim() : "";
  const refsLabel = formatRefs(row?.refs || []);
  const idLabel = eventId ? ` (${eventId})` : "";
  return `- [${ts}]${idLabel}${refsLabel}: ${text}`;
}

function renderRecallRow(row, index) {
  const rank = Number.isFinite(index) ? index + 1 : 1;
  const score = Number.isFinite(row?.matchScore) ? Number(row.matchScore).toFixed(4) : "0.0000";
  const status = String(row?.status || "running");
  const sessionId = String(row?.sessionId || "");
  const project = String(row?.project || "");
  const updatedAt = String(row?.updatedAt || "");
  const goal = String(row?.goal || "").replace(/\s+/g, " ").trim();
  const summary = String(row?.summary || "").replace(/\s+/g, " ").trim();
  const highlights = Array.isArray(row?.highlights) ? row.highlights : [];

  const lines = [
    `${rank}. [${status}] ${sessionId} score=${score}${project ? ` project=${project}` : ""}${updatedAt ? ` updated=${updatedAt}` : ""}`,
  ];
  if (goal) {
    lines.push(`   goal: ${goal}`);
  }
  if (summary) {
    lines.push(`   summary: ${summary}`);
  }
  if (highlights.length > 0) {
    lines.push("   highlights:");
    for (const highlight of highlights) {
      const label = String(highlight?.label || "");
      const text = String(highlight?.text || "").replace(/\s+/g, " ").trim();
      const itemScore = Number.isFinite(highlight?.score) ? Number(highlight.score).toFixed(4) : "0.0000";
      lines.push(`   - [${label}] (score=${itemScore}) ${text}`);
    }
  }
  return lines.join("\n");
}

export async function runMemo(rawOptions = {}, { io = console } = {}) {
  const argv = Array.isArray(rawOptions.argv) ? rawOptions.argv : [];
  const workspaceRoot = detectWorkspaceRoot(process.cwd());
  const activeSpace = resolveActiveSpace(workspaceRoot);
  const workspaceMemoEntryMaxChars = parseBoundedIntegerEnv(
    process.env.WORKSPACE_MEMORY_MEMO_ENTRY_MAX_CHARS,
    DEFAULT_WORKSPACE_MEMO_ENTRY_MAX_CHARS,
    { min: 256, max: 12000 }
  );
  const workspacePinnedMaxChars = parseBoundedIntegerEnv(
    process.env.WORKSPACE_MEMORY_PINNED_MAX_CHARS,
    DEFAULT_WORKSPACE_PINNED_MAX_CHARS,
    { min: 512, max: 20000 }
  );

  const [primary, secondary, ...rest] = argv;
  if (!primary) {
    throw usageError("Missing memo subcommand");
  }

  if (primary === "use") {
    const space = normalizeSpace([secondary, ...rest].join(" "));
    writeActiveSpaceToState(workspaceRoot, space);
    io.log(`Active space: ${space}`);
    io.log(`Workspace: ${workspaceRoot}`);
    return;
  }

  if (primary === "gui") {
    const plan = buildMemoGuiLaunchPlan(argv, {
      workspaceRoot,
      aiosRootDir: process.env.AIOS_ROOT_DIR || DEFAULT_AIOS_ROOT_DIR,
    });
    await runMemoGuiServer(plan);
    return;
  }

  if (primary === "storage") {
    const action = String(secondary || "status").toLowerCase();
    const storageApi = await loadMemoStorageApi();

    if (action === "status") {
      printMemoStorageStatus(io, await storageApi.getMemoStorageStatus(workspaceRoot));
      return;
    }

    if (action === "use") {
      const target = String(rest.join(" ") || "").trim().toLowerCase();
      if (!target) throw usageError("Usage: memo storage use <split|file>");
      const result = await storageApi.switchMemoStorage(workspaceRoot, { target });
      const status = await storageApi.getMemoStorageStatus(workspaceRoot);
      const migrated = result?.migrated && typeof result.migrated === "object" ? result.migrated : {};
      const manifest = result?.manifest && typeof result.manifest === "object" ? result.manifest : {};
      io.log(`Active memo storage: ${status?.active || target}`);
      io.log(`Migrated records: ${Number.isFinite(migrated.events) ? migrated.events : 0}`);
      io.log(`Migrated pinned files: ${Number.isFinite(migrated.pinned) ? migrated.pinned : 0}`);
      if (migrated.source) io.log(`Migration source: ${migrated.source}`);
      if (manifest.records !== undefined) io.log(`Rebuilt records: ${manifest.records}`);
      return;
    }

    if (action === "rebuild") {
      const storage = await getActiveMemoStorage(workspaceRoot, storageApi);
      const result = await storageApi.rebuildMemoStorage(workspaceRoot, { storage });
      io.log(`Full rebuild complete: ${storage}`);
      if (result?.records !== undefined) io.log(`Records: ${result.records}`);
      return;
    }

    if (action === "doctor") {
      const storage = await getActiveMemoStorage(workspaceRoot, storageApi);
      const report = await storageApi.runMemoStorageDoctor(workspaceRoot, { storage });
      printMemoDoctorReport(io, report);
      if (report?.ok === false) {
        process.exitCode = 1;
      }
      return;
    }

    throw usageError(`Unknown memo storage action: ${secondary}`);
  }

  if (primary === "space") {
    if ((secondary || "").toLowerCase() !== "list") {
      throw usageError("Usage: memo space list");
    }
    const sessionsRoot = path.join(resolveContextDbRoot(workspaceRoot, { preferLegacyExisting: true }), "sessions");
    const entries = fs.existsSync(sessionsRoot)
      ? fs.readdirSync(sessionsRoot, { withFileTypes: true })
      : [];
    const spaces = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(WORKSPACE_MEMORY_SESSION_PREFIX))
      .map((entry) => entry.name.slice(WORKSPACE_MEMORY_SESSION_PREFIX.length))
      .sort((a, b) => a.localeCompare(b));
  if (spaces.length === 0) {
    io.log("(none)");
    return;
  }
    const activeSuffix = sanitizeWorkspaceMemorySpaceForSessionId(activeSpace);
    for (const spaceSuffix of spaces) {
      const marker = spaceSuffix === activeSuffix ? "*" : " ";
      io.log(`${marker} ${spaceSuffix}`);
    }
    return;
  }

  if (primary === "persona" || primary === "user") {
    const layer = primary === "persona" ? "persona" : "user";
    const action = String(secondary || "").toLowerCase();
    if (!action) {
      throw usageError(`Usage: memo ${primary} <show|set|add|init|path> ...`);
    }

    if (action === "path") {
      const resolvedPath = layer === "persona" ? resolvePersonaPath(process.env) : resolveUserProfilePath(process.env);
      io.log(resolvedPath);
      return;
    }

    if (action === "init") {
      const seeded = ensurePersonaLayer(layer, { env: process.env });
      io.log(`${getPersonaLayerDisplayName(layer)} ${seeded.created ? "initialized" : "already exists"}.`);
      io.log(`Path: ${seeded.path}`);
      return;
    }

    if (action === "show") {
      const state = readPersonaLayer(layer, { env: process.env });
      if (!state.exists || !String(state.content || "").trim()) {
        io.log("(none)");
        return;
      }
      safePrintText(io, state.content);
      return;
    }

    if (action !== "set" && action !== "add") {
      throw usageError(`Unknown ${primary} action: ${secondary}`);
    }
    const text = rest.join(" ").trim();
    if (!text) {
      throw usageError(`${primary} ${action} requires text`);
    }
    const updated = writePersonaLayer(layer, text, { mode: action, env: process.env });
    io.log(`${getPersonaLayerDisplayName(layer)} memory ${action === "set" ? "updated" : "appended"}.`);
    io.log(`Path: ${updated.path}`);
    io.log(`Usage: ${updated.length}/${updated.maxChars} chars`);
    return;
  }

  if (primary === "pin") {
    const action = String(secondary || "").toLowerCase();
    if (!action) throw usageError("Usage: memo pin <show|set|add> ...");

    const space = activeSpace;
    const sessionId = workspaceMemorySessionId(space);

    if (action === "show") {
      const storageApi = await loadMemoStorageApi();
      const storage = await getActiveMemoStorage(workspaceRoot, storageApi);
      let content = await storageApi.readPinnedMemo(workspaceRoot, { storage, space });
      if (!String(content || "").trim() && fs.existsSync(pinnedPath(workspaceRoot, sessionId))) {
        content = readPinned(workspaceRoot, sessionId);
      }
      if (!String(content || "").trim()) {
        io.log("(none)");
        return;
      }
      safePrintText(io, content);
      return;
    }

    const text = rest.join(" ").trim();
    if (!text) throw usageError("pin set/add requires text");
    assertSafeMemoText(text, "pinned workspace memory");
    const storageApi = await loadMemoStorageApi();
    const storage = await getActiveMemoStorage(workspaceRoot, storageApi);

    if (action === "set") {
      assertMaxChars(text, workspacePinnedMaxChars, "pinned workspace memory");
      await storageApi.writePinnedMemo(workspaceRoot, { storage, space, content: text });
      mirrorPinnedMemoToLegacy(workspaceRoot, { space, content: text });
      io.log("Pinned memory updated.");
      return;
    }
    if (action === "add") {
      const existing = String(await storageApi.readPinnedMemo(workspaceRoot, { storage, space }) || "").trimEnd();
      const next = existing ? `${existing}\n\n${text}` : text;
      assertMaxChars(next, workspacePinnedMaxChars, "pinned workspace memory");
      await storageApi.writePinnedMemo(workspaceRoot, { storage, space, content: next });
      mirrorPinnedMemoToLegacy(workspaceRoot, { space, content: next });
      io.log("Pinned memory appended.");
      return;
    }
    throw usageError(`Unknown pin action: ${secondary}`);
  }

  if (primary === "add") {
    const text = [secondary, ...rest].join(" ").trim();
    if (!text) throw usageError("memo add requires text");
    assertSafeMemoText(text, "memo entry");
    assertMaxChars(text, workspaceMemoEntryMaxChars, "memo entry");

    const space = activeSpace;
    const refs = extractTags(text);
    const turnId = createMemoTurnId(space);
    const storageApi = await loadMemoStorageApi();
    const storage = await getActiveMemoStorage(workspaceRoot, storageApi);
    const record = await storageApi.appendMemoEvent({
      workspaceRoot,
      storage,
      space,
      text,
      refs,
      role: "user",
      kind: "memo",
      turn: {
        turnId,
        turnType: "side",
        environment: "memo",
        hindsightStatus: "na",
        outcome: "success",
      },
    });
    const legacy = mirrorMemoEventToLegacy(workspaceRoot, { space, text, refs, turnId, record });
    const eventId = record?.eventId || legacy.eventId || "";
    io.log(`Memo added${eventId ? `: ${eventId}` : "."}`);
    return;
  }

  if (primary === "recall") {
    const { positionals, flags } = splitRecallFlags(argv);
    if (positionals[0] !== "recall") {
      throw usageError("Usage: memo recall [query] [--limit N] [--highlight-limit N]");
    }
    const query = positionals.slice(1).join(" ").trim();
    const space = activeSpace;
    const storageApi = await loadMemoStorageApi();
    const storage = await getActiveMemoStorage(workspaceRoot, storageApi);
    let records = await storageApi.searchMemoEvents(workspaceRoot, {
      storage,
      space,
      query,
      limit: flags.limit,
    });
    if (!Array.isArray(records) || records.length === 0) {
      records = legacyMemoRows(workspaceRoot, space, { query, limit: flags.limit });
    }
    const rows = Array.isArray(records)
      ? records.map((row) => memoRecordToRecallRow(row, {
          workspaceRoot,
          space,
          query,
          highlightLimit: flags.highlightLimit,
        }))
      : [];
    if (rows.length === 0) {
      io.log("(none)");
      return;
    }
    for (let index = 0; index < rows.length; index += 1) {
      io.log(renderRecallRow(rows[index], index));
    }
    return;
  }

  if (primary === "list") {
    const { positionals, flags } = splitFlags(argv);
    if (positionals[0] !== "list") throw usageError("Usage: memo list [--limit N]");
    const limit = flags.limit;

    const space = activeSpace;
    const storageApi = await loadMemoStorageApi();
    const storage = await getActiveMemoStorage(workspaceRoot, storageApi);
    let rows = await storageApi.listMemoEvents(workspaceRoot, {
      storage,
      space,
      limit,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      rows = legacyMemoRows(workspaceRoot, space, { limit });
    }
    if (rows.length === 0) {
      io.log("(none)");
      return;
    }
    for (const row of rows) {
      io.log(renderMemoRow(row));
    }
    return;
  }

  if (primary === "search") {
    const { positionals, flags } = splitFlags(argv);
    if (positionals[0] !== "search") throw usageError("Usage: memo search <query> [--limit N] [--semantic]");
    const query = positionals.slice(1).join(" ").trim();
    if (!query) throw usageError("memo search requires query text");
    const limit = flags.limit;

    const space = activeSpace;
    const storageApi = await loadMemoStorageApi();
    const storage = await getActiveMemoStorage(workspaceRoot, storageApi);
    let rows = await storageApi.searchMemoEvents(workspaceRoot, {
      storage,
      space,
      query,
      limit,
    });
    if (!Array.isArray(rows) || rows.length === 0) {
      rows = legacyMemoRows(workspaceRoot, space, { query, limit });
    }
    if (rows.length === 0) {
      io.log("(none)");
      return;
    }
    for (const row of rows) {
      io.log(renderMemoRow(row));
    }
    return;
  }

  throw usageError(`Unknown memo subcommand: ${primary}`);
}
