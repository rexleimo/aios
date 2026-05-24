/* 中文注释：team 参数解析 facade 只负责选择子命令解析器，避免单文件塞满 status/history/watchdog/run。 */
import { parseTeamHistoryArgs } from './team/history.mjs';
import { parseTeamRunArgs } from './team/run.mjs';
import { parseTeamSkillCandidatesArgs } from './team/skill-candidates.mjs';
import { parseTeamStatusArgs } from './team/status.mjs';
import { parseTeamWatchdogArgs } from './team/watchdog.mjs';

export function parseTeamArgs(argv) {
  const rest = argv.slice(1);
  const subcommand = rest[0] && !rest[0].startsWith('-') ? String(rest[0]).trim().toLowerCase() : '';
  if (subcommand === 'status') {
    return parseTeamStatusArgs(argv);
  }
  if (subcommand === 'history') {
    return parseTeamHistoryArgs(argv);
  }
  if (subcommand === 'watchdog') {
    return parseTeamWatchdogArgs(argv);
  }
  if (subcommand === 'skill-candidates') {
    return parseTeamSkillCandidatesArgs(argv);
  }
  return parseTeamRunArgs(argv, rest);
}
