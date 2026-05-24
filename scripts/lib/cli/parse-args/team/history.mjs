/* 中文注释：team history 解析只处理历史查询筛选条件。 */
import { normalizeTeamProvider, parsePositiveInteger, takeValue } from '../shared.mjs';
import { createDefaultTeamHistoryOptions } from './defaults.mjs';
import { finalizeTeamProvider, normalizeQualityCategoryPrefixMode, normalizeSinceIso } from './shared.mjs';

export function parseTeamHistoryArgs(argv) {
  const rest = argv.slice(2);
  const options = createDefaultTeamHistoryOptions();
  let help = false;

  for (let index = 0; index < rest.length; index += 1) {
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
      case '--limit':
        options.limit = parsePositiveInteger(takeValue(rest, index, '--limit'), '--limit');
        index += 1;
        break;
      case '--concurrency':
        options.concurrency = parsePositiveInteger(takeValue(rest, index, '--concurrency'), '--concurrency');
        index += 1;
        break;
      case '--fast':
        options.fast = true;
        break;
      case '--quality-failed-only':
        options.qualityFailedOnly = true;
        break;
      case '--quality-category':
        options.qualityCategory = String(takeValue(rest, index, '--quality-category') ?? '').trim();
        index += 1;
        break;
      case '--quality-category-prefix':
        options.qualityCategoryPrefix = String(takeValue(rest, index, '--quality-category-prefix') ?? '').trim();
        index += 1;
        break;
      case '--quality-category-prefix-mode':
        options.qualityCategoryPrefixMode = normalizeQualityCategoryPrefixMode(takeValue(rest, index, '--quality-category-prefix-mode'));
        index += 1;
        break;
      case '--draft-id':
        options.draftId = String(takeValue(rest, index, '--draft-id') ?? '').trim();
        index += 1;
        break;
      case '--since':
        options.since = normalizeSinceIso(takeValue(rest, index, '--since'));
        index += 1;
        break;
      case '--status':
        options.status = String(takeValue(rest, index, '--status') ?? '').trim();
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

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'team',
    options,
  };
}
