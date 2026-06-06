import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { expandHome } from './shared.mjs';

const CLIENT_HOME_ENV_VARS = Object.freeze([
  Object.freeze({ env: 'CODEX_HOME', label: 'codex' }),
  Object.freeze({ env: 'CLAUDE_HOME', label: 'claude' }),
  Object.freeze({ env: 'GEMINI_HOME', label: 'gemini' }),
  Object.freeze({ env: 'OPENCODE_HOME', label: 'opencode' }),
]);

function normalizeOneClientHome(env, cwd, { env: envVar, label }) {
  const value = env[envVar];
  if (!value) return false;

  let normalized = value.trim();
  normalized = expandHome(normalized, env);

  if (!path.isAbsolute(normalized)) {
    normalized = path.resolve(cwd, normalized);
  }
  env[envVar] = normalized;

  if (!existsSync(normalized)) {
    try {
      mkdirSync(normalized, { recursive: true });
    } catch {
      // 创建失败时交给下游 CLI 自行处理，避免桥接层阻断启动。
    }
  }
  return true;
}

export function normalizeCodeHome(env, cwd) {
  for (const entry of CLIENT_HOME_ENV_VARS) {
    normalizeOneClientHome(env, cwd, entry);
  }
}
