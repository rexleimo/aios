// scripts/lib/components/pi/mcp-adapter.mjs — Pi MCP bridge setup.
// Pi core has no built-in MCP surface; MCP capability arrives via a
// third-party MCP-client extension (pi-mcp-adapter). This module keeps the
// AIOS-managed side declarative and testable: pinned package spec,
// AIOS-managed server entries for the Pi-global mcp.json, and idempotent
// merge/install helpers. Project repos keep using their own .mcp.json
// (the adapter reads it directly); the Pi-global file only carries servers
// that make sense outside any single project: code-review-graph (cwd-less),
// plus the AIOS-root-resolved aios-memory and aios-bridge stdio servers,
// all three cwd-less so they follow the Pi session cwd. Browser, shell and
// auth servers stay out until their CDP/exec/sensitivity dependencies get
// an explicit gate — projects enable them via their own .mcp.json.
import fs from 'node:fs';
import path from 'node:path';

export const PI_MCP_ADAPTER_PACKAGE = 'pi-mcp-adapter';
export const PI_MCP_ADAPTER_VERSION = '2.33.0';

export function piMcpAdapterSpec() {
  return `npm:${PI_MCP_ADAPTER_PACKAGE}@${PI_MCP_ADAPTER_VERSION}`;
}

export function resolvePiMcpJsonPath(piHome) {
  return path.join(piHome, 'mcp.json');
}

// Servers AIOS manages inside the Pi-global mcp.json. Keyed by server name;
// user-owned entries with other names are never touched, and a user-edited
// entry with the same name is kept as-is (reported as kept-differs).
// All entries are session-cwd-following (no cwd/env): code-review-graph
// serves the Pi session directory, and both node servers resolve their
// workspace from the session cwd at request time. `aiosRoot` is the
// runtime-resolved AIOS install root (never a repo-relative literal).
// Browser/shell/auth servers stay out: browser needs a CDP endpoint, shell
// executes arbitrary commands, and auth is niche — all need an explicit
// gate before going global.
export function buildAiosPiMcpServers({ aiosRoot = '' } = {}) {
  const servers = {
    'code-review-graph': {
      command: 'uvx',
      args: ['code-review-graph', 'serve'],
      lifecycle: 'lazy',
    },
  };
  const root = String(aiosRoot || '').trim();
  if (root) {
    servers['aios-memory'] = {
      command: 'node',
      args: [path.join(root, 'scripts', 'memory-mcp-server.mjs')],
      lifecycle: 'lazy',
    };
    servers['aios-bridge'] = {
      command: 'node',
      args: [path.join(root, 'scripts', 'aios-mcp-server.mjs')],
      lifecycle: 'lazy',
    };
  }
  return servers;
}

function readMcpJsonObject(mcpJsonPath) {
  let raw;
  try {
    raw = fs.readFileSync(mcpJsonPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`invalid Pi MCP JSON (refusing to clobber): ${mcpJsonPath}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`invalid Pi MCP shape (refusing to clobber): ${mcpJsonPath}`);
  }
  return parsed;
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Idempotent: merges AIOS-managed servers into mcp.json `mcpServers`.
// Never rewrites user-owned servers or other keys. dryRun previews.
export function ensurePiMcpServers({ mcpJsonPath, servers = null, dryRun = false, io = null } = {}) {
  if (!mcpJsonPath) {
    throw new Error('ensurePiMcpServers requires mcpJsonPath');
  }
  const wanted = servers || buildAiosPiMcpServers();
  const current = readMcpJsonObject(mcpJsonPath);
  const existing = current.mcpServers && typeof current.mcpServers === 'object' && !Array.isArray(current.mcpServers)
    ? { ...current.mcpServers }
    : {};
  const added = [];
  const present = [];
  const keptDiffers = [];
  for (const [name, definition] of Object.entries(wanted)) {
    if (!(name in existing)) {
      existing[name] = definition;
      added.push(name);
    } else if (deepEqual(existing[name], definition)) {
      present.push(name);
    } else {
      keptDiffers.push(name);
    }
  }
  const action = added.length > 0 ? 'updated' : 'present';
  if (dryRun) {
    if (added.length > 0) {
      io?.log?.(`[plan] would add Pi MCP servers in ${mcpJsonPath}: ${added.join(', ')}`);
    }
    return { mcpJsonPath, action: added.length > 0 ? 'would-update' : 'present', added, present, keptDiffers };
  }
  if (added.length > 0) {
    fs.mkdirSync(path.dirname(mcpJsonPath), { recursive: true });
    fs.writeFileSync(mcpJsonPath, `${JSON.stringify({ ...current, mcpServers: existing }, null, 2)}\n`, 'utf8');
  }
  return { mcpJsonPath, action, added, present, keptDiffers };
}

export function buildAdapterInstallArgs() {
  return ['install', piMcpAdapterSpec()];
}

// `pi list` prints installed extensions; match the bare package name so a
// differently-pinned install still counts as present.
export function isAdapterInstalled(piListOutput) {
  return String(piListOutput || '').includes(PI_MCP_ADAPTER_PACKAGE);
}

// Full setup: mcp.json servers first (offline-safe), then the adapter
// package via `pi install` (needs network). `run` spawns
// `run(cmd, args)` and resolves { stdout }; inject it in tests.
export async function ensurePiMcpAdapter({
  mcpJsonPath,
  servers = null,
  dryRun = false,
  io = null,
  run = null,
} = {}) {
  if (!mcpJsonPath) {
    throw new Error('ensurePiMcpAdapter requires mcpJsonPath');
  }
  const mcp = ensurePiMcpServers({ mcpJsonPath, servers, dryRun, io });
  let adapter = 'present';
  let list = '';
  try {
    list = run ? String((await run('pi', ['list'])).stdout || '') : '';
  } catch (error) {
    // `pi` may be absent from the subprocess PATH (or offline-broken);
    // preview intent under dry-run, fail with a clear message when live.
    if (dryRun) {
      io?.log?.(`[plan] cannot check pi package list; previewing adapter install anyway`);
    } else {
      throw new Error(`cannot check pi packages: ${error.message}`);
    }
  }
  if (!isAdapterInstalled(list)) {
    const args = buildAdapterInstallArgs();
    if (dryRun) {
      io?.log?.(`[plan] would run: pi ${args.join(' ')}`);
      adapter = 'would-install';
    } else {
      if (!run) {
        throw new Error('ensurePiMcpAdapter needs a process runner to install the adapter (no network in dry-run)');
      }
      await run('pi', args);
      adapter = 'installed';
    }
  }
  return { mcpJsonPath, mcpAction: mcp.action, adapter, added: mcp.added, present: mcp.present, keptDiffers: mcp.keptDiffers };
}
