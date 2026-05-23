import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parseAiosCommandAction } from '../../cli/fragment-parser.mjs';
import { buildSkillCandidateArtifactPath, buildSkillCandidateArtifactPayload, formatArtifactTimestamp, normalizeDraftTargetId, DRAFT_TARGET_PREFIX } from './draft-artifacts.mjs';
export { normalizeDraftTargetId } from './draft-artifacts.mjs';

function createBufferedIo() {
  const lines = [];
  return {
    lines,
    io: {
      log(line) {
        lines.push(String(line));
      },
    },
  };
}

function isDraftRecommendation(item) {
  const targetId = normalizeDraftTargetId(item?.targetId);
  return targetId.startsWith(DRAFT_TARGET_PREFIX);
}

export function selectDraftRecommendations(report, options) {
  const allRecommendations = Array.isArray(report?.recommendations?.all)
    ? report.recommendations.all
    : [];
  const draftRecommendations = allRecommendations.filter((item) => isDraftRecommendation(item));
  const requestedDraftId = normalizeDraftTargetId(options.applyDraftId);

  if (requestedDraftId) {
    const selected = draftRecommendations.find((item) => normalizeDraftTargetId(item.targetId) === requestedDraftId);
    if (!selected) {
      throw new Error(`Unknown draft recommendation: ${requestedDraftId}`);
    }
    return [selected];
  }

  if (options.applyDrafts) {
    return draftRecommendations;
  }

  return [];
}

function summarizeDraftApplyResults(results = []) {
  const safeResults = Array.isArray(results) ? results : [];
  const counts = {
    selected: safeResults.length,
    applied: 0,
    failed: 0,
    skipped: 0,
    dryRun: 0,
  };

  for (const item of safeResults) {
    const status = String(item?.status || '').trim();
    if (status === 'applied') counts.applied += 1;
    else if (status === 'failed') counts.failed += 1;
    else if (status === 'dry-run') counts.dryRun += 1;
    else counts.skipped += 1;
  }

  return counts;
}

export function renderDraftApplySummary(draftApply = null) {
  if (!draftApply || typeof draftApply !== 'object') return '';

  const counts = draftApply.counts || {
    selected: 0,
    applied: 0,
    failed: 0,
    skipped: 0,
    dryRun: 0,
  };
  const lines = [
    '',
    'Draft Apply:',
    `- mode=${draftApply.mode} dryRun=${draftApply.dryRun} selected=${counts.selected} applied=${counts.applied} dryRunActions=${counts.dryRun} failed=${counts.failed} skipped=${counts.skipped}`,
  ];
  for (const result of Array.isArray(draftApply.results) ? draftApply.results : []) {
    const targetId = normalizeDraftTargetId(result?.targetId) || '(unknown)';
    const status = String(result?.status || 'skipped').trim() || 'skipped';
    const message = String(result?.summary || '').trim() || '(no summary)';
    lines.push(`- [${status}] ${targetId}: ${message}`);
  }
  return lines.join('\n');
}

async function executeParsedAiosAction(parsedAction, { rootDir, sessionId, env }) {
  if (!parsedAction || parsedAction.mode === 'help') {
    return {
      status: 'failed',
      summary: 'Unsupported draft command (cannot parse action)',
      exitCode: 1,
      command: '',
    };
  }

  const command = String(parsedAction.command || '').trim();
  if (command === 'memo') {
    const { runMemo } = await import('../../memo/memo.mjs');
    const buffered = createBufferedIo();
    await runMemo(parsedAction.options, { io: buffered.io });
    return {
      status: 'applied',
      summary: buffered.lines.at(-1) || 'Memo command completed',
      exitCode: 0,
      command,
    };
  }

  if (command === 'quality-gate') {
    const { runQualityGate } = await import('../quality-gate.mjs');
    const buffered = createBufferedIo();
    const qualityOptions = {
      ...parsedAction.options,
      sessionId: String(parsedAction.options?.sessionId || '').trim() || sessionId,
    };
    const result = await runQualityGate(qualityOptions, { rootDir, io: buffered.io, env });
    return {
      status: result.exitCode === 0 ? 'applied' : 'failed',
      summary: buffered.lines.at(-1) || `quality-gate ${qualityOptions.mode || 'full'}`,
      exitCode: result.exitCode,
      command,
    };
  }

  return {
    status: 'failed',
    summary: `Unsupported draft command: ${command || '(unknown)'}`,
    exitCode: 1,
    command,
  };
}

