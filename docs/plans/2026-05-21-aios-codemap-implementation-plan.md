# AIOS Codemap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate code-review-graph (CRG) as a first-class AIOS component (`codemap`) with deep workflow integration across install, doctor, harness, team, and skill layers.

**Architecture:** New `codemap` internal target in AIOS CLI, backed by `scripts/lib/components/codemap.mjs`. Uses `uvx` runtime. CRG MCP server injected into all client configs. Skill enhancements weave CRG into existing AIOS skills.

**Tech Stack:** Node.js (ESM), uv/uvx, code-review-graph (Python via MCP stdio)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `scripts/lib/components/codemap.mjs` | Core: install/uninstall/doctor/build/update/status |
| `scripts/install-codemap.sh` | Shell wrapper → `aios internal codemap install` |
| `scripts/doctor-codemap.sh` | Shell wrapper → `aios internal codemap doctor` |
| `.claude/skills/aios-codemap-ops/SKILL.md` | CRG reference skill |
| `.opencode/skills/aios-codemap-ops/SKILL.md` | Synced copy |
| `scripts/lib/cli/parse-args.mjs` | Add `codemap` to INTERNAL_TARGETS |
| `scripts/lib/cli/help.mjs` | Add codemap help text |
| `scripts/aios.mjs` | Add `codemap` handler in runInternal() |
| `scripts/lib/doctor/aggregate.mjs` | Add `doctor:codemap` gate |
| `scripts/lib/lifecycle/harness.mjs` | Add codemap build/update in worktree |
| `scripts/lib/lifecycle/orchestrate.mjs` | Add codemap detect-changes in team dispatch |
| `.claude/skills/search-first/SKILL.md` | Add CRG search methods |
| `.claude/skills/debug-hub/SKILL.md` | Add CRG debug tracing |
| `.claude/skills/requesting-code-review/SKILL.md` | Add CRG review tools |

---

### Task 1: Core component — `scripts/lib/components/codemap.mjs`

**Files:**
- Create: `scripts/lib/components/codemap.mjs`

- [ ] **Step 1: Create codemap.mjs with utility functions**

```javascript
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { commandExists, captureCommand, runCommand } from '../platform/process.mjs';
import { getClientHomes } from '../platform/paths.mjs';

const CRG_MCP_ALIAS = 'code-review-graph';
const STATE_FILE_NAME = 'codemap.json';
const STATE_DIR = '.aios';
const CRG_DATA_DIR = '.code-review-graph';
const AGENTS_MD_MARKERS = {
  begin: '<!-- AIOS CODEMAP BEGIN -->',
  end: '<!-- AIOS CODEMAP END -->',
};
```

- [ ] **Step 2: Add state file helpers**

```javascript
function stateFilePath(projectRoot) {
  return path.join(projectRoot, STATE_DIR, STATE_FILE_NAME);
}

function readState(projectRoot) {
  const sp = stateFilePath(projectRoot);
  if (!fs.existsSync(sp)) return null;
  try {
    return JSON.parse(fs.readFileSync(sp, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(projectRoot, state) {
  const dir = path.join(projectRoot, STATE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(stateFilePath(projectRoot), JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function removeState(projectRoot) {
  const sp = stateFilePath(projectRoot);
  if (fs.existsSync(sp)) fs.unlinkSync(sp);
}
```

- [ ] **Step 3: Add CRG command runner**

```javascript
function runCrgCommand(args, { cwd, dryRun = false, io = console } = {}) {
  if (dryRun) {
    io.log(`PLAN uvx code-review-graph ${args.join(' ')}`);
    return { status: 'dry-run' };
  }
  if (!commandExists('uvx')) {
    throw new Error('uvx not found. Install uv: https://docs.astral.sh/uv/getting-started/installation/');
  }
  return runCommand('uvx', ['code-review-graph', ...args], { cwd });
}

function captureCrgCommand(args, { cwd } = {}) {
  if (!commandExists('uvx')) return null;
  try {
    return captureCommand('uvx', ['code-review-graph', ...args], { cwd });
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Add MCP config builder + injection**

```javascript
function buildCrgMcpServerEntry(clientKey) {
  const entry = {
    command: 'uvx',
    args: ['code-review-graph', 'serve'],
  };
  if (clientKey === 'opencode') {
    entry.type = 'stdio';
    entry.env = [];
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
      io.log(`[warn] invalid JSON in ${filePath}, skipping: ${error.message}`);
      return { status: 'error', reason: 'invalid_json' };
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    parsed = {};
  }
  if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object' || Array.isArray(parsed.mcpServers)) {
    parsed.mcpServers = {};
  }
  const existing = parsed.mcpServers[CRG_MCP_ALIAS];
  const desired = buildCrgMcpServerEntry(clientKey);
  if (JSON.stringify(existing) === JSON.stringify(desired)) {
    return { status: 'unchanged' };
  }
  parsed.mcpServers[CRG_MCP_ALIAS] = desired;
  const nextRaw = JSON.stringify(parsed, null, 2) + '\n';
  if (dryRun) {
    io.log(`PLAN inject CRG MCP into ${filePath}`);
    return { status: 'planned' };
  }
  if (exists) {
    fs.writeFileSync(filePath + '.bak', raw, 'utf8');
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, nextRaw, 'utf8');
  return { status: exists ? 'updated' : 'created' };
}

