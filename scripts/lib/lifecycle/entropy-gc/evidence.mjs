/* 中文注释：entropy-gc 证据模块只负责写 ContextDB 事件/检查点，不参与文件归档。 */
import { runContextDbCli } from '../../contextdb-cli.mjs';
import { buildEntropyTurnId } from './shared.mjs';
import { ENTROPY_EVENT_KIND } from './constants.mjs';

export function createEntropySummary(report) {
  if (report.mode === 'off') {
    return `Entropy GC skipped for ${report.sessionId}: mode=off`;
  }
  if (report.mode === 'dry-run') {
    return `Entropy GC dry-run for ${report.sessionId}: candidates=${report.candidateCount} retain=${report.retain} minAgeHours=${report.minAgeHours}`;
  }
  return `Entropy GC auto for ${report.sessionId}: archived=${report.archivedCount} candidates=${report.candidateCount} retain=${report.retain} minAgeHours=${report.minAgeHours}`;
}

export function buildEntropyEvidence(report, eventId = '') {
  const parts = [
    `mode=${report.mode}`,
    `candidates=${report.candidateCount}`,
    `archived=${report.archivedCount}`,
  ];
  if (eventId) {
    parts.unshift(`event=${eventId}`);
  }
  if (report.manifestPath) {
    parts.push(`manifest=${report.manifestPath}`);
  }
  return parts.join('; ');
}

export function buildEntropyNextActions(report) {
  if (report.mode === 'off') {
    return ['Entropy GC skipped by mode=off'];
  }
  if (report.mode === 'dry-run') {
    return report.candidateCount > 0
      ? ['Review dry-run candidates', 'Run entropy-gc auto when safe']
      : ['No stale artifacts found'];
  }
  return report.archivedCount > 0
    ? ['Review archive manifest', 'Re-run learn-eval to confirm cleaner signal']
    : ['No stale artifacts required archiving'];
}

export function normalizeEntropyFailureCategory(errorMessage = '') {
  const normalized = String(errorMessage || '').toLowerCase();
  if (normalized.includes('permission') || normalized.includes('eacces') || normalized.includes('eperm')) {
    return 'entropy-gc-permission';
  }
  return 'entropy-gc-error';
}

export function persistEntropyEvidence(report, { rootDir, sessionId }) {
  const turnId = buildEntropyTurnId(report);
  const eventArgs = [
    'event:add',
    '--workspace',
    rootDir,
    '--session',
    sessionId,
    '--role',
    'assistant',
    '--kind',
    ENTROPY_EVENT_KIND,
    '--text',
    createEntropySummary(report),
    '--turn-id',
    turnId,
    '--turn-type',
    'system-maintenance',
    '--environment',
    'entropy-gc',
    '--hindsight-status',
    'na',
    '--outcome',
    'success',
  ];
  if (report.manifestPath) {
    eventArgs.push('--refs', report.manifestPath);
    eventArgs.push('--next-state-refs', report.manifestPath);
  }
  const event = runContextDbCli(eventArgs);

  const eventId = `${sessionId}#${event.seq}`;
  const checkpointArgs = [
    'checkpoint',
    '--workspace',
    rootDir,
    '--session',
    sessionId,
    '--summary',
    createEntropySummary(report),
    '--status',
    'running',
    '--next',
    buildEntropyNextActions(report).join('|'),
    '--verify-result',
    'partial',
    '--verify-evidence',
    buildEntropyEvidence(report, eventId),
    '--retry-count',
    '0',
    '--elapsed-ms',
    '0',
  ];
  if (report.manifestPath) {
    checkpointArgs.push('--artifacts', report.manifestPath);
  }

  const checkpoint = runContextDbCli(checkpointArgs);
  return {
    persisted: true,
    eventId,
    checkpointId: `${sessionId}#C${checkpoint.seq}`,
    checkpointStatus: 'running',
  };
}
