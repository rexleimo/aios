/* 中文注释：MCP server block 构建只负责生成配置对象，不读写磁盘。 */
import path from 'node:path';

import { buildAiosMcpProxyServer } from '../../interception/mcp/proxy-config.mjs';
import { AUTH_TOOLS_ALIAS, PRIMARY_BROWSER_ALIAS, SHELL_ALIAS } from './constants.mjs';
import {
  findBrowserUseRepo,
  isLegacyBrowserUseFallback,
  resolveDefaultCdpUrl,
  resolveLauncherScript,
  resolvePythonCommand,
  resolveShellCommand,
} from './runtime-paths.mjs';

/* 中文注释：主浏览器 MCP 必须包上 aios-mcp-proxy，大 HTML/截图文本才会进入 interception 数据面。 */
export function buildPreferredMcpServer(rootDir, existingAlias = {}, runtime = {}) {
  const platform = runtime.platform || process.platform;
  const launcherScript = resolveLauncherScript(rootDir, platform);
  const shellCommand = resolveShellCommand(platform, runtime);
  const cdpUrl = resolveDefaultCdpUrl(rootDir);
  const existingEnv = existingAlias && typeof existingAlias.env === 'object' ? existingAlias.env : {};
  const browserUseRepo = findBrowserUseRepo(rootDir, existingEnv);
  const nextEnv = {
    ...existingEnv,
    BROWSER_USE_CDP_URL: cdpUrl,
  };
  if (browserUseRepo) {
    nextEnv.AIOS_BROWSER_USE_REPO = browserUseRepo;
  } else if (isLegacyBrowserUseFallback(nextEnv.AIOS_BROWSER_USE_REPO)) {
    delete nextEnv.AIOS_BROWSER_USE_REPO;
  }

  const isPowerShell = ['pwsh', 'powershell', 'powershell.exe'].includes(shellCommand.toLowerCase());
  const args = isPowerShell
    ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcherScript]
    : [launcherScript];

  const upstream = {
    type: 'stdio',
    command: shellCommand,
    args,
    env: nextEnv,
  };
  return buildAiosMcpProxyServer({
    rootDir,
    upstream,
    host: PRIMARY_BROWSER_ALIAS,
    workspaceRoot: rootDir,
  });
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
  });
}
