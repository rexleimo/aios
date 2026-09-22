/* 中文注释：浏览器 MCP 安装选型。
   三种互斥模式：none | playwright | bsk，默认 none（一个都不装）。
   - `none` 不注入任何 browser 条目（默认）。
   - `playwright` 注入仓库内 Node/Playwright MCP。
   - `bsk` 选 BrowserSkill（真人会话），不注入 Playwright 条目（互斥），其引导单独 writer（step 4）。
   本模块不写磁盘：读选择（resolveBrowserMode）与写选择（setBrowserModeInSettings）分开，
   writer 取"托管 browser 条目"用 browserManagedServer（mode 未注入 Playwright 时返回 null，
   writer 据此跳过该 alias，保持幂等且清除 legacy 条目）。 */
import fs from 'node:fs';
import path from 'node:path';

import { buildPreferredMcpServer } from './mcp-server-builders.mjs';

export const BROWSER_MODES = ['none', 'playwright', 'bsk'];
export const DEFAULT_BROWSER_MODE = 'none';

function normalizeMode(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  return BROWSER_MODES.includes(value) ? value : DEFAULT_BROWSER_MODE;
}

// 归一化后仍是否为合法模式。
export function validateBrowserMode(value) {
  return BROWSER_MODES.includes(String(value ?? '').trim().toLowerCase());
}

// 该模式是否启用仓库内 Playwright 注入（仅 'playwright'）。
export function browserModeAppliesPlaywright(mode) {
  return normalizeMode(mode) === 'playwright';
}

function readSettingsFile(rootDir) {
  if (!rootDir) return {};
  const settingsPath = path.join(rootDir, 'config', 'settings.json');
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    return {};
  }
}

function settingsFrom(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function resolveFromSettings(settings) {
  return normalizeMode(settings?.browser?.mcp ?? settings?.mcp);
}

// 解析选型，输入可以是：
//  - 字符串模式 → 直接归一化（非法 → 默认 none）
//  - settings 对象 → 读 settings.browser.mcp
//  - { rootDir } → config/settings.json 的 browser.mcp（缺失 → none）
export function resolveBrowserMode(modeOrSettings, { rootDir = null } = {}) {
  if (typeof modeOrSettings === 'string') return normalizeMode(modeOrSettings);
  if (rootDir) return resolveFromSettings(readSettingsFile(rootDir));
  return resolveFromSettings(settingsFrom(modeOrSettings));
}

// 归一化后写回 config/settings.json（供安装提问 / 切换命令使用）。
export function setBrowserModeInSettings(rootDir, mode) {
  if (!validateBrowserMode(mode)) {
    throw new Error(`unknown browser mode '${mode}' (expected one of ${BROWSER_MODES.join(', ')})`);
  }
  const value = normalizeMode(mode);
  const settingsPath = path.join(rootDir, 'config', 'settings.json');
  const next = readSettingsFile(rootDir);
  next.browser = { ...(settingsFrom(next).browser && typeof settingsFrom(next).browser === 'object'
    ? settingsFrom(next).browser
    : {}) };
  next.browser.mcp = value;
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

// writer 取"按 mode 的托管 browser 条目"：mode 未注入 Playwright → null（writer 跳过该 alias）。
// mode 未传入时沿用旧行为（注入），保持既有直接调用方/测试不变。
export function browserManagedServer(rootDir, existingAlias = {}, runtime = {}, mode) {
  if (mode !== undefined && !browserModeAppliesPlaywright(mode)) return null;
  return buildPreferredMcpServer(rootDir, existingAlias, runtime);
}
