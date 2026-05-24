/* 中文注释：workflow 选项覆盖 orchestrate/learn-eval/entropy/snapshot 等运行类命令。 */
import {
  normalizeEntropyGcFormat,
  normalizeHarnessProfile,
  normalizeLearnEvalFormat,
  normalizeOrchestrateDispatchMode,
  normalizeOrchestrateExecutionMode,
  normalizeOrchestratePreflightMode,
  normalizeOrchestratorFormat,
  normalizeSnapshotRollbackFormat,
  parsePositiveInteger,
  takeValue,
} from '../shared.mjs';

export function applyWorkflowOption({ command, options, rest, index, arg }) {
  switch (arg) {
    case '--profile':
      options.profile = normalizeHarnessProfile(takeValue(rest, index, '--profile'));
      return 1;
    case '--task':
      options.taskTitle = takeValue(rest, index, '--task');
      return 1;
    case '--context':
      options.contextSummary = takeValue(rest, index, '--context');
      return 1;
    case '--plan':
      if (command !== 'orchestrate') return null;
      options.planPath = takeValue(rest, index, '--plan');
      return 1;
    case '--session':
      if (!['learn-eval', 'orchestrate', 'quality-gate', 'entropy-gc', 'snapshot-rollback'].includes(command)) return null;
      options.sessionId = takeValue(rest, index, '--session');
      return 1;
    case '--manifest':
      if (command !== 'snapshot-rollback') return null;
      options.manifestPath = takeValue(rest, index, '--manifest');
      return 1;
    case '--job':
      if (command !== 'snapshot-rollback') return null;
      options.jobId = takeValue(rest, index, '--job');
      return 1;
    case '--limit':
      if (command !== 'learn-eval' && command !== 'orchestrate') return null;
      options.limit = parsePositiveInteger(takeValue(rest, index, '--limit'), '--limit');
      return 1;
    case '--apply-draft':
      if (command !== 'learn-eval') return null;
      options.applyDraftId = takeValue(rest, index, '--apply-draft');
      return 1;
    case '--apply-drafts':
      if (command !== 'learn-eval') return null;
      options.applyDrafts = true;
      return 0;
    case '--apply-dry-run':
      if (command !== 'learn-eval') return null;
      options.applyDryRun = true;
      return 0;
    case '--recommendation':
      if (command !== 'orchestrate') return null;
      options.recommendationId = takeValue(rest, index, '--recommendation');
      return 1;
    case '--dispatch':
      if (command !== 'orchestrate') return null;
      options.dispatchMode = normalizeOrchestrateDispatchMode(takeValue(rest, index, '--dispatch'));
      return 1;
    case '--execute':
      if (command !== 'orchestrate') return null;
      options.executionMode = normalizeOrchestrateExecutionMode(takeValue(rest, index, '--execute'));
      return 1;
    case '--preflight':
      if (command !== 'orchestrate') return null;
      options.preflightMode = normalizeOrchestratePreflightMode(takeValue(rest, index, '--preflight'));
      return 1;
    case '--format': {
      const value = takeValue(rest, index, '--format');
      if (command === 'orchestrate') options.format = normalizeOrchestratorFormat(value);
      else if (command === 'learn-eval') options.format = normalizeLearnEvalFormat(value);
      else if (command === 'entropy-gc') options.format = normalizeEntropyGcFormat(value);
      else if (command === 'snapshot-rollback') options.format = normalizeSnapshotRollbackFormat(value);
      else return null;
      return 1;
    }
    case '--retain':
      if (command !== 'entropy-gc') return null;
      options.retain = parsePositiveInteger(takeValue(rest, index, '--retain'), '--retain');
      return 1;
    case '--min-age-hours':
      if (command !== 'entropy-gc') return null;
      options.minAgeHours = parsePositiveInteger(takeValue(rest, index, '--min-age-hours'), '--min-age-hours');
      return 1;
    case '--dry-run':
      if (command !== 'snapshot-rollback') return null;
      options.dryRun = true;
      return 0;
    default:
      return null;
  }
}
