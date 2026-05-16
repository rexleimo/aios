import { promises as fs } from 'node:fs';
import path from 'node:path';
import { contextDbRelativePath, resolveContextDbRoot } from '../aios/state-root.mjs';

export const REQUIRED_PLAN_HEADINGS = ['Progress', 'Decision Log', 'Acceptance', 'Next Actions'];

const VERDICT_RANK = Object.freeze({ ready: 0, warning: 1, blocked: 2 });

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeArray(value) {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source.map((item) => normalizeText(item)).filter(Boolean))];
}

function normalizeVerdict(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'blocked' || normalized === 'warning' || normalized === 'ready') return normalized;
  return 'ready';
}

function normalizeHeading(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function extractHeadings(markdown = '') {
  const headings = new Set();
  for (const line of String(markdown || '').split(/\r?\n/)) {
    const match = /^#{1,6}\s+(.+?)\s*$/.exec(line.trim());
    if (match) {
      headings.add(normalizeHeading(match[1]));
    }
  }
  return headings;
}

function normalizePlanPath(rootDir = process.cwd(), planPath = '') {
  const raw = normalizeText(planPath);
  if (!raw) return { raw: '', displayPath: '', absPath: '' };
  const displayPath = raw.replace(/\\/g, '/').replace(/^\.\//, '');
  const absPath = path.isAbsolute(raw)
    ? raw
    : path.join(rootDir || process.cwd(), raw);
  return { raw, displayPath, absPath };
}

function readiness({ verdict = 'ready', blockedReasons = [], warnings = [], nextActions = [], evidence = [] } = {}) {
  return {
    verdict: normalizeVerdict(verdict),
    blockedReasons: normalizeArray(blockedReasons),
    warnings: normalizeArray(warnings),
    nextActions: normalizeArray(nextActions),
    evidence: Array.isArray(evidence) ? evidence.filter((item) => item && typeof item === 'object') : [],
  };
}

export async function evaluatePlanEvidence(input = {}) {
  const rootDir = input.rootDir || input.workspaceRoot || process.cwd();
  const hasMarkdown = typeof input.markdown === 'string';
  const { displayPath, absPath } = normalizePlanPath(rootDir, input.planPath);
  let markdown = hasMarkdown ? String(input.markdown || '') : '';

  if (!hasMarkdown) {
    if (!displayPath) {
      return readiness({
        verdict: 'blocked',
        blockedReasons: ['missing_plan_artifact'],
        nextActions: ['Create docs/plans/<date>-<topic>.md with Progress, Decision Log, Acceptance, and Next Actions sections.'],
      });
    }
    try {
      markdown = await fs.readFile(absPath, 'utf8');
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        return readiness({
          verdict: 'blocked',
          blockedReasons: ['missing_plan_artifact'],
          nextActions: [`Create or pass a readable plan artifact at ${displayPath} with Progress, Decision Log, Acceptance, and Next Actions sections.`],
        });
      }
      throw error;
    }
  }

  const headings = extractHeadings(markdown);
  const missing = REQUIRED_PLAN_HEADINGS.filter((heading) => !headings.has(normalizeHeading(heading)));
  if (missing.length > 0) {
    return readiness({
      verdict: 'blocked',
      blockedReasons: ['missing_plan_headings'],
      warnings: missing.map((heading) => `Missing plan heading: ${heading}`),
      nextActions: [`Add required plan headings: ${REQUIRED_PLAN_HEADINGS.join(', ')}.`],
      evidence: displayPath
        ? [{ type: 'file', path: displayPath, summary: 'Plan artifact was found but is missing required headings.', createdAt: nowIso() }]
        : [{ type: 'inline', summary: 'Inline plan markdown is missing required headings.', createdAt: nowIso() }],
    });
  }

  return readiness({
    verdict: 'ready',
    evidence: displayPath
      ? [{ type: 'file', path: displayPath, summary: `Plan artifact includes required headings: ${REQUIRED_PLAN_HEADINGS.join(', ')}.`, createdAt: nowIso() }]
      : [{ type: 'inline', summary: `Inline plan markdown includes required headings: ${REQUIRED_PLAN_HEADINGS.join(', ')}.`, createdAt: nowIso() }],
  });
}

function normalizeOwnedPathPrefixes(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const prefixes = [];
  for (const item of value) {
    const normalized = String(item ?? '').trim().replace(/\\/g, '/');
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    prefixes.push(normalized);
  }
  return prefixes;
}

function collectEditableOwnershipSubjects(input = {}) {
  const subjects = [];
  const dispatchJobs = Array.isArray(input.dispatchPlan?.jobs) ? input.dispatchPlan.jobs : [];
  for (const job of dispatchJobs) {
    const launchSpec = job?.launchSpec && typeof job.launchSpec === 'object' ? job.launchSpec : {};
    if (launchSpec.canEditFiles !== true) continue;
    subjects.push({
      id: normalizeText(job?.jobId) || 'unknown-job',
      kind: 'job',
      ownedPathPrefixes: normalizeOwnedPathPrefixes(launchSpec.ownedPathPrefixes),
    });
  }

  const workItems = Array.isArray(input.workItems) ? input.workItems : [];
  for (const item of workItems) {
    const canEdit = item?.canEditFiles === true || item?.writeCapable === true;
    if (!canEdit) continue;
    subjects.push({
      id: normalizeText(item?.itemId) || normalizeText(item?.id) || 'unknown-work-item',
      kind: 'workItem',
      ownedPathPrefixes: normalizeOwnedPathPrefixes(item?.ownedPathPrefixes || item?.ownedPathHints),
    });
  }
  return subjects;
}

export function evaluateOwnershipEvidence(input = {}) {
  const subjects = collectEditableOwnershipSubjects(input);
  const missing = [];
  const wildcard = [];
  const ready = [];

  for (const subject of subjects) {
    if (subject.ownedPathPrefixes.some((prefix) => prefix === '')) {
      wildcard.push(subject);
      continue;
    }
    if (subject.ownedPathPrefixes.length === 0) {
      missing.push(subject);
      continue;
    }
    ready.push(subject);
  }

  const blockedReasons = [];
  if (missing.length > 0) blockedReasons.push('missing_owned_path_prefixes');
  if (wildcard.length > 0) blockedReasons.push('wildcard_owned_path_prefixes');

  if (blockedReasons.length > 0) {
    return readiness({
      verdict: 'blocked',
      blockedReasons,
      warnings: [
        ...missing.map((item) => `${item.kind} ${item.id} is write-capable but has no ownedPathPrefixes.`),
        ...wildcard.map((item) => `${item.kind} ${item.id} uses wildcard ownedPathPrefixes.`),
      ],
      nextActions: ['Add explicit ownedPathPrefixes for each write-capable phase/job/work item before live execution.'],
      evidence: ready.map((item) => ({
        type: 'ownership',
        path: item.ownedPathPrefixes.join(','),
        summary: `${item.kind} ${item.id} has owned path prefixes: ${item.ownedPathPrefixes.join(', ')}.`,
        createdAt: nowIso(),
      })),
    });
  }

  return readiness({
    verdict: 'ready',
    evidence: ready.map((item) => ({
      type: 'ownership',
      path: item.ownedPathPrefixes.join(','),
      summary: `${item.kind} ${item.id} has owned path prefixes: ${item.ownedPathPrefixes.join(', ')}.`,
      createdAt: nowIso(),
    })),
  });
}

export function mergeReadinessVerdicts(...verdicts) {
  const normalized = verdicts
    .filter(Boolean)
    .map((item) => readiness(item));
  if (normalized.length === 0) return readiness();

  const verdict = normalized.reduce((current, item) => (
    VERDICT_RANK[item.verdict] > VERDICT_RANK[current] ? item.verdict : current
  ), 'ready');

  return readiness({
    verdict,
    blockedReasons: normalized.flatMap((item) => item.blockedReasons),
    warnings: normalized.flatMap((item) => item.warnings),
    nextActions: normalized.flatMap((item) => item.nextActions),
    evidence: normalized.flatMap((item) => item.evidence),
  });
}

export async function runReadinessCheck(input = {}) {
  const rootDir = input.rootDir || input.workspaceRoot || process.cwd();
  const mode = normalizeText(input.mode || 'team');
  const verdicts = [];

  // 1. Plan artifact check (for team/harness modes)
  const planDir = path.join(rootDir, 'docs', 'plans');
  let planFound = false;
  try {
    const entries = await fs.readdir(planDir);
    const mdFiles = entries.filter((f) => f.endsWith('.md'));
    if (mdFiles.length > 0) {
      planFound = true;
      verdicts.push(readiness({
        verdict: 'ready',
        evidence: [{ type: 'plans', path: `docs/plans/`, summary: `Found ${mdFiles.length} plan file(s)`, createdAt: nowIso() }],
      }));
    }
  } catch { /* no plans dir */ }

  if (!planFound) {
    const isBlocking = mode === 'team';
    verdicts.push(readiness({
      verdict: isBlocking ? 'warning' : 'ready',
      warnings: isBlocking ? ['No plan files found in docs/plans/'] : [],
      nextActions: ['Create docs/plans/<date>-<topic>.md with Progress, Decision Log, Acceptance, and Next Actions sections.'],
    }));
  }

  // 2. ContextDB session check
  const contextDbDir = resolveContextDbRoot(rootDir, { preferLegacyExisting: true });
  const contextDbRel = contextDbRelativePath(rootDir);
  let sessionFound = false;
  try {
    const sessionsDir = path.join(contextDbDir, 'sessions');
    const entries = await fs.readdir(sessionsDir);
    if (entries.length > 0) {
      sessionFound = true;
      verdicts.push(readiness({
        verdict: 'ready',
        evidence: [{ type: 'contextdb', path: `${contextDbRel}/`, summary: `Found ${entries.length} session(s)`, createdAt: nowIso() }],
      }));
    }
  } catch { /* no sessions */ }

  if (!sessionFound) {
    verdicts.push(readiness({
      verdict: 'ready',
      warnings: ['No ContextDB sessions found — will create new session on first run.'],
    }));
  }

  // 3. Model router check
  try {
    const { isModelRouterEnabled } = await import('../model-router.mjs');
    if (isModelRouterEnabled()) {
      verdicts.push(readiness({
        verdict: 'ready',
        evidence: [{ type: 'model-router', summary: 'Model router is enabled', createdAt: nowIso() }],
      }));
    } else {
      verdicts.push(readiness({
        verdict: 'warning',
        warnings: ['Model router is disabled — all tasks will use default model.'],
        nextActions: ['Set AIOS_MODEL_ROUTER=1 to enable model routing.'],
      }));
    }
  } catch {
    verdicts.push(readiness({
      verdict: 'ready',
      warnings: ['Could not verify model router status.'],
    }));
  }

  // 4. Workspace health
  try {
    const settingsPath = path.join(rootDir, 'config', 'settings.json');
    await fs.access(settingsPath);
    verdicts.push(readiness({
      verdict: 'ready',
      evidence: [{ type: 'workspace', path: 'config/settings.json', summary: 'Workspace config found', createdAt: nowIso() }],
    }));
  } catch {
    verdicts.push(readiness({
      verdict: 'ready',
      warnings: ['No config/settings.json found — using defaults.'],
    }));
  }

  return mergeReadinessVerdicts(...verdicts);
}
