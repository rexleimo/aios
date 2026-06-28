/* 中文注释：team history 解析——基于 Commander 声明式替代手写 for 循环。 */
import { Command } from 'commander';
import { normalizeTeamProvider, parsePositiveInteger } from '../shared.mjs';
import { createDefaultTeamHistoryOptions } from './defaults.mjs';
import { finalizeTeamProvider, normalizeQualityCategoryPrefixMode, normalizeSinceIso } from './shared.mjs';

const TEAM_HISTORY_CLI = new Command()
  .name('team-history')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .option('--provider <name>', 'Provider name')
  .option('--limit <n>', 'Max items')
  .option('--concurrency <n>', 'Concurrency limit')
  .option('--fast', 'Fast mode')
  .option('--quality-failed-only', 'Only show failed quality gates')
  .option('--quality-category <cat>', 'Quality category')
  .option('--quality-category-prefix <prefix>', 'Quality category prefix')
  .option('--quality-category-prefix-mode <mode>', 'Category prefix matching mode')
  .option('--draft-id <id>', 'Draft ID')
  .option('--since <iso>', 'Since timestamp')
  .option('--status <status>', 'Status filter')
  .option('--json', 'JSON output');

export function parseTeamHistoryArgs(argv) {
  const rest = argv.slice(2);
  const help = rest.includes('-h') || rest.includes('--help');
  const options = createDefaultTeamHistoryOptions();

  try {
    const parsed = TEAM_HISTORY_CLI.parse(rest, { from: 'user' });
    const flags = parsed.opts();

    if (flags.provider) options.provider = normalizeTeamProvider(flags.provider);
    if (flags.limit) options.limit = parsePositiveInteger(flags.limit, '--limit');
    if (flags.concurrency) options.concurrency = parsePositiveInteger(flags.concurrency, '--concurrency');
    if (flags.fast) options.fast = true;
    if (flags.qualityFailedOnly) options.qualityFailedOnly = true;
    if (flags.qualityCategory) options.qualityCategory = String(flags.qualityCategory).trim();
    if (flags.qualityCategoryPrefix) options.qualityCategoryPrefix = String(flags.qualityCategoryPrefix).trim();
    if (flags.qualityCategoryPrefixMode) options.qualityCategoryPrefixMode = normalizeQualityCategoryPrefixMode(flags.qualityCategoryPrefixMode);
    if (flags.draftId) options.draftId = String(flags.draftId).trim();
    if (flags.since) options.since = normalizeSinceIso(flags.since);
    if (flags.status) options.status = String(flags.status).trim();
    if (flags.json) options.json = true;

    finalizeTeamProvider(options);
    return { mode: help ? 'help' : 'command', help, command: 'team', options };
  } catch (e) {
    if (e instanceof Error && (
      e.message.includes('must be one of') ||
      e.message.includes('must be a positive integer') ||
      e.message.includes('must be a number') ||
      e.message.includes('must not be empty') ||
      e.message.includes('mode must be'))) throw e;
    finalizeTeamProvider(options);
    return { mode: 'help', help: true, command: 'team', options };
  }
}
