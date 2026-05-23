export const CLIENT_CAPABILITIES = Object.freeze(['skills', 'agents', 'superpowers', 'native', 'team', 'harness']);

export const CLIENT_DEFINITIONS = Object.freeze({
  codex: Object.freeze({
    capabilities: Object.freeze(['skills', 'agents', 'superpowers', 'native', 'team', 'harness']),
    commandName: 'codex',
    runtimeClientId: 'codex-cli',
    projectSkillRoot: '.codex/skills',
    agentTargetRoot: '.codex/agents',
    nativeMetadataRoot: '.codex',
    modelArgFlag: '-m',
    unattendedArgs: Object.freeze(['--dangerously-bypass-approvals-and-sandbox']),
    unattendedInsertAfterToken: 'exec',
  }),
  claude: Object.freeze({
    capabilities: Object.freeze(['skills', 'agents', 'superpowers', 'native', 'team', 'harness']),
    commandName: 'claude',
    runtimeClientId: 'claude-code',
    projectSkillRoot: '.claude/skills',
    agentTargetRoot: '.claude/agents',
    nativeMetadataRoot: '.claude',
    modelArgFlag: '--model',
    unattendedArgs: Object.freeze(['--dangerously-skip-permissions']),
  }),
  gemini: Object.freeze({
    capabilities: Object.freeze(['skills', 'native', 'team', 'harness']),
    commandName: 'gemini',
    runtimeClientId: 'gemini-cli',
    projectSkillRoot: '.gemini/skills',
    nativeMetadataRoot: '.gemini',
    modelArgFlag: '-m',
    unattendedArgs: Object.freeze(['--yolo']),
  }),
  opencode: Object.freeze({
    capabilities: Object.freeze(['skills', 'native', 'harness']),
    commandName: 'opencode',
    runtimeClientId: 'opencode-cli',
    projectSkillRoot: '.opencode/skills',
    nativeMetadataRoot: '.opencode',
    unattendedArgs: Object.freeze([]),
  }),
});

export const ALL_CLIENTS = Object.freeze(Object.keys(CLIENT_DEFINITIONS));
export const CLIENT_SELECTIONS = Object.freeze(['all', ...ALL_CLIENTS]);

export const CAPABILITY_CLIENT_ORDER = Object.freeze({
  skills: ALL_CLIENTS,
  native: ALL_CLIENTS,
  agents: Object.freeze(['claude', 'codex']),
  superpowers: Object.freeze(['codex', 'claude']),
  team: Object.freeze(['codex', 'claude', 'gemini']),
  harness: ALL_CLIENTS,
});

export const SHARED_AGENT_SKILL_ROOT = '.agents/skills';
