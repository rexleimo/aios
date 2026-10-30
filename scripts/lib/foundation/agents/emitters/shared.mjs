export const ORCHESTRATOR_AGENT_MARKER = '<!-- AIOS-GENERATED: orchestrator-agents v1 -->';
export const ORCHESTRATOR_AGENT_MARKER_END = '<!-- END AIOS-GENERATED -->';
export const HANDOFF_SCHEMA_REL_PATH = 'scripts/lib/tooling/specs/registry/agent-handoff.schema.json';

// 中文注释：输出合同与上下文合同各只有这一份来源。codex/claude/grok/opencode 的 emitter
// 只允许调用这两个渲染器，禁止各自手抄段落——2026-10 实测过三份副本，字段顺序已经开始漂移。
export const HANDOFF_CONTRACT_FIELDS = Object.freeze([
  'schemaVersion',
  'status',
  'fromRole',
  'toRole',
  'taskTitle',
  'contextSummary',
  'findings',
  'filesTouched',
  'openQuestions',
  'recommendations',
]);

// 中文注释：三条纪律对应 subagent 以 fresh context 启动这一合同；改这里就要同步
// scripts/tests/foundation/native/subagent-context-probe.test.mjs 与 agent 卡片断言。
export const SUBAGENT_CONTEXT_CONTRACT_LINES = Object.freeze([
  'You do not inherit the parent conversation. Work only from the brief and the refs it names.',
  'If the brief lacks a fact you need, return blocked with the missing item; do not reconstruct it from memory.',
  'Do not ask the parent to paste its transcript.',
]);

export function renderSubagentContextContract() {
  return ['Subagent Context', ...SUBAGENT_CONTEXT_CONTRACT_LINES].join('\n');
}

// 中文注释：角色卡源文件必须保留 `## Output contract` 标记（source-tree 校验要求 ECC 形状），
// 但字段清单的唯一 owner 是下面的 renderHandoffContract。渲染时把源文件里那段剥掉，
// 保证生成的卡片里恰好只有一份输出合同——模型不该看到两份互相竞争的字段表。
export function stripOutputContractSection(text = '') {
  const pattern = /\n*##\s*Output contract[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i;
  const stripped = String(text).replace(pattern, '\n');
  return stripped.replace(/\n{3,}/g, '\n\n').trim();
}

export function renderHandoffContract({ role = 'unknown', handoffTarget = 'next-phase' } = {}) {
  return [
    'Output Contract',
    `Output a single JSON object (no surrounding text) that conforms to \`${HANDOFF_SCHEMA_REL_PATH}\`.`,
    '',
    'Required fields:',
    ...HANDOFF_CONTRACT_FIELDS.map((field) => `- ${field}`),
    '',
    `Set \`fromRole=${role || 'unknown'}\` and \`toRole=${handoffTarget || 'next-phase'}\`.`,
  ].join('\n');
}

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
    systemPrompt: stripOutputContractSection(normalizeId(rawAgent?.systemPrompt)),
  };

  const toolsYaml = `[${agent.tools.map((tool) => escapeYamlString(tool)).join(', ')}]`;
  const body = [
    ORCHESTRATOR_AGENT_MARKER,
    '',
    `Role: ${agent.role || '(unknown)'}`,
    '',
    agent.systemPrompt || 'You are a role-based subagent for AIOS orchestrations.',
    '',
    renderSubagentContextContract(),
    '',
    renderHandoffContract({ role: agent.role, handoffTarget: agent.handoffTarget }),
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
