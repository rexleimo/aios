import { OPENCODE_STRICT_PRIMARY_AGENT_NAME, OPENCODE_STRICT_PRIMARY_AGENT_PATH } from './strict-primary-agent.mjs';

export const OPENCODE_CONFIG_PATH = 'opencode.json';

export function buildOpenCodeConfig() {
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
      [OPENCODE_STRICT_PRIMARY_AGENT_NAME]: {
        description: 'AIOS strict primary agent for skill enforcement, turn compression, and verification.',
        mode: 'primary',
        tools: {
          read: true,
          bash: true,
          write: true,
          edit: true,
          'changed-files': true,
        },
      },
    },
    command: {
      verify: {
        description: 'Run AIOS verification loop and report fresh evidence.',
        template: 'Use verification-before-completion, then run the relevant AIOS quality gate.\\n\\n$ARGUMENTS',
        agent: OPENCODE_STRICT_PRIMARY_AGENT_NAME,
      },
      'changed-files': {
        description: 'Show files changed in the current AIOS session.',
        template: 'Run: node scripts/aios.mjs session changed-files --json\\n\\n$ARGUMENTS',
        agent: OPENCODE_STRICT_PRIMARY_AGENT_NAME,
      },
      'skill-comply': {
        description: 'Generate AIOS skill compliance scenarios for a skill/rule/agent file.',
        template: 'Run: node scripts/aios.mjs skill comply $ARGUMENTS --dry-run --json',
        agent: OPENCODE_STRICT_PRIMARY_AGENT_NAME,
      },
      'skill-health': {
        description: 'Show AIOS skill health and failure clusters.',
        template: 'Run: node scripts/aios.mjs skill health --json\\n\\n$ARGUMENTS',
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
