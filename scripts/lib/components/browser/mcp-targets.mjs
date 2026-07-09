/* 中文注释：MCP 目标收集只决定”哪些文件可能要迁移”，落点/格式全部取自 registry 的单一事实来源。 */
import fs from 'node:fs';
import path from 'node:path';

import { ALL_CLIENTS, getClientMcpTarget } from '../../clients/registry.mjs';
import { resolveUserPath } from './runtime-paths.mjs';

/* 中文注释：按 registry 的 per-client MCP 落点生成目标（支持双作用域）。
   - codex   → ~/.codex/config.toml + <project>/.codex/config.toml（home+project, TOML）
   - claude  → <project>/.mcp.json + ~/.claude/.mcp.json（project+home, JSON mcpServers）
   - gemini  → <project>/.gemini/settings.json + ~/.gemini/settings.json（project+home, JSON mcpServers）
   - opencode→ ~/.config/opencode/opencode.json（home, JSON mcp 命名空间）
   - grok    → ~/.grok/config.toml + <project>/.grok/config.toml（home+project, TOML）
   createIfMissing 策略：project 作用域属于”当前项目”可安全创建；home 作用域属于全局、
   未使用的客户端不应被污染，故只在文件已存在时更新。 */
export function collectClientMcpTargets({ projectRoot, clientHomes = {} } = {}) {
  const targets = [];
  const seen = new Set();

  for (const client of ALL_CLIENTS) {
    const desc = getClientMcpTarget(client);
    for (const scopeEntry of desc.scopes) {
      let absPath = '';
      if (scopeEntry.scope === 'home') {
        const home = resolveUserPath(clientHomes[client]);
        if (!home) continue;
        absPath = path.resolve(path.join(home, scopeEntry.file));
      } else {
        if (!projectRoot) continue;
        absPath = path.resolve(path.join(projectRoot, scopeEntry.file));
      }
      if (seen.has(absPath)) continue;
      seen.add(absPath);
      targets.push({
        path: absPath,
        client,
        scope: scopeEntry.scope,
        format: desc.format,
        namespace: desc.namespace,
        createIfMissing: scopeEntry.scope === 'project',
      });
    }
  }

  return targets;
}

/* 中文注释：迁移顺序先仓库内 mcp-server 自带配置，再各客户端落点。 */
export function collectBrowserMcpMigrationTargets({ rootDir, clientHomes = {} } = {}) {
  const candidates = [
    { path: path.join(rootDir, 'mcp-server', '.mcp.json'), createIfMissing: true, format: 'json', namespace: 'mcpServers', client: 'mcp-server' },
    ...collectClientMcpTargets({ projectRoot: rootDir, clientHomes }),
  ];

  const seen = new Set();
  return candidates
    .filter((candidate) => {
      if (!candidate.path) return false;
      const abs = path.resolve(candidate.path);
      if (seen.has(abs)) return false;
      seen.add(abs);
      return candidate.createIfMissing || fs.existsSync(abs);
    })
    .map((candidate) => ({ ...candidate, path: path.resolve(candidate.path) }));
}