function removeCrgFromMcpJson(filePath, { io = console } = {}) {
  if (!fs.existsSync(filePath)) return { status: 'missing' };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return { status: 'error', reason: 'invalid_json' };
  }
  if (!parsed?.mcpServers?.[CRG_MCP_ALIAS]) return { status: 'unchanged' };
  delete parsed.mcpServers[CRG_MCP_ALIAS];
  fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
  io.log(`  removed ${CRG_MCP_ALIAS} from ${filePath}`);
  return { status: 'removed' };
}
```

- [ ] **Step 5: Add AGENTS.md marker-based injection**

```javascript
const AGENTS_MD_CRG_SECTION = `## Code Review Graph (CRG)

This project has a structural knowledge graph. **Use it at each decision point in your workflow.**

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
- Follow \`next_tool_suggestions\` from each response for the next tool to call
`;

function injectCrgIntoAgentsMd(projectRoot, { dryRun = false, io = console } = {}) {
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) {
    io.log('[warn] AGENTS.md not found, skipping CRG section injection');
    return { status: 'skipped' };
  }
  let content = fs.readFileSync(agentsPath, 'utf8');
  const beginIdx = content.indexOf(AGENTS_MD_MARKERS.begin);
  const endIdx = content.indexOf(AGENTS_MD_MARKERS.end);
  if (beginIdx !== -1 && endIdx !== -1) {
    const existingSection = content.slice(beginIdx, endIdx + AGENTS_MD_MARKERS.end.length);
    const desiredSection = AGENTS_MD_MARKERS.begin + '\n' + AGENTS_MD_CRG_SECTION + '\n' + AGENTS_MD_MARKERS.end;
    if (existingSection === desiredSection) return { status: 'unchanged' };
    content = content.slice(0, beginIdx) + desiredSection + content.slice(endIdx + AGENTS_MD_MARKERS.end.length);
  } else {
    content = content.trimEnd() + '\n\n' + AGENTS_MD_MARKERS.begin + '\n' + AGENTS_MD_CRG_SECTION + '\n' + AGENTS_MD_MARKERS.end + '\n';
  }
  if (dryRun) {
    io.log('PLAN inject CRG section into AGENTS.md');
    return { status: 'planned' };
  }
  fs.writeFileSync(agentsPath, content, 'utf8');
  io.log('  updated AGENTS.md with CRG section');
  return { status: 'updated' };
}

function removeCrgFromAgentsMd(projectRoot, { io = console } = {}) {
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) return { status: 'missing' };
  let content = fs.readFileSync(agentsPath, 'utf8');
  const beginIdx = content.indexOf(AGENTS_MD_MARKERS.begin);
  const endIdx = content.indexOf(AGENTS_MD_MARKERS.end);
  if (beginIdx === -1 || endIdx === -1) return { status: 'unchanged' };
  content = content.slice(0, beginIdx) + content.slice(endIdx + AGENTS_MD_MARKERS.end.length);
  content = content.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  fs.writeFileSync(agentsPath, content, 'utf8');
  io.log('  removed CRG section from AGENTS.md');
  return { status: 'removed' };
}
```

- [ ] **Step 6: Add collectClientMcpTargets (reuse browser.mjs pattern)**

```javascript
function resolveUserPath(home) {
  if (!home) return null;
  const expanded = home.startsWith('~') ? path.join(os.homedir(), home.slice(1)) : home;
  return path.resolve(expanded);
}

