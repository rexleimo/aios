import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { commandExists, captureCommand, runCommand } from '../platform/process.mjs';
import { getClientHomes } from '../platform/paths.mjs';
import { syncGeneratedSkills } from '../skills/sync.mjs';

const CRG_MCP_ALIAS = 'code-review-graph';
const STATE_FILE_NAME = 'codemap.json';
const STATE_DIR = '.aios';
const CRG_DATA_DIR = '.code-review-graph';
const AGENTS_MD_MARKERS = {
  begin: '<!-- AIOS CODEMAP BEGIN -->',
  end: '<!-- AIOS CODEMAP END -->',
};

function backupFilePath(filePath) {
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `${filePath}.bak-${ts}`;
}

function resolveUserPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw === '~') return os.homedir();
  if (raw.startsWith('~/') || raw.startsWith('~\\')) {
    return path.join(os.homedir(), raw.slice(2));
  }
  return path.resolve(raw);
}

function stateFilePath(projectRoot) {
  return path.join(projectRoot, STATE_DIR, STATE_FILE_NAME);
}

function readState(projectRoot) {
  const filePath = stateFilePath(projectRoot);
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeState(projectRoot, state) {
  const filePath = stateFilePath(projectRoot);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function removeState(projectRoot) {
  const filePath = stateFilePath(projectRoot);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // ignore
  }
}

function runCrgCommand(args, { cwd, dryRun = false, io = console } = {}) {
  if (!commandExists('uvx')) {
    throw new Error('Missing required command: uvx. Install uv first: https://docs.astral.sh/uv/getting-started/installation/');
  }
  io.log(`+ uvx ${CRG_MCP_ALIAS} ${args.join(' ')}`);
  if (dryRun) {
    io.log(`[dry-run] skipped: uvx ${CRG_MCP_ALIAS} ${args.join(' ')}`);
    return null;
  }
  return runCommand('uvx', [CRG_MCP_ALIAS, ...args], { cwd });
}

export function captureCrgCommand(args, { cwd } = {}) {
  try {
    if (!commandExists('uvx')) return null;
    const result = captureCommand('uvx', [CRG_MCP_ALIAS, ...args], { cwd });
    if (result.status !== 0) return null;
    return result;
  } catch {
    return null;
  }
}

function buildCrgMcpServerEntry(clientKey) {
  const entry = {
    command: 'uvx',
    args: ['code-review-graph', 'serve'],
  };
  if (clientKey === 'opencode') {
    entry.type = 'stdio';
  }
  return entry;
}

function injectCrgIntoMcpJson(filePath, clientKey, { dryRun = false, io = console } = {}) {
  const exists = fs.existsSync(filePath);
  const raw = exists ? fs.readFileSync(filePath, 'utf8') : '';

  let parsed = {};
  if (exists && raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
      return {
        status: 'error',
        reason: `JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    parsed = {};
  }

  if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object' || Array.isArray(parsed.mcpServers)) {
    parsed.mcpServers = {};
  }

  const desired = buildCrgMcpServerEntry(clientKey);
  const existing = parsed.mcpServers[CRG_MCP_ALIAS];
  const nextEntry = { ...desired };
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    Object.assign(nextEntry, existing, desired);
  }
  parsed.mcpServers[CRG_MCP_ALIAS] = nextEntry;

  const nextRaw = `${JSON.stringify(parsed, null, 2)}\n`;
  if (exists && raw === nextRaw) {
    return { status: 'unchanged' };
  }

  if (dryRun) {
    return { status: 'planned' };
  }

  if (exists) {
    fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, nextRaw, 'utf8');

  return { status: exists ? 'updated' : 'created' };
}

function removeCrgFromMcpJson(filePath, { io = console } = {}) {
  if (!fs.existsSync(filePath)) return;

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed?.mcpServers || typeof parsed.mcpServers !== 'object') return;
    if (!(CRG_MCP_ALIAS in parsed.mcpServers)) return;

    delete parsed.mcpServers[CRG_MCP_ALIAS];
    fs.writeFileSync(backupFilePath(filePath), raw, 'utf8');
    fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    io.log(`OK   codemap removed ${CRG_MCP_ALIAS} from ${filePath}`);
  } catch (error) {
    io.log(`ERR  codemap failed to clean ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const AGENTS_MD_CRG_SECTION = `This project has a structural knowledge graph. **Use it at each decision point in your workflow.**

### Decision checkpoints (mandatory)

| When | Call | Why |
|------|------|-----|
| Before doing anything | \`get_minimal_context(task="...")\` | Project context + suggested next steps |
| Before modifying code | \`get_impact_radius(detail_level="minimal")\` | Check blast radius; if risk=high, re-evaluate plan |
| Before modifying code | \`query_graph(pattern="tests_for", target="...")\` | Confirm tests exist; if not, write tests first |
| After modifying code | \`detect_changes(detail_level="minimal")\` | Verify actual impact matches expected |
| Before submitting | \`get_affected_flows()\` + \`get_suggested_questions()\` | Final safety net |

### Search rules

- Finding code: \`semantic_search_nodes\` before grep
- Understanding relationships: \`query_graph\` (callers_of/callees_of/tests_for) before reading files
- Code review: \`detect_changes\` → \`get_review_context\` before reading entire files

### Parameters

- Always use \`detail_level="minimal"\`; escalate to "standard" only when insufficient
- Follow \`next_tool_suggestions\` from each response for the next tool to call`;

function injectCrgIntoAgentsMd(projectRoot, { dryRun = false, io = console } = {}) {
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) {
    if (dryRun) {
      io.log(`PLAN codemap would create ${agentsPath} with CRG section`);
      return;
    }
    const content = `${AGENTS_MD_MARKERS.begin}\n${AGENTS_MD_CRG_SECTION}\n${AGENTS_MD_MARKERS.end}\n`;
    fs.writeFileSync(agentsPath, content, 'utf8');
    io.log(`OK   codemap created ${agentsPath} with CRG section`);
    return;
  }

  const raw = fs.readFileSync(agentsPath, 'utf8');
  const beginIndex = raw.indexOf(AGENTS_MD_MARKERS.begin);
  const endIndex = raw.indexOf(AGENTS_MD_MARKERS.end);

  if (beginIndex !== -1 && endIndex !== -1) {
    const before = raw.slice(0, beginIndex);
    const after = raw.slice(endIndex + AGENTS_MD_MARKERS.end.length);
    const newSection = `${AGENTS_MD_MARKERS.begin}\n${AGENTS_MD_CRG_SECTION}\n${AGENTS_MD_MARKERS.end}`;
    const nextRaw = `${before}${newSection}${after}`;
    if (nextRaw === raw) {
      io.log(`OK   codemap AGENTS.md CRG section unchanged`);
      return;
    }
    if (dryRun) {
      io.log(`PLAN codemap would update AGENTS.md CRG section`);
      return;
    }
    fs.writeFileSync(agentsPath, nextRaw, 'utf8');
    io.log(`OK   codemap updated AGENTS.md CRG section`);
    return;
  }

  const nextRaw = `${raw.replace(/\n*$/u, '')}\n\n${AGENTS_MD_MARKERS.begin}\n${AGENTS_MD_CRG_SECTION}\n${AGENTS_MD_MARKERS.end}\n`;
  if (dryRun) {
    io.log(`PLAN codemap would append CRG section to AGENTS.md`);
    return;
  }
  fs.writeFileSync(agentsPath, nextRaw, 'utf8');
  io.log(`OK   codemap appended CRG section to AGENTS.md`);
}

function removeCrgFromAgentsMd(projectRoot, { io = console } = {}) {
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) return;

  const raw = fs.readFileSync(agentsPath, 'utf8');
  const beginIndex = raw.indexOf(AGENTS_MD_MARKERS.begin);
  const endIndex = raw.indexOf(AGENTS_MD_MARKERS.end);
  if (beginIndex === -1 || endIndex === -1) return;

  const before = raw.slice(0, beginIndex);
  const after = raw.slice(endIndex + AGENTS_MD_MARKERS.end.length);
  let nextRaw = `${before}${after}`;
  nextRaw = nextRaw.replace(/\n{3,}/gu, '\n\n').replace(/^\s*\n/u, '').replace(/\n\s*$/u, '\n');
  fs.writeFileSync(agentsPath, nextRaw, 'utf8');
  io.log(`OK   codemap removed CRG section from AGENTS.md`);
}

function collectCodemapMcpTargets(rootDir, clientHomes = {}) {
  const targets = [];
  const seen = new Set();

  const addUnique = (absPath, clientKey, createIfMissing) => {
    if (!absPath || seen.has(absPath)) return;
    seen.add(absPath);
    targets.push({ path: absPath, clientKey, createIfMissing });
  };

  addUnique(
    path.resolve(path.join(rootDir, '.mcp.json')),
    'opencode',
    true,
  );

  const codexHome = resolveUserPath(clientHomes.codex);
  if (codexHome) {
    addUnique(path.join(codexHome, 'mcp.json'), 'codex', false);
  }

  const claudeHome = resolveUserPath(clientHomes.claude);
  if (claudeHome) {
    addUnique(path.join(claudeHome, '.claude.json'), 'claude', false);
  }

  const geminiHome = resolveUserPath(clientHomes.gemini);
  if (geminiHome) {
    addUnique(path.join(geminiHome, 'settings.json'), 'gemini', false);
  }

  return targets;
}

export async function installCodemap({ rootDir, projectRoot, dryRun = false, io = console, clientHomes = null } = {}) {
  const homes = clientHomes && typeof clientHomes === 'object' ? clientHomes : getClientHomes(process.env, os.homedir());

  io.log('[1/8] Checking uv in PATH');
  if (!commandExists('uv')) {
    throw new Error(
      'Missing required command: uv. Install uv first:\n' +
      '  curl -LsSf https://astral.sh/uv/install.sh | sh\n' +
      '  or: brew install uv'
    );
  }
  io.log('OK   uv found');

  io.log('[2/8] Verifying code-review-graph via uvx');
  const versionResult = captureCrgCommand(['--version'], { cwd: projectRoot });
  if (!versionResult) {
    throw new Error(
      'code-review-graph is not available via uvx. Verify your uv/uvx installation and network access.'
    );
  }
  const crgVersion = versionResult.stdout.trim();
  io.log(`OK   code-review-graph version: ${crgVersion || 'available'}`);

  io.log('[3/8] Building graph');
  const crgDataDir = path.join(projectRoot, CRG_DATA_DIR);
  const graphExists = fs.existsSync(crgDataDir);
  if (graphExists) {
    io.log('OK   graph data directory exists, skipping build');
  } else {
    io.log(`+ uvx ${CRG_MCP_ALIAS} build`);
    if (dryRun) {
      io.log(`[dry-run] skipped: uvx ${CRG_MCP_ALIAS} build`);
    } else {
      runCrgCommand(['build'], { cwd: projectRoot, io });
    }
  }

  io.log('[4/8] Injecting MCP config into clients');
  const targets = collectCodemapMcpTargets(rootDir, homes);
  const filtered = targets.filter((t) => t.createIfMissing || fs.existsSync(t.path));
  const injectedClients = [];
  for (const target of filtered) {
    const result = injectCrgIntoMcpJson(target.path, target.clientKey, { dryRun, io });
    if (result.status === 'error') {
      io.log(`ERR  codemap MCP inject failed for ${target.path}: ${result.reason}`);
    } else if (result.status === 'unchanged') {
      io.log(`OK   codemap MCP unchanged: ${target.path} (${target.clientKey})`);
    } else {
      io.log(`OK   codemap MCP ${result.status}: ${target.path} (${target.clientKey})`);
    }
    injectedClients.push(target.clientKey);
  }

  io.log('[5/8] Installing opencode plugin');
  const opencodeInstalled = injectedClients.includes('opencode') && (
    commandExists('opencode') ||
    fs.existsSync(path.join(os.homedir(), '.config', 'opencode'))
  );
  if (opencodeInstalled) {
    io.log(`+ uvx ${CRG_MCP_ALIAS} install --platform opencode`);
    if (dryRun) {
      io.log(`[dry-run] skipped: uvx ${CRG_MCP_ALIAS} install --platform opencode`);
    } else {
      try {
        runCrgCommand(['install', '--platform', 'opencode'], { cwd: projectRoot, io });
      } catch (error) {
        io.log(`[warn] opencode plugin install failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } else {
    io.log('SKIP opencode not detected, skipping plugin install');
  }

  io.log('[6/8] Writing state file');
  const state = {
    version: 1,
    installedAt: new Date().toISOString(),
    runtime: 'uvx',
    crgVersion: crgVersion || 'unknown',
    graphBuilt: !graphExists || fs.existsSync(crgDataDir),
    clients: injectedClients,
  };
  if (dryRun) {
    io.log(`PLAN codemap would write state to ${stateFilePath(projectRoot)}`);
  } else {
    writeState(projectRoot, state);
    io.log(`OK   codemap state written to ${stateFilePath(projectRoot)}`);
  }

  io.log('[7/8] Updating AGENTS.md');
  injectCrgIntoAgentsMd(projectRoot, { dryRun, io });

  io.log('[8/8] Syncing skills from skill-sources to client dirs');
  const skillsSourceDir = path.join(rootDir, 'skill-sources');
  if (fs.existsSync(skillsSourceDir)) {
    if (dryRun) {
      io.log(`[dry-run] skipped: syncGeneratedSkills({ rootDir })`);
    } else {
      try {
        const syncResult = await syncGeneratedSkills({ rootDir, io });
        const totals = syncResult.results.reduce((acc, r) => {
          acc.installed += r.installed;
          acc.updated += r.updated;
          acc.reused += r.reused;
          acc.removed += r.removed;
          return acc;
        }, { installed: 0, updated: 0, reused: 0, removed: 0 });
        io.log(`OK   skills synced: installed=${totals.installed} updated=${totals.updated} reused=${totals.reused} removed=${totals.removed}`);
      } catch (syncError) {
        io.log(`[warn] skill sync failed: ${syncError instanceof Error ? syncError.message : String(syncError)}`);
      }
    }
  } else {
    io.log('SKIP skill-sources/ not found, skipping skill sync');
  }

  io.log('Codemap install complete.');
  return { state, injectedClients, dryRun };
}

export async function uninstallCodemap({ rootDir, projectRoot, dryRun = false, io = console, clientHomes = null } = {}) {
  const homes = clientHomes && typeof clientHomes === 'object' ? clientHomes : getClientHomes(process.env, os.homedir());

  io.log('[1/4] Removing MCP config from clients');
  const targets = collectCodemapMcpTargets(rootDir, homes);
  for (const target of targets) {
    if (dryRun) {
      if (fs.existsSync(target.path)) {
        io.log(`PLAN codemap would remove ${CRG_MCP_ALIAS} from ${target.path}`);
      }
    } else if (fs.existsSync(target.path)) {
      removeCrgFromMcpJson(target.path, { io });
    }
  }

  io.log('[2/4] Removing AGENTS.md CRG section');
  if (dryRun) {
    io.log('PLAN codemap would remove CRG section from AGENTS.md');
  } else {
    removeCrgFromAgentsMd(projectRoot, { io });
  }

  io.log('[3/4] Removing state file');
  if (dryRun) {
    io.log(`PLAN codemap would remove state file ${stateFilePath(projectRoot)}`);
  } else {
    removeState(projectRoot);
    io.log(`OK   codemap state removed`);
  }

  io.log('[4/4] Preserving graph data');
  const crgDataDir = path.join(projectRoot, CRG_DATA_DIR);
  if (fs.existsSync(crgDataDir)) {
    io.log(`OK   ${dryRun ? 'would preserve' : 'preserved'} ${crgDataDir} (user data)`);
  } else {
    io.log('OK   graph data directory not present');
  }

  io.log('Codemap uninstall complete.');
  return { removed: true, dryRun };
}

export async function doctorCodemap({ rootDir, projectRoot, fix = false, dryRun = false, io = console, clientHomes = null } = {}) {
  const homes = clientHomes && typeof clientHomes === 'object' ? clientHomes : getClientHomes(process.env, os.homedir());

  let effectiveWarnings = 0;
  let errors = 0;

  const ok = (msg) => io.log(`OK   ${msg}`);
  const warn = (msg) => {
    effectiveWarnings += 1;
    io.log(`WARN ${msg}`);
  };
  const err = (msg) => {
    errors += 1;
    io.log(`ERR  ${msg}`);
  };

  io.log('Codemap Doctor');
  io.log(`Project: ${projectRoot}`);
  io.log('');

  io.log('[1/7] Checking uv in PATH');
  if (commandExists('uv')) {
    ok('uv found');
  } else {
    err('uv not found in PATH');
  }

  io.log('[2/7] Checking code-review-graph via uvx');
  if (commandExists('uvx')) {
    const versionResult = captureCrgCommand(['--version'], { cwd: projectRoot });
    if (versionResult) {
      ok(`code-review-graph available: ${versionResult.stdout.trim()}`);
    } else {
      err('code-review-graph --version failed');
    }
  } else {
    err('uvx not found in PATH');
  }

  io.log('[3/7] Checking graph data directory');
  const crgDataDir = path.join(projectRoot, CRG_DATA_DIR);
  if (fs.existsSync(crgDataDir)) {
    ok(`graph data directory exists: ${crgDataDir}`);
  } else {
    warn(`graph data directory missing: ${crgDataDir}`);
  }

  io.log('[4/7] Checking graph has nodes');
  const statusResult = captureCrgCommand(['status'], { cwd: projectRoot });
  if (statusResult && statusResult.stdout.trim()) {
    ok(`graph status: ${statusResult.stdout.trim().split('\n')[0]}`);
  } else {
    warn('graph status unavailable or empty');
  }

  io.log('[5/7] Checking MCP config in clients');
  const targets = collectCodemapMcpTargets(rootDir, homes);
  let foundMcp = false;
  const existingTargets = targets.filter((t) => fs.existsSync(t.path));
  for (const target of existingTargets) {
    let hasCrg = false;
    let parseError = false;
    try {
      const raw = fs.readFileSync(target.path, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed?.mcpServers?.[CRG_MCP_ALIAS]) {
        ok(`${CRG_MCP_ALIAS} found in ${target.path} (${target.clientKey})`);
        hasCrg = true;
        foundMcp = true;
      }
    } catch {
      parseError = true;
    }
    if (!hasCrg) {
      if (parseError) {
        warn(`${CRG_MCP_ALIAS} missing in ${target.path} (${target.clientKey}) — file exists but JSON is invalid`);
      } else {
        warn(`${CRG_MCP_ALIAS} missing in ${target.path} (${target.clientKey})`);
      }
    }
  }
  if (existingTargets.length === 0) {
    warn('no MCP config files found for any client');
  }

  io.log('[6/7] Checking state file');
  const state = readState(projectRoot);
  if (state && state.version === 1) {
    ok(`state file valid: ${stateFilePath(projectRoot)}`);
  } else {
    warn('state file missing or invalid');
  }

  io.log('[7/7] Checking AGENTS.md CRG section');
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  if (fs.existsSync(agentsPath)) {
    const raw = fs.readFileSync(agentsPath, 'utf8');
    if (raw.includes(AGENTS_MD_MARKERS.begin) && raw.includes(AGENTS_MD_MARKERS.end)) {
      ok('AGENTS.md CRG section present');
    } else {
      warn('AGENTS.md CRG section missing');
    }
  } else {
    warn('AGENTS.md not found');
  }

  if (fix && (errors > 0 || effectiveWarnings > 0)) {
    io.log('');
    io.log('[fix] Re-running installCodemap to heal issues...');
    try {
      await installCodemap({ rootDir, projectRoot, dryRun, io, clientHomes: homes });
      io.log('[fix] Install complete. Re-run doctor to verify.');
    } catch (error) {
      err(`fix failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  io.log('');
  io.log('Note: counts reflect pre-fix state. Re-run doctor to get fresh results.');
  if (errors > 0) io.log(`Result: FAILED (${errors} errors, ${effectiveWarnings} warnings)`);
  else io.log(`Result: OK (${effectiveWarnings} warnings)`);

  return { effectiveWarnings, errors };
}

export async function buildCodemap({ projectRoot, io = console } = {}) {
  const result = runCrgCommand(['build'], { cwd: projectRoot, io });
  const state = readState(projectRoot);
  if (state) {
    state.graphBuilt = true;
    writeState(projectRoot, state);
  }
  return result;
}

export async function updateCodemap({ projectRoot, io = console } = {}) {
  return runCrgCommand(['update'], { cwd: projectRoot, io });
}

export async function statusCodemap({ projectRoot, io = console } = {}) {
  const result = captureCrgCommand(['status'], { cwd: projectRoot });
  if (result) {
    io.log(result.stdout.trim());
  } else {
    io.log('ERR  code-review-graph status failed');
  }
  return result;
}
