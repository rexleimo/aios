/* 中文注释：team watchdog 解析——基于 Commander 声明式替代手写 for 循环。 */
import { Command } from 'commander';
import { normalizeTeamProvider, parsePositiveInteger } from '../shared.mjs';
import { createDefaultTeamWatchdogOptions } from './defaults.mjs';
import { finalizeTeamProvider, hydrateSessionFromResume } from './shared.mjs';

const TEAM_WATCHDOG_CLI = new Command()
  .name('team-watchdog')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('[sessionId]')
  .option('--provider <name>', 'Provider name')
  .option('--session <id>', 'Session ID')
  .option('--resume <id>', 'Resume from session ID')
  .option('--workers <n>', 'Worker count')
  .option('--json', 'JSON output');

export function parseTeamWatchdogArgs(argv) {
  const rest = argv.slice(2);
  const help = rest.includes('-h') || rest.includes('--help');
  const options = createDefaultTeamWatchdogOptions();

  try {
    const parsed = TEAM_WATCHDOG_CLI.parse(rest, { from: 'user' });
    const flags = parsed.opts();
    const positionalArgs = parsed.args || [];

    const posSession = positionalArgs.find(a => !String(a).startsWith('-'));
    if (posSession) options.sessionId = String(posSession).trim();

    if (flags.provider) options.provider = normalizeTeamProvider(flags.provider);
    if (flags.session) options.sessionId = String(flags.session).trim();
    if (flags.resume) options.resumeSessionId = String(flags.resume).trim();
    if (flags.workers) options.workers = parsePositiveInteger(flags.workers, '--workers');
    if (flags.json) options.json = true;

    finalizeTeamProvider(options);
    hydrateSessionFromResume(options);
    return { mode: help ? 'help' : 'command', help, command: 'team', options };
  } catch (e) {
    if (e instanceof Error && (
      e.message.includes('must be one of') ||
      e.message.includes('must be a positive integer') ||
      e.message.includes('must be a number') ||
      e.message.includes('must not be empty'))) throw e;
    finalizeTeamProvider(options);
    return { mode: 'help', help: true, command: 'team', options };
  }
}