function collectCodemapMcpTargets(rootDir, clientHomes = null) {
  const homes = clientHomes || getClientHomes(process.env, os.homedir());
  const targets = [];
  const seen = new Set();

  const projectMcp = path.join(rootDir, '.mcp.json');
  if (!seen.has(projectMcp)) {
    seen.add(projectMcp);
    targets.push({ path: projectMcp, clientKey: 'opencode', createIfMissing: true });
  }

  for (const [key, home] of Object.entries(homes)) {
    const resolvedHome = resolveUserPath(home);
    if (!resolvedHome) continue;
    let mcpPath;
    if (key === 'codex') mcpPath = path.join(resolvedHome, 'mcp.json');
    else if (key === 'claude') mcpPath = path.join(resolvedHome, '.claude.json');
    else if (key === 'gemini') mcpPath = path.join(resolvedHome, 'settings.json');
    else continue;
    const abs = path.resolve(mcpPath);
    if (seen.has(abs)) continue;
    seen.add(abs);
    targets.push({ path: abs, clientKey: key, createIfMissing: false });
  }

  return targets;
}
```

- [ ] **Step 7: Add installCodemap**

```javascript
export async function installCodemap({ rootDir, projectRoot, dryRun = false, io = console, clientHomes = null } = {}) {
  const existing = readState(projectRoot);

  // Step 1: prerequisite check
  if (!commandExists('uv')) {
    throw new Error(
      'uv is required but not found.\n' +
      'Install: brew install uv (macOS) or https://docs.astral.sh/uv/getting-started/installation/'
    );
  }
  io.log('OK   uv found');

  // Step 2: verify CRG available via uvx
  const versionResult = captureCrgCommand(['--version'], { cwd: projectRoot });
  if (!versionResult || versionResult.status !== 0) {
    throw new Error(
      'code-review-graph not available via uvx.\n' +
      'Try: uv cache clean && uvx code-review-graph --version'
    );
  }
  const crgVersion = (versionResult.stdout || '').trim();
  io.log(`OK   code-review-graph ${crgVersion}`);

  // Step 3: build initial graph (skip if already built and idempotent)
  const graphDir = path.join(projectRoot, CRG_DATA_DIR);
  if (!existing?.graphBuilt || !fs.existsSync(graphDir)) {
    io.log('+ uvx code-review-graph build');
    if (!dryRun) {
      runCrgCommand(['build'], { cwd: projectRoot, io });
    }
    io.log('OK   graph built');
  } else {
    io.log('OK   graph already built (skip)');
  }

  // Step 4: inject MCP config for all clients
  const targets = collectCodemapMcpTargets(rootDir, clientHomes);
  let configured = 0;
  for (const target of targets) {
    if (!target.createIfMissing && !fs.existsSync(target.path)) continue;
    const result = injectCrgIntoMcpJson(target.path, target.clientKey, { dryRun, io });
    if (result.status === 'created' || result.status === 'updated' || result.status === 'planned') {
      configured += 1;
      io.log(`OK   CRG MCP ${result.status} in ${target.path}`);
    }
  }
  io.log(`OK   CRG MCP configured in ${configured} client(s)`);

  // Step 5: install opencode plugin
  if (commandExists('opencode') || fs.existsSync(path.join(os.homedir(), '.config', 'opencode'))) {
    io.log('+ uvx code-review-graph install --platform opencode');
    if (!dryRun) {
      runCrgCommand(['install', '--platform', 'opencode'], { cwd: projectRoot, io });
    }
    io.log('OK   opencode plugin installed');
  }

  // Step 6: write state file
  const configuredClients = targets
    .filter((t) => fs.existsSync(t.path))
    .map((t) => t.clientKey);
  writeState(projectRoot, {
    version: 1,
    installedAt: new Date().toISOString(),
    runtime: 'uvx',
    crgVersion,
    graphBuilt: true,
    clients: configuredClients,
  });
  io.log('OK   state written to .aios/codemap.json');

  // Step 7: update AGENTS.md
  const agentsResult = injectCrgIntoAgentsMd(projectRoot, { dryRun, io });
  io.log(`OK   AGENTS.md ${agentsResult.status}`);

  io.log('');
  io.log('Codemap install complete.');
  return { crgVersion, configured, agentsResult };
}
```

- [ ] **Step 8: Add uninstallCodemap, doctorCodemap, buildCodemap, updateCodemap, statusCodemap**

```javascript
export async function uninstallCodemap({ rootDir, projectRoot, io = console, clientHomes = null } = {}) {
  const targets = collectCodemapMcpTargets(rootDir, clientHomes);
  for (const target of targets) {
    removeCrgFromMcpJson(target.path, { io });
  }

  const pluginPath = path.join(os.homedir(), '.config', 'opencode', 'plugins', 'crg-plugin.ts');
  if (fs.existsSync(pluginPath)) {
    fs.unlinkSync(pluginPath);
    io.log('  removed opencode plugin');
  }

  removeState(projectRoot);
  io.log('  removed .aios/codemap.json');

  removeCrgFromAgentsMd(projectRoot, { io });

  io.log('');
  io.log('Codemap uninstall complete. Graph data preserved in .code-review-graph/');
}

