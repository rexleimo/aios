/* 中文注释：Claude Code 的 statusLine 只有一个槽位。
 *
 * 以前 AIOS 把 statusLine 写在 settings 的 aiosNative 键下——Claude Code 只读顶层键，
 * 于是那段配置从来没生效；caveman 插件的徽章也没有落点（插件清单只挂 hooks，不挂 statusLine）。
 * 两边各自"拥有"一个本不存在的槽位，实际结果是这一行什么都没显示。
 *
 * 本模块是那个唯一槽位的合成器：一次输出徽章 + 计划状态。徽章的取值与清洗规则照抄
 * caveman 自己的 statusline 脚本（64 字节上限、只留 [a-z0-9-]、白名单外一律不渲染），
 * 因为同一个文件会被不受信进程改写，把原始内容打进终端等于终端转义注入。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CAVEMAN_MODES = new Set([
  'off', 'lite', 'full', 'ultra',
  'wenyan-lite', 'wenyan', 'wenyan-full', 'wenyan-ultra',
  'commit', 'review', 'compress',
]);
const CAVEMAN_ESCAPE = '[38;5;172m';
const RESET = '[0m';

// 纯函数：徽章文本。off / 未知 / 空 → ''（不渲染，而不是回显可疑字节）。
export function renderCavemanBadge(mode) {
  const value = String(mode || '').trim().toLowerCase();
  if (!value || value === 'off' || !CAVEMAN_MODES.has(value)) return '';
  const label = value === 'full' ? 'CAVEMAN' : `CAVEMAN:${value.toUpperCase()}`;
  return `${CAVEMAN_ESCAPE}[${label}]${RESET}`;
}

export function resolveCavemanFlagPath({ env = process.env, homeDir = os.homedir() } = {}) {
  const configDir = env.CLAUDE_CONFIG_DIR && path.isAbsolute(String(env.CLAUDE_CONFIG_DIR))
    ? String(env.CLAUDE_CONFIG_DIR)
    : path.join(homeDir, '.claude');
  return path.join(configDir, '.caveman-active');
}

// 只认普通文件，拒绝符号链接：本地攻击者可以把 flag 指向 ~/.ssh/id_rsa，
// 让这一行每次重绘都把密钥字节打到终端。
export function readCavemanMode({ env = process.env, homeDir = os.homedir(), fsImpl = fs } = {}) {
  const flagPath = resolveCavemanFlagPath({ env, homeDir });
  try {
    if (fsImpl.lstatSync(flagPath).isSymbolicLink()) return '';
    const raw = fsImpl.readFileSync(flagPath, 'utf8').slice(0, 64);
    return raw.replace(/[\r\n]/gu, '').replace(/[^a-z0-9-]/giu, '').toLowerCase();
  } catch {
    return '';
  }
}

// 纯函数：单个状态行。计划文案走短路径（basename），状态栏宽度有限。
export function composeStatusline({ cavemanMode = '', planState = null, progress = null } = {}) {
  const parts = [];
  const badge = renderCavemanBadge(cavemanMode);
  if (badge) parts.push(badge);
  if (!planState) {
    parts.push('no active plan');
    return parts.join(' · ');
  }
  const fileName = String(planState.relativePath || '').split(/[\\/]/u).pop() || 'plan';
  const counts = progress && Number.isFinite(progress.tasksTotal) && progress.tasksTotal > 0
    ? ` ${progress.tasksDone}/${progress.tasksTotal}`
    : '';
  parts.push(`plan ${String(planState.status || 'unknown')} ${fileName}${counts}`);
  return parts.join(' · ');
}
