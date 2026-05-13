#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { getCommandSpawnSpec } from './lib/platform/process.mjs';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CTX_AGENT_CLI_PATH = path.join(ROOT_DIR, 'scripts', 'ctx-agent.mjs');

const KNOWN_ENDPOINT_ENV_NAMES = new Set([
  'OPENAI_BASE_URL',
  'OPENAI_API_BASE',
  'OPENAI_API_URL',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_API_URL',
  'GOOGLE_AI_BASE_URL',
  'GEMINI_BASE_URL',
  'GEMINI_API_BASE_URL',
  'CODEX_BASE_URL',
  'CLAUDE_BASE_URL',
  'CLAUDE_CODE_BASE_URL',
  'OPENCODE_BASE_URL',
  'OPENROUTER_BASE_URL',
]);

const MODEL_ENDPOINT_NAME_RE = /(?:OPENAI|ANTHROPIC|GOOGLE|GEMINI|CODEX|CLAUDE|OPENCODE|OPENROUTER|LLM|MODEL).*(?:BASE_URL|API_BASE|API_URL|ENDPOINT)$/u;
const OFFICIAL_ENDPOINT_SUFFIXES = [
  'api.openai.com',
  'openai.com',
  'api.anthropic.com',
  'anthropic.com',
  'generativelanguage.googleapis.com',
  'googleapis.com',
];


const BLOCKED_SUBCOMMANDS = {
  codex: new Set([
    'exec', 'review', 'login', 'logout', 'mcp', 'mcp-server', 'app-server', 'app',
    'completion', 'sandbox', 'debug', 'apply', 'resume', 'fork', 'cloud', 'features',
    // Forward-compat: Codex CLI v0.113+ introduces plugin workflows; v0.114+ adds an experimental hooks engine.
    // These subcommands are operational/admin flows and should never be wrapped by ContextDB.
    'plugin', 'hooks',
    'help', '-h', '--help', '-V', '--version',
  ]),
  claude: new Set([
    'agents', 'auth', 'doctor', 'install', 'mcp', 'plugin', 'setup-token', 'update',
    'upgrade', '-h', '--help', '-v', '--version',
  ]),
  gemini: new Set([
    'mcp', 'extensions', 'skills', 'hooks', '-h', '--help', '-v', '--version',
  ]),
  opencode: new Set([
    'completion', 'acp', 'mcp', 'attach', 'run', 'debug', 'auth', 'agent', 'upgrade',
    'uninstall', 'serve', 'web', 'models', 'stats', 'export', 'import', 'github', 'pr',
    'session', 'db', '-h', '--help', '-v', '--version',
  ]),
};

function usage() {
  console.log(`Usage:
  node scripts/contextdb-shell-bridge.mjs --agent <codex-cli|claude-code|gemini-cli|opencode-cli> --command <codex|claude|gemini|opencode> [--cwd <path>] [-- <args...>]

Environment:
  ROOTPATH               Repo root containing scripts/ctx-agent.mjs
  CTXDB_RUNNER           Explicit runner path (overrides ROOTPATH discovery)
  CTXDB_REPO_NAME        Optional project name override
  CTXDB_WRAP_MODE        all|repo-only|opt-in|off (default: repo-only)
  CTXDB_MARKER_FILE      Marker filename for opt-in mode (default: .contextdb-enable)
  CTXDB_AUTO_CREATE_MARKER 1/true/yes/on to auto-create marker in opt-in mode (default: on)
  CTXDB_INTERACTIVE_AUTO_ROUTE 1/true/yes/on to inject route auto prompt in interactive mode (default: on)
  CTXDB_HARNESS_PROVIDER codex|claude|gemini|opencode for injected harness route (default: current CLI)
  CTXDB_HARNESS_MAX_ITERATIONS Positive integer for injected harness route (default: 8)
  CTXDB_PRIVACY_BANNER   0/false/off to hide the interactive privacy banner (default: on)
  CTXDB_PRIVACY_COLOR    0/false/off to disable banner ANSI color (default: on unless NO_COLOR is set)
  CTXDB_CODEX_DISABLE_MCP 1/true/yes/on to launch Codex without MCP startup in wrapped runs
  CTXDB_DEBUG            1/true/yes/on to print bridge decisions`);
}