export async function doctorCodemap({ rootDir, projectRoot, fix = false, dryRun = false, io = console, clientHomes = null } = {}) {
  let warnings = 0;
  let errors = 0;

  // uv check
  if (!commandExists('uv')) {
    io.log('[warn] uv not found in PATH');
    warnings += 1;
  } else {
    io.log('[ok]   uv available');
  }

  // uvx CRG check
  const versionResult = captureCrgCommand(['--version'], { cwd: projectRoot });
  if (!versionResult || versionResult.status !== 0) {
    io.log('[warn] code-review-graph not available via uvx');
    warnings += 1;
  } else {
    io.log(`[ok]   code-review-graph ${(versionResult.stdout || '').trim()}`);
  }

  // graph directory
  const graphDir = path.join(projectRoot, CRG_DATA_DIR);
  if (!fs.existsSync(graphDir)) {
    io.log('[warn] .code-review-graph/ not found — graph not built');
    warnings += 1;
  } else {
    const statusResult = captureCrgCommand(['status'], { cwd: projectRoot });
    if (statusResult && statusResult.status === 0) {
      const output = (statusResult.stdout || '').trim();
      const nodeMatch = output.match(/Total nodes:\s*(\d+)/);
      const nodeCount = nodeMatch ? Number.parseInt(nodeMatch[1], 10) : 0;
      if (nodeCount === 0) {
        io.log('[warn] graph has 0 nodes — may need rebuild');
        warnings += 1;
      } else {
        io.log(`[ok]   graph has ${nodeCount} nodes`);
      }
    } else {
      io.log('[warn] could not read graph status');
      warnings += 1;
    }
  }

  // MCP config
  const targets = collectCodemapMcpTargets(rootDir, clientHomes);
  let mcpFound = false;
  for (const target of targets) {
    if (!fs.existsSync(target.path)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(target.path, 'utf8'));
      if (parsed?.mcpServers?.[CRG_MCP_ALIAS]) {
        mcpFound = true;
        io.log(`[ok]   CRG MCP in ${target.path}`);
      }
    } catch { /* skip invalid */ }
  }
  if (!mcpFound) {
    io.log('[warn] CRG MCP not found in any client config');
    warnings += 1;
  }

  // state file
  const state = readState(projectRoot);
  if (!state) {
    io.log('[warn] .aios/codemap.json not found');
    warnings += 1;
  } else {
    io.log('[ok]   .aios/codemap.json present');
  }

  // AGENTS.md section
  const agentsPath = path.join(projectRoot, 'AGENTS.md');
  if (fs.existsSync(agentsPath)) {
    const content = fs.readFileSync(agentsPath, 'utf8');
    if (content.includes(AGENTS_MD_MARKERS.begin)) {
      io.log('[ok]   AGENTS.md CRG section present');
    } else {
      io.log('[warn] AGENTS.md CRG section missing');
      warnings += 1;
    }
  }

  if (fix && (warnings > 0 || errors > 0)) {
    io.log('');
    io.log('Running fix...');
    await installCodemap({ rootDir, projectRoot, dryRun, io, clientHomes });
  }

  return { effectiveWarnings: warnings, errors };
}

export async function buildCodemap({ projectRoot, io = console } = {}) {
  runCrgCommand(['build'], { cwd: projectRoot, io });
  io.log('OK   graph rebuilt');
  const state = readState(projectRoot);
  if (state) {
    state.graphBuilt = true;
    writeState(projectRoot, state);
  }
}

export async function updateCodemap({ projectRoot, io = console } = {}) {
  runCrgCommand(['update'], { cwd: projectRoot, io });
  io.log('OK   graph updated');
}

export async function statusCodemap({ projectRoot, io = console } = {}) {
  const state = readState(projectRoot);
  if (!state) {
    io.log('Codemap not installed. Run: aios internal codemap install');
    return;
  }
  io.log(`Codemap: installed ${state.installedAt}`);
  io.log(`  runtime: ${state.runtime}`);
  io.log(`  CRG version: ${state.crgVersion}`);
  io.log(`  graph built: ${state.graphBuilt}`);
  io.log(`  clients: ${state.clients?.join(', ') || 'none'}`);
  io.log('');
  runCrgCommand(['status'], { cwd: projectRoot, io });
}
```

- [ ] **Step 9: Commit**

```bash
git add scripts/lib/components/codemap.mjs
git commit -m "feat(codemap): add core codemap component with install/uninstall/doctor/build/update/status"
```

---

### Task 2: CLI registration — parse-args, help, aios.mjs

**Files:**
- Modify: `scripts/lib/cli/parse-args.mjs:37`
- Modify: `scripts/lib/cli/help.mjs`
- Modify: `scripts/aios.mjs`

- [ ] **Step 1: Add `codemap` to INTERNAL_TARGETS**

In `scripts/lib/cli/parse-args.mjs`, line 37:

```javascript
const INTERNAL_TARGETS = new Set(['shell', 'skills', 'native', 'superpowers', 'browser', 'privacy', 'offload', 'codemap']);
```

- [ ] **Step 2: Add codemap help text in help.mjs**

Add to `getRootHelpText()` examples section:

```
  node scripts/aios.mjs internal codemap install
  node scripts/aios.mjs internal codemap doctor --fix
  node scripts/aios.mjs internal codemap build
  node scripts/aios.mjs internal codemap status
