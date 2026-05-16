import { promises as fs } from 'node:fs';
import path from 'node:path';
import { contextDbRelativePath } from '../aios/state-root.mjs';

import { runContextDbCli } from '../contextdb-cli.mjs';

export const QUALITY_GATE_VERIFICATION_KIND = 'verification.quality-gate';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function formatArtifactTimestamp(ts = new Date()) {
  return ts.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function buildArtifactPath(rootDir, sessionId, stamp) {
  return contextDbRelativePath(rootDir, 'sessions', sessionId, 'artifacts', `quality-gate-${stamp}.json`);
}

function summarizeChecks(results = []) {
  return results.map((item) => `${item.label}:${item.status}`).join(', ');
}

function formatRefsCsv(refs = []) {
  const seen = new Set();
  const values = [];
  for (const item of refs) {
    const text = normalizeText(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    values.push(text);
  }
  return values.join(',');
}

function buildEventText(report, artifactPath) {
  const statusLabel = report.ok ? 'passed' : 'failed';
  const failedChecks = Array.isArray(report.failedChecks) ? report.failedChecks.join(',') : '';
  const failedSummary = failedChecks ? ` failed=${failedChecks}` : '';
  return `quality-gate ${normalizeText(report.mode || 'full')} ${statusLabel}: profile=${normalizeText(report.profile || 'standard')} checks=${Array.isArray(report.results) ? report.results.length : 0}${failedSummary}; artifact=${artifactPath}`;
}

function collectNextStateRefs(report) {
  const refs = [];
  const failedChecks = Array.isArray(report.failedChecks) ? report.failedChecks : [];
  for (const check of failedChecks) {
    const label = normalizeText(check).toLowerCase().replace(/\s+/g, '-');
    if (label) refs.push(`check:${label}`);
  }
  const category = normalizeText(report.failureCategory);
  if (category) refs.push(`category:${category}`);
  return refs;
}

function buildCheckpointSummary(report) {
  const failedChecks = Array.isArray(report.failedChecks)
    ? report.failedChecks
    : Array.isArray(report.results)
      ? report.results.filter((item) => item.status === 'FAIL').map((item) => item.label)
      : [];
  const statusLabel = report.ok ? 'passed' : 'failed';
  const failedSummary = failedChecks.length > 0 ? ` failed=${failedChecks.join(',')}` : '';
  return `Recorded quality-gate ${report.mode} ${statusLabel}; checks=${Array.isArray(report.results) ? report.results.length : 0}.${failedSummary}`;
}

function buildNextActions(report, artifactPath) {
  const failedChecks = Array.isArray(report.failedChecks)
    ? report.failedChecks
    : Array.isArray(report.results)
      ? report.results.filter((item) => item.status === 'FAIL').map((item) => item.label)
      : [];

  if (failedChecks.length === 0) {
    return [
      `Review verification artifact ${artifactPath}`,
      'Continue with the next local orchestration step',
    ];
  }

  return [
    `Inspect failed quality checks (${failedChecks.join(', ')}) in ${artifactPath}`,
    'Address the failing local verification checks before rerunning preflight',
  ];
}

async function writeArtifact(absPath, payload) {
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function persistQualityGateEvidence({ rootDir, sessionId, report, elapsedMs = 0 } = {}) {
  if (!sessionId) {
    return { persisted: false, reason: 'session-required' };
  }
  if (!report) {
    return { persisted: false, reason: 'report-required' };
  }

  const stamp = formatArtifactTimestamp();
  const artifactPath = buildArtifactPath(rootDir, sessionId, stamp);
  const artifactAbsPath = path.join(rootDir, artifactPath);
  const artifactPayload = {
    schemaVersion: 1,
    kind: QUALITY_GATE_VERIFICATION_KIND,
    sessionId,
    persistedAt: new Date().toISOString(),
    ok: Boolean(report.ok),
    mode: String(report.mode || 'full'),
    profile: String(report.profile || 'standard'),
    failedChecks: Array.isArray(report.failedChecks) ? report.failedChecks : [],
    failureCategory: report.failureCategory || null,
    results: Array.isArray(report.results) ? report.results : [],
  };

  await writeArtifact(artifactAbsPath, artifactPayload);

  try {
    const eventTurnId = `quality-gate:${stamp}:summary`;
    const eventArgs = [
      'event:add',
      '--workspace',
      rootDir,
      '--session',
      sessionId,
      '--role',
      'assistant',
      '--kind',
      QUALITY_GATE_VERIFICATION_KIND,
      '--text',
      buildEventText(report, artifactPath),
      '--turn-id',
      eventTurnId,
      '--turn-type',
      'verification',
      '--environment',
      'quality-gate',
      '--hindsight-status',
      'evaluated',
      '--outcome',
      report.ok ? 'success' : 'retry-needed',
      '--refs',
      formatRefsCsv([
        artifactPath,
        'env:quality-gate',
        `quality-mode:${normalizeText(report.mode || 'full')}`,
        `quality-profile:${normalizeText(report.profile || 'standard')}`,
      ]),
    ];
    const nextStateRefs = collectNextStateRefs(report);
    if (nextStateRefs.length > 0) {
      eventArgs.push('--next-state-refs', nextStateRefs.join(','));
    }
    const event = runContextDbCli(eventArgs);
    const eventId = `${sessionId}#${event.seq}`;

    const checkpointStatus = report.ok ? 'done' : 'blocked';
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
      report.ok ? 'passed' : 'failed',
      '--verify-evidence',
      `mode=${report.mode || 'full'}; profile=${report.profile || 'standard'}; verificationArtifact=${artifactPath}; checks=${summarizeChecks(report.results)}; event=${eventId}`,
      '--retry-count',
      '0',
      '--elapsed-ms',
      String(Math.max(0, Math.floor(elapsedMs || 0))),
      '--cost-total-tokens',
      '0',
      '--cost-usd',
      '0',
    ];

    if (report.failureCategory) {
      checkpointArgs.push('--failure-category', report.failureCategory);
    }

    const checkpoint = runContextDbCli(checkpointArgs);

    return {
      persisted: true,
      mode: 'contextdb',
      artifactPath,
      eventKind: QUALITY_GATE_VERIFICATION_KIND,
      eventId,
      checkpointId: `${sessionId}#C${checkpoint.seq}`,
      checkpointStatus,
    };
  } catch (error) {
    return {
      persisted: false,
      mode: 'contextdb',
      artifactPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
