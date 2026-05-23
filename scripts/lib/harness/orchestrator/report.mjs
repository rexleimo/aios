import {
  EXECUTOR_CAPABILITY_KEYS,
  normalizeExecutorCapabilityManifest,
} from './executor-capabilities.mjs';

function normalizeWorkItemStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'done' || normalized === 'completed' || normalized === 'simulated') return 'done';
  if (normalized === 'running') return 'running';
  if (normalized === 'blocked' || normalized === 'needs-input') return 'blocked';
  return 'queued';
}

function summarizeWorkItemTotals(items = []) {
  const totals = { total: items.length, queued: 0, running: 0, blocked: 0, done: 0 };
  for (const item of items) {
    const status = normalizeWorkItemStatus(item?.status);
    if (status in totals) totals[status] += 1;
  }
  return totals;
}

function formatCountMap(map) {
  return Array.from(map.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([key, count]) => `${key}=${count}`)
    .join(', ');
}

function formatLearnEvalOverlay(overlay) {
  if (!overlay) return [];
  const lines = ['Learn-Eval Overlay:', `- session=${overlay.sourceSessionId || '(unknown)'}`, `- selected=${overlay.selectedRecommendationId || '(none)'}`];
  if (overlay.sourceGoal) lines.push(`- goal=${overlay.sourceGoal}`);
  if (Array.isArray(overlay.appliedRecommendations) && overlay.appliedRecommendations.length > 0) {
    lines.push('- applied recommendations:');
    lines.push(...overlay.appliedRecommendations.map((item) => `  - [${item.kind}|${item.targetId}] ${item.title}`));
  } else {
    lines.push('- applied recommendations: (none)');
  }
  lines.push('');
  return lines;
}

function formatWorkItemPlan(workItems = []) {
  const items = Array.isArray(workItems) ? workItems : [];
  if (items.length === 0) return [];
  const lines = ['Work-Item Plan:', `- items=${items.length}`];
  lines.push(...items.map((item) => {
    const depends = Array.isArray(item.dependsOn) && item.dependsOn.length > 0 ? item.dependsOn.join(', ') : '(none)';
    return `- [${item.type || 'general'}] ${item.itemId || '(unknown)'} ${item.title || ''} dependsOn=${depends}`;
  }));
  lines.push('');
  return lines;
}

function formatPolicySection(title, policy) {
  if (!policy) return [];
  const blockerIds = Array.isArray(policy.blockerIds) ? policy.blockerIds : [];
  const advisoryIds = Array.isArray(policy.advisoryIds) ? policy.advisoryIds : [];
  const lines = [
    `${title}:`,
    `- status=${policy.status} parallelism=${policy.parallelism}`,
    `- blockers=${blockerIds.length > 0 ? blockerIds.join(', ') : '(none)'}`,
    `- advisories=${advisoryIds.length > 0 ? advisoryIds.join(', ') : '(none)'}`,
  ];
  if (Array.isArray(policy.requiredActions) && policy.requiredActions.length > 0) {
    lines.push('- required actions:');
    lines.push(...policy.requiredActions.map((item) => `  - [${item.type}] ${item.action}`));
  }
  if (Array.isArray(policy.executorPreferences) && policy.executorPreferences.length > 0) {
    lines.push('- executor preferences:');
    lines.push(...policy.executorPreferences.map((item) => `  - ${item.executor} confidence=${item.confidence} observed=${item.observedCount}`));
  }
  if (Array.isArray(policy.notes) && policy.notes.length > 0) {
    lines.push(...policy.notes.map((note) => `- note=${note}`));
  }
  lines.push('');
  return lines;
}

