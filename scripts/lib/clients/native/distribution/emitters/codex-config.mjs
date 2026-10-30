/* 中文注释：codex 用户级 config.toml 同步（trust 持久化 + 五大 MCP 注册）。
 *
 * 背景：codex 0.148+ 引入 hooks 信任机制，信任状态持久化在 ~/.codex/config.toml
 * 的 [projects.'路径'] 段；文件缺失时项目永远 untrusted，每次启动都弹 hook 信任
 * 提示（0.150 "Untrusted projects" 行为）。同时 codex 此前没有任何 MCP 注册写入
 * 逻辑（CLIENT_MCP_TARGETS 只有读取方），形成"MCP 荒漠"。
 *
 * 策略：管理区标记（# >>> aios-managed ... <<<）+ 按表名剥离历史遗留段，保证幂等；
 * 用户自有内容全部保留；原子写（tmp+rename）。TOML 用区段文本处理，不引依赖。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { isVolatileAiosRoot } from '../../../../foundation/platform/aios-runtime-root.mjs';

const MANAGED_BEGIN = '# >>> aios-managed-begin (AIOS codex trust + MCP; do not edit inside) >>>';
const MANAGED_END = '# <<< aios-managed-end <<<';

function tomlLiteral(value) {
  return `'${String(value).replace(/'/gu, "''")}'`;
}

/* 中文注释：TOML basic string 转义与 JSON 字符串转义对本模块的值（路径/参数）等价，
 * 直接用 JSON.stringify 生成，不需要额外转义步骤。 */
function tomlBasic(value) {
  return JSON.stringify(value);
}

function tomlBasicArray(values) {
  return `[${values.map((v) => tomlBasic(v)).join(', ')}]`;
}

export function codexHomeDir(env = process.env, homeDir = '') {
  if (env.CODEX_HOME && String(env.CODEX_HOME).trim()) return path.resolve(env.CODEX_HOME);
  return path.join(homeDir || os.homedir(), '.codex');
}

export function buildManagedCodexConfig({ rootDir }) {
  /* 中文注意：这里的五大 MCP 清单与项目 .mcp.json / .gemini/settings.json /
   * ~/.workbuddy/mcp.json 是同一套服务的两份落点——新增第六个服务时两处都要改，
   * codex-config.test.mjs 锁定了 5 个表名防漏。 */
  const root = path.resolve(rootDir);
  const node = process.execPath;
  const lines = [];
  lines.push('');
  lines.push(MANAGED_BEGIN);
  lines.push('');
  lines.push(`[projects.${tomlLiteral(root)}]`);
  lines.push('trust_level = "trusted"');
  lines.push('');
  lines.push('[mcp_servers.code-review-graph]');
  lines.push('type = "stdio"');
  lines.push('command = "uvx"');
  lines.push('args = ["code-review-graph", "serve"]');
  lines.push(`cwd = ${tomlLiteral(root)}`);
  lines.push('');
  lines.push('[mcp_servers.mcp-browser-use]');
  lines.push('type = "stdio"');
  lines.push('command = "node"');
  lines.push(`args = ${tomlBasicArray([path.join(root, 'scripts', 'run-local-browser-mcp.mjs')])}`);
  lines.push('startup_timeout_sec = 60');
  lines.push('');
  lines.push('[mcp_servers.mcp-browser-use.env]');
  lines.push('BROWSER_USE_CDP_URL = "http://127.0.0.1:9222"');
  lines.push('');
  lines.push('[mcp_servers.aios-auth-tools]');
  lines.push('type = "stdio"');
  lines.push('command = "python"');
  lines.push(`args = ${tomlBasicArray(['-u', path.join(root, 'scripts', 'auth-tools-server.py')])}`);
  lines.push('startup_timeout_sec = 30');
  lines.push('');
  lines.push('[mcp_servers.aios-auth-tools.env]');
  lines.push('BROWSER_USE_CDP_URL = "http://127.0.0.1:9222"');
  lines.push('');
  lines.push('[mcp_servers.aios-shell]');
  lines.push('type = "stdio"');
  lines.push(`command = ${tomlBasic(node)}`);
  lines.push(`args = ${tomlBasicArray([
    path.join(root, 'scripts', 'aios-mcp-proxy.mjs'),
    '--workspace', root,
    '--host', 'aios-shell',
    '--', node,
    path.join(root, 'scripts', 'shell-mcp-server.mjs'),
  ])}`);
  lines.push('startup_timeout_sec = 30');
  lines.push('');
  lines.push('[mcp_servers.aios-shell.env]');
  lines.push('AIOS_INTERCEPTION_METRICS = "1"');
  lines.push('AIOS_MCP_PROXY = "1"');
  lines.push('AIOS_MCP_UPSTREAM_HOST = "aios-shell"');
  lines.push('');
  lines.push('[mcp_servers.aios-memory]');
  lines.push('type = "stdio"');
  lines.push('command = "node"');
  lines.push(`args = ${tomlBasicArray([path.join(root, 'scripts', 'memory-mcp-server.mjs')])}`);
  // 中文注释：不钉 cwd。memory-mcp-server 的工作区根由 AIOS_WORKSPACE_ROOT 决定（下一行已经显式给出），
  // `cwd` 对它的语义是冗余的；但在 Windows 上这个冗余代价是整次升级：安装器要把安装目录改名让位，
  // 而目录改名只被“某进程 CWD 在该子树内”拦住。实测同类钉法已在安装树里留下 9 个长驻进程。
  lines.push('startup_timeout_sec = 30');
  lines.push('');
  lines.push('[mcp_servers.aios-memory.env]');
  lines.push(`AIOS_WORKSPACE_ROOT = ${tomlLiteral(root)}`);
  lines.push('');
  lines.push(MANAGED_END);
  return lines.join('\n');
}

