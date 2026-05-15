import {
  ORCHESTRATOR_AGENT_MARKER,
  ORCHESTRATOR_AGENT_MARKER_END,
} from './shared.mjs';

const TOOL_MAP = {
  Bash: 'shell',
  Edit: 'write',
  Glob: 'glob',
  Grep: 'grep',
  Read: 'read',
};

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
  const rawTools = Array.isArray(value) ? value : [value];
  const normalized = rawTools
    .map((tool) => TOOL_MAP[normalizeId(tool)] || normalizeId(tool).toLowerCase())
    .filter(Boolean);
  return [...new Set(normalized)];
}

function renderPrompt(agent) {
  return [
    ORCHESTRATOR_AGENT_MARKER,
    '',
    `Role: ${agent.role || '(unknown)'}`,
    '',
    agent.systemPrompt || 'You are a role-based subagent for AIOS orchestrations.',
    '',
    'Output Contract',
    'Output a single JSON object (no surrounding text) that conforms to `memory/specs/agent-handoff.schema.json`.',
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
  ].join('\n');
}

export function renderKiroAgent(rawAgent = {}) {
  const agent = {
    id: normalizeAgentId(rawAgent?.id || rawAgent?.name),
    name: normalizeAgentId(rawAgent?.name || rawAgent?.id),
    description: normalizeId(rawAgent?.description),
    tools: normalizeTools(rawAgent?.tools),
    role: normalizeRoleId(rawAgent?.role),
    handoffTarget: normalizeId(rawAgent?.handoffTarget || 'next-phase'),
    systemPrompt: normalizeId(rawAgent?.systemPrompt),
  };
  const tools = agent.tools.length > 0 ? agent.tools : ['read', 'grep', 'glob'];

  const config = {
    name: agent.name || agent.id,
    description: agent.description,
    prompt: renderPrompt(agent),
    resources: [
      'file://.kiro/steering/**/*.md',
      'skill://.kiro/skills/**/SKILL.md',
      'skill://~/.kiro/skills/**/SKILL.md',
    ],
    includeMcpJson: true,
    tools,
    allowedTools: tools,
  };

  return {
    targetRelPath: `.kiro/agents/${agent.id || agent.name}.json`,
    content: `${JSON.stringify(config, null, 2)}\n`,
  };
}