```

Add a new `getCodemapHelpText()` function:

```javascript
export function getCodemapHelpText() {
  return `AIOS Codemap — code-review-graph integration

Usage:
  node scripts/aios.mjs internal codemap <action> [options]

Actions:
  install    Install code-review-graph: uvx check, graph build, MCP inject, AGENTS.md update
  uninstall  Remove CRG configs, plugin, state (preserves .code-review-graph/)
  doctor     Health check for codemap installation
  build      Full graph rebuild from scratch
  update     Incremental graph update (changed files only, <2s)
  status     Show codemap state and graph statistics

Options:
  --fix      (doctor) auto-fix issues found
  --dry-run  Preview changes without writing

Examples:
  node scripts/aios.mjs internal codemap install
  node scripts/aios.mjs internal codemap doctor --fix
  node scripts/aios.mjs internal codemap build
  node scripts/aios.mjs internal codemap update
`;
}
```

Update `getInternalHelpText()` to route `codemap` target to `getCodemapHelpText()`.

- [ ] **Step 3: Add codemap handler in aios.mjs runInternal()**

In `scripts/aios.mjs`, after the `privacy` block (around line 130), add:

```javascript
  if (target === 'codemap') {
    const module = await import('./lib/components/codemap.mjs');
    if (action === 'install') return module.installCodemap({ rootDir, projectRoot, dryRun: Boolean(options.dryRun), io: console });
    if (action === 'uninstall') return module.uninstallCodemap({ rootDir, projectRoot, io: console });
    if (action === 'doctor') return module.doctorCodemap({ rootDir, projectRoot, fix: Boolean(options.fix), dryRun: Boolean(options.dryRun), io: console });
    if (action === 'build') return module.buildCodemap({ projectRoot, io: console });
    if (action === 'update') return module.updateCodemap({ projectRoot, io: console });
    if (action === 'status') return module.statusCodemap({ projectRoot, io: console });
  }
```

- [ ] **Step 4: Add `--dry-run` and `--fix` support for codemap in parseInternalArgs**

In `scripts/lib/cli/parse-args.mjs`, in the `parseInternalArgs` switch block, add cases for `--dry-run` and `--fix` when target is `codemap`:

```javascript
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--fix':
        if (target === 'codemap' || target === 'native') {
          options.fix = true;
        } else {
          throw new Error(`Unknown option: ${arg}`);
        }
        break;
```

Note: `--dry-run` may already be handled generically in the switch. Check existing code before adding — if `--dry-run` is already a global option for internal targets, just ensure `options.dryRun` is passed through.

- [ ] **Step 5: Verify with dry-run**

```bash
node scripts/aios.mjs internal codemap install --dry-run
node scripts/aios.mjs internal codemap status
```

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/cli/parse-args.mjs scripts/lib/cli/help.mjs scripts/aios.mjs
git commit -m "feat(codemap): register codemap as AIOS internal target with CLI support"
```

---

### Task 3: Shell wrapper scripts

**Files:**
- Create: `scripts/install-codemap.sh`
- Create: `scripts/doctor-codemap.sh`

- [ ] **Step 1: Create install-codemap.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/aios.sh" internal codemap install "$@"
```

- [ ] **Step 2: Create doctor-codemap.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/aios.sh" internal codemap doctor "$@"
```

- [ ] **Step 3: Make executable**

```bash
chmod +x scripts/install-codemap.sh scripts/doctor-codemap.sh
```

- [ ] **Step 4: Commit**

```bash
git add scripts/install-codemap.sh scripts/doctor-codemap.sh
git commit -m "feat(codemap): add shell wrapper scripts"
```

---

### Task 4: Doctor suite integration

**Files:**
- Modify: `scripts/lib/doctor/aggregate.mjs`

- [ ] **Step 1: Import doctorCodemap**

At the top of `aggregate.mjs`, add:

