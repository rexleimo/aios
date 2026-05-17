export const ORCHESTRATOR_AGENT_MARKER = '<!-- AIOS-GENERATED: orchestrator-agents v1 -->';
export const ORCHESTRATOR_AGENT_MARKER_END = '<!-- END AIOS-GENERATED -->';

function normalizeId(value) {
  return String(value || '').trim();
}

function normalizeRoleId(value) {
  return normalizeId(value).toLowerCase();
}

function normalizeAgentId(value) {
  const id = normalizeId(value).toLowerCase();
  return id.length > 0 ? id : '';
}

function normalizeTools(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeId(item)).filter(Boolean);
  }
  const text = normalizeId(value);
  return text ? [text] : [];
}

function escapeYamlString(value) {
  const raw = normalizeId(value);
  const escaped = raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function renderManagedAgentContent(rawAgent = {}) {
  const agent = {
    name: normalizeAgentId(rawAgent?.name),
    description: normalizeId(rawAgent?.description),
    tools: normalizeTools(rawAgent?.tools),
    model: normalizeId(rawAgent?.model),
    role: normalizeRoleId(rawAgent?.role),
    handoffTarget: normalizeId(rawAgent?.handoffTarget || 'next-phase'),
    systemPrompt: normalizeId(rawAgent?.systemPrompt),
  };

  const toolsYaml = `[${agent.tools.map((tool) => escapeYamlString(tool)).join(', ')}]`;
  const body = [
    ORCHESTRATOR_AGENT_MARKER,
    '',
    `Role: ${agent.role || '(unknown)'}`,
    '',
    agent.systemPrompt || 'You are a role-based subagent for AIOS orchestrations.',
    '',
    'Output Contract',
    'Output a single JSON object (no surrounding text) that conforms to `scripts/lib/specs/agent-handoff.schema.json`.',
    '',
    'Required fields:',
    '- schemaVersion',
    '- status',
    '- fromRole',
    '- toRole',
    '- taskTitle',
    '- contextSummary',
    '- findings',
    '- filesTouched',
    '- openQuestions',
    '- recommendations',
    '',
    `Set \`fromRole=${agent.role || 'unknown'}\` and \`toRole=${agent.handoffTarget || 'next-phase'}\`.`,
    '',
    ORCHESTRATOR_AGENT_MARKER_END,
    '',
  ].join('\n');

  return [
    '---',
    `name: ${agent.name}`,
    `description: ${escapeYamlString(agent.description)}`,
    `tools: ${toolsYaml}`,
    `model: ${agent.model || 'sonnet'}`,
    '---',
    '',
    body,
  ].join('\n');
}
