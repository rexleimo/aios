import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveContextDbRoot } from '../aios/state-root.mjs';

export const CONTINUITY_SUMMARY_FILENAME = 'continuity-summary.md';
export const CONTINUITY_JSON_FILENAME = 'continuity.json';

import { normalizeText } from '../../../src/shared/normalize.mjs';

function normalizeStringArray(value) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split('|')
      : [];
  return Array.from(new Set(raw
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)));
}

function sessionDir(workspaceRoot, sessionId) {
  return path.join(
    resolveContextDbRoot(path.resolve(workspaceRoot || process.cwd()), { preferLegacyExisting: true }),
    'sessions',
    normalizeText(sessionId)
  );
}

function continuityPaths(workspaceRoot, sessionId) {
  const dir = sessionDir(workspaceRoot, sessionId);
  return {
    dir,
    markdownPath: path.join(dir, CONTINUITY_SUMMARY_FILENAME),
    jsonPath: path.join(dir, CONTINUITY_JSON_FILENAME),
  };
}

async function writeAtomicFile(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp.${process.pid}.${crypto.randomUUID().slice(0, 8)}`
  );
  await fs.writeFile(tmpPath, content, 'utf8');
  try {
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => {});
    throw error;
  }
}

function normalizeWorkspaceRoot(value) {
  const text = normalizeText(value);
  return text ? path.resolve(text).replace(/\\/g, '/') : '';
}

function canonicalizeTouchedFileCandidate(candidate, workspaceRoot = '') {
  let value = normalizeText(candidate).replace(/\\/g, '/');
  if (!value || value.includes('://')) return '';

  value = value.replace(/^file:\/\//, '');
  value = value.replace(/[),;]+$/g, '').replace(/\.$/g, '');
  value = value.replace(/:\d+(?::\d+)?$/g, '');

  const roots = normalizeStringArray([workspaceRoot, process.cwd()].map(normalizeWorkspaceRoot));
  for (const root of roots) {
    if (value === root) return '';
    if (value.startsWith(`${root}/`)) {
      value = value.slice(root.length + 1);
      break;
    }
  }

  value = value.replace(/^\.\//, '');
  value = value.replace(/^(?:a|b)\//, '');

  if (value.startsWith('/')) {
    const anchors = ['mcp-server/', 'scripts/', 'docs/', 'memory/', 'config/', 'tasks/'];
    for (const anchor of anchors) {
      const index = value.indexOf(`/${anchor}`);
      if (index >= 0) {
        value = value.slice(index + 1);
        break;
      }
    }
  }

  if (value.startsWith('.aios/context-db/sessions/') || value.startsWith('memory/context-db/sessions/')) return '';
  return value;
}

export function extractTouchedFilesFromText(...values) {
  const first = values[0];
  const hasOptions = first && typeof first === 'object' && !Array.isArray(first);
  const options = hasOptions ? first : {};
  const textValues = hasOptions ? values.slice(1) : values;
  const workspaceRoot = normalizeWorkspaceRoot(options.workspaceRoot);
  const candidates = [];
  const pathPattern = /(?:^|[\s`"'(<\[])(~?\/[^\s`"'<>\])]+|\.{1,2}\/[^\s`"'<>\])]+|(?:[A-Za-z0-9_.-]+\/)+[^\s`"'<>\])]+)(?=$|[\s`"')>\],])/g;
  const bareFilePattern = /(?:^|[\s`"'(<\[])([A-Za-z0-9_.-]+\.[A-Za-z][A-Za-z0-9]{0,8})(?=$|[\s`"')>\],.:])/g;

  for (const value of textValues) {
    const text = String(value ?? '');
    const matches = [];
    for (const pattern of [pathPattern, bareFilePattern]) {
      for (const match of text.matchAll(pattern)) {
        matches.push({ index: match.index ?? 0, value: match[1] });
      }
    }
    matches.sort((a, b) => a.index - b.index);
    for (const match of matches) {
      const candidate = canonicalizeTouchedFileCandidate(match.value, workspaceRoot);
      if (candidate) candidates.push(candidate);
    }
  }
  return normalizeStringArray(candidates).slice(0, 24);
}

export function normalizeContinuitySummary(input = {}) {
  const sessionId = normalizeText(input.sessionId);
  if (!sessionId) {
    throw new Error('continuity summary requires sessionId');
  }
  const summary = normalizeText(input.summary, 'No checkpoint summary recorded yet.');
  return {
    schemaVersion: 1,
    sessionId,
    intent: normalizeText(input.intent, 'continue current session'),
    summary,
    touchedFiles: normalizeStringArray(input.touchedFiles),
    nextActions: normalizeStringArray(input.nextActions),
    updatedAt: normalizeText(input.updatedAt, new Date().toISOString()),
  };
}

export function renderContinuityMarkdown(input = {}) {
  const summary = normalizeContinuitySummary(input);
  const touchedFiles = summary.touchedFiles.length > 0
    ? summary.touchedFiles.map((item) => `- ${item}`).join('\n')
    : '- (none recorded)';
  const nextActions = summary.nextActions.length > 0
    ? summary.nextActions.map((item) => `- ${item}`).join('\n')
    : '- (none recorded)';
  return [
    '# Continuity Summary',
    '',
    `- Session: ${summary.sessionId}`,
    `- Intent: ${summary.intent}`,
    `- Updated: ${summary.updatedAt}`,
    '',
    '## Current State',
    summary.summary,
    '',
    '## Touched Files',
    touchedFiles,
    '',
    '## Next Actions',
    nextActions,
    '',
  ].join('\n');
}

export async function writeContinuitySummary(input = {}) {
  const summary = normalizeContinuitySummary(input);
  const paths = continuityPaths(input.workspaceRoot, summary.sessionId);
  await fs.mkdir(paths.dir, { recursive: true });
  await Promise.all([
    writeAtomicFile(paths.markdownPath, renderContinuityMarkdown(summary)),
    writeAtomicFile(paths.jsonPath, `${JSON.stringify(summary, null, 2)}\n`),
  ]);
  return {
    ...summary,
    markdownPath: paths.markdownPath,
    jsonPath: paths.jsonPath,
  };
}

export async function readContinuitySummary({ workspaceRoot, sessionId } = {}) {
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedSessionId) return null;
  const paths = continuityPaths(workspaceRoot, normalizedSessionId);
  try {
    const raw = await fs.readFile(paths.jsonPath, 'utf8');
    return normalizeContinuitySummary(JSON.parse(raw));
  } catch {
    return null;
  }
}

// Iteration Notes: structured per-iteration context for harness resume
export const ITERATION_NOTES_FILENAME = 'iteration-notes.json';

function iterationNotesPath(workspaceRoot, sessionId) {
  const dir = sessionDir(workspaceRoot, sessionId);
  return path.join(dir, ITERATION_NOTES_FILENAME);
}

export function normalizeIterationNote(input = {}) {
  return {
    iteration: Number(input.iteration ?? 0),
    timestamp: normalizeText(input.timestamp, new Date().toISOString()),
    completed: normalizeStringArray(input.completed),
    blockers: normalizeStringArray(input.blockers),
    decisions: normalizeStringArray(input.decisions),
    nextActions: normalizeStringArray(input.nextActions),
    artifacts: normalizeStringArray(input.artifacts),
  };
}

export async function writeIterationNotes(input = {}) {
  const sessionId = normalizeText(input.sessionId);
  if (!sessionId) throw new Error('writeIterationNotes requires sessionId');
  const note = normalizeIterationNote(input);
  const filePath = iterationNotesPath(input.workspaceRoot, sessionId);

  let existing = [];
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    existing = JSON.parse(raw);
    if (!Array.isArray(existing)) existing = [];
  } catch { /* first note */ }

  const idx = existing.findIndex((n) => n.iteration === note.iteration);
  if (idx >= 0) {
    existing[idx] = note;
  } else {
    existing.push(note);
    existing.sort((a, b) => a.iteration - b.iteration);
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await writeAtomicFile(filePath, `${JSON.stringify(existing, null, 2)}\n`);
  return { notes: existing, filePath };
}

export async function readIterationNotes({ workspaceRoot, sessionId } = {}) {
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedSessionId) return [];
  const filePath = iterationNotesPath(workspaceRoot, normalizedSessionId);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeIterationNote) : [];
  } catch {
    return [];
  }
}

export function renderIterationNotesInjection(notes = []) {
  if (!notes.length) return '';
  const latest = notes[notes.length - 1];
  const lines = [
    `## Iteration ${latest.iteration} — ${latest.timestamp}`,
    '',
    '### Completed',
    ...latest.completed.map((item) => `- ${item}`),
    '',
    '### Blockers',
    ...(latest.blockers.length ? latest.blockers.map((item) => `- ${item}`) : ['- (none)']),
    '',
    '### Decisions',
    ...(latest.decisions.length ? latest.decisions.map((item) => `- ${item}`) : ['- (none)']),
    '',
    '### Next Actions',
    ...latest.nextActions.map((item) => `- ${item}`),
    '',
    '### Artifacts',
    ...latest.artifacts.map((item) => `- ${item}`),
    '',
  ];
  if (notes.length > 1) {
    lines.push(`_(Plus ${notes.length - 1} earlier iterations in iteration-notes.json)_`, '');
  }
  return lines.join('\n');
}
