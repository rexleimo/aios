// scripts/lib/foundation/agents/brief/render.mjs
//
// The one markdown renderer for a dispatch brief. Callers (subagent-runtime
// prompts, team dispatch previews) must use it instead of assembling their own
// prose, so "what a subagent is told" has exactly one source.

import { validateDispatchBrief } from './index.mjs';

export function renderDispatchBriefMarkdown(brief = {}) {
  const { ok, errors } = validateDispatchBrief(brief);
  if (!ok) {
    throw new Error(`cannot render invalid dispatch brief: ${errors.join('; ')}`);
  }
  const lines = [
    '## Dispatch Brief',
    '',
    'Use this brief with the delivered task context and upstream handoffs. Do not rely on inheriting the parent conversation.',
    'Inspect the workspace and use available tools to discover relevant evidence within existing access permissions. Use general knowledge and reasoning; verify task-specific facts.',
    '',
    `- objective: ${brief.objective}`,
  ];
  if (brief.workItemId) lines.push(`- workItemId: ${brief.workItemId}`);
  if (brief.role) lines.push(`- role: ${brief.role}`);
  lines.push(`- outputSchema: ${brief.outputSchema}`);
  lines.push('');
  lines.push('### Ownership');
  lines.push(brief.ownedPathPrefixes.length > 0
    ? brief.ownedPathPrefixes.map((prefix) => `- ${prefix}`).join('\n')
    : '- (none declared: read-only)');
  lines.push('Ownership limits edits; you may read related dependencies within existing access permissions.');
  lines.push('');
  lines.push('### Acceptance');
  lines.push(brief.acceptance.length > 0
    ? brief.acceptance.map((item) => `- ${item}`).join('\n')
    : '- (none declared: report how you verified the task)');
  lines.push('');
  lines.push('### Upstream refs');
  lines.push(brief.upstreamRefs.length > 0
    ? brief.upstreamRefs.map((ref) => {
      const target = ref.path || ref.sha;
      const note = ref.note ? ` — ${ref.note}` : '';
      return `- ${ref.kind}: ${target}${note}`;
    }).join('\n')
    : '- (none declared)');
  lines.push('');
  lines.push('### Forbidden');
  lines.push(brief.forbidden.map((item) => `- ${item}`).join('\n'));
  lines.push('');
  lines.push('If a required fact remains unavailable after checking authorized sources, return `blocked` naming the missing item and what you checked. Do not invent the answer or request the parent transcript.');
  return lines.join('\n');
}
