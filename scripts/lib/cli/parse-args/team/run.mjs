/* 中文注释：team run 解析——基于 Commander 声明式替代手写 for 循环。 */
import { Command } from 'commander';
import {
  normalizeOrchestratePreflightMode,
  normalizeOrchestratorBlueprint,
  normalizeOrchestratorFormat,
  normalizeTeamProvider,
  parsePositiveInteger,
  parseTeamSpec,
} from '../shared.mjs';
import { createDefaultTeamOptions } from './defaults.mjs';
import { finalizeTeamProvider, hydrateSessionFromResume } from './shared.mjs';

const TEAM_RUN_CLI = new Command()
  .name('team-run')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('[taskOrSpec]', 'Task title or N:provider spec')
  .option('--workers <n>', 'Worker count')
  .option('--provider <name>', 'Provider name')
  .option('--blueprint <name>', 'Orchestrate blueprint')
  .option('--task <text>', 'Task description')
  .option('--context <text>', 'Context summary')
  .option('--plan <path>', 'Plan file path')
  .option('--session <id>', 'Session ID')
  .option('--resume <id>', 'Resume from session ID')
  .option('--limit <n>', 'Max items')
  .option('--recommendation <id>', 'Recommendation ID')
  .option('--preflight <mode>', 'Preflight mode')
  .option('--format <fmt>', 'Output format')
  .option('--retry-blocked', 'Retry blocked dispatches')
  .option('--force', 'Force operation')
  .option('--dry-run', 'Dry-run mode')
  .option('--live', 'Live execution mode');

export function parseTeamRunArgs(argv, rest) {
  const help = rest.includes('-h') || rest.includes('--help');
  const options = createDefaultTeamOptions();

  try {
    const parsed = TEAM_RUN_CLI.parse(rest, { from: 'user' });
    const flags = parsed.opts();
    const positionalArgs = parsed.args || [];

    // 处理位置参数：team spec 或 task title
    for (const arg of positionalArgs) {
      if (String(arg).startsWith('-')) continue;
      const teamSpec = parseTeamSpec(arg);
      if (teamSpec) {
        options.workers = teamSpec.workers;
        options.provider = teamSpec.provider;
      } else {
        options.taskTitle = options.taskTitle ? `${options.taskTitle} ${arg}` : arg;
      }
    }

    if (flags.workers) options.workers = parsePositiveInteger(flags.workers, '--workers');
    if (flags.provider) options.provider = normalizeTeamProvider(flags.provider);
    if (flags.blueprint) options.blueprint = normalizeOrchestratorBlueprint(flags.blueprint);
    if (flags.task) options.taskTitle = flags.task;
    if (flags.context) options.contextSummary = flags.context;
    if (flags.plan) options.planPath = flags.plan;
    if (flags.session) options.sessionId = flags.session;
    if (flags.resume) options.resumeSessionId = flags.resume;
    if (flags.limit) options.limit = parsePositiveInteger(flags.limit, '--limit');
    if (flags.recommendation) options.recommendationId = flags.recommendation;
    if (flags.preflight) options.preflightMode = normalizeOrchestratePreflightMode(flags.preflight);
    if (flags.format) options.format = normalizeOrchestratorFormat(flags.format);
    if (flags.retryBlocked) options.retryBlocked = true;
    if (flags.force) options.force = true;
    if (flags.dryRun) options.executionMode = 'dry-run';
    if (flags.live) options.executionMode = 'live';

    finalizeTeamProvider(options);
    options.teamSpec = `${options.workers}:${options.provider}`;
    hydrateSessionFromResume(options);
    if (options.retryBlocked && !options.sessionId) {
      throw new Error('--retry-blocked requires --resume <session-id> or --session <session-id>');
    }

    return { mode: help ? 'help' : 'command', help, command: 'team', options };
  } catch (e) {
    if (e instanceof Error && e.message.includes('--retry-blocked requires')) throw e;
    finalizeTeamProvider(options);
    return { mode: 'help', help: true, command: 'team', options };
  }
}
