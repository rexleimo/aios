import path from 'node:path';
import { captureCommand } from '../../platform/process.mjs';
import { MAX_PRINT_CHARS } from './constants.mjs';

export function usageError(message) {
  const error = new Error(`${message}\n\nRun: node scripts/aios.mjs memo --help`);
  error.code = 'AIOS_MEMO_USAGE';
  return error;
}

export function detectWorkspaceRoot(cwd = process.cwd()) {
  const result = captureCommand('git', ['-C', cwd, 'rev-parse', '--show-toplevel']);
  if (!result.error && result.status === 0) {
    const root = String(result.stdout || '').trim().split('\n')[0];
    if (root) return root;
  }
  return path.resolve(cwd);
}

// 纯函数：项目名只来自工作区路径，避免 memo CLI 和 GUI 各自解析 basename。
export function workspaceProjectName(workspaceRoot) {
  return path.basename(workspaceRoot);
}

// 纯函数：统一解析有上下界的整数环境变量，容量和端口限制共用同一套规则。
export function parseBoundedIntegerEnv(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

export function parsePositiveLimit(raw) {
  const parsed = Number.parseInt(String(raw || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw usageError('--limit must be a positive integer');
  }
  return parsed;
}

export function parsePositivePort(raw) {
  const parsed = Number.parseInt(String(raw || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    throw usageError('--port must be a positive TCP port');
  }
  return parsed;
}

export function safePrintText(io, text) {
  const raw = String(text ?? '');
  if (!raw) {
    io.log('(none)');
    return;
  }
  const trimmed = raw.length > MAX_PRINT_CHARS ? `${raw.slice(0, MAX_PRINT_CHARS)}\n[truncated]` : raw;
  io.log(trimmed.trimEnd());
}
