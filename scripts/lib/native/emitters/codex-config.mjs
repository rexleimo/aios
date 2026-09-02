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
  lines.push(`cwd = ${tomlLiteral(root)}`);
  lines.push('startup_timeout_sec = 30');
  lines.push('');
  lines.push('[mcp_servers.aios-memory.env]');
  lines.push(`AIOS_WORKSPACE_ROOT = ${tomlLiteral(root)}`);
  lines.push('');
  lines.push(MANAGED_END);
  return lines.join('\n');
}

/* 中文注释：按表头剥离 AIOS 拥有的段（含历史手工写入、无标记的版本），避免重复表头。
 * 前置假设：输入是合法 TOML（codex 自己也要求这一点，非法文件它同样无法加载）；
 * 对畸形文件（表头无闭合）会吞到下一个表头为止，属可接受退化。 */
export function stripManagedTables(raw, { rootDir }) {
  const root = path.resolve(rootDir);
  const tableNames = [
    `mcp_servers.aios-memory`,
    `mcp_servers.aios-shell`,
    `mcp_servers.aios-auth-tools`,
    `mcp_servers.mcp-browser-use`,
    `mcp_servers.code-review-graph`,
    `projects.${tomlLiteral(root)}`,
    `projects."${root.replace(/"/gu, '\\"')}"`,
  ];
  const lines = String(raw).split(/\r?\n/u);
  const out = [];
  let skipping = false;
  for (const line of lines) {
    if (line.startsWith(MANAGED_BEGIN)) { skipping = true; continue; }
    if (line.startsWith(MANAGED_END)) { skipping = false; continue; }
    if (skipping) continue;
    const header = /^\s*\[([^\]]+)\]\s*$/u.exec(line);
    if (header) {
      const name = header[1].trim();
      const isManaged = tableNames.some((t) => name === t || name.startsWith(`${t}.`));
      if (isManaged) { skipping = true; continue; }
    }
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/gu, '\n\n').trimEnd();
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
} = {}) {
  const targetPath = path.join(codexHomeDir(env, homeDir), 'config.toml');
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
