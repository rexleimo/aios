export const CLIENT_CAPABILITIES = Object.freeze(['skills', 'agents', 'superpowers', 'native', 'team', 'harness']);

// Per-client skill format: 'markdown-directory' = SKILL.md in a dir (all clients including gemini).
// 'toml-command' = single .toml file, used only for route commands (.gemini/commands/*.toml), not skills.
export const SKILL_FORMATS = Object.freeze(['markdown-directory', 'toml-command']);
export const DEFAULT_SKILL_FORMAT = 'markdown-directory';

export const CLIENT_DEFINITIONS = Object.freeze({
  codex: Object.freeze({
    capabilities: Object.freeze(['skills', 'agents', 'superpowers', 'native', 'team', 'harness']),
    commandName: 'codex',
    runtimeClientId: 'codex-cli',
    projectSkillRoot: '.codex/skills',
    skillFormat: 'markdown-directory',
    agentTargetRoot: '.codex/agents',
    nativeMetadataRoot: '.codex',
    instructionFileName: 'AGENTS.md',
    nativeProjectSourceFile: 'AGENTS.md',
    modelArgFlag: '-m',
    unattendedArgs: Object.freeze(['--dangerously-bypass-approvals-and-sandbox']),
    unattendedInsertAfterToken: 'exec',
  }),
  claude: Object.freeze({
    capabilities: Object.freeze(['skills', 'agents', 'superpowers', 'native', 'team', 'harness']),
    commandName: 'claude',
    runtimeClientId: 'claude-code',
    projectSkillRoot: '.claude/skills',
    skillFormat: 'markdown-directory',
    agentTargetRoot: '.claude/agents',
    nativeMetadataRoot: '.claude',
    instructionFileName: 'CLAUDE.md',
    nativeProjectSourceFile: 'CLAUDE.md',
    modelArgFlag: '--model',
    unattendedArgs: Object.freeze(['--dangerously-skip-permissions']),
  }),
  gemini: Object.freeze({
    capabilities: Object.freeze(['skills', 'native', 'team', 'harness', 'superpowers']),
    commandName: 'gemini',
    runtimeClientId: 'gemini-cli',
    projectSkillRoot: '.gemini/skills',
    skillFormat: 'markdown-directory',
    nativeMetadataRoot: '.gemini',
    instructionFileName: 'GEMINI.md',
    nativeProjectSourceFile: 'GEMINI.md',
    modelArgFlag: '-m',
    unattendedArgs: Object.freeze(['--yolo']),
    deprecated: true,  // Replaced by Antigravity CLI on 2026-06-18; keep syncing but no new features
  }),
  // Antigravity CLI (Google) — successor to Gemini CLI. Inherits Agent Skills, Hooks,
  // Subagents, and Extensions from Gemini CLI. Built in Go. Not 1:1 feature parity.
  // Conservative assumption: same skill paths and instruction file as Gemini CLI.
  // TODO: verify paths after Antigravity CLI docs become available.
  antigravity: Object.freeze({
    capabilities: Object.freeze(['skills', 'native', 'team', 'harness', 'superpowers']),
    commandName: 'antigravity',
    runtimeClientId: 'antigravity-cli',
    projectSkillRoot: '.gemini/skills',    // Inherited from Gemini CLI; verify after install
    skillFormat: 'markdown-directory',
    nativeMetadataRoot: '.gemini',          // May change; verify after install
    instructionFileName: 'GEMINI.md',       // Inherited from Gemini CLI; verify after install
    nativeProjectSourceFile: 'GEMINI.md',
    modelArgFlag: '-m',
    unattendedArgs: Object.freeze(['--yolo']),
  }),
  opencode: Object.freeze({
    capabilities: Object.freeze(['skills', 'native', 'harness', 'superpowers', 'agents', 'team']),
    commandName: 'opencode',
    runtimeClientId: 'opencode-cli',
    projectSkillRoot: '.opencode/skills',
    skillFormat: 'markdown-directory',
    agentTargetRoot: '.opencode/agents',
    nativeMetadataRoot: '.opencode',
    instructionFileName: 'AGENTS.md',
    nativeProjectSourceFile: 'AIOS.md',
    modelArgFlag: '-m',
    unattendedArgs: Object.freeze(['run', '--dangerously-skip-permissions']),
  }),
  // Crush (charmbracelet) — successor to OpenCode. Auto-discovers ~/.agents/skills/,
  // ~/.claude/skills/, .agents/skills/, .claude/skills/, and .crush/skills/.
  // Auto-loads AGENTS.md, CLAUDE.md, and GEMINI.md as context files.
  // MCP config in crush.json under "mcp" namespace. Hooks are Claude Code–compatible.
  crush: Object.freeze({
    capabilities: Object.freeze(['skills', 'native', 'harness', 'superpowers', 'agents', 'team']),
    commandName: 'crush',
    runtimeClientId: 'crush-cli',
    projectSkillRoot: '.crush/skills',
    skillFormat: 'markdown-directory',
    agentTargetRoot: '.crush/agents',
    nativeMetadataRoot: '.crush',
    instructionFileName: 'AGENTS.md',
    nativeProjectSourceFile: 'AGENTS.md',
    modelArgFlag: '--model',
    unattendedArgs: Object.freeze(['--yolo']),
  }),
});

