import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCommandSpawnSpec } from '../platform/process.mjs';

const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);
export const SCRIPTS_DIR = path.resolve(__dirname, '..', '..');
export const ROOT_DIR = path.resolve(SCRIPTS_DIR, '..');
export const MCP_DIR = path.join(ROOT_DIR, 'mcp-server');
export const CTX_AGENT_CLI_PATH = path.join(SCRIPTS_DIR, 'ctx-agent.mjs');
export const CTXDB_CODEX_DISABLE_MCP_ENV = 'CTXDB_CODEX_DISABLE_MCP';

export function runCommand(command, args, options = {}) {
  const spec = getCommandSpawnSpec(command, args, options);
  return spawnSync(spec.command, spec.args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
    stdio: options.stdio ?? ['pipe', 'pipe', 'pipe'],
    shell: spec.shell ?? false,
  });
}

export function runCommandWithInput(command, args, input, options = {}) {
  const spec = getCommandSpawnSpec(command, args, options);
  return spawnSync(spec.command, spec.args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
    input: String(input ?? ''),
    stdio: options.stdio ?? ['pipe', 'pipe', 'pipe'],
    shell: spec.shell ?? false,
  });
}

export function ensureSuccess(result, context) {
  if (result.error) {
    const reason = result.error.message || String(result.error);
    throw new Error(`${context}: ${reason}`);
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    const stdout = (result.stdout || '').trim();
    const detail = stderr || stdout || `exit=${result.status}`;
    throw new Error(`${context}: ${detail}`);
  }
}

// 纯函数：统一解析布尔环境变量，避免各模块重复维护 true/false 别名。
export function parseBoolEnv(value, defaultValue) {
  if (value === undefined || value === null || String(value).trim() === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

// 纯函数：把环境变量中的整数限制在安全边界内。
export function parseBoundedIntegerEnv(value, defaultValue, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') return defaultValue;
  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(Math.max(parsed, min), max);
}

// 纯函数：解析正整数参数，并在缺少 fallback 时抛出带 flag 的错误。
export function parsePositiveInteger(rawValue, fallback, flagName = 'value') {
  const parsed = Number.parseInt(String(rawValue ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${flagName} must be a positive integer`);
  }
  return parsed;
}

// 纯函数：构造可复制的 shell 预览参数，不实际执行命令。
export function formatShellArg(value = '') {
  const text = String(value ?? '');
  return /^[A-Za-z0-9_./:@=-]+$/u.test(text)
    ? text
    : `"${text.replace(/(["`$])/g, '\\$1')}"`;
}

export function resolveWorkspaceRoot(cwd) {
  const git = runCommand('git', ['-C', cwd, 'rev-parse', '--show-toplevel']);
  if (git.status === 0) return (git.stdout || '').trim();
  return cwd;
}

export function assertWorkspaceExists(workspaceRoot) {
  if (!existsSync(workspaceRoot)) {
    throw new Error(`--workspace is not a directory: ${workspaceRoot}`);
  }
}
