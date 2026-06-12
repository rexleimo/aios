import { resolveWorkspaceRoot } from './common.mjs';
import {
  normalizeHarnessRouteProvider,
  normalizeOrchestrateBlueprint,
  normalizeRouteExecutionMode,
  normalizeRouteMode,
  normalizeTeamRouteProvider,
} from './routes.mjs';
import { parsePositiveInteger } from './common.mjs';
import { resolveClientFromRuntimeId, resolveClientRuntimeIds } from '../clients/registry.mjs';

export function usage() {
  console.log(`Usage:
  scripts/ctx-agent.mjs --agent <codex-cli|claude-code|gemini-cli|antigravity-cli|opencode-cli|crush-cli> [options] [-- <extra agent args>]

Options:
  --agent <name>      Agent name: codex-cli | claude-code | gemini-cli | antigravity-cli | opencode-cli | crush-cli
  --workspace <path>  Workspace root to store context-db (default: current git root, else current dir)
  --project <name>    Project name (default: current directory name)
  --goal <text>       Session goal (used when creating a new session)
  --session <id>      Reuse a specific session id
  --prompt <text>     Run one-shot mode and auto log request/response/checkpoint
  --status <state>    Checkpoint status on success: running|blocked|done (default: running)
  --route <mode>      One-shot routing mode: auto|single|team|subagent|harness (default: auto)
  --route-execute <mode> Routed execution mode: dry-run|live (default: live)
  --team-provider <name> Team provider for routed commands: auto|codex|claude|gemini (default: auto)
  --team-workers <n>  Team workers for routed commands (default: 3)
  --harness-provider <name> Harness provider for routed harness: codex|claude|gemini|opencode (default: inferred)
  --harness-max-iterations <n> Harness iteration budget for routed harness (default: 8)
  --blueprint <name>  Orchestrate blueprint for routed subagent: feature|bugfix|refactor|security (default: feature)
  --save-guard        Write a Stop-hook checkpoint only; never launch an agent subprocess
  --no-bootstrap      Disable automatic first-task bootstrap for this run
  --no-checkpoint     Disable automatic checkpoint write in one-shot mode
  --continuity-summary Write compact continuity artifacts after one-shot checkpoint (default)
  --dry-run           Skip remote model call, write synthetic response for pipeline testing
  --max-log-chars <n> Max characters stored in event logs (default: 8000)
  -h, --help          Show this help`);
  console.log(`
Environment:
  CTXDB_CODEX_DISABLE_MCP 1/true/yes/on to launch Codex without MCP startup (-c mcp_servers={} -c features.rmcp_client=false)`);
}

export function parseArgs(argv) {
  const opts = {
    agent: '', project: '', workspaceRoot: '', goal: '', sessionId: '', prompt: '', checkpointStatus: 'running',
    routeMode: 'auto', routeExecutionMode: 'live', teamProvider: 'auto', teamWorkers: '3', harnessProvider: 'auto', harnessMaxIterations: '8',
    blueprint: 'feature', saveGuard: false, autoBootstrap: true, autoCheckpoint: true, continuitySummary: true, dryRun: false,
    maxLogChars: '8000', extraArgs: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const read = (fallback = '') => argv[++i] || fallback;
    switch (arg) {
      case '--agent': opts.agent = read(); break;
      case '--workspace': opts.workspaceRoot = read(); break;
      case '--project': opts.project = read(); break;
      case '--goal': opts.goal = read(); break;
      case '--session': opts.sessionId = read(); break;
      case '--prompt': opts.prompt = read(); break;
      case '--limit': throw new Error('--limit has been removed from ctx-agent prompt execution; context packets are no longer injected.');
      case '--status': opts.checkpointStatus = read('running'); break;
      case '--checkpoint-status': opts.checkpointStatus = read('running'); opts.saveGuard = true; break;
      case '--save-guard': opts.saveGuard = true; break;
      case '--route': opts.routeMode = read('auto'); break;
      case '--route-execute': opts.routeExecutionMode = read('dry-run'); break;
      case '--team-provider': opts.teamProvider = read('auto'); break;
      case '--team-workers': opts.teamWorkers = read('3'); break;
      case '--harness-provider': opts.harnessProvider = read('auto'); break;
      case '--harness-max-iterations': opts.harnessMaxIterations = read('8'); break;
      case '--blueprint': opts.blueprint = read('feature'); break;
      case '--no-bootstrap': opts.autoBootstrap = false; break;
      case '--no-checkpoint': opts.autoCheckpoint = false; break;
      case '--continuity-summary': opts.continuitySummary = true; break;
      case '--no-continuity-summary': opts.continuitySummary = false; break;
      case '--context-mode': throw new Error('--context-mode has been removed; ctx-agent no longer injects ContextDB packets into prompts.');
      case '--startup-mode': throw new Error('--startup-mode has been removed; interactive startup always shows a local unfinished-task summary and never injects prompts.');
      case '--dry-run': opts.dryRun = true; break;
      case '--max-log-chars': opts.maxLogChars = read('8000'); break;
      case '-h':
      case '--help': usage(); process.exit(0); break;
      case '--': opts.extraArgs = argv.slice(i + 1); i = argv.length; break;
      default: opts.extraArgs.push(arg); break;
    }
  }
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