export const ALL_CLIENTS = Object.freeze(Object.keys(CLIENT_DEFINITIONS));
export const CLIENT_SELECTIONS = Object.freeze(['all', ...ALL_CLIENTS]);

export const CAPABILITY_CLIENT_ORDER = Object.freeze({
  skills: ALL_CLIENTS,
  native: ALL_CLIENTS,
  agents: Object.freeze(['claude', 'codex', 'opencode', 'crush']),
  superpowers: Object.freeze(['codex', 'claude', 'gemini', 'antigravity', 'opencode', 'crush']),
  team: Object.freeze(['codex', 'claude', 'gemini', 'antigravity', 'opencode', 'crush']),
  harness: ALL_CLIENTS,
});

export const SHARED_AGENT_SKILL_ROOT = '.agents/skills';

// 每个客户端 MCP 配置的真实落点——全系统单一事实来源（取代之前错误的 home/mcp.json 假设）。
// 双作用域：大多数客户端同时支持项目级和用户级 MCP 配置，各有独立文件。
// format: 'json'(标准 mcpServers) | 'toml'(codex 的 [mcp_servers]) | 'opencode-json'(opencode 的 mcp 命名空间 + 本地条目形状)
// namespace: JSON 顶层键 / TOML 表前缀。
// createIfMissing 由各消费方按自身语义决定，不在此处编码。
export const CLIENT_MCP_TARGETS = Object.freeze({
  codex: Object.freeze({
    format: 'toml',
    namespace: 'mcp_servers',
    scopes: Object.freeze([
      Object.freeze({ scope: 'home', file: 'config.toml' }),
      Object.freeze({ scope: 'project', file: '.codex/config.toml' }),
    ]),
  }),
  claude: Object.freeze({
    format: 'json',
    namespace: 'mcpServers',
    scopes: Object.freeze([
      Object.freeze({ scope: 'project', file: '.mcp.json' }),
      Object.freeze({ scope: 'home', file: '.mcp.json' }),
    ]),
  }),
  gemini: Object.freeze({
    format: 'json',
    namespace: 'mcpServers',
    scopes: Object.freeze([
      Object.freeze({ scope: 'project', file: '.gemini/settings.json' }),
      Object.freeze({ scope: 'home', file: 'settings.json' }),
    ]),
  }),
  // Antigravity CLI MCP — inherited from Gemini CLI; verify paths after install.
  antigravity: Object.freeze({
    format: 'json',
    namespace: 'mcpServers',
    scopes: Object.freeze([
      Object.freeze({ scope: 'project', file: '.gemini/settings.json' }),
      Object.freeze({ scope: 'home', file: 'settings.json' }),
    ]),
  }),
  opencode: Object.freeze({
    format: 'opencode-json',
    namespace: 'mcp',
    scopes: Object.freeze([
      Object.freeze({ scope: 'home', file: 'opencode.json' }),
    ]),
  }),
  crush: Object.freeze({
    format: 'json',
    namespace: 'mcp',
    scopes: Object.freeze([
      Object.freeze({ scope: 'project', file: 'crush.json' }),
      Object.freeze({ scope: 'project', file: '.crush.json' }),
      Object.freeze({ scope: 'home', file: 'crush.json' }),
    ]),
  }),
});
