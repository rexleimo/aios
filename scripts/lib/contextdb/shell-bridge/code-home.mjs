import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { expandHome } from './shared.mjs';

export function normalizeCodeHome(env, cwd) {
  const codexHome = env.CODEX_HOME;
  if (!codexHome) return;

  let normalized = codexHome.trim();
  normalized = expandHome(normalized, env);

  if (!path.isAbsolute(normalized)) {
    normalized = path.resolve(cwd, normalized);
  }
  env.CODEX_HOME = normalized;

  if (!existsSync(normalized)) {
    try {
      mkdirSync(normalized, { recursive: true });
    } catch {
      // 创建失败时交给下游 CLI 自行处理，避免桥接层阻断启动。
    }
  }
}
