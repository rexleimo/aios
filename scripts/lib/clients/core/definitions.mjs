import { orderByPriority } from './ordering.mjs';

export const CLIENT_CAPABILITIES = Object.freeze(['skills', 'agents', 'native', 'team', 'harness']);

// Per-client skill format: 'markdown-directory' = SKILL.md in a dir (all clients including gemini).
// 'toml-command' = single .toml file, used only for route commands (.gemini/commands/*.toml), not skills.
export const SKILL_FORMATS = Object.freeze(['markdown-directory', 'toml-command']);
export const DEFAULT_SKILL_FORMAT = 'markdown-directory';

// 模型路由契约（与 capabilities 正交：能当 team worker != 能被派模型）。
//   mode='relay'  AIOS 可以给该客户端注入端点并按 protocol 派模型（worker 用 --model/-m 传递）。
//   mode='own'    不派模型：用客户端自身配置的默认模型（账号绑定 / 无 headless --model / 端点覆盖能力未验证）。
//   protocols     该客户端能实际 speak 的 relay 协议，取自本机配置证据（见每行行尾注释）。
// 三态而不是两态：避免把 team-capable 但不可路由的客户端（zcode/grok/workbuddy）判成不兼容后硬拒。
export const CLIENT_DEFINITIONS = Object.freeze({
  codex: Object.freeze({
    capabilities: Object.freeze(['skills', 'agents', 'native', 'team', 'harness']),
    commandName: 'codex',
    modelRouting: 'relay',
    modelProtocols: Object.freeze(['openai-response']),  // codex config.toml: base_url + wire_api=responses
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
    modelRouting: 'relay',
    modelProtocols: Object.freeze(['claude']),  // claude env ANTHROPIC_BASE_URL/ANTHROPIC_AUTH_TOKEN 可覆盖
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
    modelRouting: 'own',
    modelProtocols: Object.freeze([]),  // 本机未装 gemini CLI，端点覆盖能力未验证 -> 先按客户端自身配置
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
    modelRouting: 'relay',
    modelProtocols: Object.freeze(['openai-chat', 'openai-response', 'claude', 'gemini']),  // opencode.json 已实配 @ai-sdk/openai|anthropic|google|openai-compatible 四通道
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
    modelRouting: 'relay',
    modelProtocols: Object.freeze(['claude', 'openai-chat']),  // hermes config.yaml custom_providers.api_mode: anthropic_messages|chat_completions
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
    modelRouting: 'own',
    modelProtocols: Object.freeze([]),  // grok 账号绑定（grok models 只有 4.5/4.6），无自定义 base_url
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
    modelRouting: 'own',
    modelProtocols: Object.freeze([]),  // workbuddy CLI 未安装，本期不参与模型路由
    runtimeClientId: 'workbuddy-agent',
    projectSkillRoot: '.workbuddy/skills',
    skillFormat: 'markdown-directory',
    nativeMetadataRoot: '.workbuddy',
    instructionFileName: 'AGENTS.md',
    nativeProjectSourceFile: 'AGENTS.md',
    modelArgFlag: '--model',
    unattendedArgs: Object.freeze(['--dangerously-skip-permissions']),
  }),
  // Pi coding agent (earendil-works/pi) — minimal self-extending harness.
  // Skills: Pi natively scans the Agent Skills standard roots, including the
  // shared project root `.agents/skills` and `~/.agents/skills`. AIOS must
  // NOT also install into `.pi/skills`: when both exist Pi reports the skill
  // as already loaded from one root and skips the copy in the shared path,
  // so the shared root is the single project-scope install target.
  // Global skills keep the per-client home `~/.pi/agent/skills` (the shared
  // global root is not an AIOS install target).
  // Native instruction: AGENTS.md (global ~/.pi/agent/AGENTS.md + cwd chain, APPEND_SYSTEM.md override).
  // No built-in MCP surface: AIOS tools reach Pi through the AIOS Pi extension, not config migration.
  // No sub-agents upstream: no `agents` capability until an extension verifies it.
  // team: the same spawn-based routing drives `pi -p` headlessly as any other
  // provider (verified live: worker dispatch + batch aggregation, see
  // scripts/tests/team-pi-worker.test.mjs). Harness RPC (long-lived managed
  // session) is supported via the pi-rpc transport.
  pi: Object.freeze({
    capabilities: Object.freeze(['skills', 'native', 'team', 'harness']),
    commandName: 'pi',
    modelRouting: 'relay',
    modelProtocols: Object.freeze(['openai-chat', 'claude']),  // pi models.json provider.api: openai-completions|anthropic-messages
    runtimeClientId: 'pi-coding-agent',
    projectSkillRoot: '.agents/skills',
    skillFormat: 'markdown-directory',
    nativeMetadataRoot: '.pi',
    instructionFileName: 'AGENTS.md',
    nativeProjectSourceFile: 'AGENTS.md',
    modelArgFlag: '--model',
    unattendedArgs: Object.freeze([]),  // Pi has no permission popups; harness drives print/json/rpc
  }),
  // ZCode (Z.AI) — desktop AI coding app (Electron) that ALSO ships a real CLI inside
  // the app bundle: /Applications/ZCode.app/Contents/Resources/glm/zcode.cjs (run with
  // node; NOT on PATH by default — alias `zcode` to it to enable CLI detection/harness).
  // The CLI supports -p/--print one-shot, --resume <sessId>, -c/--continue, --json,
  // and --mode yolo (the documented default for headless prompts, passed explicitly).
  // No headless --model flag exists (verified against zcode 0.16.5: "Unknown option
  // '--model'"); model routing therefore stays empty until upstream ships a flag.
  // Skills: ZCode natively scans Agent Skills roots — user ~/.zcode/skills and
  // ~/.agents/skills, project .zcode/skills then .agents/skills. Same lesson as pi:
  // project skills land ONLY in the shared root .agents/skills; a .zcode/skills copy
  // would shadow the shared projection. Global skills keep the per-client home
  // ~/.zcode/skills.
  // MCP: user ~/.zcode/cli/config.json and project .zcode/config.json, both nested
  // mcp.servers (strict server schema — canonical command/args/env fields only).
  // Native instruction: AGENTS.md (user ~/.zcode/AGENTS.md + workspace chain).
  // team: spawn-based routing drives the bundled CLI headlessly like any other
  // provider. No `agents` capability: ZCode has no project-scope subagent-definition
  // surface (its native extensibility is .zcode/workflows/*.workflow.js, a different
  // artifact type; plugin `agents` fields are recorded but not executed upstream).
  zcode: Object.freeze({
    capabilities: Object.freeze(['skills', 'native', 'team', 'harness']),
    commandName: 'zcode',
    modelRouting: 'own',
    modelProtocols: Object.freeze([]),  // zcode 无 headless --model（0.16.5 实测 Unknown option）
    runtimeClientId: 'zcode-cli',
    projectSkillRoot: '.agents/skills',
    skillFormat: 'markdown-directory',
    nativeMetadataRoot: '.zcode',
    instructionFileName: 'AGENTS.md',
    nativeProjectSourceFile: 'AGENTS.md',
    modelArgFlag: '',
    unattendedArgs: Object.freeze(['--mode', 'yolo']),
  }),
  // Qoder (Alibaba) — 桌面 IDE + CLI。判据来自安装包内打包的 agent SDK 运行时
  // （resources/app.asar.unpacked/node_modules/@qoder-ai/qoder-cn-agent-sdk）：
  // Skills 扫描根按运行时 SkillCommandHandler.enumerate 的顺序：
  //   ~/.qoder-cn/skills（user）> ~/.agents/skills（user，受 loadFromAgentsDirectory 门控）
  //   > <repo>/.qoder/skills（project）> <repo>/.agents/skills（project，同一门控）。
  // 用户级根是"发行版家目录/skills"，所以它必须跟着 resolveQoderHome 走：CN 是 ~/.qoder-cn，
  // 国际版是 ~/.qoder。AIOS 此前把家目录写死成 ~/.qoder，在 CN 机器上等于装进一个不扫描的目录。
  // 同理 project 配置目录名两个发行版都是 `.qoder`（运行时 projectDefault 不随发行版切换），
  // MCP 落点见 CLIENT_MCP_TARGETS.qoder。
  // Native instruction: AGENTS.md（已验证：仓库 AGENTS.md 会被自动注入；QODER.md 别名不写）。
  // 命令名：CN 发行版是 qodercn / qoder-cn（分发器）与 qoderclicn（真实 exe，见
  // entry/qodercn-dispatcher.ps1 的 Get-Command 顺序），国际版才是 qoder / qodercli；
  // 真实装哪个取决于用户，所以按候选解析而不是赌一个。
  // Headless：`--yolo` 与 `--model`/`--print`/`--output-format`/`--permission-mode` 同表存在于
  // 打包进 IDE 的 agent SDK argv 表；模型默认走账号绑定（/model 交互），不做 headless 路由。
  qoder: Object.freeze({
    capabilities: Object.freeze(['skills', 'native', 'team', 'harness']),
    commandName: 'qoder',
    commandAliases: Object.freeze(['qodercli', 'qodercn', 'qoder-cn', 'qoderclicn']),
    modelRouting: 'own',
    modelProtocols: Object.freeze([]),  // qoder 模型账号绑定（/model 交互选择），无已验证的 headless --model
    runtimeClientId: 'qoder-cli',
    projectSkillRoot: '.qoder/skills',
    skillFormat: 'markdown-directory',
    nativeMetadataRoot: '.qoder',
    instructionFileName: 'AGENTS.md',
    nativeProjectSourceFile: 'AGENTS.md',
    modelArgFlag: '',
    unattendedArgs: Object.freeze(['--yolo']),
  }),
});

