/* 中文注释：harness 参数解析，基于 Commander 声明式 */
import { Command } from 'commander';
import {
  createDefaultHarnessDashboardOptions,
  createDefaultHarnessResumeOptions,
  createDefaultHarnessRunOptions,
  createDefaultHarnessStatusOptions,
  createDefaultHarnessStopOptions,
  HARNESS_SUBCOMMANDS,
  normalizeBaseRef,
  normalizeHarnessProfile,
  normalizeSoloHarnessProvider,
  parsePositiveInteger,
} from './shared.mjs';

// 中文注释：turn 超时校验与 execute-turn 的 clamp 边界保持一致（1s - 6h），避免静默改值。
function parseTurnTimeoutMs(raw) {
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1000 || n > 21600000) {
    throw new Error('--turn-timeout-ms must be an integer between 1000 and 21600000');
  }
  return n;
}

// 中文注释：4 个子命令各有一组专属 options
const program = new Command()
  .name('harness')
  .helpOption(false)
  .exitOverride();

const RUN_OPTIONS = [
  ['--objective <text>', 'Objective text'],
  ['--session <id>', 'Session ID'],
  ['--workspace <path>', 'Workspace root'],
  ['--provider <name>', 'Provider name'],
  ['--profile <name>', 'Profile name'],
  ['--worktree', 'Use worktree'],
  ['--base-ref <ref>', 'Base reference'],
  ['--max-iterations <n>', 'Max iterations'],
  ['--unattended', 'Unattended tier: should-run pacing gate (quota + cadence + quiet shutdown)'],
  ['--quota <n>', 'Compute quota duty ratio for unattended runs (default 1.0)'],
  ['--cadence-base-ms <n>', 'Cadence base delay ms (default 180000)'],
  ['--cadence-max-ms <n>', 'Cadence max delay ms (default 1800000)'],
  ['--quiet-threshold <n>', 'Consecutive noop polls before quiet shutdown (default 3)'],
  ['--no-safe-bypass', 'Disable the single bounded read-only safe-bypass turn on operator gates'],
  ['--turn-timeout-ms <n>', 'Per-turn provider timeout ms (default 1800000); staged process-tree cleanup on expiry'],
  ['--dry-run', 'Dry run mode'],
  ['--hooks', 'Enable lifecycle hooks'],
  ['--no-hooks', 'Disable lifecycle hooks'],
  ['--json', 'Output as JSON'],
];

const STATUS_OPTIONS = [
  ['--session <id>', 'Session ID'],
  ['--workspace <path>', 'Workspace root'],
  ['--json', 'Output as JSON'],
];

const RESUME_OPTIONS = [
  ['--session <id>', 'Session ID'],
  ['--workspace <path>', 'Workspace root'],
  ['--max-iterations <n>', 'Max iterations'],
  ['--unattended', 'Unattended tier: should-run pacing gate (quota + cadence + quiet shutdown)'],
  ['--quota <n>', 'Compute quota duty ratio for unattended runs (default 1.0)'],
  ['--cadence-base-ms <n>', 'Cadence base delay ms (default 180000)'],
  ['--cadence-max-ms <n>', 'Cadence max delay ms (default 1800000)'],
  ['--quiet-threshold <n>', 'Consecutive noop polls before quiet shutdown (default 3)'],
  ['--no-safe-bypass', 'Disable the single bounded read-only safe-bypass turn on operator gates'],
  ['--turn-timeout-ms <n>', 'Per-turn provider timeout ms (default 1800000); staged process-tree cleanup on expiry'],
  ['--hooks', 'Enable lifecycle hooks'],
  ['--no-hooks', 'Disable lifecycle hooks'],
  ['--json', 'Output as JSON'],
];

const STOP_OPTIONS = [
  ['--session <id>', 'Session ID'],
  ['--workspace <path>', 'Workspace root'],
  ['--reason <text>', 'Stop reason'],
  ['--json', 'Output as JSON'],
];