/* 中文注释：按表头剥离 AIOS 拥有的段（含历史手工写入、无标记的版本），避免重复表头。
 * 前置假设：输入是合法 TOML（codex 自己也要求这一点，非法文件它同样无法加载）。
 * 两种剥离态必须分开：
 * - 标记区（begin→end）：整段都是 AIOS 的，剔到 end 为止；
 * - 无标记遗留表：它只“拥有自己的表体”，到下一个表头就必须停——否则后面的人类配置会被误删。
 *   （旧实现用一个布尔位贯穿两者，遗留表之后的内容会一直吞到 MANAGED_END，实测为数据丢失。） */
export function stripManagedTables(raw, { rootDir }) {
  const root = path.resolve(rootDir);
  const managedMcpTables = [
    'mcp_servers.aios-memory',
    'mcp_servers.aios-shell',
    'mcp_servers.aios-auth-tools',
    'mcp_servers.mcp-browser-use',
    'mcp_servers.code-review-graph',
  ];
  const lines = String(raw).split(/\r?\n/u);
  const out = [];
  let inManagedBlock = false;
  let inLegacyTable = false;
  for (const line of lines) {
    if (line.startsWith(MANAGED_BEGIN)) { inManagedBlock = true; inLegacyTable = false; continue; }
    if (line.startsWith(MANAGED_END)) { inManagedBlock = false; inLegacyTable = false; continue; }
    if (inManagedBlock) continue;

    const header = /^\s*\[([^\]]+)\]\s*$/u.exec(line);
    if (header) {
      const name = header[1].trim();
      const isManaged = managedMcpTables.some((t) => name === t || name.startsWith(`${t}.`))
        || sameProjectTable(name, root);
      if (isManaged) { inLegacyTable = true; continue; }
      // 无关表头：遗留表到此为止，人类内容从这一行起继续保留。
      inLegacyTable = false;
      out.push(line);
      continue;
    }
    if (inLegacyTable) continue;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/gu, '\n\n').trimEnd();
}

/* 中文注释：`[projects.'C:\\path']` 与 `[projects."C:\\\\path"]` 指向同一个表。
 * 旧逻辑按“文本拼写”枚举两种，漏了 codex 自己写的转义形式，于是托管段又追了一个
 * 同键表 → config.toml 报 duplicate key → codex 整个客户端加载失败。
 * 唯一安全做法是把键解码成路径再比。不做大小写折叠：大小写不同的键对 TOML 是两个键，
 * 删它等于替人类做决定。 */
function sameProjectTable(headerName, root) {
  if (!headerName.startsWith('projects.')) return false;
  const decoded = decodeTomlKey(headerName.slice('projects.'.length));
  if (!decoded) return false;
  return path.resolve(decoded) === root;
}

function decodeTomlKey(segment) {
  const text = String(segment || '').trim();
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/gu, "'");
  }
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    // TOML basic string 的转义集与本模块写出的值（路径/参数）与 JSON 一致。
    try {
      const parsed = JSON.parse(text);
      return typeof parsed === 'string' ? parsed : '';
    } catch {
      return '';
    }
  }
  return text;
}

/**
 * Ensure ~/.codex/config.toml carries AIOS trust + managed MCP sections.
 * Idempotent: re-running yields 'reused'. Injectable fs for tests.
 */
export async function syncCodexHomeConfig({
  rootDir,
  env = process.env,
  homeDir = '',
  fsImpl = fs,
  tmpdir = os.tmpdir(),
} = {}) {
  const targetPath = path.join(codexHomeDir(env, homeDir), 'config.toml');
  /* 中文注释：同一道易失根守卫（与 migrateBrowserMcpConfig 一致）。
   * 托管段里的绝对路径取自 rootDir，一旦 rootDir 是临时物化目录而落点是长期配置，
   * 系统回收后 codex 的 MCP 就永久失联。沙箱到沙箱照旧放行。 */
  if (isVolatileAiosRoot(rootDir, { env, tmpdir }) && !isVolatileAiosRoot(targetPath, { env, tmpdir })) {
    return { status: 'skipped', reason: 'volatile-root', path: targetPath };
  }
  const previous = await fsImpl.readFile(targetPath, 'utf8').catch((error) => {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return '';
    throw error;
  });
  const stripped = stripManagedTables(previous, { rootDir });
  const next = `${stripped ? `${stripped}\n` : ''}${buildManagedCodexConfig({ rootDir })}\n`;
  if (next === previous) return { status: 'reused', path: targetPath };
  await fsImpl.mkdir(path.dirname(targetPath), { recursive: true });
  const tmp = `${targetPath}.tmp.${process.pid}`;
  await fsImpl.writeFile(tmp, next, 'utf8');
  await fsImpl.rename(tmp, targetPath);
  return { status: previous ? 'updated' : 'created', path: targetPath };
}