function formatReadiness(readiness) {
  if (!readiness || typeof readiness !== 'object') return [];
  const blockedReasons = Array.isArray(readiness.blockedReasons) ? readiness.blockedReasons : [];
  const warnings = Array.isArray(readiness.warnings) ? readiness.warnings : [];
  const nextActions = Array.isArray(readiness.nextActions) ? readiness.nextActions : [];
  const evidence = Array.isArray(readiness.evidence) ? readiness.evidence : [];
  const lines = ['Readiness:', `- verdict=${readiness.verdict || 'ready'} blockers=${blockedReasons.length > 0 ? blockedReasons.join(', ') : '(none)'}`];
  lines.push(...warnings.slice(0, 4).map((item) => `- warning=${item}`));
  if (nextActions.length > 0) {
    lines.push('- next actions:', ...nextActions.slice(0, 4).map((item) => `  - ${item}`));
  }
  if (evidence.length > 0) {
    lines.push('- evidence:', ...evidence.slice(0, 4).map((item) => `  - [${item.type || 'evidence'}] ${item.path || '(inline)'} ${item.summary || ''}`));
  }
  lines.push('');
  return lines;
}

function formatDispatchPreflight(dispatchPreflight) {
  if (!dispatchPreflight) return [];
  const results = Array.isArray(dispatchPreflight.results) ? dispatchPreflight.results : [];
  const lines = ['Dispatch Preflight:', `- mode=${dispatchPreflight.mode} actions=${results.length}`];
  lines.push(...results.map((item) => `- [${item.status}] ${item.runner} source=${item.sourceId || '(none)'} ${item.summary || item.action}`), '');
  return lines;
}

function formatDispatchPlan(dispatchPlan) {
  if (!dispatchPlan) return [];
  const jobs = Array.isArray(dispatchPlan.jobs) ? dispatchPlan.jobs : [];
  const lines = ['Local Dispatch Skeleton:', `- mode=${dispatchPlan.mode} ready=${dispatchPlan.readyForExecution ? 'true' : 'false'} jobs=${jobs.length}`];
  if (Array.isArray(dispatchPlan.executorRegistry) && dispatchPlan.executorRegistry.length > 0) lines.push(`- executors=${dispatchPlan.executorRegistry.join(', ')}`);
  if (Array.isArray(dispatchPlan.notes) && dispatchPlan.notes.length > 0) lines.push(...dispatchPlan.notes.map((note) => `- note=${note}`));
  if (Array.isArray(dispatchPlan.workItems) && dispatchPlan.workItems.length > 0) lines.push(`- workItems=${dispatchPlan.workItems.length}`);
  if (dispatchPlan.workItemQueue?.enabled) lines.push(`- workItemQueue maxParallel=${dispatchPlan.workItemQueue.maxParallel} entries=${dispatchPlan.workItemQueue.entries.length}`);
  lines.push(...jobs.map((job) => {
    const dependsOn = Array.isArray(job.dependsOn) && job.dependsOn.length > 0 ? job.dependsOn.join(', ') : '(root)';
    return `- [${job.jobType}] ${job.jobId} role=${job.role} dependsOn=${dependsOn} executor=${job.launchSpec?.executor || 'unknown'}`;
  }), '');
  return lines;
}

function formatExecutorCapabilityManifest(manifest) {
  const normalized = normalizeExecutorCapabilityManifest(manifest);
  if (!normalized) return [];
  const summaryBits = EXECUTOR_CAPABILITY_KEYS.map((key) => `${key}=${normalized.summary[key]}`).join(' ');
  const lines = ['Executor Capability Manifest:', `- mode=${normalized.executionMode} runtime=${normalized.runtimeId || '(none)'}`, `- summary ${summaryBits}`];
  if (normalized.executors.length > 0) {
    for (const entry of normalized.executors) {
      const capabilityBits = EXECUTOR_CAPABILITY_KEYS.map((key) => `${key}=${entry.capabilities[key]}`).join(' ');
      lines.push(`- ${entry.id} jobs=${entry.jobCount} ${capabilityBits}`);
      if (entry.notes.length > 0) lines.push(...entry.notes.map((note) => `  - note=${note}`));
    }
  } else {
    lines.push('- (no executors)');
  }
  lines.push('');
  return lines;
}

