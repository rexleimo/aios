import {
  buildUnknownCapabilityGuardSuggestedCommands,
  canOverrideUnknownLiveCapabilities,
  collectUnknownLiveCapabilities,
} from './live-capability-guard.mjs';

// 纯函数：把未知能力面转成可读摘要，避免 live guard 的展示逻辑污染运行主流程。
function formatUnknownExecutorLabel(executors = []) {
  if (!Array.isArray(executors) || executors.length === 0) return '(none)';
  return executors
    .map((item) => `${item.id}(jobs=${item.jobCount} unknown=${item.unknown.join('/')})`)
    .join('; ');
}

export function handleUnknownCapabilityGuard({
  options,
  env,
  io,
  dispatchRuntime,
  executorCapabilityManifest,
  previewBuilder,
  writeWarning,
} = {}) {
  const unknownCapabilityGuard = options.executionMode === 'live'
    ? collectUnknownLiveCapabilities(executorCapabilityManifest)
    : { blocked: false, summaryKeys: [], executors: [] };
  const allowUnknownCapabilities = options.executionMode === 'live'
    ? canOverrideUnknownLiveCapabilities(options, env)
    : true;

  if (options.executionMode === 'live' && unknownCapabilityGuard.blocked && !allowUnknownCapabilities) {
    const summaryLabel = unknownCapabilityGuard.summaryKeys.join(', ');
    const executorLabel = formatUnknownExecutorLabel(unknownCapabilityGuard.executors);
    const suggestedCommands = buildUnknownCapabilityGuardSuggestedCommands(options, previewBuilder);
    const message = `[guard] refusing live execution: capability manifest has unknown surfaces (${summaryLabel}).`;
    const suggestion = 'Run dry-run first, then override with --force (or AIOS_ALLOW_UNKNOWN_CAPABILITIES=1) when you accept the risk.';

    if (options.format === 'json') {
      const report = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        kind: 'guardrail.capability-unknown',
        sessionId: options.sessionId || null,
        executionMode: 'live',
        runtimeId: dispatchRuntime?.id || null,
        summary: executorCapabilityManifest?.summary || null,
        unknownCapabilities: unknownCapabilityGuard.summaryKeys,
        unknownExecutors: unknownCapabilityGuard.executors,
        message: `${message} ${suggestion}`,
        suggestedCommands,
      };
      io.log(JSON.stringify(report, null, 2));
      return { exitCode: 1, report };
    }

    writeWarning(
      io,
      `${message}\nExecutors: ${executorLabel}\n${suggestion}\nSuggested:\n- ${suggestedCommands.join('\n- ')}`
    );
    return { exitCode: 1 };
  }

  if (options.executionMode === 'live' && unknownCapabilityGuard.blocked && allowUnknownCapabilities) {
    const summaryLabel = unknownCapabilityGuard.summaryKeys.join(', ');
    const override = options.force === true ? '--force' : 'AIOS_ALLOW_UNKNOWN_CAPABILITIES=1';
    writeWarning(
      io,
      `[warn] live capability guard override (${override}): unknown surfaces=${summaryLabel}`
    );
  }

  return null;
}
