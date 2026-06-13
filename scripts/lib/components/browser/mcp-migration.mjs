/* 中文注释：MCP 迁移只负责读写 JSON 文件并汇总结果，配置对象由 builder 模块提供。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getClientHomes } from '../../platform/paths.mjs';
import { AUTH_TOOLS_ALIAS, PRIMARY_BROWSER_ALIAS, SHELL_ALIAS } from './constants.mjs';
import { buildAuthToolsMcpServer, buildPreferredMcpServer, buildShellMcpServer } from './mcp-server-builders.mjs';
import { collectBrowserMcpMigrationTargets } from './mcp-targets.mjs';
import { migrateOneMcpToml } from './mcp-toml.mjs';
import { migrateOneMcpOpencodeJson } from './mcp-opencode.mjs';
import { resolveLauncherScript } from './runtime-paths.mjs';

/* 中文注释：单文件迁移保持 alias 稳定，只替换 server block 内容，减少客户端侧配置漂移。 */
export function migrateOneMcpJsonFile(filePath, rootDir, { serversKey = 'mcpServers' } = {}) {
  const exists = fs.existsSync(filePath);
  const raw = exists ? fs.readFileSync(filePath, 'utf8') : '';

  let parsed = {};
  if (exists && raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return {
        status: 'error',
        reason: `JSON parse failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    parsed = {};
  }

  if (!parsed[serversKey] || typeof parsed[serversKey] !== 'object' || Array.isArray(parsed[serversKey])) {
    parsed[serversKey] = {};
  }

  const mcpServers = parsed[serversKey];
  const existingAlias = mcpServers[PRIMARY_BROWSER_ALIAS];
  mcpServers[PRIMARY_BROWSER_ALIAS] = buildPreferredMcpServer(rootDir, existingAlias);
  mcpServers[AUTH_TOOLS_ALIAS] = buildAuthToolsMcpServer(rootDir, mcpServers[AUTH_TOOLS_ALIAS]);
  mcpServers[SHELL_ALIAS] = buildShellMcpServer(rootDir);

  const nextRaw = `${JSON.stringify(parsed, null, 2)}\n`;
  if (exists && raw === nextRaw) {
    return { status: 'unchanged' };
  }

  return {
    status: exists ? 'updated' : 'created',
    nextRaw,
  };
}

export async function migrateBrowserMcpConfig({ rootDir, io = console, dryRun = false, clientHomes = null } = {}) {
  const launcherScript = resolveLauncherScript(rootDir);
  const bootstrapScript = path.join(rootDir, 'scripts', 'browser-use-bootstrap.py');
  if (!fs.existsSync(launcherScript)) {
    throw new Error(`browser-use launcher script not found: ${launcherScript}`);
  }
  if (!fs.existsSync(bootstrapScript)) {
    throw new Error(`browser-use bootstrap script not found: ${bootstrapScript}`);
  }

  const homes = clientHomes && typeof clientHomes === 'object' ? clientHomes : getClientHomes(process.env, os.homedir());
  const targets = collectBrowserMcpMigrationTargets({ rootDir, clientHomes: homes });
  return applyMcpConfigMigration({ targets, rootDir, io, dryRun });
}

/* 中文注释：apply 阶段统一统计 created/updated/unchanged/errors，doctor 用这些数字给出修复证据。 */
export function applyMcpConfigMigration({ targets, rootDir, io, dryRun }) {
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let errors = 0;
  const changedPaths = [];

  for (const target of targets) {
    const absPath = path.resolve(target.path);
    let result;
    if (target.format === 'toml') {
      result = migrateOneMcpToml(absPath, rootDir);
    } else if (target.format === 'opencode-json') {
      result = migrateOneMcpOpencodeJson(absPath, rootDir);
    } else {
      result = migrateOneMcpJsonFile(absPath, rootDir, { serversKey: target.namespace });
    }
    if (result.status === 'error') {
      io.log(`ERR  mcp-migrate skipped (invalid json): ${absPath}; ${result.reason}`);
      errors += 1;
      continue;
    }

    if (result.status === 'unchanged') {
      io.log(`OK   mcp-migrate unchanged: ${absPath}`);
      unchanged += 1;
      continue;
    }

    if (dryRun) {
      io.log(`PLAN mcp-migrate ${result.status}: ${absPath}`);
    } else {
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, result.nextRaw, 'utf8');
      io.log(`OK   mcp-migrate ${result.status}: ${absPath}`);
    }

    changedPaths.push(absPath);
    if (result.status === 'created') created += 1;
    if (result.status === 'updated') updated += 1;
  }

  io.log(
    `mcp-migrate summary: created=${created} updated=${updated} unchanged=${unchanged} ` +
    `errors=${errors} dryRun=${dryRun ? 'true' : 'false'}`,
  );

  return {
    created,
    updated,
    unchanged,
    errors,
    dryRun,
    changedPaths,
  };
}
