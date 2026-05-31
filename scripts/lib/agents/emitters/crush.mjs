import {
  ORCHESTRATOR_AGENT_MARKER,
  ORCHESTRATOR_AGENT_MARKER_END,
} from './shared.mjs';

// Crush (charmbracelet) agent emitter. Crush shares the same agent file format
// as OpenCode: `.crush/agents/<name>.md` with YAML frontmatter
// (name/description/mode: subagent) and a managed body block.

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeRoleId(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeAgentName(value) {
  return normalizeText(value).toLowerCase();
}

function escapeYamlString(value) {
  const raw = normalizeText(value);
  const escaped = raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function buildManagedBody(rawAgent = {}) {
  const role = normalizeRoleId(rawAgent.role) || '(unknown)';
  const handoffTarget = normalizeText(rawAgent.handoffTarget) || 'next-phase';
  const prompt = normalizeText(rawAgent.systemPrompt) || 'You are a role-based subagent for AIOS orchestrations.';
  return [
    ORCHESTRATOR_AGENT_MARKER,
    '',
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
    '',
    ORCHESTRATOR_AGENT_MARKER_END,
    '',
  ].join('\n');
}

export function renderCrushAgent(agent) {
  const name = normalizeAgentName(agent?.name);
  const description = normalizeText(agent?.description);
  const content = [
    '---',
    `name: ${name}`,
    `description: ${escapeYamlString(description)}`,
    'mode: subagent',
    '---',
    '',
    buildManagedBody(agent),
  ].join('\n');

  return {
    targetRelPath: `.crush/agents/${name}.md`,
    content,
  };
}