```javascript
import { doctorCodemap } from '../components/codemap.mjs';
```

- [ ] **Step 2: Add doctor:codemap gate**

After the `doctor-browser-mcp` block (around line 283), add:

```javascript
  io.log('');
  io.log('== doctor-codemap ==');
  if (isHarnessGateEnabled('doctor:codemap', { profile, disabledGates, profiles: ['standard', 'strict'] })) {
    const codemapResult = await doctorCodemap({ rootDir, projectRoot, fix, dryRun, io });
    addDoctorCheck(checks, {
      id: 'doctor:codemap',
      item: 'Code review graph (CRG) installation and graph health',
      status: codemapResult.errors > 0 ? 'error' : (codemapResult.effectiveWarnings > 0 ? 'warn' : 'ok'),
      fix: 'Run: node scripts/aios.mjs internal codemap doctor --fix',
      note: `errors=${codemapResult.errors}; effectiveWarnings=${codemapResult.effectiveWarnings}`,
    });
    if (codemapResult.errors > 0) {
      effectiveWarns += 1;
    } else {
      effectiveWarns += codemapResult.effectiveWarnings;
    }
  } else {
    logSkippedGate(io, 'doctor:codemap', profile);
    addDoctorCheck(checks, {
      id: 'doctor:codemap',
      item: 'Code review graph (CRG) installation and graph health',
      status: 'skip',
      fix: 'Enable gate or run doctor with --profile standard/strict.',
      note: `disabled for profile=${profile}`,
    });
  }
```

- [ ] **Step 3: Verify**

```bash
node scripts/aios.mjs doctor
```

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/doctor/aggregate.mjs
git commit -m "feat(codemap): add codemap doctor gate to AIOS doctor suite"
```

---

### Task 5: Harness integration

**Files:**
- Modify: `scripts/lib/lifecycle/harness.mjs`

- [ ] **Step 1: Add codemap build in worktree preparation**

Find the section after `prepareSoloWorktree()` is called (search for `prepareSoloWorktree`). After the worktree is prepared, add:

```javascript
    // Codemap: build graph in worktree if source repo has codemap installed
    const codemapStatePath = path.join(projectRoot, '.aios', 'codemap.json');
    if (fs.existsSync(codemapStatePath)) {
      try {
        io.log('+ codemap: building graph in worktree');
        const { buildCodemap } = await import('../components/codemap.mjs');
        await buildCodemap({ projectRoot: worktreePath, io });
      } catch (codemapError) {
        io.log(`[warn] codemap build in worktree failed: ${codemapError.message}`);
      }
    }
```

Note: `projectRoot` here is the source repo root, `worktreePath` is the worktree path. Adjust variable names to match the actual harness code context.

- [ ] **Step 2: Commit**

```bash
git add scripts/lib/lifecycle/harness.mjs
git commit -m "feat(codemap): auto-build graph in harness worktree when codemap is active"
```

---

### Task 6: Team dispatch integration

**Files:**
- Modify: `scripts/lib/lifecycle/orchestrate.mjs`

- [ ] **Step 1: Add codemap detect-changes in dispatch context**

Find the section where the dispatch plan/context is assembled for workers. Add a codemap analysis block:

```javascript
  // Codemap: include change impact analysis if available
  let codemapAnalysis = null;
  const codemapStatePath = path.join(workspaceRoot, '.aios', 'codemap.json');
  if (fs.existsSync(codemapStatePath)) {
    try {
      const { captureCrgCommand } = await import('../components/codemap.mjs');
      const result = captureCrgCommand(['detect-changes', '--brief'], { cwd: workspaceRoot });
      if (result && result.status === 0 && result.stdout) {
        codemapAnalysis = result.stdout.trim();
      }
    } catch { /* non-fatal */ }
  }
```

Then include `codemapAnalysis` in the dispatch context string that gets sent to workers.

Note: The `captureCrgCommand` function needs to be exported from `codemap.mjs` — add it to the export list if not already there.

- [ ] **Step 2: Commit**

```bash
git add scripts/lib/lifecycle/orchestrate.mjs
git commit -m "feat(codemap): include CRG change analysis in team dispatch context"
```

---

### Task 7: Reference skill — `aios-codemap-ops`

**Files:**
- Create: `.claude/skills/aios-codemap-ops/SKILL.md`
- Create: `.opencode/skills/aios-codemap-ops/SKILL.md`

- [ ] **Step 1: Create .claude/skills/aios-codemap-ops/SKILL.md**

```markdown
---
name: aios-codemap-ops
description: >
  Quick reference for code-review-graph (CRG) MCP tools. Use when you need
  to look up a CRG tool name, parameter, or pattern. For workflow guidance,
  see AGENTS.md decision checkpoints. Requires `aios internal codemap install`.