function formatDispatchRun(dispatchRun) {
  if (!dispatchRun) return [];
  const jobRuns = Array.isArray(dispatchRun.jobRuns) ? dispatchRun.jobRuns : [];
  const lines = ['Local Dispatch Run:', `- mode=${dispatchRun.mode} ok=${dispatchRun.ok ? 'true' : 'false'} jobs=${jobRuns.length}`];
  if (dispatchRun.runtime?.id) lines.push(`- runtime=${dispatchRun.runtime.id} executionMode=${dispatchRun.runtime.executionMode || dispatchRun.mode}`);
  if (Array.isArray(dispatchRun.executorRegistry) && dispatchRun.executorRegistry.length > 0) lines.push(`- executors=${dispatchRun.executorRegistry.join(', ')}`);
  if (dispatchRun.error) lines.push(`- error=${dispatchRun.error}`);
  lines.push(...jobRuns.map((jobRun) => `- [${jobRun.status}] ${jobRun.jobId} output=${jobRun.output?.outputType || 'unknown'}`), '');
  return lines;
}

function formatDispatchEvidence(dispatchEvidence) {
  if (!dispatchEvidence) return [];
  const lines = ['Dispatch Evidence:', `- persisted=${dispatchEvidence.persisted ? 'true' : 'false'}`];
  for (const key of ['mode', 'reason', 'artifactPath', 'eventId', 'checkpointId', 'error']) {
    const label = { artifactPath: 'artifact', eventId: 'event', checkpointId: 'checkpoint' }[key] || key;
    if (dispatchEvidence[key]) lines.push(`- ${label}=${dispatchEvidence[key]}`);
  }
  lines.push('');
  return lines;
}

function formatWorkItemTelemetry(workItemTelemetry) {
  if (!workItemTelemetry || typeof workItemTelemetry !== 'object') return [];
  const items = Array.isArray(workItemTelemetry.items) ? workItemTelemetry.items : [];
  const rawTotals = workItemTelemetry.totals && typeof workItemTelemetry.totals === 'object' ? workItemTelemetry.totals : summarizeWorkItemTotals(items);
  const totals = {
    total: Number.isFinite(rawTotals.total) ? Math.max(0, Math.floor(rawTotals.total)) : items.length,
    queued: Number.isFinite(rawTotals.queued) ? Math.max(0, Math.floor(rawTotals.queued)) : 0,
    running: Number.isFinite(rawTotals.running) ? Math.max(0, Math.floor(rawTotals.running)) : 0,
    blocked: Number.isFinite(rawTotals.blocked) ? Math.max(0, Math.floor(rawTotals.blocked)) : 0,
    done: Number.isFinite(rawTotals.done) ? Math.max(0, Math.floor(rawTotals.done)) : 0,
  };
  const lines = [
    'Work-Item Telemetry:',
    `- schemaVersion=${Number.isFinite(workItemTelemetry.schemaVersion) ? Math.floor(workItemTelemetry.schemaVersion) : 1}`,
    `- totals total=${totals.total} queued=${totals.queued} running=${totals.running} blocked=${totals.blocked} done=${totals.done}`,
  ];
  const blockedByType = new Map();
  const failureCounts = new Map();
  const retryCounts = new Map();
  for (const item of items) {
    const itemType = String(item?.itemType || 'unknown').trim() || 'unknown';
    const status = normalizeWorkItemStatus(item?.status);
    const typeCounts = blockedByType.get(itemType) || { total: 0, blocked: 0 };
    typeCounts.total += 1;
    if (status === 'blocked') typeCounts.blocked += 1;
    blockedByType.set(itemType, typeCounts);
    const failureClass = String(item?.failureClass || 'none').trim();
    if (status === 'blocked' && failureClass && failureClass !== 'none') failureCounts.set(failureClass, (failureCounts.get(failureClass) || 0) + 1);
    const retryClass = String(item?.retryClass || 'none').trim();
    if (retryClass && retryClass !== 'none') retryCounts.set(retryClass, (retryCounts.get(retryClass) || 0) + 1);
  }
  const byTypeText = Array.from(blockedByType.entries()).sort((left, right) => left[0].localeCompare(right[0])).map(([itemType, counts]) => `${itemType}=${counts.blocked}/${counts.total}`).join(', ');
  if (items.length > 0) lines.push(`- blockedByType ${byTypeText || '(none)'}`);
  if (failureCounts.size > 0) lines.push(`- failureClasses ${formatCountMap(failureCounts)}`);
  if (retryCounts.size > 0) lines.push(`- retryClasses ${formatCountMap(retryCounts)}`);
  lines.push('');
  return lines;
}