function parseArgs(argv) {
  const opts = {
    agent: '',
    command: '',
    cwd: process.cwd(),
    passthroughArgs: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--agent':
        opts.agent = argv[++i] || '';
        break;
      case '--command':
        opts.command = argv[++i] || '';
        break;
      case '--cwd':
        opts.cwd = argv[++i] || process.cwd();
        break;
      case '-h':
      case '--help':
        usage();
        process.exit(0);
        break;
      case '--':
        opts.passthroughArgs = argv.slice(i + 1);
        i = argv.length;
        break;
      default:
        opts.passthroughArgs.push(arg);
        break;
    }
  }

  return opts;
}

function normalizeCodeHome(env, cwd) {
  const codexHome = env.CODEX_HOME;
  if (!codexHome) return;

  let normalized = codexHome.trim();
  const home = env.HOME || env.USERPROFILE || '';

  if (normalized === '~') {
    normalized = home || normalized;
  } else if (normalized.startsWith('~/') || normalized.startsWith('~\\')) {
    const suffix = normalized.slice(2);
    normalized = home ? path.join(home, suffix) : normalized;
  }

  if (!path.isAbsolute(normalized)) {
    normalized = path.resolve(cwd, normalized);
  }
  env.CODEX_HOME = normalized;

  if (!existsSync(normalized)) {
    try {
      mkdirSync(normalized, { recursive: true });
    } catch {
      // non-fatal: fallback to runtime behavior
    }
  }
}


function expandHome(inputPath, env) {
  if (!inputPath) return inputPath;
  const home = env.HOME || env.USERPROFILE || '';
  if (inputPath === '~') return home || inputPath;
  if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    return home ? path.join(home, inputPath.slice(2)) : inputPath;
  }
  return inputPath;
}

function resolvePrivacyConfigPath(env) {
  const explicit = String(env.REXCIL_PRIVACY_CONFIG || '').trim();
  if (explicit) {
    return path.resolve(expandHome(explicit, env));
  }

  const home = env.HOME || env.USERPROFILE || '';
  const rexcilHomeRaw = String(env.REXCIL_HOME || '').trim();
  const rexcilHome = rexcilHomeRaw
    ? path.resolve(expandHome(rexcilHomeRaw, env))
    : path.join(home, '.rexcil');
  return path.join(rexcilHome, 'privacy-guard.json');
}

