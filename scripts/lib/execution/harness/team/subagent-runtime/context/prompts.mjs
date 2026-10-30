import { renderHandoffContract, stripOutputContractSection } from '../../../../../foundation/agents/emitters/shared.mjs';
import { buildModelRouterPromptSection } from '../../../../../tooling/model-router.mjs';
import { buildDispatchBrief } from '../../../../../foundation/agents/brief/index.mjs';
import { renderDispatchBriefMarkdown } from '../../../../../foundation/agents/brief/render.mjs';
import { HANDOFF_SCHEMA_DISPLAY_PATH } from '../state/constants.mjs';
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
    lines.push(stripOutputContractSection(agent.systemPrompt));
  } else {
    lines.push('You are a role-based subagent for AIOS orchestrations.');
  }

  lines.push('');
  lines.push(renderHandoffContract({
    role: normalizeText(job?.role),
    handoffTarget: normalizeText(job?.launchSpec?.handoffTarget),
  }));
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
    lines.push('- Limit edits to ownedPathPrefixes; read related dependencies within existing access permissions. Do not advance another work item\'s Rex command.');
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

  // 中文注释：brief 是“可空白开工”的单个载荷，渲染器唯一 owner 在 foundation/agents/brief。
  // objective 取真实字段（phase.responsibility → taskTitle → jobId），不编造描述。
  const upstreamRefs = (Array.isArray(job?.launchSpec?.workItemRefs)
    ? job.launchSpec.workItemRefs
    : [])
    .map((item) => normalizeText(item))
    .filter(Boolean)
    .map((itemId) => ({ kind: 'handoff', path: itemId }));
  const brief = buildDispatchBrief({
    workItemId: normalizeText(job?.jobId),
    objective: normalizeText(phase?.responsibility) || normalizeText(plan?.taskTitle) || `job ${normalizeText(job?.jobId) || 'unassigned'}`,
    role: normalizeText(job?.role),
    ownedPathPrefixes: resolveOwnedPathPrefixes(phase, job),
    acceptance: Array.isArray(phase?.acceptance) ? phase.acceptance : [],
    upstreamRefs,
    outputSchema: HANDOFF_SCHEMA_DISPLAY_PATH,
  });
  lines.push(renderDispatchBriefMarkdown(brief));
  lines.push('');

  lines.push('## Deliverable');
  lines.push('- Summarize concrete findings.');
  lines.push('- If you touched files, list them in `filesTouched` (relative paths).');
  lines.push('- If blocked or need input, set `status` to `blocked` or `needs-input` and explain in `openQuestions`.');
  lines.push('- Otherwise set `status` to `completed`.');
  lines.push('- Complete the assigned objective and acceptance checks, including review, diagnosis or verification when no code changes are needed. Return a no-op only when evidence shows the assigned work is already satisfied.');
  lines.push('- If the next step is manual, environment-specific, or external, report it in `openQuestions`/`recommendations` without waiting for it to happen.');
  lines.push('- Run checks needed for the assigned task even when no files were edited; keep investigation and verification proportional to its scope.');
  lines.push('');
  lines.push('For the final reply, output ONLY the JSON object.');
  lines.push('');

  return lines.join('\n');
}
