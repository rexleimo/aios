import { promises as fs } from 'node:fs';
import path from 'node:path';
import { contextDbRelativePath, resolveContextDbRoot } from '../aios/state-root.mjs';

import {
  createDefaultEntropyGcOptions,
  normalizeEntropyGcFormat,
  normalizeEntropyGcMode,
} from './options.mjs';
import { runContextDbCli } from '../contextdb-cli.mjs';

const DISPATCH_ARTIFACT_RE = /^dispatch-run-.*\.json$/i;
const ENTROPY_EVENT_KIND = 'maintenance.entropy-gc';

function normalizeText(value = '') {
  return String(value ?? '').trim();
}

function normalizePath(value = '') {
  return String(value || '').split(path.sep).join('/');
}

function toRelativePath(rootDir, absolutePath) {
  return normalizePath(path.relative(rootDir, absolutePath));
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function formatStamp(date = new Date()) {
  const iso = date.toISOString().replace(/[-:]/g, '');
  return iso.slice(0, 15).replace('T', 'T');
}

function buildEntropyTurnId(report = {}) {
  const sessionId = normalizeText(report.sessionId).replace(/[^a-zA-Z0-9._:-]/g, '') || 'session';
  return `entropy:${sessionId}:${formatStamp()}`;
}

function readJsonLines(raw = '') {
  return String(raw || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readJsonLinesOptional(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return readJsonLines(raw);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function collectRecentReferencedArtifacts(checkpoints = [], limit = 20) {
  const selected = checkpoints.slice(Math.max(0, checkpoints.length - limit));
  const refs = new Set();
  for (const checkpoint of selected) {
    for (const artifact of Array.isArray(checkpoint?.artifacts) ? checkpoint.artifacts : []) {
      const normalized = normalizePath(String(artifact || ''));
      if (DISPATCH_ARTIFACT_RE.test(path.basename(normalized))) {
        refs.add(normalized);
      }
    }
  }
  return refs;
}

async function listDispatchArtifacts(artifactsDir) {
  const entries = await fs.readdir(artifactsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && DISPATCH_ARTIFACT_RE.test(entry.name))
    .map((entry) => entry.name);

  const records = [];
  for (const fileName of files) {
    const absolutePath = path.join(artifactsDir, fileName);
    const stats = await fs.stat(absolutePath);
    records.push({
      fileName,
      absolutePath,
      mtimeMs: stats.mtimeMs,
      sizeBytes: stats.size,
    });
  }

  records.sort((left, right) => right.mtimeMs - left.mtimeMs || left.fileName.localeCompare(right.fileName));
  return records;
}

async function moveFileSafe(sourcePath, targetPath) {
  try {
    await fs.rename(sourcePath, targetPath);
    return;
  } catch (error) {
    if (!error || typeof error !== 'object' || error.code !== 'EXDEV') {
      throw error;
    }
  }

  await fs.copyFile(sourcePath, targetPath);
  await fs.unlink(sourcePath);
}

function createEntropySummary(report) {
  if (report.mode === 'off') {
    return `Entropy GC skipped for ${report.sessionId}: mode=off`;
  }
  if (report.mode === 'dry-run') {
    return `Entropy GC dry-run for ${report.sessionId}: candidates=${report.candidateCount} retain=${report.retain} minAgeHours=${report.minAgeHours}`;
  }
  return `Entropy GC auto for ${report.sessionId}: archived=${report.archivedCount} candidates=${report.candidateCount} retain=${report.retain} minAgeHours=${report.minAgeHours}`;
}

function buildEntropyEvidence(report, eventId = '') {
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

function buildEntropyNextActions(report) {
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

function normalizeEntropyFailureCategory(errorMessage = '') {
  const normalized = String(errorMessage || '').toLowerCase();
  if (normalized.includes('permission') || normalized.includes('eacces') || normalized.includes('eperm')) {
    return 'entropy-gc-permission';
  }
  return 'entropy-gc-error';
}

function buildCandidateRecord(rootDir, record) {
  return {
    path: toRelativePath(rootDir, record.absolutePath),
    sizeBytes: record.sizeBytes,
    mtimeMs: Math.floor(record.mtimeMs),
  };
}

export function normalizeEntropyGcOptions(rawOptions = {}) {
  const defaults = createDefaultEntropyGcOptions();
  const sessionId = String(rawOptions.sessionId ?? defaults.sessionId).trim();
  const mode = normalizeEntropyGcMode(rawOptions.mode ?? defaults.mode);
  const retain = parsePositiveInteger(rawOptions.retain, defaults.retain);
  const minAgeHours = parsePositiveInteger(rawOptions.minAgeHours, defaults.minAgeHours);
  const format = normalizeEntropyGcFormat(rawOptions.format ?? defaults.format);

  if (!sessionId && mode !== 'off') {
    throw new Error('entropy-gc requires --session unless mode=off');
  }

  return {
    sessionId,
    mode,
    retain,
    minAgeHours,
    format,
  };
}

export function planEntropyGc(rawOptions = {}) {
  const options = normalizeEntropyGcOptions(rawOptions);
  const args = ['entropy-gc', options.mode];
  if (options.sessionId) {
    args.push('--session', options.sessionId);
  }
  if (options.retain !== 5) {
    args.push('--retain', String(options.retain));
  }
  if (options.minAgeHours !== 24) {
    args.push('--min-age-hours', String(options.minAgeHours));
  }
  if (options.format !== 'text') {
    args.push('--format', options.format);
  }
  return {
    command: 'entropy-gc',
    options,
    preview: `node scripts/aios.mjs ${args.join(' ')}`,
  };
}

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

  const keepSet = new Set(records.slice(0, options.retain).map((item) => toRelativePath(rootDir, item.absolutePath)));
  const minAgeMs = options.minAgeHours * 60 * 60 * 1000;
  const cutoffMs = now - minAgeMs;

  const candidates = [];
  const skippedReferenced = [];
  const skippedFresh = [];
  for (const record of records) {
    const relativePath = toRelativePath(rootDir, record.absolutePath);
    if (keepSet.has(relativePath)) {
      continue;
    }
    if (referenced.has(relativePath)) {
      skippedReferenced.push(buildCandidateRecord(rootDir, record));
      continue;
    }
    if (record.mtimeMs > cutoffMs) {
      skippedFresh.push(buildCandidateRecord(rootDir, record));
      continue;
    }
    candidates.push(record);
  }

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
    const turnId = buildEntropyTurnId(report);
    const eventArgs = [
      'event:add',
      '--workspace',
      rootDir,
      '--session',
      options.sessionId,
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

    const eventId = `${options.sessionId}#${event.seq}`;
    const checkpointArgs = [
      'checkpoint',
      '--workspace',
      rootDir,
      '--session',
      options.sessionId,
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
    report.evidence = {
      persisted: true,
      eventId,
      checkpointId: `${options.sessionId}#C${checkpoint.seq}`,
      checkpointStatus: 'running',
    };
  } catch (error) {
    report.evidence = {
      persisted: false,
      error: error instanceof Error ? error.message : String(error),
      failureCategory: normalizeEntropyFailureCategory(error instanceof Error ? error.message : String(error)),
    };
  }

  return report;
}

export async function runEntropyGc(rawOptions = {}, { rootDir, io = console } = {}) {
  const { options } = planEntropyGc(rawOptions);
  const report = await executeEntropyGc(options, { rootDir, persistEvidence: true });

  if (options.format === 'json') {
    io.log(JSON.stringify(report, null, 2));
    return { exitCode: 0, report };
  }

  io.log('ENTROPY GC');
  io.log('----------');
  io.log(`Session: ${report.sessionId || '(none)'}`);
  io.log(`Mode: ${report.mode}`);
  io.log(`Scanned: ${report.scannedCount}`);
  io.log(`Candidates: ${report.candidateCount}`);
  io.log(`Archived: ${report.archivedCount}`);
  if (report.manifestPath) {
    io.log(`Manifest: ${report.manifestPath}`);
  }
  if (report.evidence?.persisted === true) {
    io.log(`Checkpoint: ${report.evidence.checkpointId}`);
  } else if (report.evidence?.error) {
    io.log(`Evidence: failed - ${report.evidence.error}`);
  }

  return { exitCode: 0, report };
}
