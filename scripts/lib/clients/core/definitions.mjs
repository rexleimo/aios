export const CLIENT_CAPABILITIES = Object.freeze(['skills', 'agents', 'native', 'team', 'harness']);

// Per-client skill format: 'markdown-directory' = SKILL.md in a dir (all clients including gemini).
// 'toml-command' = single .toml file, used only for route commands (.gemini/commands/*.toml), not skills.
export const SKILL_FORMATS = Object.freeze(['markdown-directory', 'toml-command']);
export const DEFAULT_SKILL_FORMAT = 'markdown-directory';

export const CLIENT_DEFINITIONS = Object.freeze({
  codex: Object.freeze({
    capabilities: Object.freeze(['skills', 'agents', 'native', 'team', 'harness']),
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
    capabilities: Object.freeze(['skills', 'agents', 'native', 'team', 'harness']),
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
    capabilities: Object.freeze(['skills', 'native', 'team', 'harness']),
    commandName: 'gemini',
    runtimeClientId: 'gemini-cli',
    projectSkillRoot: '.gemini/skills',
    skillFormat: 'markdown-directory',
    nativeMetadataRoot: '.gemini',
    instructionFileName: 'GEMINI.md',
    nativeProjectSourceFile: 'GEMINI.md',
    // 中文注释：Gemini CLI 上游已停止迭代（供应商转向 Antigravity），但按项目承诺
    // 所有客户端一致支持：AIOS 继续全量适配（MCP 记忆、指令投影、skill 同步），
    // 仅同步上游现版本的修复，不依赖上游新功能。
    modelArgFlag: '-m',
    unattendedArgs: Object.freeze(['--yolo']),
  }),
  opencode: Object.freeze({
    capabilities: Object.freeze(['skills', 'native', 'harness', 'agents', 'team']),
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
  // Hermes Agent (NousResearch) — CLI agent with MCP, skills, cron, memory, delegate_task.
  // Skill format: markdown-directory (SKILL.md frontmatter + steps).
  // MCP config: JSON stdio in ~/.hermes/config.yaml mcp_servers section or project .mcp.json.
  // Native instruction: AGENTS.md (auto-loaded from project root).
  // No built-in unattended mode; harness orchestration uses delegate_task instead.
  hermes: Object.freeze({
    capabilities: Object.freeze(['skills', 'native', 'harness']),
    commandName: 'hermes',
    runtimeClientId: 'hermes-agent',
    projectSkillRoot: '.hermes/skills',
    skillFormat: 'markdown-directory',
    nativeMetadataRoot: '.hermes',
    instructionFileName: 'AGENTS.md',
    nativeProjectSourceFile: 'AGENTS.md',
    modelArgFlag: '--model',
    unattendedArgs: Object.freeze([]),  // Hermes 没有 --yolo/--dangerously-skip-permissions 模式
  }),
  // Grok Build (xAI) — TUI coding agent with skills, MCP, subagents, headless mode.
  // Skills: .grok/skills (also scans .agents/skills and Claude/Cursor compat paths).
  // MCP: TOML [mcp_servers.*] in ~/.grok/config.toml (and project .grok/config.toml).
  // Native instruction: AGENTS.md (and Agents.md / CLAUDE.md compat names).
  // Unattended: --always-approve (headless also documents --yolo).
  grok: Object.freeze({
    capabilities: Object.freeze(['skills', 'agents', 'native', 'team', 'harness']),
    commandName: 'grok',
    runtimeClientId: 'grok-build',
    projectSkillRoot: '.grok/skills',
    skillFormat: 'markdown-directory',
    agentTargetRoot: '.grok/agents',
    nativeMetadataRoot: '.grok',
    instructionFileName: 'AGENTS.md',
    nativeProjectSourceFile: 'AGENTS.md',
    modelArgFlag: '-m',
    unattendedArgs: Object.freeze(['--always-approve']),
  }),
  // WorkBuddy — desktop AI agent that ALSO ships a real CLI inside the app bundle:
  //   /Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin/codebuddy
  // (aliased as `cbc`). It supports non-interactive one-shot (`-p` / --print),
  // JSON output, `--model`, `--worktree`, `--acp` stdio, and `-y`/--dangerously-skip-permissions,
  // so it can be driven as a solo-harness provider exactly like codex/claude.
  // The binary is NOT on PATH by default — add the app's cli/bin dir to PATH.
  // Skills: user-level ~/.workbuddy/skills + project-level .workbuddy/skills (markdown-directory).
  // MCP: JSON ~/.workbuddy/mcp.json with mcpServers namespace.
  // Native instruction: AGENTS.md (project root, auto-loaded as project guidance).
  // No `team`/`agents` capability: subagent/groupchat routing is unverified for this CLI.
  workbuddy: Object.freeze({
    capabilities: Object.freeze(['skills', 'native', 'harness']),
    commandName: 'codebuddy',
    runtimeClientId: 'workbuddy-agent',
    projectSkillRoot: '.workbuddy/skills',
    skillFormat: 'markdown-directory',
    nativeMetadataRoot: '.workbuddy',
    instructionFileName: 'AGENTS.md',
    nativeProjectSourceFile: 'AGENTS.md',
    modelArgFlag: '--model',
    unattendedArgs: Object.freeze(['--dangerously-skip-permissions']),
  }),
});

export const ALL_CLIENTS = Object.freeze(Object.keys(CLIENT_DEFINITIONS));
export const CLIENT_SELECTIONS = Object.freeze(['all', ...ALL_CLIENTS]);

export const CAPABILITY_CLIENT_ORDER = Object.freeze({
  skills: ALL_CLIENTS,
  native: ALL_CLIENTS,
  agents: Object.freeze(['claude', 'codex', 'opencode', 'grok']),
  team: Object.freeze(['codex', 'claude', 'gemini', 'opencode', 'grok']),
  harness: ALL_CLIENTS,
});

export const SHARED_AGENT_SKILL_ROOT = '.agents/skills';

// 每个客户端 MCP 配置的真实落点——全系统单一事实来源（取代之前错误的 home/mcp.json 假设）。
// 双作用域：大多数客户端同时支持项目级和用户级 MCP 配置，各有独立文件。
// format: 'json'(标准 mcpServers) | 'toml'(codex 的 [mcp_servers]) | 'opencode-json'(opencode 的 mcp 命名空间 + 本地条目形状) | 'yaml'(hermes config.yaml 的 mcp_servers)
// namespace: JSON 顶层键 / TOML 表前缀。
// createIfMissing: true 表示即使目标文件不存在也可创建；null/undefined 按消费方默认（home scope 默认 false，project scope 默认 true）。
export const CLIENT_MCP_TARGETS = Object.freeze({
  codex: Object.freeze({
    format: 'toml',
    namespace: 'mcp_servers',
    scopes: Object.freeze([
      Object.freeze({ scope: 'home', file: 'config.toml', createIfMissing: true }),
      Object.freeze({ scope: 'project', file: '.codex/config.toml' }),
    ]),
  }),
  claude: Object.freeze({
    format: 'json',
    namespace: 'mcpServers',
    scopes: Object.freeze([
      Object.freeze({ scope: 'project', file: '.mcp.json' }),
      Object.freeze({ scope: 'home', file: '.mcp.json', createIfMissing: true }),
    ]),
  }),
  gemini: Object.freeze({
    format: 'json',
    namespace: 'mcpServers',
    scopes: Object.freeze([
      Object.freeze({ scope: 'project', file: '.gemini/settings.json' }),
      Object.freeze({ scope: 'home', file: 'settings.json', createIfMissing: true }),
    ]),
  }),
  opencode: Object.freeze({
    format: 'opencode-json',
    namespace: 'mcp',
    scopes: Object.freeze([
      Object.freeze({ scope: 'home', file: 'opencode.json', createIfMissing: true }),
    ]),
  }),
  // Hermes Agent MCP — JSON stdio format, mcpServers namespace.
  // Project scope: .mcp.json (shared with Claude Code).
  // Home scope: config.yaml under ~/.hermes/ (Hermes reads mcp_servers from its YAML config).
  hermes: Object.freeze({
    format: 'json',
    namespace: 'mcpServers',
    scopes: Object.freeze([
      Object.freeze({ scope: 'project', file: '.mcp.json' }),
      Object.freeze({ scope: 'home', file: 'config.yaml', format: 'yaml', namespace: 'mcp_servers', createIfMissing: true }),
    ]),
  }),
  // Grok Build MCP — TOML [mcp_servers.*], same shape as Codex.
  // Home: ~/.grok/config.toml; Project: .grok/config.toml
  grok: Object.freeze({
    format: 'toml',
    namespace: 'mcp_servers',
    scopes: Object.freeze([
      Object.freeze({ scope: 'home', file: 'config.toml', createIfMissing: true }),
      Object.freeze({ scope: 'project', file: '.grok/config.toml' }),
    ]),
  }),
  // WorkBuddy MCP — JSON stdio format, mcpServers namespace, single home scope.
  // Home: ~/.workbuddy/mcp.json (clientHome already resolves to ~/.workbuddy).
  workbuddy: Object.freeze({
    format: 'json',
    namespace: 'mcpServers',
    scopes: Object.freeze([
      Object.freeze({ scope: 'home', file: 'mcp.json', createIfMissing: true }),
    ]),
  }),
});