export const ALL_CLIENTS = Object.freeze(Object.keys(CLIENT_DEFINITIONS));
export const CLIENT_SELECTIONS = Object.freeze(['all', ...ALL_CLIENTS]);

// 纯函数：某能力的成员集合，来自每个客户端自己的 capabilities 声明（单一事实来源）。
function clientsWithCapability(capability) {
  return Object.freeze(ALL_CLIENTS.filter((client) => (
    CLIENT_DEFINITIONS[client].capabilities.includes(capability)
  )));
}

// 顺序是派发优先级，成员来自各客户端的 capabilities 声明；team 唯一的偏离是 zcode 排在 pi 前。
export const CAPABILITY_CLIENT_ORDER = Object.freeze({
  skills: clientsWithCapability('skills'),
  native: clientsWithCapability('native'),
  agents: orderByPriority(clientsWithCapability('agents'), ['claude']),
  team: orderByPriority(clientsWithCapability('team'), ['codex', 'claude', 'gemini', 'opencode', 'grok', 'zcode']),
  harness: clientsWithCapability('harness'),
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
      // Claude Code 的**用户级** MCP 文件是与 `~/.claude` 同级的 `~/.claude.json`，
      // 不是 `~/.claude/.mcp.json`（后者不是它的真实配置位置；同样的结论见
      // `scripts/lib/doctor/security-config/files.mjs` 的说明）。
      Object.freeze({ scope: 'home', file: '../.claude.json', createIfMissing: true }),
    ]),
  }),
  // Gemini CLI MCP — JSON mcpServers namespace. Gemini's McpServerConfigSchema is strict:
  // an unknown field (e.g. AIOS's startupTimeoutSec) invalidates the WHOLE settings.json
  // and gemini refuses to start ("Invalid configuration"). 'gemini-json' normalizes
  // AIOS-managed servers to that schema (startupTimeoutSec seconds -> timeout milliseconds).
  // 与 zcode 同构：target 仍是 'json'，归一化只写在 scope 层。
  gemini: Object.freeze({
    format: 'json',
    namespace: 'mcpServers',
    scopes: Object.freeze([
      Object.freeze({ scope: 'project', file: '.gemini/settings.json', format: 'gemini-json' }),
      Object.freeze({ scope: 'home', file: 'settings.json', format: 'gemini-json', createIfMissing: true }),
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
  // Pi has no built-in MCP surface (upstream philosophy: extensions over MCP).
  // Empty scopes: every collector iterates scopes, so migration/proxy/codemap safely skip Pi.
  // AIOS memory/tools reach Pi through the AIOS Pi extension, not config files.
  pi: Object.freeze({
    format: 'none',
    namespace: '',
    scopes: Object.freeze([]),
  }),
  // ZCode MCP — nested mcp.servers inside the shared CLI config file (which also
  // holds hooks/plugins state). Dot-path namespace; the JSON migrator resolves it.
  // 'zcode-json' additionally normalizes AIOS-managed servers to ZCode's strict
  // server schema (unknown fields like startupTimeoutSec would get servers dropped).
  // Home: ~/.zcode/cli/config.json (clientHome already resolves to ~/.zcode).
  // Project: .zcode/config.json (zcode.json is an accepted alias we do not write).
  zcode: Object.freeze({
    format: 'json',
    namespace: 'mcp.servers',
    scopes: Object.freeze([
      Object.freeze({ scope: 'home', file: 'cli/config.json', format: 'zcode-json', namespace: 'mcp.servers', createIfMissing: true }),
      Object.freeze({ scope: 'project', file: '.zcode/config.json', format: 'zcode-json', namespace: 'mcp.servers' }),
    ]),
  }),
  // Qoder MCP — standard JSON mcpServers inside the CLI settings files (which also
  // hold unrelated user settings, so the migrator must merge, never rewrite).
  // Home: <edition home>/settings.json — the runtime's own getGlobalSettingsPath(), so on
  // a CN install it is ~/.qoder-cn/settings.json (see resolveQoderHome), not ~/.qoder.
  // Project: .qoder/settings.json (committed scope). The gitignored
  // .qoder/settings.local.json 'local' scope is a valid CLI target we do not write.
  qoder: Object.freeze({
    format: 'json',
    namespace: 'mcpServers',
    scopes: Object.freeze([
      Object.freeze({ scope: 'home', file: 'settings.json', createIfMissing: true }),
      Object.freeze({ scope: 'project', file: '.qoder/settings.json' }),
    ]),
  }),
});
// 纯函数：给 CLI 帮助与文档使用的客户端清单，仍然来自同一份注册表。
export function describeClient(name) {
  const normalized = String(name || '').trim().toLowerCase();
  return CLIENT_DEFINITIONS[normalized] || null;
}

export function getClientHelpList() {
  return {
    clientNames: [...ALL_CLIENTS],
    byCapability: Object.fromEntries(Object.entries(CAPABILITY_CLIENT_ORDER)
      .map(([capability, names]) => [capability, [...names]])),
  };
}