const DASHBOARD_OPTIONS = [
  ['--workspace <path>', 'Workspace root'],
  ['--json', 'Output as JSON'],
];

for (const name of ['run', 'status', 'resume', 'stop', 'dashboard']) {
  const opts = name === 'run' ? RUN_OPTIONS : name === 'status' ? STATUS_OPTIONS : name === 'resume' ? RESUME_OPTIONS : name === 'dashboard' ? DASHBOARD_OPTIONS : STOP_OPTIONS;
  const cmd = program
    .command(name)
    .description(`Harness ${name} command`)
    .helpOption(false)
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument('[args...]');
  for (const [flags, desc] of opts) {
    cmd.option(flags, desc);
  }
}

program.allowUnknownOption(true).allowExcessArguments(true).argument('[args...]');

export function parseHarnessArgs(argv) {
  const help = argv.includes('-h') || argv.includes('--help');
  const rest = argv.slice(1);
  const rawSub = String(rest[0] || '').trim().toLowerCase();
  const subcommand = HARNESS_SUBCOMMANDS.has(rawSub) ? rawSub : 'run';

  if (help && !subcommand) {
    return { mode: 'help', help: true, command: 'harness', options: createDefaultHarnessRunOptions() };
  }

  try {
    const sliced = argv.slice(1);
    const parsed = program.parse(sliced, { from: 'user' });
    const flags = parsed.opts();

    // 获取子命令对象的 opts
    let effectiveFlags = flags;
    const matchedCmd = parsed.commands?.find((c) => c.name() === subcommand);
    if (matchedCmd?.opts) effectiveFlags = matchedCmd.opts();

    let options;

    if (subcommand === 'run') {
      options = createDefaultHarnessRunOptions();
      if (effectiveFlags.objective) options.objective = String(effectiveFlags.objective);
      if (effectiveFlags.session) options.sessionId = String(effectiveFlags.session);
      if (effectiveFlags.workspace) options.workspaceRoot = String(effectiveFlags.workspace);
      if (effectiveFlags.provider) options.provider = normalizeSoloHarnessProvider(String(effectiveFlags.provider));
      if (effectiveFlags.profile) options.profile = normalizeHarnessProfile(String(effectiveFlags.profile));
      if (effectiveFlags.worktree === true) options.worktree = true;
      if (effectiveFlags.maxIterations !== undefined) {
        const v = parseInt(String(effectiveFlags.maxIterations), 10);
        if (!Number.isFinite(v) || v <= 0) throw new Error('--max-iterations must be a positive integer');
        options.maxIterations = v;
      }
      // harness run
      if (effectiveFlags.dryRun === true) options.dryRun = true;
      if (effectiveFlags.hooks === true) options.lifecycleHooks = true;
      if (effectiveFlags.hooks === false) options.lifecycleHooks = false;
      if (effectiveFlags.json === true) options.json = true;
      if (effectiveFlags.unattended === true) options.unattended = true;
      if (effectiveFlags.safeBypass === false) options.safeBypass = false;
      for (const [flag, key, validator] of [
        ['quota', 'quota', (v) => {
          const n = Number(v);
          if (!Number.isFinite(n) || n <= 0) throw new Error('--quota must be a positive number');
          return n;
        }],
        ['cadenceBaseMs', 'cadenceBaseMs', (v) => {
          const n = Number(v);
          if (!Number.isFinite(n) || n < 0) throw new Error('--cadence-base-ms must be a non-negative number');
          return n;
        }],
        ['cadenceMaxMs', 'cadenceMaxMs', (v) => {
          const n = Number(v);
          if (!Number.isFinite(n) || n < 0) throw new Error('--cadence-max-ms must be a non-negative number');
          return n;
        }],
        ['quietThreshold', 'quietThreshold', (v) => {
          const n = parseInt(String(v), 10);
          if (!Number.isFinite(n) || n <= 0) throw new Error('--quiet-threshold must be a positive integer');
          return n;
        }],
      ]) {
        if (effectiveFlags[flag] !== undefined) options[key] = validator(effectiveFlags[flag]);
      }
      if (effectiveFlags.turnTimeoutMs !== undefined) options.turnTimeoutMs = parseTurnTimeoutMs(effectiveFlags.turnTimeoutMs);
    } else if (subcommand === 'status') {
      options = createDefaultHarnessStatusOptions();
      if (effectiveFlags.session) options.sessionId = String(effectiveFlags.session);
      if (effectiveFlags.workspace) options.workspaceRoot = String(effectiveFlags.workspace);
      if (effectiveFlags.json === true) options.json = true;
    } else if (subcommand === 'dashboard') {
      options = createDefaultHarnessDashboardOptions();
      if (effectiveFlags.workspace) options.workspaceRoot = String(effectiveFlags.workspace);
      if (effectiveFlags.json === true) options.json = true;
    } else if (subcommand === 'resume') {
      options = createDefaultHarnessResumeOptions();
      if (effectiveFlags.session) options.sessionId = String(effectiveFlags.session);
      if (effectiveFlags.workspace) options.workspaceRoot = String(effectiveFlags.workspace);
      if (effectiveFlags.maxIterations !== undefined) {
        const v = parseInt(String(effectiveFlags.maxIterations), 10);
        if (!Number.isFinite(v) || v <= 0) throw new Error('--max-iterations must be a positive integer');
        options.maxIterations = v;
      }
      if (effectiveFlags.hooks === true) options.lifecycleHooks = true;
      if (effectiveFlags.hooks === false) options.lifecycleHooks = false;
      if (effectiveFlags.json === true) options.json = true;
      if (effectiveFlags.unattended === true) options.unattended = true;
      if (effectiveFlags.safeBypass === false) options.safeBypass = false;
      for (const [flag, key, validator] of [
        ['quota', 'quota', (v) => {
          const n = Number(v);
          if (!Number.isFinite(n) || n <= 0) throw new Error('--quota must be a positive number');
          return n;
        }],
        ['cadenceBaseMs', 'cadenceBaseMs', (v) => {
          const n = Number(v);
          if (!Number.isFinite(n) || n < 0) throw new Error('--cadence-base-ms must be a non-negative number');
          return n;
        }],
        ['cadenceMaxMs', 'cadenceMaxMs', (v) => {
          const n = Number(v);
          if (!Number.isFinite(n) || n < 0) throw new Error('--cadence-max-ms must be a non-negative number');
          return n;
        }],
        ['quietThreshold', 'quietThreshold', (v) => {
          const n = parseInt(String(v), 10);
          if (!Number.isFinite(n) || n <= 0) throw new Error('--quiet-threshold must be a positive integer');
          return n;
        }],
      ]) {
        if (effectiveFlags[flag] !== undefined) options[key] = validator(effectiveFlags[flag]);
      }
      if (effectiveFlags.turnTimeoutMs !== undefined) options.turnTimeoutMs = parseTurnTimeoutMs(effectiveFlags.turnTimeoutMs);
    } else {
      options = createDefaultHarnessStopOptions();
      if (effectiveFlags.session) options.sessionId = String(effectiveFlags.session);
      if (effectiveFlags.workspace) options.workspaceRoot = String(effectiveFlags.workspace);
      if (effectiveFlags.reason) options.reason = String(effectiveFlags.reason);
      if (effectiveFlags.json === true) options.json = true;
    }

    return { mode: help ? 'help' : 'command', help: help || false, command: 'harness', options };
  } catch (e) {
    if (e instanceof Error && (e.message.includes('positive integer') || e.message.includes('must be'))) throw e;
    return { mode: 'help', help: true, command: 'harness', options: createDefaultHarnessRunOptions() };
  }
}
