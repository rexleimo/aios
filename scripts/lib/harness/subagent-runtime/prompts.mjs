import { buildModelRouterPromptSection } from '../../model-router.mjs';
import { HANDOFF_SCHEMA_DISPLAY_PATH } from './constants.mjs';
import { resolveOwnedPathPrefixes } from './file-policy.mjs';
import { normalizeText } from './text.mjs';

export function renderDependencyContext(dependencyRuns = []) {
  const handoffs = dependencyRuns
    .map((run) => run?.output?.payload)
    .filter(Boolean);
  if (handoffs.length === 0) {
    return '(none)';
  }
  return handoffs.map((payload, index) => `- upstream[${index + 1}]: ${JSON.stringify(payload)}`).join('\n');
}

function deliveredExecutionContext(plan) {
  return String(plan?.executionContext?.text || '').trim();
}

export function buildSystemPrompt({ agent, plan, job, phase, rexBinding = null }) {
  const lines = [];
  if (agent?.systemPrompt) {
    lines.push(agent.systemPrompt);
  } else {
    lines.push('You are a role-based subagent for AIOS orchestrations.');
  }

  lines.push('');
  lines.push('Output Contract');
  lines.push(`Output a single JSON object (no surrounding text) that conforms to \`${HANDOFF_SCHEMA_DISPLAY_PATH}\`.`);
  lines.push('');
  lines.push('Required fields: schemaVersion, status, fromRole, toRole, taskTitle, contextSummary, findings, filesTouched, openQuestions, recommendations.');
  lines.push('Set schemaVersion=1. Always include array fields (empty arrays are OK).');
  lines.push(`Set fromRole=${normalizeText(job?.role) || 'unknown'} and toRole=${normalizeText(job?.launchSpec?.handoffTarget) || 'next-phase'}.`);
  lines.push('');

  const modelRouterSection = buildModelRouterPromptSection(job?.launchSpec?.modelRouting);
  if (modelRouterSection) {
    lines.push(modelRouterSection);
    lines.push('Use the routed model/protocol for this job; record any mismatch as a blocker.');
    lines.push('');
  }

  const ownedPrefixes = resolveOwnedPathPrefixes(phase, job).join(', ');
  const workItemRefs = Array.isArray(job?.launchSpec?.workItemRefs)
    ? job.launchSpec.workItemRefs.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  lines.push('Runtime Notes');
  lines.push(`- jobId=${normalizeText(job?.jobId)}`);
  lines.push(`- taskTitle=${normalizeText(plan?.taskTitle)}`);
  if (normalizeText(plan?.contextSummary)) {
    lines.push(`- contextSummary=${normalizeText(plan?.contextSummary)}`);
  }
  if (deliveredExecutionContext(plan)) {
    lines.push(`- executionContextDelivery=${normalizeText(plan?.executionContext?.receiptRef) || 'present'}`);
  }
  if (workItemRefs.length > 0) {
    lines.push(`- workItemRefs=${workItemRefs.join(', ')}`);
  }
  if (normalizeText(ownedPrefixes)) {
    lines.push(`- ownedPathPrefixes=${ownedPrefixes}`);
  }
  if (rexBinding?.workItemKey) {
    lines.push(`- rexWorkItem=${normalizeText(rexBinding.workItemKey)}`);
    if (rexBinding.capabilityId) lines.push(`- rexCapability=${normalizeText(rexBinding.capabilityId)}`);
    if (rexBinding.providerId) lines.push(`- rexProvider=${normalizeText(rexBinding.providerId)}`);
    lines.push('- Stay inside ownedPathPrefixes. Do not advance another work item\'s Rex command.');
  }
  lines.push('');

  return lines.join('\n');
}

export function buildUserPrompt({ plan, job, phase, dependencyRuns, rexBinding = null }) {
  const lines = [];
  lines.push('# Orchestration Phase');
  lines.push(`jobId: ${normalizeText(job?.jobId)}`);
  lines.push(`role: ${normalizeText(job?.role)}`);
  lines.push(`taskTitle: ${normalizeText(plan?.taskTitle)}`);
  if (rexBinding?.workItemKey) {
    lines.push(`rexWorkItem: ${normalizeText(rexBinding.workItemKey)}`);
    lines.push(`rexActivation: ${normalizeText(rexBinding.activationId)}`);
  }
  lines.push('');

  if (phase) {
    lines.push('## Responsibility');
    lines.push(`${normalizeText(phase.label)}: ${normalizeText(phase.responsibility)}`);
    lines.push('');

    lines.push('## Ownership');
    lines.push(normalizeText(phase.ownership) || '(none)');
    lines.push('');

    lines.push('## File Policy');
    lines.push(`canEditFiles: ${phase.canEditFiles === true ? 'true' : 'false'}`);
    lines.push(`ownedPathPrefixes: ${JSON.stringify(resolveOwnedPathPrefixes(phase, job))}`);
    lines.push('');
  }

  lines.push('## Upstream Handoffs');
  lines.push(renderDependencyContext(dependencyRuns));
  lines.push('');

  const workItemRefs = Array.isArray(job?.launchSpec?.workItemRefs)
    ? job.launchSpec.workItemRefs.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  if (workItemRefs.length > 0) {
    lines.push('## Decomposed Work Items');
    const workItemMap = new Map(
      (Array.isArray(plan?.workItems) ? plan.workItems : [])
        .map((item) => [normalizeText(item?.itemId), item])
        .filter(([id]) => id)
    );
    for (const itemId of workItemRefs) {
      const item = workItemMap.get(itemId);
      if (!item) {
        lines.push(`- ${itemId}`);
        continue;
      }
      const summary = normalizeText(item.summary) || normalizeText(item.title);
      lines.push(`- [${normalizeText(item.type) || 'general'}] ${itemId}: ${summary}`);
    }
    lines.push('');
  }

  const contextDelivery = deliveredExecutionContext(plan);
  if (contextDelivery) {
    lines.push('## Orchestrator-Delivered Context');
    lines.push('Use this delivery to perform the task. Do not copy raw delivered source text into the JSON handoff; refer to its ref/hash and summarize only necessary findings.');
    lines.push(contextDelivery);
    lines.push('');
  }

  lines.push('## Deliverable');
  lines.push('- Summarize concrete findings.');
  lines.push('- If you touched files, list them in `filesTouched` (relative paths).');
  lines.push('- If blocked or need input, set `status` to `blocked` or `needs-input` and explain in `openQuestions`.');
  lines.push('- Otherwise set `status` to `completed`.');
  lines.push('- If upstream handoffs do not clearly require code changes, return a no-op handoff instead of exploring indefinitely.');
  lines.push('- If the next step is manual, environment-specific, or external, report it in `openQuestions`/`recommendations` without waiting for it to happen.');
  lines.push('- Do not run broad verification commands unless you actually changed owned files.');
  lines.push('');
  lines.push('Output ONLY the JSON object.');
  lines.push('');

  return lines.join('\n');
}
