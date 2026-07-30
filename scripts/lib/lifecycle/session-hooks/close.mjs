import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveContextDbRoot } from '../../aios/state-root.mjs';
import { readJsonlEvents } from '../../memo/storage/events-read.mjs';
import { atomicWriteText } from '../../memo/storage/fs-io.mjs';
import { normalizeSessionId, readSessionChangedFiles } from '../../session/changed-files.mjs';

const SUMMARY_MAX_CHARS = 200;
const SESSION_CLOSE_CANDIDATE_FILE = 'session-close-memory-candidate.json';

function sessionDir(rootDir, sessionId, env = process.env) {
  return path.join(resolveContextDbRoot(rootDir, { preferLegacyExisting: true, env }), 'sessions', normalizeSessionId(sessionId));
}

function sessionEventsPath(rootDir, sessionId, env = process.env) {
  return path.join(sessionDir(rootDir, sessionId, env), 'l2-events.jsonl');
}

export function sessionCloseCandidatePath(rootDir, sessionId, { env = process.env } = {}) {
  return path.join(sessionDir(rootDir, sessionId, env), SESSION_CLOSE_CANDIDATE_FILE);
}

export async function readSessionCloseCandidate({ rootDir, sessionId, env = process.env }) {
  try {
    return JSON.parse(await fs.readFile(sessionCloseCandidatePath(rootDir, sessionId, { env }), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Read ContextDB l2-events for a given session and extract:
 *  - last assistant message content (truncated to 200 chars)
 *  - list of files touched (from changed-files ledger)
 *
 * Returns { lastAssistantContent, touchedFiles }.
 */
async function extractSessionSummary({ rootDir, sessionId, env = process.env }) {
  // 1. Read l2-events.jsonl for assistant messages
  const eventsPath = sessionEventsPath(rootDir, sessionId, env);
  let lastAssistantContent = '';
  try {
    const { events } = await readJsonlEvents(eventsPath, { tolerateMalformed: true });
    // Find last assistant-role event with text content
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event.role === 'assistant' && typeof event.text === 'string' && event.text.trim()) {
        lastAssistantContent = event.text.trim().slice(0, SUMMARY_MAX_CHARS);
        break;
      }
    }
  } catch {
    // No events file — empty summary
  }

  // 2. Read changed-files ledger for touched files
  let touchedFiles = [];
  try {
    const report = await readSessionChangedFiles({ rootDir, sessionId, env });
    touchedFiles = (report.files || []).map((f) => f.path);
  } catch {
    // No changed-files ledger — empty list
  }

  return { lastAssistantContent, touchedFiles };
}

/**
 * Session-close memory candidate hook.
 *
 * Reads ContextDB events for the session, extracts the last assistant
 * message content and the list of touched files, then writes a reviewable
 * candidate sidecar next to the ContextDB session. It does not publish to
 * project_shared recall.
 *
 * Returns the written candidate.
 */
export async function autoMemoSessionClose({ rootDir, sessionId, env = process.env }) {
  const safeSessionId = normalizeSessionId(sessionId);
  const { lastAssistantContent, touchedFiles } = await extractSessionSummary({ rootDir, sessionId: safeSessionId, env });

  const summaryParts = [`Session ${safeSessionId} completed.`];
  if (touchedFiles.length > 0) {
    summaryParts.push(`Key files: ${touchedFiles.join(', ')}`);
  }
  if (lastAssistantContent) {
    summaryParts.push(`Summary: ${lastAssistantContent}`);
  }

  const text = summaryParts.join(' ');

  const createdAt = new Date().toISOString();
  const candidate = {
    schemaVersion: 1,
    kind: 'session-close-memory-candidate',
    candidateId: `session-close:${safeSessionId}`,
    sessionId: safeSessionId,
    status: 'candidate',
    claimStatus: 'candidate',
    scope: 'project_shared',
    role: 'assistant',
    text,
    refs: touchedFiles,
    createdAt,
    updatedAt: createdAt,
    promotion: 'manual_or_steward',
    turn: {
      turnType: 'side',
      environment: 'session-close',
      expiryDays: 90,
    },
    source: {
      kind: 'contextdb-session',
      sessionId: safeSessionId,
      eventsPath: 'l2-events.jsonl',
    },
  };

  const candidatePath = sessionCloseCandidatePath(rootDir, safeSessionId, { env });
  await atomicWriteText(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);

  return candidate;
}

/**
 * CLI runner for session close subcommand.
 * Writes a reviewable candidate and prints confirmation to stdout.
 */
export async function runSessionClose(options, { rootDir = process.cwd(), stdout = process.stdout, env = process.env } = {}) {
  const sessionId = options.session || 'default';
  const candidate = await autoMemoSessionClose({ rootDir, sessionId, env });

  if (options.json || options.format === 'json') {
    stdout.write(`${JSON.stringify(candidate, null, 2)}\n`);
  } else {
    stdout.write(`Session close candidate written for ${sessionId}\n`);
    stdout.write(`  Candidate: ${candidate.candidateId}\n`);
    stdout.write(`  Text: ${candidate.text.slice(0, 80)}...\n`);
  }

  return { exitCode: 0, event: candidate, candidate };
}
