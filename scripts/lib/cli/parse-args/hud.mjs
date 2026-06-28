/* 中文注释：hud 解析——基于 Commander 声明式替代手写 for 循环。保留 watch 逻辑等原有业务语义。 */
import { Command } from 'commander';
import {
  SKILL_CANDIDATE_VIEWS,
  normalizeHudPreset,
  normalizeSkillCandidateView,
  normalizeTeamProvider,
  parsePositiveInteger,
  parseWatchInterval,
  takeValue,
} from './shared.mjs';
import { createDefaultHudOptions } from './shared.mjs';

const HUD_CLI = new Command()
  .name('hud')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(false)
  .allowExcessArguments(false)
  .option('--session <id>', 'Session ID')
  .option('--workspace <path>', 'Workspace root')
  .option('--provider <name>', 'Provider name')
  .option('--preset <name>', 'Display preset: focused|minimal|full')
  .option('-w, --watch', 'Watch mode')
  .option('--fast', 'Fast refresh')
  .option('--no-fast', 'Disable fast refresh')
  .option('--show-skill-candidates [view]', 'Show skill candidates (optional view: inline|detail|list)')
  .option('--skill-candidate-view <view>', 'Skill candidate view: inline|detail|list')
  .option('--export-skill-candidate-patch-template', 'Export skill candidate patch template')
  .option('--draft-id <id>', 'Skill candidate draft ID')
  .option('--skill-candidate-limit <n>', 'Max skill candidates')
  .option('--json', 'JSON output')
  .option('--watchdog', 'Watchdog mode')
  .option('--interval-ms <n>', 'Watch interval in ms or "auto"');

export function parseHudArgs(argv) {
  const rest = argv.slice(1);
  const help = rest.includes('-h') || rest.includes('--help');

  try {
    const parsed = HUD_CLI.parse(rest, { from: 'user' });
    const flags = parsed.opts();
    const options = createDefaultHudOptions();
    let presetExplicit = false;
    let fastExplicit = false;

    if (flags.session) options.sessionId = String(flags.session).trim();
    if (flags.workspace) options.workspaceRoot = String(flags.workspace).trim();
    if (flags.provider) options.provider = normalizeTeamProvider(flags.provider);
    if (flags.preset) {
      presetExplicit = true;
      options.preset = normalizeHudPreset(flags.preset);
    }
    if (flags.watch) options.watch = true;
    if (flags.fast) { options.fast = true; fastExplicit = true; }
    if (flags.fast === false) { options.fast = false; fastExplicit = true; }
    if (flags.json) options.json = true;
    if (flags.watchdog) options.watchdog = true;

    // show-skill-candidates 可以是 boolean 或 string（view 可选值）
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
    if (flags.draftId) {
      options.draftId = String(flags.draftId).trim();
      options.showSkillCandidates = true;
    }
    if (flags.skillCandidateLimit) {
      options.skillCandidateLimit = parsePositiveInteger(flags.skillCandidateLimit, '--skill-candidate-limit');
      options.showSkillCandidates = true;
    }
    if (flags.intervalMs) {
      options.intervalMs = parseWatchInterval(flags.intervalMs, '--interval-ms');
    }

    // 后处理逻辑
    if (options.watch && !presetExplicit) {
      options.preset = 'minimal';
    }
    const intervalAutoFastEligible = options.intervalMs === 'auto'
      || (Number.isFinite(options.intervalMs) && options.intervalMs <= 500);
    if (!fastExplicit && options.watch && options.preset === 'minimal' && intervalAutoFastEligible) {
      options.fast = true;
    }

    return {
      mode: help ? 'help' : 'command',
      help,
      command: 'hud',
      options,
    };
  } catch (e) {
    if (e instanceof Error && (
      e.message.includes('must be one of') ||
      e.message.includes('must be a positive integer') ||
      e.message.includes('must be a number') ||
      e.message.includes('must not be empty') ||
      e.message.includes('action must be'))) throw e;
    return {
      mode: 'help',
      help: true,
      command: 'hud',
      options: createDefaultHudOptions(),
    };
  }
}
