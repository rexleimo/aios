/* 中文注释：MCP server block 构建只负责生成配置对象，不读写磁盘。 */
import path from 'node:path';

import { buildAiosMcpProxyServer } from '../../interception/mcp/proxy-config.mjs';
import { AUTH_TOOLS_ALIAS, PRIMARY_BROWSER_ALIAS, SHELL_ALIAS } from './constants.mjs';
import {
  resolveDefaultCdpUrl,
  resolveLocalBrowserMcpScript,
  resolvePythonCommand,
} from './runtime-paths.mjs';

/* 中文注释：当外部 browser-use checkout 不存在时，回退到仓库内的 Playwright MCP。 */
export function buildLocalBrowserMcpServer(rootDir, existingAlias = {}, runtime = {}) {
  const existingEnv = existingAlias && typeof existingAlias.env === 'object' ? existingAlias.env : {};
  const nextEnv = { ...existingEnv };
  delete nextEnv.AIOS_BROWSER_USE_REPO;
  delete nextEnv.AIOS_INTERCEPTION_METRICS;
  delete nextEnv.AIOS_MCP_PROXY;
  delete nextEnv.AIOS_MCP_UPSTREAM_HOST;
  return {
    type: 'stdio',
    command: runtime.nodeCommand || 'node',
    args: [resolveLocalBrowserMcpScript(rootDir)],
    cwd: rootDir,
    startupTimeoutSec: 60,
    env: nextEnv,
  };
}

/* 中文注释：本地 Node/Playwright MCP 是唯一的浏览器运行入口。 */
export function buildPreferredMcpServer(rootDir, existingAlias = {}, runtime = {}) {
  const cdpUrl = resolveDefaultCdpUrl(rootDir);
  const existingEnv = existingAlias && typeof existingAlias.env === 'object' ? existingAlias.env : {};
  const nextEnv = {
    ...existingEnv,
    BROWSER_USE_CDP_URL: existingEnv.BROWSER_USE_CDP_URL || cdpUrl,
  };
  delete nextEnv.AIOS_BROWSER_USE_REPO;
  delete nextEnv.AIOS_INTERCEPTION_METRICS;
  delete nextEnv.AIOS_MCP_PROXY;
  delete nextEnv.AIOS_MCP_UPSTREAM_HOST;
  return buildLocalBrowserMcpServer(rootDir, { ...existingAlias, env: nextEnv }, runtime);
}

/* 中文注释：auth-tools 仍保持直连，因为它是小型辅助服务，不承载大页面输出。 */
export function buildAuthToolsMcpServer(rootDir, existingEntry = {}) {
  const authScript = path.join(rootDir, 'scripts', 'auth-tools-server.py');
  const cdpUrl = resolveDefaultCdpUrl(rootDir);
  const nextEnv = {
    ...(existingEntry && typeof existingEntry.env === 'object' ? existingEntry.env : {}),
    BROWSER_USE_CDP_URL: cdpUrl,
  };

  return {
    type: 'stdio',
    command: resolvePythonCommand(),
    args: ['-u', authScript],
    startupTimeoutSec: 30,
    env: nextEnv,
  };
}

export { AUTH_TOOLS_ALIAS, PRIMARY_BROWSER_ALIAS, SHELL_ALIAS };

export function buildShellMcpServer(rootDir) {
  return buildAiosMcpProxyServer({
    rootDir,
    upstream: {
      type: 'stdio',
      command: process.execPath,
      args: [path.join(rootDir, 'scripts', 'shell-mcp-server.mjs')],
    },
    host: SHELL_ALIAS,
    workspaceRoot: rootDir,
    startupTimeoutSec: 30,
  });
}
