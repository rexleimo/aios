/* 中文注释：浏览器 MCP 选型切换命令。
 * 写 settings.json 后触发 migrateBrowserMcpConfig 重新 materialize，
 * 把 mode 选型重新下发到各客户端（互斥三态：none | playwright | bsk）。
 * 本模块读写本地磁盘，调用方需传入 rootDir 与 io。 */
import { BROWSER_MODES, validateBrowserMode, resolveBrowserMode, setBrowserModeInSettings } from './mcp-mode.mjs';
import { migrateBrowserMcpConfig } from './mcp-config.mjs';
import { printBskInstallGuide } from './bsk-writer.mjs';
import { formatErrorMessage } from './shared.mjs';

// 切换浏览器选型：先校验原始输入（非法抛错，不让 resolveBrowserMode 隐式归一为 none），
// 再落 settings（写入失败先抛，避免 materialize 了错误模式），
// 最后重新 materialize MCP 配置。materialize 失败只告警不阻塞切换。
export async function switchBrowserMcpMode({ rootDir, mode, io = console, dryRun = false } = {}) {
  if (!validateBrowserMode(mode)) {
    throw new Error(`unknown browser mode '${mode}' (expected one of ${BROWSER_MODES.join(', ')})`);
  }

  const normalized = resolveBrowserMode(mode);

  // 先落配置：materialize 必须在正确 mode 上进行，否则会把错误选型写进各客户端。
  const settings = setBrowserModeInSettings(rootDir, normalized);

  const migrationResult = await migrateBrowserMcpConfig({
    rootDir, mode: normalized, io, dryRun,
  }).catch((error) => {
    const message = formatErrorMessage(error).split(/\r?\n/u)[0];
    io?.log?.(`[warn] browser MCP config auto-update skipped: ${message}`);
    return null;
  });

  // 切到 bsk 后，下发一次三步引导 + 工具集映射（owner action 清单），方便用户完成扩展连接。
  if (normalized === 'bsk') {
    printBskInstallGuide({ io });
  } else if (normalized === 'none') {
    io?.log?.('Browser MCP mode set to none: no browser MCP will be materialized.');
  } else {
    io?.log?.(`Browser MCP mode set to ${normalized}; MCP configs re-materialized.`);
  }

  return {
    mode: normalized,
    settings,
    migrationResult,
    dryRun,
  };
}