---

## CRG Tool Quick Reference

### query_graph patterns

| Pattern | Returns |
|---------|---------|
| `callers_of` | Functions that call the target |
| `callees_of` | Functions called by the target |
| `imports_of` | Imports from a file/module |
| `importers_of` | Files that import a file/module |
| `children_of` | Nodes contained in a file/class |
| `tests_for` | Tests covering the target |
| `inheritors_of` | Classes inheriting from target |
| `file_summary` | All nodes in a file |

### refactor_tool modes

| Mode | Action |
|------|--------|
| `rename` | Preview rename across all locations |
| `dead_code` | Find unreferenced symbols |
| `suggest` | Community-driven refactoring suggestions |

### Confidence tiers

| Tier | Meaning |
|------|---------|
| `EXTRACTED` | Certain — directly parsed from code |
| `INFERRED` | Likely — deduced from patterns |
| `AMBIGUOUS` | Guess — low confidence |

### detail_level

- **minimal** (default): summary + counts + key entity names
- **standard**: full output with node/edge details

Always start with `minimal`. Escalate to `standard` only when insufficient.

### Key tool parameters

| Tool | Key params |
|------|-----------|
| `get_minimal_context` | `task` (required) |
| `detect_changes` | `base`, `detail_level`, `changed_files` |
| `get_impact_radius` | `changed_files`, `max_depth`, `detail_level` |
| `get_review_context` | `base`, `detail_level`, `include_source` |
| `get_affected_flows` | `changed_files`, `base` |
| `semantic_search_nodes` | `query`, `kind`, `limit` |
| `query_graph` | `pattern`, `target`, `detail_level` |
| `traverse_graph` | `query`, `mode` (bfs/dfs), `depth`, `token_budget` |
| `find_large_functions` | `min_lines`, `kind`, `file_path_pattern` |
| `get_architecture_overview` | (none) |
| `get_hub_nodes` | `top_n` |
| `get_bridge_nodes` | `top_n` |
| `get_knowledge_gaps` | (none) |
| `get_surprising_connections` | `top_n` |
| `get_suggested_questions` | (none) |
```

- [ ] **Step 2: Copy to .opencode/skills/aios-codemap-ops/SKILL.md**

```bash
mkdir -p .opencode/skills/aios-codemap-ops
cp .claude/skills/aios-codemap-ops/SKILL.md .opencode/skills/aios-codemap-ops/SKILL.md
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/aios-codemap-ops/SKILL.md .opencode/skills/aios-codemap-ops/SKILL.md
git commit -m "feat(codemap): add aios-codemap-ops reference skill"
```

---

### Task 8: Skill enhancements — weave CRG into existing skills

**Files:**
- Modify: `.claude/skills/search-first/SKILL.md`
- Modify: `.claude/skills/debug-hub/SKILL.md`
- Modify: `.claude/skills/requesting-code-review/SKILL.md`

- [ ] **Step 1: Enhance search-first skill**

Read the current `.claude/skills/search-first/SKILL.md`. Add a CRG section after the existing "Search locally" step:

```markdown
### CRG (if codemap installed)

If this project has `aios internal codemap install` configured:

1. `semantic_search_nodes(query="<keyword>")` — find functions/classes by name or meaning
2. `query_graph(pattern="callers_of"|"callees_of"|"tests_for", target="<name>")` — trace structural relationships
3. Only fall back to grep/rg when the graph doesn't cover what you need

These tools return structural context (callers, dependents, test coverage) that text search cannot provide.
```

- [ ] **Step 2: Enhance debug-hub skill**

Read the current `.claude/skills/debug-hub/SKILL.md`. Add a CRG section:

```markdown
### CRG (if codemap installed)

Use code-review-graph tools for evidence collection:

1. `semantic_search_nodes(query="<error-related term>")` — find related functions
2. `query_graph(pattern="callees_of", target="<suspected function>")` — trace call chain
3. `get_flow(name="<flow name>")` — see full execution path
4. `detect_changes(base="HEAD~5")` — check if recent changes caused the issue
```

- [ ] **Step 3: Enhance requesting-code-review skill**

Read the current `.claude/skills/requesting-code-review/SKILL.md`. Add a CRG section:

```markdown
### CRG (if codemap installed)

Use code-review-graph tools for structural review:

1. `detect_changes(base="main", detail_level="minimal")` — risk-scored change analysis
2. `get_affected_flows(base="main")` — which execution paths are impacted
3. `get_impact_radius(base="main", detail_level="minimal")` — blast radius
4. `query_graph(pattern="tests_for", target="<changed function>")` — test coverage gaps
5. `get_review_context(base="main", detail_level="minimal")` — focused source snippets

