import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
export const CTX_AGENT_CLI_PATH = path.join(ROOT_DIR, 'scripts', 'ctx-agent.mjs');

export const AIOS_MARKER = '<!-- AIOS: .aios/context-db/index.json -->';
export const LEGACY_AIOS_MARKER = '<!-- AIOS: memory/context-db/index.json -->';
export const AIOS_MARKERS = Object.freeze([AIOS_MARKER, LEGACY_AIOS_MARKER]);

export const BLOCKED_SUBCOMMANDS = Object.freeze({
  codex: new Set([
    'exec', 'review', 'login', 'logout', 'mcp', 'mcp-server', 'app-server', 'app',
    'completion', 'sandbox', 'debug', 'apply', 'resume', 'fork', 'cloud', 'features',
    // Codex 的插件和 hooks 属于管理/运维命令，不能被 ContextDB 包装。
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
    'session', 'db', 'version', '-h', '--help', '-v', '--version',
  ]),
});
