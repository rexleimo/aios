import { OPENCODE_STRICT_PRIMARY_AGENT_NAME, OPENCODE_STRICT_PRIMARY_AGENT_PATH } from './strict-primary-agent.mjs';

export const OPENCODE_CONFIG_PATH = 'opencode.json';
// OpenCode 的 `agent.steps` 是硬性工具步数上限：到点后工具被禁用，模型只能输出文字
// 汇报。历史默认 24 会把一轮会话固定截断在 24 步，多里程碑任务因此永远做不完、只能
// 交班（2026-09-17 回归定位）。这里保留一个有界但充裕的默认值，并允许通过
// AIOS_OPENCODE_MAX_STEPS 显式覆盖（正整数；0/off/none/unlimited 视为不限制）。
// 注意：opencode.json 以深度合并写入，必须始终回写该键，否则旧项目里残留的
// `steps: 24` 不会被清掉。
export const OPENCODE_DEFAULT_MAX_STEPS = 500;
export const OPENCODE_MAX_STEPS_ENV = 'AIOS_OPENCODE_MAX_STEPS';
const OPENCODE_UNLIMITED_STEP_VALUES = Object.freeze(['0', 'off', 'none', 'unlimited', 'infinite', 'unbounded']);
export const OPENCODE_MCP_TIMEOUT_MS = 90_000;

/** 解析 OpenCode 单轮工具步数上限；返回正整数，或 null 表示不写上限。 */
export function resolveOpenCodeMaxSteps(env = process.env) {
  const raw = String(env?.[OPENCODE_MAX_STEPS_ENV] ?? '').trim().toLowerCase();
  if (!raw) return OPENCODE_DEFAULT_MAX_STEPS;
  if (OPENCODE_UNLIMITED_STEP_VALUES.includes(raw)) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : OPENCODE_DEFAULT_MAX_STEPS;
}

export function buildOpenCodeConfig({ maxSteps = resolveOpenCodeMaxSteps() } = {}) {
  const agentDefinition = {
    description: 'AIOS strict primary agent for skill enforcement, turn compression, and verification.',
    mode: 'primary',
    tools: {
      read: true,
      bash: true,
      write: true,
      edit: true,
      'changed-files': true,
    },
  };
  if (Number.isFinite(maxSteps) && maxSteps > 0) agentDefinition.steps = maxSteps;
  return {
    $schema: 'https://opencode.ai/config.json',
    default_agent: OPENCODE_STRICT_PRIMARY_AGENT_NAME,
    instructions: [
      'AGENTS.md',
      OPENCODE_STRICT_PRIMARY_AGENT_PATH,
    ],
    skills: {
      paths: ['.opencode/skills'],
    },
    agent: {
      [OPENCODE_STRICT_PRIMARY_AGENT_NAME]: agentDefinition,
    },
    experimental: {
      mcp_timeout: OPENCODE_MCP_TIMEOUT_MS,
    },
    command: {
      verify: {
        description: 'Run AIOS verification loop and report fresh evidence.',
        template: 'Use verification-before-completion, then run the relevant AIOS quality gate.\\n\\n$ARGUMENTS',
        agent: OPENCODE_STRICT_PRIMARY_AGENT_NAME,
      },
      'changed-files': {
        description: 'Show files changed in the current AIOS session.',
        template: 'Run: aios session changed-files --json\\n\\n$ARGUMENTS',
        agent: OPENCODE_STRICT_PRIMARY_AGENT_NAME,
      },
      'skill-comply': {
        description: 'Generate AIOS skill compliance scenarios for a skill/rule/agent file.',
        template: 'Run: aios skill comply $ARGUMENTS --dry-run --json',
        agent: OPENCODE_STRICT_PRIMARY_AGENT_NAME,
      },
      'skill-health': {
        description: 'Show AIOS skill health and failure clusters.',
        template: 'Run: aios skill health --json\\n\\n$ARGUMENTS',
        agent: OPENCODE_STRICT_PRIMARY_AGENT_NAME,
      },
    },
    permission: {
      'mcp_*': 'ask',
    },
  };
}

export function renderOpenCodeConfig() {
  return `${JSON.stringify(buildOpenCodeConfig(), null, 2)}\n`;
}
