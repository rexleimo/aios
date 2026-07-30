import fs from 'node:fs';
import path from 'node:path';

import { commandExists } from '../../platform/process.mjs';

import { AGENTS_MD_MARKERS, CRG_DATA_DIR, CRG_MCP_ALIAS } from './constants.mjs';
import { captureCrgCommand } from './crg.mjs';
import { resolveClientHomes } from './environment.mjs';
import { collectCodemapInstructionFiles, inspectCodemapInstructionMarkers } from './instructions.mjs';
import { installCodemap } from './install.mjs';
import { collectCodemapMcpTargets, inspectCodemapMcpTarget } from './mcp-targets.mjs';
import { readState, stateFilePath } from './state-store.mjs';

function createDoctorCounters(io) {
  let effectiveWarnings = 0;
  let errors = 0;
  return {
    ok: (msg) => io.log(`OK   ${msg}`),
    warn: (msg) => {
      effectiveWarnings += 1;
      io.log(`WARN ${msg}`);
    },
    err: (msg) => {
      errors += 1;
      io.log(`ERR  ${msg}`);
    },
    snapshot: () => ({ effectiveWarnings, errors }),
  };
}

function checkDoctorRuntime({ projectRootPath, skipCrgChecks, statusText, crgVersion, io, counters }) {
  io.log('[1/7] Checking uv in PATH');
  if (skipCrgChecks) counters.ok('uv check skipped (test override)');
  else if (commandExists('uv')) counters.ok('uv found');
  else counters.err('uv not found in PATH');

  io.log('[2/7] Checking code-review-graph via uvx');
  if (skipCrgChecks) counters.ok(`code-review-graph check skipped${crgVersion ? `: ${crgVersion}` : ''}`);
  else if (commandExists('uvx')) {
    const versionResult = captureCrgCommand(['--version'], { cwd: projectRootPath });
    if (versionResult) counters.ok(`code-review-graph available: ${versionResult.stdout.trim()}`);
    else counters.err('code-review-graph --version failed');
  } else counters.err('uvx not found in PATH');

  io.log('[3/7] Checking graph data directory');
  const crgDataDir = path.join(projectRootPath, CRG_DATA_DIR);
  if (fs.existsSync(crgDataDir)) counters.ok(`graph data directory exists: ${crgDataDir}`);
  else counters.warn(`graph data directory missing: ${crgDataDir}`);

  io.log('[4/7] Checking graph has nodes');
  if (statusText) counters.ok(`graph status: ${String(statusText).trim().split('\n')[0]}`);
  else if (skipCrgChecks) counters.ok('graph status check skipped (test override)');
  else {
    const statusResult = captureCrgCommand(['status'], { cwd: projectRootPath });
    if (statusResult && statusResult.stdout.trim()) counters.ok(`graph status: ${statusResult.stdout.trim().split('\n')[0]}`);
    else counters.warn('graph status unavailable or empty');
  }
}

function checkDoctorConfigs({ projectRootPath, homes, client, counters }) {
  for (const target of collectCodemapMcpTargets(projectRootPath, homes, client)) {
    const inspection = inspectCodemapMcpTarget(target);
    if (inspection.valid) counters.ok(`${CRG_MCP_ALIAS} found in ${target.path} (${target.clientKey})`);
    else if (!inspection.exists) counters.warn(`${CRG_MCP_ALIAS} missing in ${target.path} (${target.clientKey})`);
    else if (inspection.hasCrg) counters.warn(`${CRG_MCP_ALIAS} invalid in ${target.path} (${target.clientKey})`);
    else if (String(inspection.reason || '').startsWith('parse failed:')) counters.warn(`${CRG_MCP_ALIAS} missing in ${target.path} (${target.clientKey}) - ${inspection.reason}`);
    else counters.warn(`${CRG_MCP_ALIAS} missing in ${target.path} (${target.clientKey})`);
  }
}

function checkDoctorStateAndDocs({ projectRootPath, client, counters }) {
  const state = readState(projectRootPath);
  if (state && state.version === 1) counters.ok(`state file valid: ${stateFilePath(projectRootPath)}`);
  else counters.warn('state file missing or invalid');

  for (const target of collectCodemapInstructionFiles(client)) {
    const instructionPath = path.join(projectRootPath, target.fileName);
    if (!fs.existsSync(instructionPath)) {
      counters.warn(`${target.fileName} not found`);
      continue;
    }
    const raw = fs.readFileSync(instructionPath, 'utf8');
    const markers = inspectCodemapInstructionMarkers(raw);
    if (markers.valid) {
      counters.ok(`${target.fileName} CRG section present`);
    } else {
      counters.warn(`${target.fileName} CRG section malformed or missing`);
    }
  }
}

export async function doctorCodemap({
  rootDir,
  projectRoot,
  fix = false,
  dryRun = false,
  io = console,
  clientHomes = null,
  client = 'all',
  skipCrgChecks = false,
  skipOpencodePluginInstall = false,
  statusText = '',
  crgVersion = '',
} = {}) {
  const homes = resolveClientHomes(clientHomes);
  const projectRootPath = path.resolve(projectRoot || process.cwd());
  const counters = createDoctorCounters(io);

  io.log('Codemap Doctor');
  io.log(`Project: ${projectRootPath}`);
  io.log('');
  checkDoctorRuntime({ projectRootPath, skipCrgChecks, statusText, crgVersion, io, counters });
  io.log('[5/7] Checking MCP config in clients');
  checkDoctorConfigs({ projectRootPath, homes, client, counters });
  io.log('[6/7] Checking state file');
  io.log('[7/7] Checking client instruction files');
  checkDoctorStateAndDocs({ projectRootPath, client, counters });

  const preFix = counters.snapshot();
  if (fix && (preFix.errors > 0 || preFix.effectiveWarnings > 0)) {
    io.log('');
    io.log('[fix] Re-running installCodemap to heal issues...');
    try {
      await installCodemap({ rootDir, projectRoot: projectRootPath, dryRun, io, clientHomes: homes, client, skipCrgChecks, skipOpencodePluginInstall, crgVersion });
      io.log('[fix] Install complete. Re-run doctor to verify.');
    } catch (error) {
      counters.err(`fix failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  io.log('');
  io.log('Note: counts reflect pre-fix state. Re-run doctor to get fresh results.');
  const finalCounts = counters.snapshot();
  if (finalCounts.errors > 0) io.log(`Result: FAILED (${finalCounts.errors} errors, ${finalCounts.effectiveWarnings} warnings)`);
  else io.log(`Result: OK (${finalCounts.effectiveWarnings} warnings)`);
  return finalCounts;
}
