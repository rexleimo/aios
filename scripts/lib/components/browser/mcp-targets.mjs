/* 中文注释：MCP 目标收集只决定“哪些文件可能要迁移”，不构建 server block。 */
import fs from 'node:fs';
import path from 'node:path';

import { resolveUserPath } from './runtime-paths.mjs';

/* 中文注释：客户端 home 是可选目标；不存在的用户级配置不创建，避免污染未使用客户端。 */
export function collectClientMcpTargets(clientHomes = {}) {
  const targets = [];
  const seen = new Set();

  for (const home of [clientHomes.codex, clientHomes.claude, clientHomes.gemini, clientHomes.opencode]) {
    const resolvedHome = resolveUserPath(home);
    if (!resolvedHome) continue;

    const absPath = path.resolve(path.join(resolvedHome, 'mcp.json'));
    if (seen.has(absPath)) continue;
    seen.add(absPath);
    targets.push({ path: absPath, createIfMissing: false });
  }

  return targets;
}

/* 中文注释：迁移顺序先仓库级再用户级；用户级只在已有配置时更新。 */
export function collectBrowserMcpMigrationTargets({ rootDir, clientHomes = {} } = {}) {
  const candidates = [
    { path: path.join(rootDir, '.mcp.json'), createIfMissing: true },
    { path: path.join(rootDir, 'mcp-server', '.mcp.json'), createIfMissing: true },
    ...collectClientMcpTargets(clientHomes),
  ];

  const seen = new Set();
  return candidates.filter((candidate) => {
    if (!candidate.path) return false;
    const abs = path.resolve(candidate.path);
    if (seen.has(abs)) return false;
    seen.add(abs);
    return candidate.createIfMissing || fs.existsSync(abs);
  });
}
