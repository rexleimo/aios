import fs from 'node:fs';
import path from 'node:path';

import { commandExists } from '../../platform/process.mjs';
import { syncGeneratedSkills } from '../../skills/sync.mjs';

import { CRG_DATA_DIR, CRG_MCP_ALIAS } from './constants.mjs';
import { captureCrgCommand, runCrgCommand } from './crg.mjs';
import { resolveClientHomes } from './environment.mjs';
import { injectCrgIntoInstructionFiles } from './instructions.mjs';
import { collectCodemapMcpTargets, injectCrgIntoClientTarget } from './mcp-targets.mjs';
import { ensureOpencodePlugin } from './opencode-plugin.mjs';
import { resolveUserPath } from './paths.mjs';
import { stateFilePath, writeState } from './state-store.mjs';

function logUvCheck({ skipCrgChecks, io }) {
  io.log('[1/8] Checking uv in PATH');
  if (!skipCrgChecks && !commandExists('uv')) {
    throw new Error(
      'Missing required command: uv. Install uv first:\n' +
      '  curl -LsSf https://astral.sh/uv/install.sh | sh\n' +
      '  or: brew install uv'
    );
  }
  io.log(skipCrgChecks ? 'SKIP uv check (test override)' : 'OK   uv found');
}

function resolveCrgVersion({ projectRootPath, skipCrgChecks, crgVersion, io }) {
  io.log('[2/8] Verifying code-review-graph via uvx');
  if (skipCrgChecks) {
    io.log(`OK   code-review-graph version: ${crgVersion || 'available'}`);
    return crgVersion;
  }

  const versionResult = captureCrgCommand(['--version'], { cwd: projectRootPath });
  if (!versionResult) {
    throw new Error('code-review-graph is not available via uvx. Verify your uv/uvx installation and network access.');
  }
  const resolved = versionResult.stdout.trim();
  io.log(`OK   code-review-graph version: ${resolved || 'available'}`);
  return resolved;
}

function ensureGraphBuilt({ projectRootPath, dryRun, io }) {
  io.log('[3/8] Building graph');
  const crgDataDir = path.join(projectRootPath, CRG_DATA_DIR);
  const graphExists = fs.existsSync(crgDataDir);
  if (graphExists) {
    io.log('OK   graph data directory exists, skipping build');
  } else {
    io.log(`+ uvx ${CRG_MCP_ALIAS} build`);
    if (dryRun) {
      io.log(`[dry-run] skipped: uvx ${CRG_MCP_ALIAS} build`);
    } else {
      runCrgCommand(['build'], { cwd: projectRootPath, io });
    }
  }
  return { crgDataDir, graphExists };
}

function injectClientMcpConfigs({ projectRootPath, homes, client, dryRun, io }) {
  io.log('[4/8] Injecting MCP config into clients');
  const targets = collectCodemapMcpTargets(projectRootPath, homes, client);
  const filtered = targets.filter((target) => target.createIfMissing || fs.existsSync(target.path));
  const injectedClients = [];
  for (const target of filtered) {
    const result = injectCrgIntoClientTarget(target, projectRootPath, { dryRun, io });
    if (result.status === 'error') {
      io.log(`ERR  codemap MCP inject failed for ${target.path}: ${result.reason}`);
    } else if (result.status === 'unchanged') {
      io.log(`OK   codemap MCP unchanged: ${target.path} (${target.clientKey})`);
    } else {
      io.log(`OK   codemap MCP ${result.status}: ${target.path} (${target.clientKey})`);
    }
    if (!injectedClients.includes(target.clientKey)) {
      injectedClients.push(target.clientKey);
    }
  }
  return injectedClients;
}

function installOpencodePluginIfNeeded({ injectedClients, homes, dryRun, skipCrgChecks, skipOpencodePluginInstall, io }) {
  io.log('[5/8] Installing opencode plugin');
  const opencodeSelected = injectedClients.includes('opencode');
  const opencodeInstalled = opencodeSelected && (
    dryRun ||
    commandExists('opencode') ||
    fs.existsSync(resolveUserPath(homes.opencode))
  );
  if (skipOpencodePluginInstall || skipCrgChecks) {
    io.log('SKIP opencode plugin install (disabled)');
  } else if (opencodeInstalled) {
    const pluginResult = ensureOpencodePlugin(homes.opencode, { dryRun, io });
    io.log(`OK   opencode plugin ${pluginResult.status}: ${pluginResult.path || homes.opencode}`);
  } else {
    io.log('SKIP opencode not detected, skipping plugin install');
  }
}

async function syncCodemapSkills({ rootDir, dryRun, io }) {
  io.log('[8/8] Syncing skills from skill-sources to client dirs');
  const skillsSourceDir = path.join(rootDir, 'skill-sources');
  if (!fs.existsSync(skillsSourceDir)) {
    io.log('SKIP skill-sources/ not found, skipping skill sync');
    return;
  }
  if (dryRun) {
    io.log('[dry-run] skipped: syncGeneratedSkills({ rootDir })');
    return;
  }

  try {
    const syncResult = await syncGeneratedSkills({ rootDir, io });
    const totals = syncResult.results.reduce((acc, result) => {
      acc.installed += result.installed;
      acc.updated += result.updated;
      acc.reused += result.reused;
      acc.removed += result.removed;
      return acc;
    }, { installed: 0, updated: 0, reused: 0, removed: 0 });
    io.log(`OK   skills synced: installed=${totals.installed} updated=${totals.updated} reused=${totals.reused} removed=${totals.removed}`);
  } catch (syncError) {
    io.log(`[warn] skill sync failed: ${syncError instanceof Error ? syncError.message : String(syncError)}`);
  }
}

export async function installCodemap({
  rootDir,
  projectRoot,
  dryRun = false,
  io = console,
  clientHomes = null,
  client = 'all',
  skipCrgChecks = false,
  skipOpencodePluginInstall = false,
  crgVersion = '',
} = {}) {
  const homes = resolveClientHomes(clientHomes);
  const projectRootPath = path.resolve(projectRoot || process.cwd());

  logUvCheck({ skipCrgChecks, io });
  const resolvedCrgVersion = resolveCrgVersion({ projectRootPath, skipCrgChecks, crgVersion, io });
  const { crgDataDir, graphExists } = ensureGraphBuilt({ projectRootPath, dryRun, io });
  const injectedClients = injectClientMcpConfigs({ projectRootPath, homes, client, dryRun, io });
  installOpencodePluginIfNeeded({ injectedClients, homes, dryRun, skipCrgChecks, skipOpencodePluginInstall, io });

  io.log('[6/8] Writing state file');
  const state = {
    version: 1,
    installedAt: new Date().toISOString(),
    runtime: 'uvx',
    crgVersion: resolvedCrgVersion || 'unknown',
    graphBuilt: !graphExists || fs.existsSync(crgDataDir),
    clients: injectedClients,
  };
  if (dryRun) {
    io.log(`PLAN codemap would write state to ${stateFilePath(projectRootPath)}`);
  } else {
    writeState(projectRootPath, state);
    io.log(`OK   codemap state written to ${stateFilePath(projectRootPath)}`);
  }

  io.log('[7/8] Updating client instruction files');
  injectCrgIntoInstructionFiles(projectRootPath, { dryRun, io, client });
  await syncCodemapSkills({ rootDir, dryRun, io });
  io.log('Codemap install complete.');
  return { state, injectedClients, dryRun };
}
