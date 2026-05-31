import {
  ORCHESTRATOR_AGENT_MARKER,
  ORCHESTRATOR_AGENT_MARKER_END,
} from './shared.mjs';

// 中文注释：opencode 子 agent 落点 `.opencode/agents/<name>.md`（opencode 单复数目录都接受；
// 这里用复数 agents 与 codex/claude 的 `.{client}/agents` 约定及 doctor 期望保持一致）。
// opencode frontmatter 允许字段 name/description/mode/model/...；未知字段静默并入 options。
// 这里只发 name/description/mode(subagent),避免 model(需 provider/ 前缀) 与 tools(需对象) 的非法形状。
// body 必须以受管标记包裹，使 sync 的 isManagedAgentMarkdown 能识别为受管文件。

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

export function renderOpencodeAgent(agent) {
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
    targetRelPath: `.opencode/agents/${name}.md`,
    content,
  };
}
