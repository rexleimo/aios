/* 中文注释：release-status 运行层负责 IO 编排，计算/渲染分别交给下层纯函数模块。 */
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  loadPolicyReleaseState,
  normalizePolicyReleaseConfig,
} from '../../rl-orchestrator-v1/policy-release-gate.mjs';
import { buildHealthSummary } from './health.mjs';
import { buildDailyHistory, buildHistorySignals, buildRecentSummary, renderHistoryExport } from './history.mjs';
import { planReleaseStatus } from './options.mjs';
import { buildFailureResult, renderReleaseStatusText } from './rendering.mjs';
import { toPosixPath } from './shared.mjs';

export async function runReleaseStatus(rawOptions = {}, { rootDir, io = console, env = process.env } = {}) {
  const { options } = planReleaseStatus(rawOptions, { rootDir, env });
  if (!rawOptions.statePath) {
    options.statePath = await resolveReadableDefaultStatePath(options.statePath, rootDir);
  }
  const statePath = toPosixPath(path.relative(rootDir, options.statePath) || options.statePath);
  const outputPath = options.outputPath
    ? toPosixPath(path.relative(rootDir, options.outputPath) || options.outputPath)
    : '';
  const historyOutputPath = options.historyOutputPath
    ? toPosixPath(path.relative(rootDir, options.historyOutputPath) || options.historyOutputPath)
    : '';

  const emitResult = async (result) => {
    const rendered = options.format === 'json'
      ? JSON.stringify(result, null, 2)
      : renderReleaseStatusText(result);
    io.log(rendered);
    if (options.outputPath) {
      await mkdir(path.dirname(options.outputPath), { recursive: true });
      await writeFile(options.outputPath, `${rendered.trimEnd()}\n`, 'utf8');
    }
  };

  const emitHistory = async (history) => {
    if (!options.historyOutputPath) return;
    const rendered = renderHistoryExport(history, options.historyFormat);
    await mkdir(path.dirname(options.historyOutputPath), { recursive: true });
    await writeFile(options.historyOutputPath, rendered, 'utf8');
  };

  try {
    await access(options.statePath);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      const result = {
        ...buildFailureResult(`state file not found: ${statePath}`, options, statePath),
        outputPath,
        historyOutputPath,
      };
      await emitResult(result);
      return result;
    }
    throw error;
  }

  const releaseConfig = normalizePolicyReleaseConfig({
    rootDir,
    policyRelease: {
      mode: 'canary',
      statePath: options.statePath,
    },
  });
  const state = await loadPolicyReleaseState(releaseConfig);
  const recentEntries = Array.isArray(state.recent)
    ? state.recent.slice(-options.recent)
    : [];
  const historyEntries = Array.isArray(state.recent) ? state.recent : [];
  const recentWindow = buildRecentSummary(recentEntries);
  const historyDaily = buildDailyHistory(historyEntries, options.historyDays);
  const historySignals = buildHistorySignals({
    historyDaily,
    maxFailureRate: options.maxFailureRate,
    maxFallbackRate: options.maxFallbackRate,
    failureDeltaWarn: options.wowFailureRateDeltaWarn,
    fallbackDeltaWarn: options.wowFallbackRateDeltaWarn,
  });
  const health = buildHealthSummary({
    recentWindow,
    minSamples: options.minSamples,
    maxFailureRate: options.maxFailureRate,
    maxFallbackRate: options.maxFallbackRate,
  });
  const strictFailed = options.strict && !health.gatePassed;
  const result = {
    ok: true,
    exitCode: strictFailed ? 1 : 0,
    format: options.format,
    statePath,
    outputPath,
    historyOutputPath,
    historyFormat: options.historyFormat,
    historyDays: options.historyDays,
    strict: options.strict,
    updatedAt: state.updated_at || null,
    effectiveMode: state.effective_mode,
    effectiveRolloutRate: Number(state.effective_rollout_rate || 0),
    counters: {
      ...(state.counters || {}),
    },
    lastDowngradeReason: state.last_downgrade_reason || null,
    lastPromotionReason: state.last_promotion_reason || null,
    recentWindow: {
      ...recentWindow,
      limit: options.recent,
    },
    historyDaily,
    historySignals,
    health,
    strictFailed,
    state,
  };

  await emitHistory(historyDaily);
  await emitResult(result);
  return result;
}

async function resolveReadableDefaultStatePath(defaultStatePath, rootDir) {
  try {
    await access(defaultStatePath);
    return defaultStatePath;
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'ENOENT') throw error;
  }

  const legacyStatePath = path.join(
    rootDir,
    'experiments',
    'rl-mixed-v1',
    'release',
    'orchestrator-policy-release.state.json'
  );
  try {
    await access(legacyStatePath);
    return legacyStatePath;
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'ENOENT') throw error;
    return defaultStatePath;
  }
}
