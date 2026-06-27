import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveContextDbRoot } from '../../aios/state-root.mjs';
import { readJsonlEvents } from '../../memo/storage/events-read.mjs';
import { readSessionChangedFiles } from '../../session/changed-files.mjs';
import { appendMemoEvent } from '../../memo/storage/events-write.mjs';

const SUMMARY_MAX_CHARS = 200;

function sessionDir(rootDir, sessionId) {
  return path.join(resolveContextDbRoot(rootDir, { preferLegacyExisting: true }), 'sessions', sessionId);
}

function sessionEventsPath(rootDir, sessionId) {
  return path.join(sessionDir(rootDir, sessionId), 'l2-events.jsonl');
}

/**
 * Read ContextDB l2-events for a given session and extract:
 *  - last assistant message content (truncated to 200 chars)
 *  - list of files touched (from changed-files ledger)
 *
 * Returns { lastAssistantContent, touchedFiles }.
 */
async function extractSessionSummary({ rootDir, sessionId }) {
  // 1. Read l2-events.jsonl for assistant messages
  const eventsPath = sessionEventsPath(rootDir, sessionId);
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
    const report = await readSessionChangedFiles({ rootDir, sessionId });
    touchedFiles = (report.files || []).map((f) => f.path);
  } catch {
    // No changed-files ledger — empty list
  }

  return { lastAssistantContent, touchedFiles };
}

/**
 * Auto-memo hook for session close.
 *
 * Reads ContextDB events for the session, extracts the last assistant
 * message content and the list of touched files, then writes a summary
 * memo event via appendMemoEvent (scope=project_shared, expiryDays=90).
 *
 * Returns the written memo event.
 */
export async function autoMemoSessionClose({ rootDir, sessionId }) {
  const { lastAssistantContent, touchedFiles } = await extractSessionSummary({ rootDir, sessionId });

  const summaryParts = [`Session ${sessionId} completed.`];
  if (touchedFiles.length > 0) {
    summaryParts.push(`Key files: ${touchedFiles.join(', ')}`);
  }
  if (lastAssistantContent) {
    summaryParts.push(`Summary: ${lastAssistantContent}`);
  }

  const text = summaryParts.join(' ');

  const event = await appendMemoEvent({
    workspaceRoot: rootDir,
    space: 'default',
    text,
    refs: touchedFiles,
    scope: 'project_shared',
    turn: {
      turnType: 'side',
      environment: 'session-close',
      expiryDays: 90,
    },
  });

  return event;
}

/**
 * CLI runner for session close subcommand.
 * Writes auto-memo and prints confirmation to stdout.
 */
export async function runSessionClose(options, { rootDir = process.cwd(), stdout = process.stdout } = {}) {
  const sessionId = options.session || 'default';
  const event = await autoMemoSessionClose({ rootDir, sessionId });

  if (options.json || options.format === 'json') {
    stdout.write(`${JSON.stringify(event, null, 2)}\n`);
  } else {
    stdout.write(`Session close memo written for ${sessionId}\n`);
    stdout.write(`  Event: ${event.eventId}\n`);
    stdout.write(`  Text: ${event.text.slice(0, 80)}...\n`);
  }

  return { exitCode: 0, event };
}
