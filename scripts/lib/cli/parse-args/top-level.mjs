/* 中文注释：顶层参数解析器只做命令级调度——基于 Commander 管理选项，替代手写 for+switch。
 * setup/update/uninstall/doctor/quality-gate/orchestrate/entropy-gc/snapshot-rollback/release-status/learn-eval
 * 这 11 个命令共享选项处理器，集中声明 Commander spec。 */
import { Command } from 'commander';
import {
  createDefaultDoctorOptions,
  createDefaultEntropyGcOptions,
  createDefaultLearnEvalOptions,
  createDefaultOrchestrateOptions,
  createDefaultQualityGateOptions,
  createDefaultReleaseStatusOptions,
  createDefaultSetupOptions,
  createDefaultSnapshotRollbackOptions,
  createDefaultUninstallOptions,
  createDefaultUpdateOptions,
  normalizeClient,
  normalizeComponents,
  normalizeEntropyGcFormat,
  normalizeEntropyGcMode,
  normalizeHarnessProfile,
  normalizeLearnEvalFormat,
  normalizeOrchestrateDispatchMode,
  normalizeOrchestrateExecutionMode,
  normalizeOrchestratePreflightMode,
  normalizeOrchestratorBlueprint,
  normalizeOrchestratorFormat,
  normalizeQualityGateMode,
  normalizeReleaseStatusFormat,
  normalizeReleaseStatusHistoryFormat,
  normalizeSkillInstallMode,
  normalizeSkillNames,
  normalizeSkillScope,
  normalizeSnapshotRollbackFormat,
  normalizeTokenProfile,
  normalizeWrapMode,
  parsePositiveInteger,
  parseUnitInterval,
} from './shared.mjs';

// 中文注释：按命令创建 Commander 实例。每个命令的 options 集中声明在这里。
function getCommandProgram(command, defaults) {
  const program = new Command()
    .name(command)
    .helpOption(false)
    .exitOverride()
    .allowUnknownOption(true)
    .allowExcessArguments(true);

  // 通用选项——所有命令共享
  program.option('--dry-run', 'Preview without writing');
  program.option('--json', 'JSON output');

  if (['setup', 'update', 'uninstall'].includes(command)) {
    program
      .option('--components <list>', 'Components (comma-separated)')
      .option('--mode <mode>', 'Setup/update mode')
      .option('--client <name>', 'Target client')
      .option('--scope <scope>', 'Skill scope')
      .option('--skills <names>', 'Skill names (comma-separated)')
      .option('--install-mode <mode>', 'Skill install mode')
      .option('--token-profile <profile>', 'Token discipline profile')
      .option('--apply-client-cost-settings', 'Apply client cost settings')
      .option('--skip-playwright-install', 'Skip Playwright install')
      .option('--with-playwright-install', 'Include Playwright install');
    if (command === 'update') {
      program
        .option('--self-update', 'Update Hermes CLI itself')
        .option('--skip-self-update', 'Skip self-update')
        .option('--skip-doctor', 'Skip post-update doctor');
    }
  }

  if (command === 'doctor') {
    program
      .option('--strict', 'Strict mode')
      .option('--native', 'Native-only mode')
      .option('--verbose', 'Verbose output')
      .option('--fix', 'Auto-fix issues')
      .option('--global-security', 'Check global security')
      .option('--client <name>', 'Target client')
      .option('--profile <name>', 'Doctor profile');
  }

  if (['orchestrate', 'learn-eval', 'entropy-gc', 'snapshot-rollback', 'quality-gate', 'release-status'].includes(command)) {
    program
      .option('--profile <name>', 'Harness profile')
      .option('--task <text>', 'Task description')
      .option('--context <text>', 'Context summary')
      .option('--session <id>', 'Session ID')
      .option('--limit <n>', 'Max results')
      .option('--format <fmt>', 'Output format');
  }

  if (command === 'orchestrate') {
    program
      .option('--blueprint <name>', 'Orchestrate blueprint')
      .option('--plan <path>', 'Plan file path')
      .option('--recommendation <id>', 'Recommendation ID')
      .option('--dispatch <mode>', 'Dispatch mode')
      .option('--execute <mode>', 'Execution mode')
      .option('--preflight <mode>', 'Preflight mode');
  }

  if (command === 'snapshot-rollback') {
    program
      .option('--manifest <path>', 'Manifest path')
      .option('--job <id>', 'Job ID');
  }

  if (command === 'learn-eval') {
    program
      .option('--apply-draft <id>', 'Apply specific draft')
      .option('--apply-drafts', 'Apply all pending drafts')
      .option('--apply-dry-run', 'Dry-run draft apply');
  }

  if (command === 'entropy-gc') {
    program
      .option('--retain <n>', 'Retention count')
      .option('--min-age-hours <n>', 'Min age in hours');
  }

  if (command === 'release-status') {
    program
      .option('--strict', 'Strict gate check')
      .option('--min-samples <n>', 'Min samples')
      .option('--max-failure-rate <rate>', 'Max failure rate')
      .option('--max-fallback-rate <rate>', 'Max fallback rate')
      .option('--output <path>', 'Output path')
      .option('--history-output <path>', 'History output path')
      .option('--history-days <n>', 'History days')
      .option('--state-path <path>', 'State file path')
      .option('--recent <n>', 'Recent N items')
      .option('--history-format <fmt>', 'History output format');
  }

  return program;
}

