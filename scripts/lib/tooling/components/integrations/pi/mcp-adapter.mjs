// scripts/lib/tooling/components/integrations/pi/mcp-adapter.mjs — Pi MCP bridge setup.
// Pi carries MCP through one of two carriers that both read the same
// Pi-global mcp.json: the built-in `mcp` extension (pi >= 0.99.0) or the
// pinned third-party MCP-client extension (pi-mcp-adapter, required before
// 0.99.0). resolvePiMcpMode() picks the carrier from `pi --version`;
// detection failure stays on the adapter, the legacy always-safe path. This
// module keeps the AIOS-managed side declarative and testable: pinned
// package spec, AIOS-managed server entries for the Pi-global mcp.json, and
// idempotent merge/install helpers. Project repos keep using their own
// .mcp.json (the adapter reads it directly); the Pi-global file only carries servers
// that make sense outside any single project: code-review-graph (cwd-less),
// plus the AIOS-root-resolved aios-memory and aios-bridge stdio servers,
// all three cwd-less so they follow the Pi session cwd. The browser server
// joins them once its runtime is installed in this AIOS root (browser
// readiness has a single owner: components/browser/runtime/runtime-readiness.mjs).
// The headroom server joins once the caller resolves an installed headroom
// binary behind MCP consent; its env tags the client and disables readback,
// mirroring headroom-mcp/commands.mjs buildDesiredHeadroomEntry — but Pi
// skips that config-file chain entirely (structural no-op for both carriers),
// so this managed entry is Pi's only Headroom route.
// Shell and auth stay out: a shell MCP tool would bypass the AIOS Pi safety
// gate, and auth stays niche.
import fs from 'node:fs';
import path from 'node:path';

import { planServerEdits } from '../../../../clients/mcp/server-writer.mjs';

import { PRIMARY_BROWSER_ALIAS } from '../../browser/constants.mjs';
import { resolveLocalBrowserMcpScript } from '../../browser/runtime/runtime-paths.mjs';

export const PI_MCP_ADAPTER_PACKAGE = 'pi-mcp-adapter';
export const PI_MCP_ADAPTER_VERSION = '2.33.0';

// First pi release whose built-in `mcp` extension serves mcp.json itself.
export const PI_BUILTIN_MCP_SINCE = '0.99.0';

