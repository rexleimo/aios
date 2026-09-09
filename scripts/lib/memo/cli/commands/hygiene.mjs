import {
  HYGIENE_DEFAULT_MIN_AGE_DAYS,
  ROTATE_DEFAULT_MAX_EVENTS,
  archiveStaleSessions,
  renderHygieneReport,
  rotateSessionEvents,
  surveyWorkspaceMemoryHygiene,
} from '../../hygiene.mjs';
import { usageError } from '../shared.mjs';

function parsePositiveInteger(raw, flagName) {
  const value = Number.parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(value) || value < 1) {
    throw usageError(`${flagName} must be a positive integer`);
  }
  return value;
}

function parseHygieneFlags(rest) {
  const options = {
    json: false,
    archiveStaleSessions: false,
    rotateEvents: false,
    minAgeDays: HYGIENE_DEFAULT_MIN_AGE_DAYS,
    maxEvents: ROTATE_DEFAULT_MAX_EVENTS,
  };
  const usage = 'Usage: memo hygiene [--json] [--min-age-days N] [--archive-stale-sessions] [--rotate-events] [--max-events N]';
  for (let index = 0; index < rest.length; index += 1) {
    const arg = String(rest[index] || '');
    const value = () => {
      const next = rest[index + 1];
      if (next === undefined) throw usageError(`${arg} requires a value\n${usage}`);
      index += 1;
      return next;
    };
    if (arg === '--json') options.json = true;
    else if (arg === '--archive-stale-sessions') options.archiveStaleSessions = true;
    else if (arg === '--rotate-events') options.rotateEvents = true;
    else if (arg === '--min-age-days') options.minAgeDays = parsePositiveInteger(value(), arg);
    else if (arg === '--max-events') options.maxEvents = parsePositiveInteger(value(), arg);
    else throw usageError(usage);
  }
  return options;
}

function printArchiveResult(io, archive) {
  for (const entry of archive.moved) {
    io.log(`archived: ${entry.sessionId} (${entry.from} -> ${entry.to})`);
  }
  io.log(`archived ${archive.moved.length} session(s), skipped ${archive.skipped}`);
}

function printRotateResult(io, rotate) {
  for (const entry of rotate.rotated) {
    io.log(`rotated: ${entry.file} moved=${entry.movedLines} kept=${entry.keptLines} archive=${entry.archiveFile} sha256 ${entry.sha256Before} -> ${entry.sha256After}`);
  }
  io.log(`rotated ${rotate.rotated.length} event log(s), ${rotate.untouched} at or below the keep threshold`);
}

/* E2 step 4 of the approval queue: a separate hygiene command whose default
 * is a read-only survey. Archive/rotate only run behind their explicit
 * flags, always move (never delete), and print an auditable diff. Owner
 * should run applies while agent sessions are idle — l2 appends are not
 * lock-coordinated with rotation. */
export async function handleMemoHygieneCommand({ rest = [], workspaceRoot, io }) {
  const options = parseHygieneFlags(rest);
  const now = new Date();

  if (!options.archiveStaleSessions && !options.rotateEvents) {
    const report = await surveyWorkspaceMemoryHygiene(workspaceRoot, {
      minAgeDays: options.minAgeDays,
      now,
      env: process.env,
    });
    io.log(options.json ? JSON.stringify(report, null, 2) : renderHygieneReport(report));
    return true;
  }

  const survey = await surveyWorkspaceMemoryHygiene(workspaceRoot, {
    minAgeDays: options.minAgeDays,
    now,
    env: process.env,
  });
  const result = { generatedAt: survey.generatedAt };
  if (options.archiveStaleSessions) {
    result.archive = await archiveStaleSessions(workspaceRoot, {
      minAgeDays: options.minAgeDays,
      now,
      env: process.env,
    });
  }
  if (options.rotateEvents) {
    result.rotate = await rotateSessionEvents(workspaceRoot, {
      maxEvents: options.maxEvents,
      now,
      env: process.env,
    });
  }

  if (options.json) {
    io.log(JSON.stringify(result, null, 2));
    return true;
  }
  if (result.archive) printArchiveResult(io, result.archive);
  if (result.rotate) printRotateResult(io, result.rotate);
  const archived = result.archive?.moved.length ?? 0;
  const rotated = result.rotate?.rotated.length ?? 0;
  io.log(`hygiene applied: ${archived} archived, ${rotated} rotated, 0 deleted`);
  return true;
}
