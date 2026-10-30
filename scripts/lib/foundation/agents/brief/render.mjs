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
    'Work from this brief only. You do not inherit the parent conversation.',
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
  lines.push('');
  lines.push('### Acceptance');
  lines.push(brief.acceptance.length > 0
    ? brief.acceptance.map((item) => `- ${item}`).join('\n')
    : '- (none declared: report how you verified the change)');
  lines.push('');
  lines.push('### Upstream refs');
  lines.push(brief.upstreamRefs.length > 0
    ? brief.upstreamRefs.map((ref) => {
      const target = ref.path || ref.sha;
      const note = ref.note ? ` — ${ref.note}` : '';
      return `- ${ref.kind}: ${target}${note}`;
    }).join('\n')
    : '- (none: this brief is self-contained)');
  lines.push('');
  lines.push('### Forbidden');
  lines.push(brief.forbidden.map((item) => `- ${item}`).join('\n'));
  lines.push('');
  lines.push('If a fact you need is not in this brief, return `blocked` naming the missing item.');
  return lines.join('\n');
}
