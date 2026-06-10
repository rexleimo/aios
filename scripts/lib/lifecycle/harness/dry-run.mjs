import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveContextDbRoot } from '../../aios/state-root.mjs';
import { checkSoloHarnessProfileReadiness } from '../../harness/solo-profiles.mjs';
import { resolveClientSkillRoots } from '../../clients/registry.mjs';
import { CLIENT_MCP_TARGETS } from '../../clients/core/definitions.mjs';

const SKILL_DIRS = resolveClientSkillRoots('all');

// Project-scope MCP config files across all clients, derived from the single
// source of truth in CLIENT_MCP_TARGETS (no hard-coded per-client path list).
const PROJECT_MCP_CONFIG_FILES = [...new Set(
  Object.values(CLIENT_MCP_TARGETS)
    .flatMap((target) => target.scopes)
    .filter((entry) => entry.scope === 'project')
    .map((entry) => entry.file)
)];

export async function runHarnessDryRunChecks({ rootDir, provider, sessionId, objective, worktree = false }) {
  const results = [];

  function add(ok, label, detail = '') {
    results.push({ ok, label, detail });
  }

  // 1. provider CLI on PATH
  const profileCheck = await checkSoloHarnessProfileReadiness({ provider });
  add(profileCheck.ok,
    `Provider CLI (${provider})`,
    profileCheck.ok ? 'found on PATH' : profileCheck.reason);

  // 2. skills directories
  let skillCount = 0;
  for (const dir of SKILL_DIRS) {
    try {
      const p = path.join(rootDir, dir);
      const entries = await fs.readdir(p);
      skillCount += entries.filter(e => !e.startsWith('.')).length;
    } catch { /* dir doesn't exist */ }
  }
  add(skillCount > 0,
    'Skills indexed',
    skillCount > 0 ? `${skillCount} skills found across ${SKILL_DIRS.join(', ')}` : 'no skill directories found');

  // 3. workspace config
  const settingsPath = path.join(rootDir, 'config', 'settings.json');
  let configOk = false;
  try {
    await fs.access(settingsPath);
    configOk = true;
  } catch { /* missing */ }
  add(configOk,
    'Workspace config',
    configOk ? 'config/settings.json present' : 'config/settings.json missing (defaults will be used)');

  // 4. ContextDB sessions
  const dbRoot = resolveContextDbRoot(rootDir, { preferLegacyExisting: true });
  let sessionCount = 0;
  try {
    const sessionsDir = path.join(dbRoot, 'sessions');
    const entries = await fs.readdir(sessionsDir);
    sessionCount = entries.length;
  } catch { /* no sessions yet */ }
  add(true,
    'ContextDB',
    sessionCount > 0 ? `${sessionCount} prior session(s) found` : 'no prior sessions — fresh start');

  // 5. MCP config (project-scope files across all supported clients)
  let mcpConfigs = 0;
  for (const pattern of PROJECT_MCP_CONFIG_FILES) {
    try {
      await fs.access(path.join(rootDir, pattern));
      mcpConfigs++;
    } catch { /* doesn't exist */ }
  }
  add(mcpConfigs > 0,
    'MCP servers',
    mcpConfigs > 0 ? `${mcpConfigs} MCP config(s) found` : 'no MCP config found — browser tools unavailable');

  // 6. plan artifact (for team/harness)
  let planFound = false;
  try {
    const planDir = path.join(rootDir, 'docs', 'plans');
    const entries = await fs.readdir(planDir);
    planFound = entries.some(e => e.endsWith('.md'));
  } catch { /* no plans dir */ }
  add(planFound,
    'Plan artifact',
    planFound ? 'plan files found in docs/plans/' : 'no plan found — required for team mode, optional for solo');

  // 7. worktree readiness
  let gitReady = false;
  try {
    const gitHead = await fs.readFile(path.join(rootDir, '.git', 'HEAD'), 'utf8');
    gitReady = gitHead.trim().length > 0;
  } catch { /* not a git repo */ }
  add(gitReady,
    'Git repository',
    gitReady ? 'git repo detected' : 'not a git repo — worktree isolation unavailable');

  // 8. worktree ContextDB (gitignored .aios/ won't exist in isolated worktree)
  if (worktree && gitReady) {
    let gitignoreBlocksContextDb = false;
    try {
      const gitignore = await fs.readFile(path.join(rootDir, '.gitignore'), 'utf8');
      const patterns = gitignore.split('\n').map(l => l.trim()).filter(Boolean);
      gitignoreBlocksContextDb = patterns.some(p => p.includes('.aios') || p.includes('context-db'));
    } catch { /* no gitignore */ }
    add(!gitignoreBlocksContextDb,
      'Worktree ContextDB',
      gitignoreBlocksContextDb
        ? '.aios/ is gitignored — ContextDB will be unavailable in worktree'
        : '.aios/ is tracked — ContextDB available in worktree');
  }

  const blocked = results.filter(r => !r.ok && r.label.startsWith('Provider CLI'));
  const warnings = results.filter(r => !r.ok && !r.label.startsWith('Provider CLI'));

  const verdict = blocked.length > 0 ? 'blocked'
    : warnings.length > 0 ? 'warning'
    : 'ready';

  const nextActions = [];
  if (verdict === 'blocked') {
    nextActions.push(`Install or configure the ${provider} CLI on PATH`);
  }
  if (verdict === 'warning' || nextActions.length === 0) {
    for (const w of warnings) {
      if (w.label === 'Skills indexed') nextActions.push('Run aios workspace-init to populate skill index');
      if (w.label === 'Workspace config') nextActions.push('Create config/settings.json or run aios init');
      if (w.label === 'MCP servers') nextActions.push(`Add a project MCP config for the target client (e.g. ${PROJECT_MCP_CONFIG_FILES.join(', ')}) for browser+tool support`);
      if (w.label === 'Plan artifact') nextActions.push('Create docs/plans/<date>-<topic>.md for team mode readiness');
      if (w.label === 'Git repository') nextActions.push('Initialize git repo for worktree isolation support');
      if (w.label === 'Worktree ContextDB') nextActions.push('Remove .aios/ from .gitignore or run without --worktree for ContextDB access');
    }
  }
  if (nextActions.length === 0) {
    nextActions.push('All checks passed — ready to run: node scripts/aios.mjs harness run --objective "..."');
  }

  return { verdict, results, nextActions, sessionId, provider, objective };
}
