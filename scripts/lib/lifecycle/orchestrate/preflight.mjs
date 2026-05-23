import { parseAiosCommandAction } from '../../cli/fragment-parser.mjs';
import { runReleaseStatus } from '../release-status.mjs';
import { isReleaseStateUnavailable } from './release-guard.mjs';

function createBufferedIo() {
  const lines = [];
  return {
    lines,
    io: {
      log(line) {
        lines.push(String(line));
      },
    },
  };
}

// 纯函数：只允许本地 dry-run orchestrate 在 preflight 中递归执行，避免预检意外触发 live 调度。
export function isSupportedPreflightOrchestrateAction(options = {}) {
  return options.dispatchMode === 'local' && options.executionMode === 'dry-run';
}

// 纯函数：为递归 orchestrate 预检关闭二次 preflight，并继承当前 session。
export function buildPreflightOrchestrateOptions(options = {}, sessionId = '') {
  const nestedOptions = sessionId && !options.sessionId
    ? { ...options, sessionId }
    : { ...options };
  nestedOptions.preflightMode = 'none';
  return nestedOptions;
}

async function runPreflightAction(item, {
  rootDir,
  env,
  sessionId,
  preflightAdapters,
  fallbackOrchestrateRunner = null,
}) {
  if (item.type !== 'command') {
    return {
      type: item.type,
      sourceId: item.sourceId || null,
      action: item.action,
      status: 'skipped',
      runner: 'unsupported',
      summary: 'artifact-only action is not executable in preflight',
      exitCode: null,
    };
  }

  const parsed = parseAiosCommandAction(item.action);
  if (!parsed || parsed.mode === 'help') {
    return {
      type: item.type,
      sourceId: item.sourceId || null,
      action: item.action,
      status: 'skipped',
      runner: 'unsupported',
      summary: 'unsupported orchestrate action',
      exitCode: null,
    };
  }

  const priorExitCode = process.exitCode;
  const buffered = createBufferedIo();
  try {
    if (parsed.command === 'quality-gate') {
      const qualityGateOptions = sessionId && !parsed.options.sessionId
        ? { ...parsed.options, sessionId }
        : parsed.options;
      const result = await preflightAdapters.qualityGate(qualityGateOptions, {
        rootDir,
        io: buffered.io,
        env,
      });
      process.exitCode = priorExitCode;
      return {
        type: item.type,
        sourceId: item.sourceId || null,
        action: item.action,
        status: result?.exitCode === 0 || result?.ok === true ? 'passed' : 'failed',
        runner: 'quality-gate',
        summary: buffered.lines.at(-1) || `quality-gate ${result?.mode || 'full'}`,
        exitCode: Number.isFinite(result?.exitCode) ? result.exitCode : (result?.ok === true ? 0 : 1),
      };
    }

    if (parsed.command === 'doctor') {
      const result = await preflightAdapters.doctor(parsed.options, {
        rootDir,
        io: buffered.io,
      });
      process.exitCode = priorExitCode;
      return {
        type: item.type,
        sourceId: item.sourceId || null,
        action: item.action,
        status: result?.exitCode === 0 || result?.ok === true ? 'passed' : 'failed',
        runner: 'doctor',
        summary: buffered.lines.at(-1) || 'doctor completed',
        exitCode: Number.isFinite(result?.exitCode) ? result.exitCode : (result?.ok === true ? 0 : 1),
      };
    }

    if (parsed.command === 'orchestrate') {
      if (!isSupportedPreflightOrchestrateAction(parsed.options)) {
        return {
          type: item.type,
          sourceId: item.sourceId || null,
          action: item.action,
          status: 'skipped',
          runner: 'unsupported',
          summary: 'unsupported orchestrate action: only local dry-run is executable in preflight',
          exitCode: null,
        };
      }

      const orchestrateRunner = preflightAdapters.orchestrate || fallbackOrchestrateRunner;
      if (typeof orchestrateRunner !== 'function') {
        return {
          type: item.type,
          sourceId: item.sourceId || null,
          action: item.action,
          status: 'skipped',
          runner: 'unsupported',
          summary: 'orchestrate runner is not available in preflight',
          exitCode: null,
        };
      }

      const orchestrateOptions = buildPreflightOrchestrateOptions(parsed.options, sessionId);
      const result = await orchestrateRunner(orchestrateOptions, {
        rootDir,
        io: buffered.io,
        env,
        preflightAdapters,
      });
      const dispatchOk = result?.report?.dispatchRun?.ok === true;
      const jobCount = Array.isArray(result?.report?.dispatchRun?.jobRuns) ? result.report.dispatchRun.jobRuns.length : 0;
      process.exitCode = priorExitCode;
      return {
        type: item.type,
        sourceId: item.sourceId || null,
        action: item.action,
        status: dispatchOk ? 'passed' : 'failed',
        runner: 'orchestrate',
        summary: dispatchOk ? `orchestrate dry-run ready jobs=${jobCount}` : `orchestrate dry-run blocked jobs=${jobCount}`,
        exitCode: dispatchOk ? 0 : (Number.isFinite(result?.exitCode) ? result.exitCode : 1),
      };
    }

    if (parsed.command === 'release-status') {
      const releaseStatusRunner = preflightAdapters.releaseStatus || runReleaseStatus;
      const releaseStatusOptions = {
        ...parsed.options,
        strict: true,
        format: 'json',
      };
      const result = await releaseStatusRunner(releaseStatusOptions, {
        rootDir,
        io: buffered.io,
      });
      const unavailable = isReleaseStateUnavailable(result);
      process.exitCode = priorExitCode;
      if (unavailable) {
        return {
          type: item.type,
          sourceId: item.sourceId || null,
          action: item.action,
          status: 'passed',
          runner: 'release-status',
          summary: 'release state unavailable (guard bypassed)',
          exitCode: 0,
        };
      }
      const passed = Number(result?.exitCode) === 0;
      const reasons = Array.isArray(result?.health?.reasons) ? result.health.reasons : [];
      return {
        type: item.type,
        sourceId: item.sourceId || null,
        action: item.action,
        status: passed ? 'passed' : 'failed',
        runner: 'release-status',
        summary: passed
          ? `release-status healthy samples=${result?.health?.metrics?.samples ?? 0}`
          : (reasons.length > 0 ? reasons.join(', ') : 'release-status strict gate failed'),
        exitCode: Number.isFinite(result?.exitCode) ? result.exitCode : (passed ? 0 : 1),
      };
    }
  } finally {
    process.exitCode = priorExitCode;
  }

  return {
    type: item.type,
    sourceId: item.sourceId || null,
    action: item.action,
    status: 'skipped',
    runner: 'unsupported',
    summary: `unsupported command: ${parsed.command}`,
    exitCode: null,
  };
}

export async function executeDispatchPreflight(dispatchPolicy, {
  rootDir,
  env = process.env,
  sessionId = '',
  preflightMode = 'none',
  preflightAdapters = {},
  extraActions = [],
  fallbackOrchestrateRunner = null,
} = {}) {
  if (preflightMode === 'none' || !dispatchPolicy) {
    return null;
  }

  const results = [];
  const actionQueue = [
    ...(Array.isArray(dispatchPolicy.requiredActions) ? dispatchPolicy.requiredActions : []),
    ...(Array.isArray(extraActions) ? extraActions : []),
  ];
  for (const item of actionQueue) {
    results.push(await runPreflightAction(item, {
      rootDir,
      env,
      sessionId,
      preflightAdapters,
      fallbackOrchestrateRunner,
    }));
  }

  return {
    mode: preflightMode,
    results,
  };
}