These replace reading entire files with targeted structural analysis.
```

- [ ] **Step 4: Sync to .opencode/skills/**

```bash
cp .claude/skills/search-first/SKILL.md .opencode/skills/search-first/SKILL.md
cp .claude/skills/debug-hub/SKILL.md .opencode/skills/debug-hub/SKILL.md
```

Note: `requesting-code-review` may not exist in `.opencode/skills/` — check and copy if the directory exists.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/search-first/SKILL.md .claude/skills/debug-hub/SKILL.md .claude/skills/requesting-code-review/SKILL.md .opencode/skills/search-first/SKILL.md .opencode/skills/debug-hub/SKILL.md
git commit -m "feat(codemap): weave CRG into search-first, debug-hub, and requesting-code-review skills"
```

---

### Task 9: Integration test — full install dry-run

**Files:**
- None (verification only)

- [ ] **Step 1: Run install dry-run**

```bash
node scripts/aios.mjs internal codemap install --dry-run
```

Expected: prints all planned actions without making changes.

- [ ] **Step 2: Run actual install**

```bash
node scripts/aios.mjs internal codemap install
```

Expected: uv check passes, CRG builds graph, MCP configs written, AGENTS.md updated.

- [ ] **Step 3: Verify MCP config**

```bash
cat .mcp.json
```

Expected: `code-review-graph` entry present.

- [ ] **Step 4: Verify doctor**

```bash
node scripts/aios.mjs internal codemap doctor
```

Expected: all checks pass or show warnings with fix instructions.

- [ ] **Step 5: Verify status**

```bash
node scripts/aios.mjs internal codemap status
```

Expected: shows CRG version, graph stats, configured clients.

- [ ] **Step 6: Verify uninstall (dry)**

```bash
node scripts/aios.mjs internal codemap uninstall
```

Expected: removes configs but preserves `.code-review-graph/`.

- [ ] **Step 7: Reinstall**

```bash
node scripts/aios.mjs internal codemap install
```

- [ ] **Step 8: Run full AIOS doctor**

```bash
node scripts/aios.mjs doctor
```

Expected: `doctor:codemap` gate appears in output.

- [ ] **Step 9: Commit any fixes**

If any issues were found and fixed during testing, commit the fixes.

---

### Task 10: Update help text and finalize

**Files:**
- Modify: `scripts/lib/cli/help.mjs` (root help text)

- [ ] **Step 1: Add codemap to root help examples**

Ensure `getRootHelpText()` includes:

```
  node scripts/aios.mjs internal codemap install
  node scripts/aios.mjs internal codemap doctor --fix
```

- [ ] **Step 2: Final verification**

```bash
node scripts/aios.mjs --help
node scripts/aios.mjs internal codemap --help
```

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/cli/help.mjs
git commit -m "feat(codemap): add codemap to root help text"
```

---

## Spec Coverage Check

| Design requirement | Task |
|---|---|
| uvx runtime | Task 1 (runCrgCommand) |
| Install pipeline (7 steps) | Task 1 (installCodemap) |
| MCP config injection (4 clients) | Task 1 (injectCrgIntoMcpJson) |
| OpenCode plugin install | Task 1 (Step 5) |
| AGENTS.md marker-based injection | Task 1 (injectCrgIntoAgentsMd) |
| .aios/codemap.json state | Task 1 (readState/writeState) |
| CLI registration | Task 2 |
| Shell wrappers | Task 3 |
| Doctor gate | Task 4 |
| Harness worktree build | Task 5 |
| Team dispatch context | Task 6 |
| Reference skill | Task 7 |
| Skill enhancements (3 skills) | Task 8 |
| Integration test | Task 9 |
| Help text | Task 10 |
| Uninstall (preserve graph) | Task 1 (uninstallCodemap) |
| MCP config backup before modify | Task 1 (.bak in injectCrgIntoMcpJson) |
| AGENTS.md marker-based removal | Task 1 (removeCrgFromAgentsMd) |
| Security: no source file deletion | All tasks (no rm -rf of source) |

## Placeholder Scan

No TBD, TODO, or placeholder patterns found.

## Type Consistency

- `installCodemap`, `uninstallCodemap`, `doctorCodemap`, `buildCodemap`, `updateCodemap`, `statusCodemap` — consistent naming across Task 1 and Task 2
- `CRG_MCP_ALIAS` = `'code-review-graph'` — used consistently in inject/remove
- `captureCrgCommand` — needs to be exported from codemap.mjs for Task 6
