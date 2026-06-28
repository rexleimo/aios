/* 中文注释：skill-candidates 解析——基于 Commander 声明式替代手写 for 循环。 */
import { Command } from 'commander';
import { normalizeTeamProvider, parsePositiveInteger } from '../shared.mjs';
import { createDefaultTeamSkillCandidatesExportOptions } from './defaults.mjs';
import { finalizeTeamProvider, hydrateSessionFromResume } from './shared.mjs';

const TEAM_SKILL_CANDIDATES_CLI = new Command()
  .name('team-skill-candidates')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('[action]', 'list or export')
  .option('--provider <name>', 'Provider name')
  .option('--session <id>', 'Session ID')
  .option('--resume <id>', 'Resume from session ID')
  .option('--skill-candidate-limit <n>', 'Max skill candidates')
  .option('--draft-id <id>', 'Draft ID')
  .option('--output <path>', 'Output path (export only)')
  .option('--json', 'JSON output');

export function parseTeamSkillCandidatesArgs(argv) {
  const rest = argv.slice(2);
  const help = rest.includes('-h') || rest.includes('--help');
  const options = createDefaultTeamSkillCandidatesExportOptions();

  try {
    const parsed = TEAM_SKILL_CANDIDATES_CLI.parse(rest, { from: 'user' });
    const flags = parsed.opts();
    const positionalArgs = parsed.args || [];

    // 位置参数：action
    const posAction = positionalArgs.find(a => !String(a).startsWith('-'));
    if (posAction) {
      const action = String(posAction).trim().toLowerCase();
      if (!['list', 'export'].includes(action)) {
        throw new Error('team skill-candidates action must be one of: list, export');
      }
      options.action = action;
    }

    if (flags.provider) options.provider = normalizeTeamProvider(flags.provider);
    if (flags.session) options.sessionId = String(flags.session).trim();
    if (flags.resume) options.resumeSessionId = String(flags.resume).trim();
    if (flags.skillCandidateLimit) options.skillCandidateLimit = parsePositiveInteger(flags.skillCandidateLimit, '--skill-candidate-limit');
    if (flags.draftId) options.draftId = String(flags.draftId).trim();
    if (flags.output) options.outputPath = String(flags.output).trim();
    if (flags.json) options.json = true;

    finalizeTeamProvider(options);
    hydrateSessionFromResume(options);
    if (options.action !== 'export' && options.outputPath) {
      throw new Error('--output is only supported by team skill-candidates export');
    }

    return { mode: help ? 'help' : 'command', help, command: 'team', options };
  } catch (e) {
    if (e instanceof Error && (
      e.message.includes('must be one of') ||
      e.message.includes('must be a positive integer') ||
      e.message.includes('must be a number') ||
      e.message.includes('must not be empty') ||
      e.message.includes('action must be') ||
      e.message.includes('--output is only supported'))) throw e;
    finalizeTeamProvider(options);
    return { mode: 'help', help: true, command: 'team', options };
  }
}
