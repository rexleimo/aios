/* 中文注释：persist 模块负责 ContextDB 事件/checkpoint 写入，计算细节来自其它模块。 */
import path from 'node:path';

import { runContextDbCli } from '../../contextdb-cli.mjs';
import { buildDispatchArtifactPayload, writeArtifact } from './artifact.mjs';
import { ORCHESTRATION_DISPATCH_EVENT_KIND } from './constants.mjs';
import { normalizeDispatchCost } from './cost.mjs';
import {
  buildArtifactPath,
  formatArtifactTimestamp,
  formatRefsCsv,
  normalizeDispatchMode,
  normalizeText,
} from './shared.mjs';
import { buildCheckpointSummary, buildEventText, buildNextActions } from './text.mjs';
import { enrichDispatchRunForArtifact } from './turns.mjs';

export async function persistDispatchEvidence({ rootDir, sessionId, report, elapsedMs, now = null } = {}) {
  if (!report?.dispatchRun) {
    return { persisted: false, reason: 'dispatch-run-missing' };
  }

  const mode = normalizeDispatchMode(report.dispatchRun);
  if (mode !== 'dry-run' && mode !== 'live') {
    return { persisted: false, reason: 'mode-unsupported', mode };
  }
  if (mode === 'live' && (!Array.isArray(report.dispatchRun.jobRuns) || report.dispatchRun.jobRuns.length === 0)) {
    return { persisted: false, reason: 'mode-unsupported', mode };
  }

  if (!sessionId) {
    return { persisted: false, reason: 'session-required', mode: 'contextdb' };
  }

  const persistedAt = now instanceof Date ? now : new Date();
  const stamp = formatArtifactTimestamp(persistedAt);
  const artifactPath = buildArtifactPath(rootDir, sessionId, stamp);
  const artifactAbsPath = path.join(rootDir, artifactPath);
  const dispatchRunForArtifact = enrichDispatchRunForArtifact(report.dispatchRun, report.dispatchPlan, stamp);
  const artifactPayload = buildDispatchArtifactPayload({
    sessionId,
    persistedAt,
    report,
    dispatchRunForArtifact,
    artifactPath,
  });

  await writeArtifact(artifactAbsPath, artifactPayload);

  try {
    const dispatchCost = normalizeDispatchCost(report.dispatchRun.cost);
    const dispatchSummaryTurnId = `dispatch:${stamp}:summary`;
    const dispatchWorkItemRefs = Array.isArray(report.workItems)
      ? report.workItems
        .map((item) => normalizeText(item?.itemId || item?.id || ''))
        .filter(Boolean)
      : [];
    const eventRefs = [
      artifactPath,
      'env:orchestrate',
      `dispatch:${stamp}`,
    ];
    const eventArgs = [
      'event:add',
      '--workspace',
      rootDir,
      '--session',
      sessionId,
      '--role',
      'assistant',
      '--kind',
      ORCHESTRATION_DISPATCH_EVENT_KIND,
      '--text',
      buildEventText(report, artifactPath),
      '--turn-id',
      dispatchSummaryTurnId,
      '--turn-type',
      'verification',
      '--environment',
      'orchestrate',
      '--hindsight-status',
      'evaluated',
      '--outcome',
      report.dispatchRun.ok ? 'success' : 'retry-needed',
      '--refs',
      formatRefsCsv(eventRefs),
    ];
    if (dispatchWorkItemRefs.length > 0) {
      eventArgs.push('--work-item-refs', dispatchWorkItemRefs.join(','));
    }
    const event = runContextDbCli(eventArgs);
    const eventId = `${sessionId}#${event.seq}`;

    const checkpointStatus = report.dispatchRun.ok ? 'running' : 'blocked';
    const checkpointArgs = [
      'checkpoint',
      '--workspace',
      rootDir,
      '--session',
      sessionId,
      '--summary',
      buildCheckpointSummary(report),
      '--status',
      checkpointStatus,
      '--artifacts',
      artifactPath,
      '--next',
      buildNextActions(report, artifactPath).join('|'),
      '--verify-result',
      report.dispatchRun.ok ? 'partial' : 'failed',
      '--verify-evidence',
      `event=${eventId}; artifact=${artifactPath}`,
      '--retry-count',
      '0',
      '--elapsed-ms',
      String(Math.max(0, Math.floor(elapsedMs || 0))),
      '--cost-input-tokens',
      String(dispatchCost.inputTokens),
      '--cost-output-tokens',
      String(dispatchCost.outputTokens),
      '--cost-total-tokens',
      String(dispatchCost.totalTokens),
      '--cost-usd',
      String(dispatchCost.usd),
    ];

    if (!report.dispatchRun.ok) {
      checkpointArgs.push('--failure-category', mode === 'live' ? 'dispatch-runtime-blocked' : 'merge-gate-blocked');
    }

    const checkpoint = runContextDbCli(checkpointArgs);
    const checkpointId = `${sessionId}#C${checkpoint.seq}`;
    const evidence = {
      persisted: true,
      mode: 'contextdb',
      artifactPath,
      eventKind: ORCHESTRATION_DISPATCH_EVENT_KIND,
      eventId,
      checkpointId,
      checkpointStatus,
    };

    await writeArtifact(artifactAbsPath, {
      ...artifactPayload,
      dispatchEvidence: evidence,
    });

    return evidence;
  } catch (error) {
    return {
      persisted: false,
      mode: 'contextdb',
      artifactPath,
      eventKind: ORCHESTRATION_DISPATCH_EVENT_KIND,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