export function parseTopLevelArgs(command, argv) {
  const defaults = getDefaults(command);
  const options = { ...defaults };
  if (command === 'update') {
    options.selfUpdate = true;
  }
  const rest = argv.slice(1);
  const help = rest.includes('-h') || rest.includes('--help');

  try {
    const program = getCommandProgram(command, defaults);
    const parsed = program.parse(rest, { from: 'user' });
    const flags = parsed.opts();
    const positionalArgs = parsed.args || [];

    // 1) 位置参数（quality-gate/orchestrate/entropy-gc 的首个非 - 参数）
    if (command === 'quality-gate' && positionalArgs.length > 0) {
      options.mode = normalizeQualityGateMode(positionalArgs[0]);
    }
    if (command === 'orchestrate' && positionalArgs.length > 0) {
      options.blueprint = normalizeOrchestratorBlueprint(positionalArgs[0]);
    }
    if (command === 'entropy-gc' && positionalArgs.length > 0) {
      options.mode = normalizeEntropyGcMode(positionalArgs[0]);
    }

    // 2) Commander flag → options 映射
    if (flags.dryRun) options.dryRun = true;
    if (flags.json) options.json = true;

    if (['setup', 'update', 'uninstall'].includes(command)) {
      if (flags.components) options.components = normalizeComponents(flags.components, defaults.components);
      if (flags.mode != null) options.wrapMode = normalizeWrapMode(flags.mode);
      if (flags.client) options.client = normalizeClient(flags.client);
      if (command !== 'uninstall') {
        if (flags.scope != null) options.scope = normalizeSkillScope(flags.scope);
        if (flags.skills) options.skills = normalizeSkillNames(flags.skills);
      }
      if (flags.installMode != null) options.installMode = normalizeSkillInstallMode(flags.installMode);
      if (flags.tokenProfile) options.tokenProfile = normalizeTokenProfile(flags.tokenProfile);
      if (flags.applyClientCostSettings) options.applyClientCostSettings = true;
      if (flags.skipPlaywrightInstall) options.skipPlaywrightInstall = true;
      if (flags.withPlaywrightInstall) options.withPlaywrightInstall = true;
      if (command === 'update') {
        if (flags.skipDoctor) options.skipDoctor = true;
        if (flags.selfUpdate !== undefined) options.selfUpdate = flags.selfUpdate;
        if (flags.skipSelfUpdate) options.selfUpdate = false;
      }
    }

    if (command === 'doctor') {
      if (flags.strict) options.strict = true;
      if (flags.native) options.nativeOnly = true;
      if (flags.verbose) options.verbose = true;
      if (flags.fix) options.fix = true;
      if (flags.globalSecurity) options.globalSecurity = true;
      if (flags.client) options.client = normalizeClient(flags.client);
      if (flags.profile) options.profile = normalizeHarnessProfile(flags.profile);
    }

    if (['orchestrate', 'learn-eval', 'quality-gate', 'entropy-gc', 'snapshot-rollback', 'release-status'].includes(command)) {
      if (flags.profile) options.profile = normalizeHarnessProfile(flags.profile);
      if (flags.task) options.taskTitle = flags.task;
      if (flags.context) options.contextSummary = flags.context;
      if (flags.session) options.sessionId = flags.session;
      if (flags.limit) options.limit = parsePositiveInteger(flags.limit, '--limit');
    }

    if (command === 'orchestrate') {
      if (flags.plan) options.planPath = flags.plan;
      if (flags.recommendation) options.recommendationId = flags.recommendation;
      if (flags.dispatch) options.dispatchMode = normalizeOrchestrateDispatchMode(flags.dispatch);
      if (flags.execute) options.executionMode = normalizeOrchestrateExecutionMode(flags.execute);
      if (flags.preflight) options.preflightMode = normalizeOrchestratePreflightMode(flags.preflight);
      if (flags.format) options.format = normalizeOrchestratorFormat(flags.format);
    }

    if (command === 'snapshot-rollback') {
      if (flags.manifest) options.manifestPath = flags.manifest;
      if (flags.job) options.jobId = flags.job;
      if (flags.format) options.format = normalizeSnapshotRollbackFormat(flags.format);
    }

    if (command === 'learn-eval') {
      if (flags.applyDraft) options.applyDraftId = flags.applyDraft;
      if (flags.applyDrafts) options.applyDrafts = true;
      if (flags.applyDryRun) options.applyDryRun = true;
      if (flags.format) options.format = normalizeLearnEvalFormat(flags.format);
    }

    if (command === 'entropy-gc') {
      if (flags.retain) options.retain = parsePositiveInteger(flags.retain, '--retain');
      if (flags.minAgeHours) options.minAgeHours = parsePositiveInteger(flags.minAgeHours, '--min-age-hours');
      if (flags.format) options.format = normalizeEntropyGcFormat(flags.format);
    }

    if (command === 'release-status') {
      if (flags.strict) options.strict = true;
      if (flags.minSamples) options.minSamples = parsePositiveInteger(flags.minSamples, '--min-samples');
      if (flags.maxFailureRate) options.maxFailureRate = parseUnitInterval(flags.maxFailureRate, '--max-failure-rate');
      if (flags.maxFallbackRate) options.maxFallbackRate = parseUnitInterval(flags.maxFallbackRate, '--max-fallback-rate');
      if (flags.output) options.outputPath = flags.output;
      if (flags.historyOutput) options.historyOutputPath = flags.historyOutput;
      if (flags.historyDays) options.historyDays = parsePositiveInteger(flags.historyDays, '--history-days');
      if (flags.statePath) options.statePath = flags.statePath;
      if (flags.recent) options.recent = parsePositiveInteger(flags.recent, '--recent');
      if (flags.format) options.format = normalizeReleaseStatusFormat(flags.format);
      if (flags.historyFormat) options.historyFormat = normalizeReleaseStatusHistoryFormat(flags.historyFormat);
    }

    return {
      mode: help ? 'help' : 'command',
      help,
      command,
      options,
    };
  } catch (e) {
    // 校验类异常向上冒泡，非法值/格式错误不吞掉
    if (e instanceof Error && (
      e.message.includes('must be one of') ||
      e.message.includes('must be a positive integer') ||
      e.message.includes('must be a number') ||
      e.message.includes('must not be empty') ||
      e.message.includes('Missing value'))) throw e;
    return {
      mode: 'help',
      help: true,
      command,
      options,
    };
  }
}

function getDefaults(command) {
  if (command === 'setup') return createDefaultSetupOptions();
  if (command === 'update') return createDefaultUpdateOptions();
  if (command === 'uninstall') return createDefaultUninstallOptions();
  if (command === 'doctor') return createDefaultDoctorOptions();
  if (command === 'quality-gate') return createDefaultQualityGateOptions();
  if (command === 'orchestrate') return createDefaultOrchestrateOptions();
  if (command === 'entropy-gc') return createDefaultEntropyGcOptions();
  if (command === 'snapshot-rollback') return createDefaultSnapshotRollbackOptions();
  if (command === 'release-status') return createDefaultReleaseStatusOptions();
  return createDefaultLearnEvalOptions();
}
