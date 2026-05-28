import {
  ORCHESTRATOR_AGENT_MARKER,
  ORCHESTRATOR_AGENT_MARKER_END,
} from './shared.mjs';

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeRoleId(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeAgentName(value) {
  return normalizeText(value).toLowerCase();
}

function escapeTomlString(value) {
  return JSON.stringify(normalizeText(value));
}

function buildDeveloperInstructions(rawAgent = {}) {
  const role = normalizeRoleId(rawAgent.role) || 'unknown';
  const handoffTarget = normalizeText(rawAgent.handoffTarget || 'next-phase');
  const prompt = normalizeText(rawAgent.systemPrompt) || 'You are a role-based subagent for AIOS orchestrations.';
  return [
    `Role: ${role}`,
    '',
    prompt,
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
    `Set \`fromRole=${role}\` and \`toRole=${handoffTarget}\`.`,
  ].join('\n');
}

function renderCodexAgentToml(rawAgent = {}) {
  const name = normalizeAgentName(rawAgent.name);
  const description = normalizeText(rawAgent.description);
  const developerInstructions = buildDeveloperInstructions(rawAgent);

  return [
    `# ${ORCHESTRATOR_AGENT_MARKER}`,
    `name = ${escapeTomlString(name)}`,
    `description = ${escapeTomlString(description)}`,
    `developer_instructions = ${escapeTomlString(developerInstructions)}`,
    `# ${ORCHESTRATOR_AGENT_MARKER_END}`,
    '',
  ].join('\n');
}

export function renderCodexAgent(agent) {
  const name = normalizeAgentName(agent?.name);
  return {
    targetRelPath: `.codex/agents/${name}.toml`,
    content: renderCodexAgentToml(agent),
  };
}
