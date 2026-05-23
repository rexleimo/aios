import { createDefaultLearnEvalOptions, normalizeLearnEvalFormat } from './options.mjs';
import { buildLearnEvalReport, renderLearnEvalReport } from '../harness/learn-eval.mjs';
import { persistLearnEvalHindsightEvidence } from '../harness/learn-eval-evidence.mjs';
import { executeDraftRecommendations, normalizeDraftTargetId, renderDraftApplySummary, selectDraftRecommendations } from './learn-eval/draft-apply.mjs';
export function normalizeLearnEvalOptions(rawOptions = {}) {
  const defaults = createDefaultLearnEvalOptions();
  const limit = Number.isFinite(rawOptions.limit)
    ? Math.max(1, Math.floor(rawOptions.limit))
    : defaults.limit;
  const applyDraftId = normalizeDraftTargetId(rawOptions.applyDraftId ?? defaults.applyDraftId);
  const applyDrafts = rawOptions.applyDrafts === true;
  const applyDryRun = rawOptions.applyDryRun === true;
  const sessionId = String(rawOptions.sessionId || '').trim();

  if (applyDraftId && applyDrafts) {
    throw new Error('--apply-draft and --apply-drafts cannot be used together');
  }
  if ((applyDraftId || applyDrafts) && !sessionId) {
    throw new Error('--apply-draft/--apply-drafts requires --session');
  }

  return {
    sessionId,
    limit,
    format: normalizeLearnEvalFormat(rawOptions.format ?? defaults.format),
    applyDraftId,
    applyDrafts,
    applyDryRun,
  };
}

export function planLearnEval(rawOptions = {}) {
  const options = normalizeLearnEvalOptions(rawOptions);
  const args = ['learn-eval'];
  if (options.sessionId) {
    args.push('--session', options.sessionId);
  }
  if (options.limit !== 10) {
    args.push('--limit', String(options.limit));
  }
  if (options.format !== 'text') {
    args.push('--format', options.format);
  }
  if (options.applyDraftId) {
    args.push('--apply-draft', options.applyDraftId);
  } else if (options.applyDrafts) {
    args.push('--apply-drafts');
  }
  if (options.applyDryRun) {
    args.push('--apply-dry-run');
  }
  return {
    command: 'learn-eval',
    options,
    preview: `node scripts/aios.mjs ${args.join(' ')}`,
  };
}

export async function runLearnEval(
  rawOptions = {},
  {
    rootDir,
    io = console,
    env = process.env,
    persistHindsightEvidence = persistLearnEvalHindsightEvidence,
    buildReport = buildLearnEvalReport,
    executeDrafts = executeDraftRecommendations,
  } = {}
) {
  const { options } = planLearnEval(rawOptions);
  const report = await buildReport(options, { rootDir });
  const hindsightEvidence = await persistHindsightEvidence({ rootDir, report });
  if (hindsightEvidence && typeof hindsightEvidence === 'object') {
    report.hindsightEvidence = hindsightEvidence;
  }

  let exitCode = 0;
  if (options.applyDraftId || options.applyDrafts) {
    const selectedDrafts = selectDraftRecommendations(report, options);
    const draftApply = await executeDrafts(selectedDrafts, {
      rootDir,
      sessionId: options.sessionId,
      env,
      dryRun: options.applyDryRun,
    });
    draftApply.mode = options.applyDraftId ? 'single' : 'all';
    draftApply.requestedTargetId = options.applyDraftId || null;
    report.draftApply = draftApply;
    if (Number(draftApply?.counts?.failed || 0) > 0) {
      exitCode = 1;
    }
  }

  if (options.format === 'json') {
    io.log(JSON.stringify(report, null, 2));
    return { exitCode, report };
  }

  const output = [renderLearnEvalReport(report)];
  if (report.draftApply) {
    output.push(renderDraftApplySummary(report.draftApply));
  }
  io.log(output.filter(Boolean).join('\n'));
  return { exitCode, report };
}