// Parse the first dotted version in `raw` (pi prints e.g. "0.99.2");
// returns null when nothing numeric parses.
export function parsePiVersion(raw) {
  const match = String(raw || '').match(/(\d+)\.(\d+)(?:\.(\d+))?/u);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

function compareVersionTriples(a, b) {
  for (let i = 0; i < 3; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left - right;
  }
  return 0;
}

// 'builtin' once pi ships its built-in MCP extension, 'adapter' otherwise.
// Unknown versions stay on 'adapter': the legacy carrier is always safe
// (worst case it re-installs what was already there), while assuming
// 'builtin' from a parse failure would silently leave old pi without MCP.
export function resolvePiMcpMode(rawPiVersion) {
  const version = parsePiVersion(rawPiVersion);
  const since = parsePiVersion(PI_BUILTIN_MCP_SINCE);
  if (!version || !since) return 'adapter';
  return compareVersionTriples(version, since) >= 0 ? 'builtin' : 'adapter';
}

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
// Browser/shell/auth servers stay out by default: shell executes arbitrary
// commands, and auth is niche. The browser server is added only when the
// caller states the runtime is installed, so the Pi-global file never
// advertises a server that cannot start.
//
// `browserRuntime` is an explicit input rather than an fs check here so this
// module keeps no browser-path knowledge; the readiness fact stays with its
// owner (components/browser/runtime/runtime-readiness.mjs). CDP is not required: an
// unconfigured profile makes the runtime launch its own local Chromium.
export function buildAiosPiBrowserServer({ aiosRoot = '' } = {}) {
  const root = String(aiosRoot || '').trim();
  if (!root) return null;
  return {
    command: 'node',
    args: [resolveLocalBrowserMcpScript(root)],
    lifecycle: 'lazy',
  };
}

// `headroomExecutable` is an explicit input like `browserRuntime`: the
// caller passes the resolved installed binary, or '' when Headroom is
// absent or unconsented, keeping fs knowledge out of this module.
export function buildAiosPiHeadroomServer({ executable = '' } = {}) {
  const headroom = String(executable || '').trim();
  if (!headroom) return null;
  return {
    command: headroom,
    args: ['mcp', 'serve'],
    env: { HEADROOM_MCP_CLIENT: 'pi', HEADROOM_MCP_READ: 'off' },
    lifecycle: 'lazy',
  };
}

export function buildAiosPiMcpServers({ aiosRoot = '', browserRuntime = false, headroomExecutable = '' } = {}) {
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
    if (browserRuntime) {
      const browserServer = buildAiosPiBrowserServer({ aiosRoot: root });
      if (browserServer) servers[PRIMARY_BROWSER_ALIAS] = browserServer;
    }
  }
  const headroomServer = buildAiosPiHeadroomServer({ executable: headroomExecutable });
  if (headroomServer) servers['headroom'] = headroomServer;
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

// Idempotent: merges AIOS-managed servers into mcp.json mcpServers.
// Never rewrites user-owned servers or other keys. dryRun previews.
export function ensurePiMcpServers({ mcpJsonPath, servers = null, dryRun = false, io = null } = {}) {
  if (!mcpJsonPath) {
    throw new Error('ensurePiMcpServers requires mcpJsonPath');
  }
  const wanted = servers || buildAiosPiMcpServers();
  const current = readMcpJsonObject(mcpJsonPath);
  const existing = current.mcpServers && typeof current.mcpServers === 'object' && !Array.isArray(current.mcpServers)
    ? current.mcpServers
    : {};
  const added = [];
  const present = [];
  const keptDiffers = [];
  const edits = [];
  for (const [name, definition] of Object.entries(wanted)) {
    if (!(name in existing)) {
      added.push(name);
      edits.push({ action: 'upsert', serverName: name, entry: definition, mode: 'insert' });
    } else if (deepEqual(existing[name], definition)) {
      present.push(name);
    } else {
      // 用户改过同名条目 → 认下现状（kept-differs），绝不写入。旧实现也是这个语义：
      // 「只增不改」是 pi 这条路径的合同，不是遗漏。
      keptDiffers.push(name);
    }
  }

  // 「先算后写」：文本手术交给通用 planner（只动托管条目的切片，别处的缩进/键序/注释不再被整份重排带走）。
  // pi 的写入仍是同步的（历史行为，调用方从 `aios init` 到 install 都是同步路径），
  // 但**算**的部分已经与 CLI/codemap/browser 共用同一把手术刀。
  const planned = planServerEdits({
    filePath: mcpJsonPath,
    shape: { format: 'json', entryPath: 'mcpServers', allowedFields: null, createIfMissing: true },
    edits,
  });
  if (planned.status === 'rejected') {
    throw new Error(`refusing to write Pi MCP JSON: ${planned.reason}`);
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
    fs.writeFileSync(mcpJsonPath, planned.text, 'utf8');
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

// Full setup: mcp.json servers first (offline-safe, carrier-independent),
// then the carrier decision. On pi >= 0.99.0 the built-in MCP extension
// serves mcp.json and no adapter is installed; an already-installed adapter
// is only reported (`installed-conflicts`) — removal flips session behavior
// and stays an explicit operator action (`pi remove npm:pi-mcp-adapter`).
// On older pi, or whenever `pi --version` cannot be captured, the adapter
// path runs exactly as before. `run` spawns `run(cmd, args)` and resolves
// { stdout }; inject it in tests. `piVersion` overrides detection when the
// caller already captured it.
export async function ensurePiMcpAdapter({
  mcpJsonPath,
  servers = null,
  dryRun = false,
  io = null,
  run = null,
  piVersion = null,
} = {}) {
  if (!mcpJsonPath) {
    throw new Error('ensurePiMcpAdapter requires mcpJsonPath');
  }
  const mcp = ensurePiMcpServers({ mcpJsonPath, servers, dryRun, io });
  let detected = piVersion == null || piVersion === '' ? '' : String(piVersion);
  if (!detected && run) {
    try {
      detected = String((await run('pi', ['--version'])).stdout || '');
    } catch {
      detected = '';
    }
  }
  const mode = resolvePiMcpMode(detected);
  let list = '';
  try {
    list = run ? String((await run('pi', ['list'])).stdout || '') : '';
  } catch (error) {
    // `pi` may be absent from the subprocess PATH (or offline-broken);
    // preview intent under dry-run, fail with a clear message when live.
    if (dryRun) {
      io?.log?.(mode === 'builtin'
        ? `[plan] cannot check pi package list; assuming the adapter is absent`
        : `[plan] cannot check pi package list; previewing adapter install anyway`);
    } else {
      throw new Error(`cannot check pi packages: ${error.message}`);
    }
  }
  const adapterInstalled = isAdapterInstalled(list);
  if (mode === 'builtin') {
    if (adapterInstalled) {
      io?.log?.(`[info] pi ${parsePiVersion(detected)?.join('.') || '(version?)'} ships built-in MCP; pi-mcp-adapter shadows it (sessions keep working via the adapter)`);
      io?.log?.(`[info] optional cleanup restores built-in MCP: pi remove ${piMcpAdapterSpec()}`);
    }
    return {
      mcpJsonPath,
      mode,
      piVersion: parsePiVersion(detected)?.join('.') || null,
      mcpAction: mcp.action,
      adapter: adapterInstalled ? 'installed-conflicts' : 'not-installed',
      added: mcp.added,
      present: mcp.present,
      keptDiffers: mcp.keptDiffers,
    };
  }
  let adapter = 'present';
  if (!adapterInstalled) {
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
  return {
    mcpJsonPath,
    mode,
    piVersion: parsePiVersion(detected)?.join('.') || null,
    mcpAction: mcp.action,
    adapter,
    added: mcp.added,
    present: mcp.present,
    keptDiffers: mcp.keptDiffers,
  };
}
