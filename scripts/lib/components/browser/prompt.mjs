/* 中文注释：浏览器 MCP 选型交互式提问。
 * 安装时问一次（none|playwright|bsk），落盘后交 install 流程按 mode 执行。
 * 提问与落盘分开：promptBrowserMode 读当前值、提问、写 settings，返回选中值。
 * 全部副作用可注入（selectFn/io），纯函数化便于单测。 */
import { select } from '@inquirer/prompts';

import { BROWSER_MODES, DEFAULT_BROWSER_MODE, resolveBrowserMode, setBrowserModeInSettings } from './mcp-mode.mjs';

// 三态的友好标签（提问里的人话）。
export const BROWSER_MODE_LABELS = {
  playwright: 'Playwright — 自动测试/抓取（受控浏览器）',
  bsk: 'BSK/BrowserSkill — 驱动你真实登录的浏览器（真人会话）',
  none: 'none — 不装（默认）',
};

// 交互式三态选择。selectFn 可注入（测试/非 TTY 兜底）。返回选中的合法 mode。
export async function selectBrowserMode({ message, selectFn = select, io = console } = {}) {
  const choices = BROWSER_MODES.map((value) => ({
    name: BROWSER_MODE_LABELS[value] || value,
    value,
  }));
  const chosen = await selectFn({ message, choices });
  return BROWSER_MODES.includes(String(chosen)) ? String(chosen) : DEFAULT_BROWSER_MODE;
}

// 安装时的选型提问：读当前 → 提问 → 写 settings（落盘后 install 流程按该 mode 执行）。
// 失败只告警不阻塞安装（返回默认 none）。
export async function promptBrowserMode({ rootDir, message, selectFn = select, io = console } = {}) {
  try {
    const current = rootDir ? resolveBrowserMode(rootDir) : DEFAULT_BROWSER_MODE;
    if (!message) {
      message = 'Which browser automation do you want?';
    } else if (current && current !== DEFAULT_BROWSER_MODE) {
      message = `${message} (current: ${current})`;
    }
    const chosen = await selectBrowserMode({ message, selectFn, io });
    setBrowserModeInSettings(rootDir, chosen);
    io.log(`[ok] browser mode set to ${chosen}`);
    return chosen;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    io.log(`[warn] browser mode selection skipped: ${reason}`);
    return rootDir ? resolveBrowserMode(rootDir) : DEFAULT_BROWSER_MODE;
  }
}
