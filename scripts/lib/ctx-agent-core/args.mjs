// scripts/lib/ctx-agent-core/args.mjs — 统一参数解析
// 目标：消除手写 parseArgs 循环，基于 Commander 声明式解析
// 注意：这是库模块（被 run.mjs import），保持 export parseArgs 签名不变
import { createCliParser } from '../../../src/shared/cli-parser.mjs';
import { parsePositiveInteger, resolveWorkspaceRoot } from './common.mjs';
import {
  normalizeHarnessRouteProvider,
  normalizeOrchestrateBlueprint,
  normalizeRouteExecutionMode,
  normalizeRouteMode,
  normalizeTeamRouteProvider,
} from './routes.mjs';
import { resolveClientFromRuntimeId, resolveClientRuntimeIds } from '../clients/registry.mjs';

const cli = createCliParser({
  name: 'ctx-agent',
  description: 'Context agent: run one-shot or interactive agent sessions with contextdb',
  options: [
    ['--agent <name>', 'Agent name: codex-cli | claude-code | gemini-cli | opencode-cli'],
    ['--workspace <path>', 'Workspace root to store context-db (default: current git root, else current dir)'],
    ['--project <name>', 'Project name (default: current directory name)'],
    ['--goal <text>', 'Session goal (used when creating a new session)'],
    ['--session <id>', 'Reuse a specific session id'],
    ['--prompt <text>', 'Run one-shot mode and auto log request/response/checkpoint'],
    ['--status <state>', 'Checkpoint status on success: running|blocked|done (default: running)'],
    ['--route <mode>', 'One-shot routing mode: auto|single|team|subagent|harness (default: auto)'],
    ['--route-execute <mode>', 'Routed execution mode: dry-run|live (default: live)'],
    ['--team-provider <name>', 'Team provider: auto|codex|claude|gemini (default: auto)'],
    ['--team-workers <n>', 'Team workers count (default: 3)'],
    ['--harness-provider <name>', 'Harness provider: codex|claude|gemini|opencode (default: inferred)'],
    ['--harness-max-iterations <n>', 'Harness iteration budget (default: 8)'],
    ['--blueprint <name>', 'Orchestrate blueprint: feature|bugfix|refactor|security (default: feature)'],
    ['--save-guard', 'Write a Stop-hook checkpoint only; never launch an agent subprocess'],
    ['--no-bootstrap', 'Disable automatic first-task bootstrap'],
    ['--no-checkpoint', 'Disable automatic checkpoint write in one-shot mode'],
    ['--continuity-summary', 'Write compact continuity artifacts after one-shot checkpoint (default)'],
    ['--no-continuity-summary', 'Skip continuity artifacts'],
    ['--dry-run', 'Skip remote model call, write synthetic response for pipeline testing'],
    ['--max-log-chars <n>', 'Max characters stored in event logs (default: 8000)'],
    ['--checkpoint-status <state>', 'Checkpoint status with save-guard: running|blocked|done'],
  ],
});

export function usage() {
  let text = cli.program.helpInformation();
  text += '\nEnvironment:\n';
  text += '  CTXDB_CODEX_DISABLE_MCP 1/true/yes/on to launch Codex without MCP startup (-c mcp_servers={} -c features.rmcp_client=false)\n';
  return text;
}