function formatDispatchInsights(dispatchInsights) {
  if (!dispatchInsights || typeof dispatchInsights !== 'object') return [];
  const runtime = dispatchInsights.runtime && typeof dispatchInsights.runtime === 'object' ? dispatchInsights.runtime : {};
  const signals = Array.isArray(dispatchInsights.signals) ? dispatchInsights.signals : [];
  const actions = Array.isArray(dispatchInsights.suggestedActions) ? dispatchInsights.suggestedActions : [];
  const lines = [
    'Dispatch Insights:',
    `- status=${String(dispatchInsights.status || 'attention')} score=${Number.isFinite(dispatchInsights.score) ? Math.max(0, Math.floor(dispatchInsights.score)) : 0}`,
    `- runtime=${String(runtime.id || 'unknown')} executionMode=${String(runtime.executionMode || 'none')} mode=${String(runtime.mode || 'none')}`,
  ];
  lines.push(...(signals.length > 0 ? signals.map((signal) => {
    const count = Number.isFinite(signal?.count) ? ` count=${Math.max(0, Math.floor(signal.count))}` : '';
    const evidence = signal?.evidence ? ` evidence=${signal.evidence}` : '';
    return `- signal ${signal?.severity || 'info'} ${signal?.id || 'unknown'}${count}: ${signal?.message || ''}${evidence}`;
  }) : ['- signals=(none)']));
  lines.push(...actions.map((action) => {
    const command = action?.command ? ` command=${action.command}` : '';
    return `- action ${action?.id || 'unknown'}: ${action?.label || ''}${command}`;
  }), '');
  return lines;
}

export function renderOrchestrationReportContent(plan = {}) {
  return [
    `ORCHESTRATION BLUEPRINT: ${plan.blueprint}`,
    `Task: ${plan.taskTitle}`,
    `Description: ${plan.description}`,
    ...(plan.contextSummary ? ['', `Context: ${plan.contextSummary}`] : []),
    '',
    'Phases:',
    ...(Array.isArray(plan.phases) ? plan.phases.map((phase) => `- [${phase.mode}] ${phase.label}: ${phase.responsibility}`) : []),
    '',
    ...formatWorkItemPlan(plan.workItems),
    ...formatLearnEvalOverlay(plan.learnEvalOverlay),
    ...formatPolicySection('Dispatch Policy', plan.dispatchPolicy),
    ...formatDispatchPreflight(plan.dispatchPreflight),
    ...formatReadiness(plan.readiness),
    ...formatPolicySection('Effective Dispatch Policy', plan.effectiveDispatchPolicy),
    ...formatExecutorCapabilityManifest(plan.executorCapabilityManifest),
    ...formatDispatchPlan(plan.dispatchPlan),
    ...formatDispatchRun(plan.dispatchRun),
    ...formatDispatchEvidence(plan.dispatchEvidence),
    ...formatWorkItemTelemetry(plan.workItemTelemetry),
    ...formatDispatchInsights(plan.dispatchInsights),
    'Merge Gate:',
    '- Block on handoff status = blocked|needs-input',
    '- Block when read-only roles report filesTouched',
    '- Block on overlapping file ownership across parallel outputs',
    '- Merge only findings and recommendations when ownership is clean',
    '',
  ].join('\n');
}