async function executeStructuredDraftAction(draftAction, { rootDir, sessionId, env }) {
  const actionKind = String(draftAction?.kind || '').trim();
  if (actionKind === 'memo-add') {
    const text = String(draftAction?.text || '').trim();
    if (!text) {
      return {
        status: 'failed',
        summary: 'Invalid memo-add draft action: missing text',
        exitCode: 1,
        command: 'memo',
      };
    }

    const { runMemo } = await import('../../memo/memo.mjs');
    const buffered = createBufferedIo();
    await runMemo({ argv: ['add', text] }, { io: buffered.io });
    return {
      status: 'applied',
      summary: buffered.lines.at(-1) || 'Memo command completed',
      exitCode: 0,
      command: 'memo',
    };
  }

  if (actionKind === 'quality-gate') {
    const { runQualityGate } = await import('../quality-gate.mjs');
    const buffered = createBufferedIo();
    const mode = String(draftAction?.mode || '').trim() || 'pre-pr';
    const result = await runQualityGate(
      {
        mode,
        sessionId: sessionId || '',
      },
      { rootDir, io: buffered.io, env }
    );
    return {
      status: result.exitCode === 0 ? 'applied' : 'failed',
      summary: buffered.lines.at(-1) || `quality-gate ${mode}`,
      exitCode: result.exitCode,
      command: 'quality-gate',
    };
  }

  if (actionKind === 'skill-candidate') {
    const text = String(draftAction?.text || '').trim();
    const skillId = String(draftAction?.skillId || '').trim() || 'unknown-skill';
    if (!text) {
      return {
        status: 'failed',
        summary: `Invalid skill-candidate draft action for ${skillId}: missing text`,
        exitCode: 1,
        command: 'memo',
      };
    }

    const normalizedSessionId = String(sessionId || '').trim();
    let artifactPath = '';
    if (normalizedSessionId) {
      const persistedAt = new Date().toISOString();
      artifactPath = buildSkillCandidateArtifactPath(rootDir, normalizedSessionId, {
        skillId,
        failureClass: String(draftAction?.failureClass || '').trim(),
        stamp: formatArtifactTimestamp(new Date(persistedAt)),
      });
      const artifactAbsPath = path.join(rootDir, artifactPath);
      const artifactPayload = buildSkillCandidateArtifactPayload(draftAction, {
        sessionId: normalizedSessionId,
        persistedAt,
      });
      await fs.mkdir(path.dirname(artifactAbsPath), { recursive: true });
      await fs.writeFile(artifactAbsPath, `${JSON.stringify(artifactPayload, null, 2)}\n`, 'utf8');
    }

    const { runMemo } = await import('../../memo/memo.mjs');
    const buffered = createBufferedIo();
    const memoText = artifactPath ? `${text} artifact=${artifactPath}` : text;
    await runMemo({ argv: ['add', memoText] }, { io: buffered.io });
    return {
      status: 'applied',
      summary: buffered.lines.at(-1) || `Skill candidate memo added for ${skillId}${artifactPath ? ` (${artifactPath})` : ''}`,
      exitCode: 0,
      command: 'memo',
    };
  }

  return {
    status: 'failed',
    summary: `Unsupported draftAction kind: ${actionKind || '(unknown)'}`,
    exitCode: 1,
    command: actionKind,
  };
}

export async function executeDraftRecommendations(
  recommendations = [],
  {
    rootDir,
    sessionId = '',
    env = process.env,
    dryRun = false,
  } = {}
) {
  const results = [];
  for (const recommendation of recommendations) {
    const targetId = normalizeDraftTargetId(recommendation?.targetId);
    const nextCommand = String(recommendation?.nextCommand || '').trim();
    const draftAction = recommendation?.draftAction && typeof recommendation.draftAction === 'object'
      ? recommendation.draftAction
      : null;
    if (!targetId) continue;

    if (!nextCommand && !draftAction) {
      results.push({
        targetId,
        status: 'skipped',
        summary: 'Missing nextCommand/draftAction on draft recommendation',
        nextCommand: '',
      });
      continue;
    }

    if (dryRun) {
      const dryRunSummary = draftAction
        ? `Would apply draftAction: ${String(draftAction.kind || 'unknown')}`
        : `Would run: ${nextCommand}`;
      results.push({
        targetId,
        status: 'dry-run',
        summary: dryRunSummary,
        nextCommand,
      });
      continue;
    }

    try {
      const execution = draftAction
        ? await executeStructuredDraftAction(draftAction, { rootDir, sessionId, env })
        : await executeParsedAiosAction(parseAiosCommandAction(nextCommand), { rootDir, sessionId, env });
      results.push({
        targetId,
        status: execution.status,
        summary: execution.summary,
        exitCode: execution.exitCode,
        nextCommand,
      });
    } catch (error) {
      results.push({
        targetId,
        status: 'failed',
        summary: error instanceof Error ? error.message : String(error),
        exitCode: 1,
        nextCommand,
      });
    }
  }

  const counts = summarizeDraftApplyResults(results);
  return {
    mode: recommendations.length === 1 ? 'single' : 'all',
    dryRun,
    selectedTargetIds: recommendations.map((item) => normalizeDraftTargetId(item?.targetId)).filter(Boolean),
    counts,
    results,
  };
}