export function parseArgs(argv) {
  // 显式拒绝已移除的选项，保持向后兼容的报错语义。
  const removedOptions = new Map([
    ['--limit', '--limit has been removed from ctx-agent prompt execution; context packets are no longer injected.'],
    ['--context-mode', '--context-mode has been removed; ctx-agent no longer injects ContextDB packets into prompts.'],
    ['--startup-mode', '--startup-mode has been removed; interactive startup always shows a local unfinished-task summary and never injects prompts.'],
  ]);
  for (const raw of argv) {
    const flag = String(raw || '');
    const bareFlag = flag.includes('=') ? flag.slice(0, flag.indexOf('=')) : flag;
    if (removedOptions.has(bareFlag)) {
      throw new Error(removedOptions.get(bareFlag));
    }
  }

  const opts = {
    agent: '', project: '', workspaceRoot: '', goal: '', sessionId: '', prompt: '', checkpointStatus: 'running',
    routeMode: 'auto', routeExecutionMode: 'live', teamProvider: 'auto', teamWorkers: '3', harnessProvider: 'auto', harnessMaxIterations: '8',
    blueprint: 'feature', saveGuard: false, autoBootstrap: true, autoCheckpoint: true, continuitySummary: true, dryRun: false,
    maxLogChars: '8000', extraArgs: [],
  };

  const parsed = cli.parse(argv);

  if (parsed.help) {
    opts._help = true;
    return opts;
  }

  // 处理 -- 后的 extraArgs
  let extraArgs = [];
  let extraIdx = argv.indexOf('--');
  if (extraIdx !== -1) {
    extraArgs = argv.slice(extraIdx + 1);
  }

  const flags = parsed.flags;

  opts.agent = flags.agent || '';
  opts.project = flags.project || '';
  opts.workspaceRoot = flags.workspace || '';
  opts.goal = flags.goal || '';
  opts.sessionId = flags.session || '';
  opts.prompt = flags.prompt || '';
  opts.checkpointStatus = normalizeCheckpointStatus(flags.checkpointStatus || flags.status);
  opts.routeMode = flags.route || 'auto';
  opts.routeExecutionMode = flags.routeExecute || 'live';
  opts.teamProvider = flags.teamProvider || 'auto';
  opts.teamWorkers = flags.teamWorkers || '3';
  opts.harnessProvider = flags.harnessProvider || 'auto';
  opts.harnessMaxIterations = flags.harnessMaxIterations || '8';
  opts.blueprint = flags.blueprint || 'feature';
  opts.saveGuard = flags.saveGuard === true || flags.checkpointStatus !== undefined;
  opts.autoBootstrap = flags.bootstrap !== false;
  opts.autoCheckpoint = flags.checkpoint !== false;
  opts.continuitySummary = flags.continuitySummary !== false;
  opts.dryRun = flags.dryRun === true;
  opts.maxLogChars = flags.maxLogChars || '8000';
  opts.extraArgs = extraArgs;

  return opts;
}

export function normalizeCheckpointStatus(value = 'running') {
  const normalized = String(value || '').trim().toLowerCase();
  if (['completed', 'complete', 'success', 'succeeded'].includes(normalized)) return 'done';
  if (['failed', 'failure', 'error'].includes(normalized)) return 'blocked';
  return normalized || 'running';
}

export function validateOpts(opts) {
  if (!opts.agent) throw new Error('Missing required --agent');
  if (!resolveClientFromRuntimeId(opts.agent)) {
    throw new Error(`--agent must be one of: ${resolveClientRuntimeIds('all').join(', ')}`);
  }
  opts.checkpointStatus = normalizeCheckpointStatus(opts.checkpointStatus);
  if (!['running', 'blocked', 'done'].includes(opts.checkpointStatus)) throw new Error('--status must be one of: running, blocked, done');
  if (!/^\d+$/u.test(opts.maxLogChars)) throw new Error('--max-log-chars must be a non-negative integer');
  opts.routeMode = normalizeRouteMode(opts.routeMode);
  opts.routeExecutionMode = normalizeRouteExecutionMode(opts.routeExecutionMode);
  opts.teamProvider = normalizeTeamRouteProvider(opts.teamProvider);
  opts.teamWorkers = String(parsePositiveInteger(opts.teamWorkers, undefined, '--team-workers'));
  opts.harnessProvider = normalizeHarnessRouteProvider(opts.harnessProvider);
  opts.harnessMaxIterations = String(parsePositiveInteger(opts.harnessMaxIterations, undefined, '--harness-max-iterations'));
  opts.blueprint = normalizeOrchestrateBlueprint(opts.blueprint);
}

export function resolveInitialWorkspace(opts) {
  return opts.workspaceRoot || resolveWorkspaceRoot(process.cwd());
}
