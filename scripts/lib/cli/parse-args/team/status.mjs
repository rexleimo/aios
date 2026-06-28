/* 中文注释：team status 解析——基于 Commander 声明式替代手写 for 循环。 */
import { Command } from 'commander';
import {
  SKILL_CANDIDATE_VIEWS,
  normalizeHudPreset,
  normalizeSkillCandidateView,
  normalizeTeamProvider,
  parsePositiveInteger,
  parseWatchInterval,
} from '../shared.mjs';
import { createDefaultTeamStatusOptions } from './defaults.mjs';
import { finalizeTeamProvider, hydrateSessionFromResume } from './shared.mjs';

const TEAM_STATUS_CLI = new Command()
  .name('team-status')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('[sessionId]')
  .option('--provider <name>', 'Provider name')
  .option('--session <id>', 'Session ID')
  .option('--resume <id>', 'Resume from session ID')
  .option('--preset <name>', 'Display preset')
  .option('-w, --watch', 'Watch mode')
  .option('--fast', 'Fast refresh')
  .option('--no-fast', 'Disable fast refresh')
  .option('--show-skill-candidates [view]', 'Show skill candidates')
  .option('--skill-candidate-view <view>', 'Skill candidate view')
  .option('--export-skill-candidate-patch-template', 'Export patch template')
  .option('--draft-id <id>', 'Draft ID')
  .option('--skill-candidate-limit <n>', 'Max skill candidates')
  .option('--json', 'JSON output')
  .option('--watchdog', 'Watchdog mode')
  .option('--interval-ms <n>', 'Watch interval (ms or "auto")');

export function parseTeamStatusArgs(argv) {
  const rest = argv.slice(2);
  const help = rest.includes('-h') || rest.includes('--help');
  const options = createDefaultTeamStatusOptions();
  let presetExplicit = false;
  let fastExplicit = false;

  try {
    const parsed = TEAM_STATUS_CLI.parse(rest, { from: 'user' });
    const flags = parsed.opts();
    const positionalArgs = parsed.args || [];

    // 位置参数：sessionId
    const posSession = positionalArgs.find(a => !String(a).startsWith('-'));
    if (posSession) options.sessionId = String(posSession).trim();

    if (flags.provider) options.provider = normalizeTeamProvider(flags.provider);
    if (flags.session) options.sessionId = String(flags.session).trim();
    if (flags.resume) options.resumeSessionId = String(flags.resume).trim();
    if (flags.preset) { presetExplicit = true; options.preset = normalizeHudPreset(flags.preset); }
    if (flags.watch) options.watch = true;
    if (flags.fast) { options.fast = true; fastExplicit = true; }
    if (flags.fast === false) { options.fast = false; fastExplicit = true; }
    if (flags.json) options.json = true;
    if (flags.watchdog) options.watchdog = true;
    if (flags.intervalMs) options.intervalMs = parseWatchInterval(flags.intervalMs, '--interval-ms');

    // skill-candidates
    if (flags.showSkillCandidates !== undefined) {
      options.showSkillCandidates = true;
      if (typeof flags.showSkillCandidates === 'string') {
        const viewFlag = String(flags.showSkillCandidates).trim().toLowerCase();
        if (SKILL_CANDIDATE_VIEWS.has(viewFlag)) {
          options.skillCandidateView = normalizeSkillCandidateView(flags.showSkillCandidates, '--show-skill-candidates');
        }
      }
    }
    if (flags.skillCandidateView) {
      options.skillCandidateView = normalizeSkillCandidateView(flags.skillCandidateView, '--skill-candidate-view');
      options.showSkillCandidates = true;
    }
    if (flags.exportSkillCandidatePatchTemplate) {
      options.exportSkillCandidatePatchTemplate = true;
      options.showSkillCandidates = true;
    }
    if (flags.draftId) { options.draftId = String(flags.draftId).trim(); options.showSkillCandidates = true; }
    if (flags.skillCandidateLimit) {
      options.skillCandidateLimit = parsePositiveInteger(flags.skillCandidateLimit, '--skill-candidate-limit');
      options.showSkillCandidates = true;
    }

    finalizeTeamProvider(options);
    hydrateSessionFromResume(options);
    if (options.watch && !presetExplicit) options.preset = 'minimal';
    const intervalAutoFastEligible = options.intervalMs === 'auto'
      || (Number.isFinite(options.intervalMs) && options.intervalMs <= 500);
    if (!fastExplicit && options.watch && options.preset === 'minimal' && intervalAutoFastEligible) options.fast = true;

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
