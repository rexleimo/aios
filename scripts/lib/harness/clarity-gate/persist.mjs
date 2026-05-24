/* 中文注释：persist 模块只负责 clarity gate 的 ContextDB 事件和 checkpoint 写入。 */
import { runContextDbCli } from '../../contextdb-cli.mjs';
import { CLARITY_GATE_EVENT_KIND } from './constants.mjs';
import { formatTurnStamp, normalizeStringArray, normalizeText } from './shared.mjs';

export function buildClaritySummary(gate) {
  if (!gate?.needsHuman) {
    return `Clarity gate clear for session ${gate?.sessionId || '(unknown)'}: automation can continue.`;
  }
  return `Clarity gate requires human input for session ${gate.sessionId}: ${gate.reasons.join('; ')}`;
}

export function buildEvidenceText(gate, eventId = '') {
  const parts = [];
  if (eventId) {
    parts.push(`event=${eventId}`);
  }
  parts.push(`needsHuman=${gate.needsHuman ? 'true' : 'false'}`);
  parts.push(`blockedCheckpoints=${gate.metrics.blockedCheckpoints}`);
  parts.push(`blockedCheckpointsTotal=${gate.metrics.blockedCheckpointsTotal}`);
  parts.push(`blockedCheckpointsExcluded=${gate.metrics.blockedCheckpointsExcluded}`);
  parts.push(`conflictingRecommendations=${gate.metrics.conflictingRecommendations ? 'true' : 'false'}`);
  parts.push(`filesTouched=${gate.metrics.filesTouched}`);
  parts.push(`riskSignals=${gate.metrics.riskSignalCount || 0}`);
  parts.push(`sensitiveCommands=${gate.metrics.sensitiveCommandSignals?.length || 0}`);
  parts.push(`externalWrites=${gate.metrics.externalWriteSignals?.length || 0}`);
  parts.push(`boundaries=${gate.metrics.boundaryCrossingSignals?.length || 0}`);
  return parts.join('; ');
}

export function persistClarityGateDecision(
  {
    rootDir,
    sessionId,
    gate,
  } = {}
) {
  if (!gate?.needsHuman) {
    return { persisted: false, reason: 'not-required' };
  }
  if (!normalizeText(sessionId)) {
    return { persisted: false, reason: 'session-required' };
  }

  try {
    const summary = buildClaritySummary({ ...gate, sessionId });
    const dispatchTurnIds = normalizeStringArray(gate?.metrics?.dispatchTurnIds);
    const dispatchWorkItemRefs = normalizeStringArray(gate?.metrics?.dispatchWorkItemRefs);
    const turnId = `clarity:${formatTurnStamp()}:summary`;
    const eventArgs = [
      'event:add',
      '--workspace',
      rootDir,
      '--session',
      sessionId,
      '--role',
      'assistant',
      '--kind',
      CLARITY_GATE_EVENT_KIND,
      '--text',
      summary,
      '--turn-id',
      turnId,
      '--turn-type',
      'verification',
      '--environment',
      'orchestrate',
      '--hindsight-status',
      'evaluated',
      '--outcome',
      'ambiguous',
    ];
    if (dispatchTurnIds.length > 0) {
      eventArgs.push('--parent-turn-id', dispatchTurnIds[0]);
    }
    if (dispatchWorkItemRefs.length > 0) {
      eventArgs.push('--work-item-refs', dispatchWorkItemRefs.join(','));
    }
    const event = runContextDbCli(eventArgs);
    const eventId = `${sessionId}#${event.seq}`;
    const checkpoint = runContextDbCli([
      'checkpoint',
      '--workspace',
      rootDir,
      '--session',
      sessionId,
      '--summary',
      summary,
      '--status',
      'blocked',
      '--next',
      gate.nextActions.join('|'),
      '--verify-result',
      'partial',
      '--verify-evidence',
      buildEvidenceText(gate, eventId),
      '--retry-count',
      '0',
      '--elapsed-ms',
      '0',
      '--failure-category',
      'clarity-needs-input',
    ]);

    return {
      persisted: true,
      mode: 'contextdb',
      eventKind: CLARITY_GATE_EVENT_KIND,
      eventId,
      checkpointId: `${sessionId}#C${checkpoint.seq}`,
      checkpointStatus: 'blocked',
    };
  } catch (error) {
    return {
      persisted: false,
      mode: 'contextdb',
      eventKind: CLARITY_GATE_EVENT_KIND,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
