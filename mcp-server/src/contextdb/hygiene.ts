import { promises as fs } from 'node:fs';
import path from 'node:path';

import { ensureContextDb } from './core.js';
import { resolveContextDbRoot } from './paths.js';

export interface ContextDbHygieneStatus {
  ok: true;
  workspaceRoot: string;
  dbRoot: string;
  sessions: number;
  events: number;
  checkpoints: number;
  exports: number;
  staleExports: number;
  suspectedNoise: number;
  noiseReasons: Record<string, number>;
}

export interface ContextDbPruneNoiseResult {
  ok: true;
  dryRun: boolean;
  candidates: number;
  removed: number;
  candidateReasons: Record<string, number>;
}

export interface ContextDbCompactResult {
  ok: true;
  dryRun: boolean;
  plannedActions: string[];
  wouldRemoveNoise: number;
  wouldRemoveStaleExports: number;
}

interface NoiseCandidate {
  reason: string;
}

export async function hygieneStatus(input: { workspaceRoot: string }): Promise<ContextDbHygieneStatus> {
  const dbRoot = await ensureContextDb(input.workspaceRoot);
  const summary = await scanContextDb(input.workspaceRoot);
  return {
    ok: true,
    workspaceRoot: input.workspaceRoot,
    dbRoot,
    sessions: summary.sessions,
    events: summary.events,
    checkpoints: summary.checkpoints,
    exports: summary.exports,
    staleExports: summary.staleExports,
    suspectedNoise: summary.noiseCandidates.length,
    noiseReasons: countReasons(summary.noiseCandidates),
  };
}

export async function pruneNoise(input: { workspaceRoot: string; dryRun?: boolean }): Promise<ContextDbPruneNoiseResult> {
  if (input.dryRun !== true) {
    throw new Error('contextdb hygiene:prune-noise currently supports --dry-run only');
  }
  await ensureContextDb(input.workspaceRoot);
  const summary = await scanContextDb(input.workspaceRoot);
  return {
    ok: true,
    dryRun: true,
    candidates: summary.noiseCandidates.length,
    removed: 0,
    candidateReasons: countReasons(summary.noiseCandidates),
  };
}

export async function compactContextDb(input: { workspaceRoot: string; dryRun?: boolean }): Promise<ContextDbCompactResult> {
  if (input.dryRun !== true) {
    throw new Error('contextdb hygiene:compact currently supports --dry-run only');
  }
  await ensureContextDb(input.workspaceRoot);
  const summary = await scanContextDb(input.workspaceRoot);
  const plannedActions: string[] = [];
  if (summary.noiseCandidates.length > 0) plannedActions.push('prune_noise_candidates');
  if (summary.staleExports > 0) plannedActions.push('remove_stale_exports');
  return {
    ok: true,
    dryRun: true,
    plannedActions,
    wouldRemoveNoise: summary.noiseCandidates.length,
    wouldRemoveStaleExports: summary.staleExports,
  };
}

async function scanContextDb(workspaceRoot: string): Promise<{
  sessions: number;
  sessionIds: Set<string>;
  events: number;
  checkpoints: number;
  exports: number;
  staleExports: number;
  noiseCandidates: NoiseCandidate[];
}> {
  const dbRoot = resolveContextDbRoot(workspaceRoot, { preferLegacyExisting: true });
  const sessionsRoot = path.join(dbRoot, 'sessions');
  const exportsRoot = path.join(dbRoot, 'exports');
  const sessionIds = new Set<string>();
  const noiseCandidates: NoiseCandidate[] = [];
  let events = 0;
  let checkpoints = 0;

  for (const entry of await safeReadDir(sessionsRoot)) {
    if (!entry.isDirectory()) continue;
    sessionIds.add(entry.name);
    const sessionDir = path.join(sessionsRoot, entry.name);
    const eventRows = await readJsonLines(path.join(sessionDir, 'l2-events.jsonl'));
    const checkpointRows = await readJsonLines(path.join(sessionDir, 'l1-checkpoints.jsonl'));
    events += eventRows.length;
    checkpoints += checkpointRows.length;
    for (const row of eventRows) {
      const reason = classifyNoise(row);
      if (reason) noiseCandidates.push({ reason });
    }
  }

  const exportEntries = (await safeReadDir(exportsRoot)).filter((entry) => entry.isFile());
  const staleExports = exportEntries.filter((entry) => !belongsToKnownSession(entry.name, sessionIds)).length;

  return {
    sessions: sessionIds.size,
    sessionIds,
    events,
    checkpoints,
    exports: exportEntries.length,
    staleExports,
    noiseCandidates,
  };
}

async function safeReadDir(dirPath: string): Promise<import('node:fs').Dirent[]> {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function readJsonLines(filePath: string): Promise<Array<Record<string, unknown>>> {
  let raw = '';
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        const parsed = JSON.parse(line);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
      } catch {
        return {};
      }
    });
}

function classifyNoise(row: Record<string, unknown>): string | null {
  const text = typeof row.text === 'string' ? row.text.trim() : '';
  if (text.length === 0) return 'empty_text';
  if (text.length <= 3) return 'tiny_text';

  const tokens = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const uniqueTokens = new Set(tokens);
  if (tokens.length >= 3 && uniqueTokens.size === 1) {
    return 'low_signal_repetition';
  }
  if (/^(debug|trace|log|todo)[:\s-]/i.test(text) && text.length < 40) {
    return 'internal_scaffold';
  }
  return null;
}

function countReasons(candidates: NoiseCandidate[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const candidate of candidates) {
    counts[candidate.reason] = (counts[candidate.reason] ?? 0) + 1;
  }
  return counts;
}

function belongsToKnownSession(fileName: string, sessionIds: Set<string>): boolean {
  for (const sessionId of sessionIds) {
    if (fileName === `${sessionId}.md` || fileName === `${sessionId}-context.md` || fileName.startsWith(`${sessionId}-`)) {
      return true;
    }
  }
  return false;
}
