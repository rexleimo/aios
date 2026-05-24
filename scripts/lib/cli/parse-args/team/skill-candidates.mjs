/* 中文注释：skill-candidates 解析专注草稿候选导出/列表，避免塞回 team 主入口。 */
import { normalizeTeamProvider, parsePositiveInteger, takeValue } from '../shared.mjs';
import { createDefaultTeamSkillCandidatesExportOptions } from './defaults.mjs';
import { finalizeTeamProvider, hydrateSessionFromResume } from './shared.mjs';

export function parseTeamSkillCandidatesArgs(argv) {
  const rest = argv.slice(2);
  const options = createDefaultTeamSkillCandidatesExportOptions();
  let help = false;
  let index = 0;

  if (rest[0] && !String(rest[0]).startsWith('-')) {
    const action = String(rest[0] || '').trim().toLowerCase();
    if (!['list', 'export'].includes(action)) {
      throw new Error('team skill-candidates action must be one of: list, export');
    }
    options.action = action;
    index = 1;
  }

  for (; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    switch (arg) {
      case '--provider':
        options.provider = normalizeTeamProvider(takeValue(rest, index, '--provider'));
        index += 1;
        break;
      case '--session':
        options.sessionId = String(takeValue(rest, index, '--session') ?? '').trim();
        index += 1;
        break;
      case '--resume':
        options.resumeSessionId = String(takeValue(rest, index, '--resume') ?? '').trim();
        index += 1;
        break;
      case '--skill-candidate-limit':
        options.skillCandidateLimit = parsePositiveInteger(
          takeValue(rest, index, '--skill-candidate-limit'),
          '--skill-candidate-limit'
        );
        index += 1;
        break;
      case '--draft-id':
        options.draftId = String(takeValue(rest, index, '--draft-id') ?? '').trim();
        index += 1;
        break;
      case '--output':
        options.outputPath = String(takeValue(rest, index, '--output') ?? '').trim();
        index += 1;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  finalizeTeamProvider(options);
  hydrateSessionFromResume(options);
  if (options.action !== 'export' && options.outputPath) {
    throw new Error('--output is only supported by team skill-candidates export');
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'team',
    options,
  };
}
