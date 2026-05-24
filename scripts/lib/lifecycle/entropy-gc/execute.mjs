/* 中文注释：execute 层编排扫描、归档和证据持久化，具体规则由下层模块提供。 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { resolveContextDbRoot } from '../../aios/state-root.mjs';
import {
  collectRecentReferencedArtifacts,
  listDispatchArtifacts,
  moveFileSafe,
  selectEntropyCandidates,
} from './artifacts.mjs';
import { ENTROPY_EVENT_KIND } from './constants.mjs';
import { normalizeEntropyFailureCategory, persistEntropyEvidence } from './evidence.mjs';
import { readJsonLinesOptional } from './json-lines.mjs';
import { planEntropyGc } from './options.mjs';
import { buildCandidateRecord, formatStamp, toRelativePath } from './shared.mjs';

export async function executeEntropyGc(
  rawOptions = {},
  {
    rootDir,
    now = Date.now(),
    persistEvidence = true,
  } = {}
) {
  const { options } = planEntropyGc(rawOptions);

  if (options.mode === 'off') {
    return {
      ok: true,
      sessionId: options.sessionId,
      mode: 'off',
      retain: options.retain,
      minAgeHours: options.minAgeHours,
      candidateCount: 0,
      archivedCount: 0,
      candidates: [],
      archived: [],
      keep: [],
      skippedReferenced: [],
      skippedFresh: [],
      manifestPath: '',
      archiveRoot: '',
      evidence: { persisted: false, reason: 'mode-off' },
    };
  }

  const sessionDir = path.join(resolveContextDbRoot(rootDir, { preferLegacyExisting: true }), 'sessions', options.sessionId);
  const artifactsDir = path.join(sessionDir, 'artifacts');
  const checkpointsPath = path.join(sessionDir, 'l1-checkpoints.jsonl');
  const checkpoints = await readJsonLinesOptional(checkpointsPath);
  const referenced = collectRecentReferencedArtifacts(checkpoints, 20);
  let records = [];
  try {
    records = await listDispatchArtifacts(artifactsDir);
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'ENOENT') {
      throw error;
    }
  }

  const { keepSet, candidates, skippedReferenced, skippedFresh } = selectEntropyCandidates({
    rootDir,
    records,
    referenced,
    retain: options.retain,
    minAgeHours: options.minAgeHours,
    now,
  });
  const stamp = formatStamp(new Date(now));
  const archiveRoot = path.join(sessionDir, 'archive', `entropy-gc-${stamp}`);
  const manifestPath = path.join(archiveRoot, 'manifest.json');
  const archived = [];

  if (options.mode === 'auto' && candidates.length > 0) {
    await fs.mkdir(archiveRoot, { recursive: true });
    for (const record of candidates) {
      const targetPath = path.join(archiveRoot, path.basename(record.absolutePath));
      await moveFileSafe(record.absolutePath, targetPath);
      archived.push({
        from: toRelativePath(rootDir, record.absolutePath),
        to: toRelativePath(rootDir, targetPath),
        sizeBytes: record.sizeBytes,
        mtimeMs: Math.floor(record.mtimeMs),
      });
    }
  }

  const report = {
    ok: true,
    sessionId: options.sessionId,
    mode: options.mode,
    retain: options.retain,
    minAgeHours: options.minAgeHours,
    scannedCount: records.length,
    candidateCount: candidates.length,
    archivedCount: archived.length,
    candidates: candidates.map((record) => buildCandidateRecord(rootDir, record)),
    archived,
    keep: [...keepSet],
    skippedReferenced,
    skippedFresh,
    manifestPath: archived.length > 0 ? toRelativePath(rootDir, manifestPath) : '',
    archiveRoot: archived.length > 0 ? toRelativePath(rootDir, archiveRoot) : '',
    evidence: { persisted: false, reason: 'not-requested' },
  };

  if (archived.length > 0) {
    const manifest = {
      schemaVersion: 1,
      kind: ENTROPY_EVENT_KIND,
      sessionId: options.sessionId,
      createdAt: new Date(now).toISOString(),
      mode: options.mode,
      retain: options.retain,
      minAgeHours: options.minAgeHours,
      scannedCount: report.scannedCount,
      candidateCount: report.candidateCount,
      archivedCount: report.archivedCount,
      archived,
      keep: report.keep,
      skippedReferenced: report.skippedReferenced,
      skippedFresh: report.skippedFresh,
    };
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }

  if (!persistEvidence) {
    return report;
  }

  try {
    report.evidence = persistEntropyEvidence(report, { rootDir, sessionId: options.sessionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report.evidence = {
      persisted: false,
      error: message,
      failureCategory: normalizeEntropyFailureCategory(message),
    };
  }

  return report;
}