function summarizePrivacyGuard(env) {
  const configPath = resolvePrivacyConfigPath(env);
  if (!existsSync(configPath)) {
    return {
      enabled: true,
      mode: 'regex',
      strict: true,
      label: 'enabled (regex, strict defaults; config missing)',
      severity: 'ok',
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    return {
      enabled: false,
      mode: 'unknown',
      strict: false,
      label: 'unknown (invalid config; run aios privacy status)',
      severity: 'warn',
    };
  }

  const enforcement = parsed && typeof parsed === 'object' && parsed.enforcement && typeof parsed.enforcement === 'object'
    ? parsed.enforcement
    : {};
  const enabled = parsed?.enabled !== false;
  const mode = typeof parsed?.mode === 'string' && parsed.mode.trim() ? parsed.mode.trim() : 'regex';
  const strict = Boolean(
    enforcement.requiredForSensitiveFiles !== false
      && enforcement.blockWhenGuardDisabled !== false
      && enforcement.detectSensitiveContent !== false
  );
  const strictText = strict ? ', strict' : ', relaxed';
  return {
    enabled,
    mode,
    strict,
    label: `${enabled ? 'enabled' : 'disabled'} (${mode}${strictText})`,
    severity: enabled && strict ? 'ok' : 'warn',
  };
}

function isEndpointEnvName(name) {
  return KNOWN_ENDPOINT_ENV_NAMES.has(name) || MODEL_ENDPOINT_NAME_RE.test(name);
}

function parseEndpointHost(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  try {
    const normalized = /^[a-z][a-z0-9+.-]*:\/\//iu.test(raw) ? raw : `https://${raw}`;
    const url = new URL(normalized);
    return url.hostname || '';
  } catch {
    return '';
  }
}

function isLocalEndpointHost(host) {
  const normalized = String(host || '').trim().toLowerCase();
  return normalized === 'localhost'
    || normalized === '::1'
    || normalized === '[::1]'
    || normalized === '0.0.0.0'
    || normalized.startsWith('127.')
    || normalized.endsWith('.local');
}

function matchesHostSuffix(host, suffix) {
  return host === suffix || host.endsWith(`.${suffix}`);
}

function isOfficialEndpointHost(host) {
  const normalized = String(host || '').trim().toLowerCase();
  return OFFICIAL_ENDPOINT_SUFFIXES.some((suffix) => matchesHostSuffix(normalized, suffix));
}

function summarizeModelEndpoints(env) {
  const endpoints = Object.entries(env)
    .filter(([name, value]) => isEndpointEnvName(name) && String(value || '').trim())
    .map(([name, value]) => ({ name, host: parseEndpointHost(value) }))
    .filter((item) => item.host);

  const custom = endpoints.filter((item) => {
    const host = item.host.toLowerCase();
    return !isLocalEndpointHost(host) && !isOfficialEndpointHost(host);
  });

  if (custom.length > 0) {
    const preview = custom
      .slice(0, 2)
      .map((item) => `${item.name} -> ${item.host}`)
      .join(', ');
    const suffix = custom.length > 2 ? ` (+${custom.length - 2} more)` : '';
    return {
      severity: 'warn',
      label: `custom relay endpoint: ${preview}${suffix}`,
    };
  }

  if (endpoints.length > 0) {
    return {
      severity: 'ok',
      label: 'official/local endpoint only',
    };
  }

  return {
    severity: 'ok',
    label: 'default provider endpoint (no override detected)',
  };
}

function shouldUsePrivacyColor(env) {
  if ('NO_COLOR' in env) return false;
  return parseBoolEnv(env.CTXDB_PRIVACY_COLOR, true);
}

function ansi(env, code, value) {
  if (!shouldUsePrivacyColor(env)) return String(value);
  return `\u001b[${code}m${value}\u001b[0m`;
}

function stripAnsi(value) {
  return String(value).replace(/\u001b\[[0-9;]*m/gu, '');
}

function renderPrivacyPanel(lines, env) {
  const width = Math.max(...lines.map((line) => stripAnsi(line).length), 24);
  const border = `+${'-'.repeat(width + 2)}+`;
  const rendered = [ansi(env, '36', border)];
  for (const line of lines) {
    const padding = ' '.repeat(Math.max(0, width - stripAnsi(line).length));
    rendered.push(`${ansi(env, '36', '|')} ${line}${padding} ${ansi(env, '36', '|')}`);
  }
  rendered.push(ansi(env, '36', border));
  return `${rendered.join('\n')}\n`;
}

function buildPrivacyBanner({ command, agent, shouldWrap, env }) {
  const guard = summarizePrivacyGuard(env);
  const endpoints = summarizeModelEndpoints(env);
  const guardText = ansi(env, guard.severity === 'ok' ? '32' : '33', guard.label);
  const endpointText = ansi(env, endpoints.severity === 'ok' ? '32' : '33', endpoints.label);
  const contextText = shouldWrap ? ansi(env, '32', 'wrapped') : ansi(env, '33', 'passthrough');

  return renderPrivacyPanel([
    ansi(env, '1;36', 'AIOS Privacy Shield'),
    `Agent: ${agent} (${command}) | ContextDB: ${contextText}`,
    `Privacy Guard: ${guardText}`,
    `Relay check: ${endpointText}`,
    'Secret handling: sensitive files -> aios privacy read --file <path>',
    'Model compliance: advisory only; deterministic AIOS gates verify enforcement',
  ], env);
}

function shouldPrintPrivacyBanner(env, interactive) {
  if (!interactive) return false;
  return parseBoolEnv(env.CTXDB_PRIVACY_BANNER, true);
}

function runGit(cwd, args) {
  return spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function detectWorkspaceRoot(cwd) {
  const result = runGit(cwd, ['rev-parse', '--show-toplevel']);
  if (result.status === 0) {
    const workspace = (result.stdout || '').trim();
    if (workspace) return workspace;
  }
  return path.resolve(cwd);
}

function normalizeForCompare(inputPath) {
  let output = path.resolve(inputPath);
  try {
    output = realpathSync(output);
  } catch {
    // ignore realpath failures and keep resolved absolute path
  }

  if (process.platform === 'win32') {
    return output.toLowerCase();
  }

  return output;
}

function shouldWrapWorkspace(workspace, env) {
  const mode = (env.CTXDB_WRAP_MODE || 'repo-only').trim().toLowerCase();

  switch (mode) {
    case 'all':
      return true;
    case 'repo-only': {
      const rootpath = env.ROOTPATH;
      if (!rootpath) return false;
      return normalizeForCompare(rootpath) === normalizeForCompare(workspace);
    }
    case 'opt-in': {
      const marker = env.CTXDB_MARKER_FILE || '.contextdb-enable';
      return existsSync(path.join(workspace, marker));
    }
    case 'off':
    case 'disabled':
    case 'none':
      return false;
    default:
      // preserve historical behavior for unknown modes
      return true;
  }
}

function isBlockedSubcommand(command, firstArg) {
  if (!firstArg) return false;
  const blocked = BLOCKED_SUBCOMMANDS[command];
  if (!blocked) return false;
  return blocked.has(firstArg);
}

function detectRunner(env) {
  if (env.CTXDB_RUNNER && existsSync(env.CTXDB_RUNNER)) {
    return { command: env.CTXDB_RUNNER, args: [] };
  }

  if (env.ROOTPATH) {
    const candidate = path.join(env.ROOTPATH, 'scripts', 'ctx-agent.mjs');
    if (existsSync(candidate)) {
      return { command: 'node', args: [candidate] };
    }
  }

  return null;
}

function isInteractivePassthrough(command, passthroughArgs) {
  // Interactive mode: bare command with no positional arguments (no subcommand, no --prompt, etc.)
  const first = passthroughArgs[0] || '';
  if (!first) return true;
  // Allow help/version flags through to the native agent without ContextDB interference
  if (first === '--help' || first === '-h' || first === '--version' || first === '-v') return false;
  // Any other argument is a subcommand or flag — not bare interactive
  return false;
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function formatShellArg(value = '') {
  const text = String(value ?? '');
  return /^[A-Za-z0-9_./:@=-]+$/u.test(text) ? text : JSON.stringify(text);
}

function buildCtxAgentRoutePreview({
  agent = 'codex-cli',
  workspaceRoot = '',
  project = '',
  routeMode = 'team',
  executionMode = 'live',
  teamProvider = 'codex',
  teamWorkers = 3,
  blueprint = 'feature',
  taskPrompt = '<task>',
} = {}) {
  const args = [CTX_AGENT_CLI_PATH, '--agent', agent];
  if (String(workspaceRoot || '').trim()) {
    args.push('--workspace', String(workspaceRoot).trim());
  }
  if (String(project || '').trim()) {
    args.push('--project', String(project).trim());
  }
  args.push(
    '--route',
    String(routeMode || 'team').trim(),
    '--route-execute',
    String(executionMode || 'live').trim(),
    '--team-provider',
    normalizeTeamProvider(teamProvider) || 'codex',
    '--team-workers',
    String(parsePositiveInteger(teamWorkers, 3)),
  );
  if (String(routeMode || '').trim() === 'subagent') {
    args.push('--blueprint', blueprint);
  }
  args.push(
    '--prompt',
    String(taskPrompt || '').trim() || '<task>',
    '--no-bootstrap',
  );
  return `node ${args.map((item) => formatShellArg(item)).join(' ')}`;
}


function normalizeHarnessProvider(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'claude' || normalized === 'gemini' || normalized === 'codex' || normalized === 'opencode') {
    return normalized;
  }
  return '';
}

function inferHarnessProviderFromCommand(command) {
  if (command === 'claude') return 'claude';
  if (command === 'gemini') return 'gemini';
  if (command === 'opencode') return 'opencode';
  return 'codex';
}

function buildHarnessRoutePreview({
  workspaceRoot = '',
  sessionId = '',
  provider = 'codex',
  taskPrompt = '<task>',
  maxIterations = 8,
} = {}) {
  const args = [path.join(ROOT_DIR, 'scripts', 'aios.mjs'), 'harness', 'run'];
  args.push('--objective', String(taskPrompt || '').trim() || '<task>');
  if (String(sessionId || '').trim()) {
    args.push('--session', String(sessionId).trim());
  }
  args.push('--provider', normalizeHarnessProvider(provider) || 'codex');
  args.push('--max-iterations', String(parsePositiveInteger(maxIterations, 8)));
  args.push('--worktree');
  if (String(workspaceRoot || '').trim()) {
    args.push('--workspace', String(workspaceRoot).trim());
  }
  return `node ${args.map((item) => formatShellArg(item)).join(' ')}`;
}

function normalizeTeamProvider(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'claude' || normalized === 'gemini' || normalized === 'codex') {
    return normalized;
  }
  return '';
}

function inferTeamProviderFromCommand(command) {
  if (command === 'claude') return 'claude';
  if (command === 'gemini') return 'gemini';
  return 'codex';
}

function inferSubagentClientFromProvider(provider) {
  if (provider === 'claude') return 'claude-code';
  if (provider === 'gemini') return 'gemini-cli';
  return 'codex-cli';
}

function inferSubagentClientFromCommand(command) {
  if (command === 'claude') return 'claude-code';
  if (command === 'gemini') return 'gemini-cli';
  if (command === 'codex') return 'codex-cli';
  if (command === 'opencode') return 'opencode-cli';
  return '';
}

function normalizeSubagentClient(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'codex-cli' || normalized === 'claude-code' || normalized === 'gemini-cli' || normalized === 'opencode-cli') {
    return normalized;
  }
  return '';
}

function resolveSubagentClientForPrompt(command, provider, env) {
  const explicitRouteClient = normalizeSubagentClient(env.CTXDB_ROUTE_SUBAGENT_CLIENT);
  if (explicitRouteClient) return explicitRouteClient;
  const explicitClient = normalizeSubagentClient(env.AIOS_SUBAGENT_CLIENT);
  if (explicitClient) return explicitClient;
  const commandClient = normalizeSubagentClient(inferSubagentClientFromCommand(command));
  if (commandClient) return commandClient;
  return inferSubagentClientFromProvider(provider);
}

function buildInteractiveAutoPrompt({
  agent = 'codex-cli',
  command = 'codex',
  workspaceRoot = '',
  project = '',
  env = process.env,
} = {}) {
  const provider = normalizeTeamProvider(env.CTXDB_TEAM_PROVIDER)
    || (normalizeTeamProvider(env.AIOS_TEAM_PROVIDER))
    || inferTeamProviderFromCommand(command);
  const workers = parsePositiveInteger(env.CTXDB_TEAM_WORKERS, 3);
  const rawBlueprint = String(env.CTXDB_ORCHESTRATE_BLUEPRINT || '').trim().toLowerCase();
  const blueprint = rawBlueprint === 'bugfix' || rawBlueprint === 'refactor' || rawBlueprint === 'security'
    ? rawBlueprint
    : 'feature';
  const subagentClient = resolveSubagentClientForPrompt(command, provider, env);
  const harnessProvider = normalizeHarnessProvider(env.CTXDB_HARNESS_PROVIDER)
    || normalizeHarnessProvider(env.AIOS_HARNESS_PROVIDER)
    || inferHarnessProviderFromCommand(command);
  const harnessMaxIterations = parsePositiveInteger(env.CTXDB_HARNESS_MAX_ITERATIONS || env.AIOS_HARNESS_MAX_ITERATIONS, 8);
  const teamCommand = buildCtxAgentRoutePreview({
    agent,
    workspaceRoot,
    project,
    routeMode: 'team',
    executionMode: 'live',
    teamProvider: provider,
    teamWorkers: workers,
    taskPrompt: '<task>',
  });
  const subagentCommand = buildCtxAgentRoutePreview({
    agent: subagentClient,
    workspaceRoot,
    project,
    routeMode: 'subagent',
    executionMode: 'live',
    teamProvider: provider,
    teamWorkers: workers,
    blueprint,
    taskPrompt: '<task>',
  });
  const harnessCommand = buildHarnessRoutePreview({
    workspaceRoot,
    provider: harnessProvider,
    taskPrompt: '<task>',
    maxIterations: harnessMaxIterations,
  });

  return [
    'Continue from this state and execute the next best step.',
    'Routing policy: default to single-route execution.',
    'Privacy boundary: LLM instructions are advisory; deterministic AIOS checks are the enforcement layer.',
    'Use `aios privacy read --file <path>` for sensitive files such as .env, tokens, cookies, session data, browser profiles, and MCP configs.',
    'Do not paste raw secrets, credentials, cookies, personal data, or private browser profile data into prompts/logs/checkpoints.',
    'Do not claim strict privacy compliance unless AIOS gates verified it; report what was checked and any remaining risk.',
    'Only choose team/subagent when the user explicitly asks for delegation/parallel work, or when there are 2+ clearly independent domains.',
    'Only choose harness for explicit long-running, overnight, resumable, checkpoint-heavy objectives that need an iteration journal.',
    'Do NOT spawn built-in explorer/worker subagents just to scan a codebase; start single-agent first.',
    'If delegated workers are running, post a heartbeat every 30s and stop waiting after 120s with a fallback plan.',
    `If route=team, run: ${teamCommand}`,
    `If route=subagent, run: ${subagentCommand}`,
    `If route=harness, run: ${harnessCommand}`,
    'Do not ask the user to manually trigger these commands unless they requested preview/dry-run.',
  ].join('\n');
}

function shouldInjectInteractiveAutoPrompt(env) {
  return parseBoolEnv(env.CTXDB_INTERACTIVE_AUTO_ROUTE, true);
}

function shouldDebug(env) {
  const value = (env.CTXDB_DEBUG || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function parseBoolEnv(value, defaultValue) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return defaultValue;
}

function shouldAutoCreateMarker(env) {
  return parseBoolEnv(env.CTXDB_AUTO_CREATE_MARKER, true);
}

function tryEnsureOptInMarker(workspace, env) {
  const marker = env.CTXDB_MARKER_FILE || '.contextdb-enable';
  const markerPath = path.join(workspace, marker);

  if (existsSync(markerPath)) {
    return { created: false, error: '' };
  }

  if (!shouldAutoCreateMarker(env)) {
    return { created: false, error: '' };
  }

  try {
    writeFileSync(markerPath, '', { encoding: 'utf8', flag: 'wx' });
    return { created: true, error: '' };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
      return { created: false, error: '' };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { created: false, error: message };
  }
}

function spawnInherited(command, args, cwd, env) {
  const spec = getCommandSpawnSpec(command, args, { env });
  const result = spawnSync(spec.command, spec.args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: spec.shell ?? false,
  });

  if (result.error) {
    const reason = result.error.message || String(result.error);
    console.error(`[contextdb-shell-bridge] failed to run ${command}: ${reason}`);
    return 1;
  }

  return result.status ?? 1;
}

function validateOptions(opts) {
  const validAgents = new Set(['codex-cli', 'claude-code', 'gemini-cli', 'opencode-cli']);
  const validCommands = new Set(['codex', 'claude', 'gemini', 'opencode']);

  if (!validAgents.has(opts.agent)) {
    throw new Error('--agent must be one of: codex-cli, claude-code, gemini-cli, opencode-cli');
  }

  if (!validCommands.has(opts.command)) {
    throw new Error('--command must be one of: codex, claude, gemini, opencode');
  }
}

function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  try {
    validateOptions(opts);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[contextdb-shell-bridge] ${message}`);
    usage();
    process.exit(2);
  }

  const env = { ...process.env };
  if (opts.command === 'codex') {
    normalizeCodeHome(env, opts.cwd);
  }

  const firstArg = opts.passthroughArgs[0] || '';
  const blockedSubcommand = isBlockedSubcommand(opts.command, firstArg);
  const runner = blockedSubcommand ? null : detectRunner(env);
  const workspace = blockedSubcommand ? '' : detectWorkspaceRoot(opts.cwd);
  const project = env.CTXDB_REPO_NAME || (workspace ? path.basename(workspace) : '');

  // Interactive mode detection: bare command invocation (no subcommand/flags) triggers
  // automatic handoff prompt injection so the new session resumes from the last checkpoint.
  const interactive = isInteractivePassthrough(opts.command, opts.passthroughArgs);
  if (interactive && !env.CTXDB_AUTO_PROMPT && shouldInjectInteractiveAutoPrompt(env) && runner && workspace) {
    env.CTXDB_AUTO_PROMPT = buildInteractiveAutoPrompt({
      agent: opts.agent,
      command: opts.command,
      workspaceRoot: workspace,
      project,
      env,
    });
    if (shouldDebug(env)) {
      const preview = String(env.CTXDB_AUTO_PROMPT || '').split(/\r?\n/u)[0] || 'continue';
      console.error(`[contextdb-shell-bridge] interactive detected; auto-prompt=${preview}`);
    }
  } else if (interactive && shouldDebug(env) && !env.CTXDB_AUTO_PROMPT) {
    const reason = !shouldInjectInteractiveAutoPrompt(env)
      ? 'disabled by CTXDB_INTERACTIVE_AUTO_ROUTE'
      : !runner
        ? 'runner unavailable'
        : !workspace
          ? 'workspace unavailable'
          : 'skipped';
    console.error(`[contextdb-shell-bridge] interactive detected; auto-prompt ${reason}`);
  }

  const mode = (env.CTXDB_WRAP_MODE || 'repo-only').trim().toLowerCase();
  let markerCreated = false;
  let markerCreateError = '';

  if (!blockedSubcommand && runner && workspace && mode === 'opt-in') {
    const markerResult = tryEnsureOptInMarker(workspace, env);
    markerCreated = markerResult.created;
    markerCreateError = markerResult.error;
  }

  const allowedByMode = workspace ? shouldWrapWorkspace(workspace, env) : false;
  const shouldWrap = Boolean(!blockedSubcommand && runner && workspace && allowedByMode);

  if (shouldDebug(env)) {
    const reason = shouldWrap
      ? 'wrap'
      : blockedSubcommand
        ? 'blocked-subcommand'
        : !runner
          ? 'runner-missing'
          : !workspace
            ? 'workspace-missing'
            : 'mode-blocked';
    console.error(
      `[contextdb-shell-bridge] command=${opts.command} agent=${opts.agent} decision=${reason} workspace=${workspace || '-'}`
    );
    if (mode === 'opt-in') {
      console.error(
        `[contextdb-shell-bridge] opt-in marker created=${markerCreated ? 'yes' : 'no'} auto-create=${shouldAutoCreateMarker(env) ? 'on' : 'off'}`
      );
      if (markerCreateError) {
        console.error(`[contextdb-shell-bridge] opt-in marker create error=${markerCreateError}`);
      }
    }
  }

  if (shouldPrintPrivacyBanner(env, interactive)) {
    process.stderr.write(buildPrivacyBanner({
      command: opts.command,
      agent: opts.agent,
      shouldWrap,
      env,
    }));
  }

  if (!shouldWrap) {
    const code = spawnInherited(opts.command, opts.passthroughArgs, opts.cwd, env);
    process.exit(code);
  }

  const args = [
    ...runner.args,
    '--workspace', workspace,
    '--agent', opts.agent,
    '--project', project,
  ];

  args.push('--', ...opts.passthroughArgs);

  const code = spawnInherited(runner.command, args, opts.cwd, env);
  process.exit(code);
}

main();
