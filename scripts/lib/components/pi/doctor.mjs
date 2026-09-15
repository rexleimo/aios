// scripts/lib/components/pi/doctor.mjs — Pi MCP bridge health check.
// Reports the AIOS-managed servers inside the Pi-global mcp.json plus the
// pinned MCP-client adapter. Repair hints use the global `aios` CLI only;
// the AIOS root comes in as the doctor runtime root, never a repo-relative
// literal.
import fs from 'node:fs';

import { captureCommand, commandExists } from '../../platform/process.mjs';
import { getClientHomes } from '../../platform/paths.mjs';
import { buildAiosPiMcpServers, isAdapterInstalled, resolvePiMcpJsonPath } from './mcp-adapter.mjs';

const MANAGED_SERVER_NAMES = ['code-review-graph', 'aios-memory', 'aios-bridge'];

function sameServerDefinition(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export async function doctorPiBridge({
  aiosRoot = '',
  env = process.env,
  io = console,
  commandExistsImpl = commandExists,
  captureImpl = captureCommand,
} = {}) {
  const result = {
    errors: 0,
    effectiveWarnings: 0,
    skipped: false,
    managedPresent: [],
    managedMissing: [],
    adapter: 'unknown',
    mcpJsonPath: '',
  };

  const piHome = getClientHomes(env).pi;
  const mcpJsonPath = resolvePiMcpJsonPath(piHome);
  result.mcpJsonPath = mcpJsonPath;

  const piOnPath = await Promise.resolve(commandExistsImpl('pi', { env }));
  let parsed = null;
  let hasMcpJson = false;
  try {
    parsed = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8'));
    hasMcpJson = true;
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      io.log('[error] Pi mcp.json is not valid JSON; AIOS never rewrites it automatically');
      result.errors += 1;
    }
  }

  if (!piOnPath && !hasMcpJson) {
    result.skipped = true;
    io.log('[skip] Pi coding agent not detected (no pi CLI and no mcp.json)');
    return result;
  }

  io.log('Pi MCP Bridge Doctor');
  io.log('--------------------');
  io.log(`Pi home: ${piHome}`);

  const existing = parsed?.mcpServers && typeof parsed.mcpServers === 'object' && !Array.isArray(parsed.mcpServers)
    ? parsed.mcpServers
    : {};
  const wanted = buildAiosPiMcpServers({ aiosRoot });

  for (const name of MANAGED_SERVER_NAMES) {
    const definition = wanted[name];
    if (!definition) {
      io.log(`[warn] ${name}: cannot verify (AIOS root unknown)`);
      result.managedMissing.push(name);
      result.effectiveWarnings += 1;
      continue;
    }
    if (!(name in existing)) {
      io.log(`[warn] ${name}: missing from Pi mcp.json`);
      result.managedMissing.push(name);
      result.effectiveWarnings += 1;
      continue;
    }
    if (!sameServerDefinition(existing[name], definition)) {
      io.log(`[warn] ${name}: present but differs from the AIOS-managed definition (user edits are kept)`);
      result.managedPresent.push(name);
      result.effectiveWarnings += 1;
      continue;
    }
    io.log(`[ok] ${name}`);
    result.managedPresent.push(name);
  }

  if (piOnPath) {
    try {
      const list = captureImpl('pi', ['list'], { env });
      if (isAdapterInstalled(list?.stdout)) {
        io.log('[ok] pi-mcp-adapter installed');
        result.adapter = 'installed';
      } else {
        io.log('[warn] pi-mcp-adapter not installed; Pi cannot load MCP servers');
        result.adapter = 'missing';
        result.effectiveWarnings += 1;
      }
    } catch (error) {
      io.log(`[warn] cannot check pi packages: ${error?.message || error}`);
      result.adapter = 'unknown';
      result.effectiveWarnings += 1;
    }
  } else {
    io.log('[warn] pi CLI not on PATH; adapter status unknown');
    result.adapter = 'unknown';
    result.effectiveWarnings += 1;
  }

  if (result.errors > 0 || result.effectiveWarnings > 0) {
    io.log('Run: aios init --agent pi to (re)install the bridge, then rerun aios doctor');
  }

  return result;
}
