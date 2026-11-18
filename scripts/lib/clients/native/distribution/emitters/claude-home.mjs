/* 中文注释：Claude Code 用户级 settings.json 的 statusLine 同步。
 *
 * 背景：Claude Code 只读**顶层** statusLine。AIOS 的 claude emitter 把整份配置写在
 * `aiosNative` 键下（`.claude/settings.local.json`），顶层从来不出现这个键——
 * 于是计划状态栏在项目作用域也从未生效；全局 `~/.claude/settings.json` 更是完全没有写过，
 * 用户看到的 gap 就在这里。
 *
 * 策略与 codex 用户级 config.toml 一致：家目录路径走不了相对路径的 operations 管线，
 * 作为 claude 专属后置步骤在 run.mjs 里执行；易失安装根守卫拦下临时物化目录
 * （mkdtemp 出来的根被回收后，写进长期配置的命令会永久失效）。
 *
 * 冲突策略：只有一个 statusLine 槽位。用户已有取值（例如自己装的徽章脚本）一律保留，
 * 本模块只补缺——覆盖等于替用户删掉他配的东西，upstream caveman 也拒绝这么做。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isVolatileAiosRoot } from '../../../../foundation/platform/aios-runtime-root.mjs';

// 中文注释：跟随 Claude Code 自己的解析——它读 CLAUDE_CONFIG_DIR，不读 AIOS 的 CLAUDE_HOME。
export function resolveClaudeConfigDir({ env = process.env, homeDir = '' } = {}) {
  const raw = env.CLAUDE_CONFIG_DIR && String(env.CLAUDE_CONFIG_DIR).trim();
  if (raw && path.isAbsolute(raw)) return path.resolve(raw);
  return path.join(homeDir || os.homedir(), '.claude');
}

/* 中文注释：写进 home 的根必须活得过本次会话。仓库树能给出徽章，但可能被搬走；
 * 环境里声明的安装根（AIOS_ROOT_DIR 等）更持久，却可能还是没带 `plan statusline` 的旧版本。
 * 取舍：能在候选里找到一个**同时是 AIOS 根、且带 statusline 模块**的根就用它（徽章可用），
 * 否则退回第一个可用的 AIOS 根，靠下面的降级尾巴保持可读。 */
function isAiosRootCandidate(root, fsImpl) {
  try {
    return fsImpl.existsSync(path.join(root, 'scripts', 'aios.mjs'));
  } catch {
    return false;
  }
}

function hasStatuslineCommand(root, fsImpl) {
  try {
    return fsImpl.existsSync(path.join(root, 'scripts', 'lib', 'foundation', 'planning', 'ops', 'statusline.mjs'));
  } catch {
    return false;
  }
}

export function resolveStatuslineRoot({ rootDir, env = process.env, fsImpl = fs } = {}) {
  /* 顺序：环境声明的安装根优先（长期稳定），调用方根兜底（就是此刻在跑的那份代码）。
   * 两者都只在“带 statusline 模块”时才可能被选中，所以旧安装根不会抢走这个位置。 */
  const candidates = [env.AIOS_ROOT_DIR, env.AIOS_ROOT, env.ROOTPATH, env.AIOS_INSTALL_DIR, rootDir]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map((value) => path.resolve(value));
  const usable = candidates.filter((root) => isAiosRootCandidate(root, fsImpl));
  return usable.find((root) => hasStatuslineCommand(root, fsImpl))
    || usable[0]
    || path.resolve(String(rootDir || '.'));
}

/* 中文注释：命令带一条降级尾巴。状态栏在每次重绘时执行，安装根若还没带 `plan statusline`
 * （升级过程里必然出现的窗口期），裸命令会把「unknown plan subcommand」直接画进状态栏。
 * 先试新子命令，失败退回 `plan status` —— 后者是所有版本都有的只读视图。
 * 整组再吞一次 stderr：安装根被搬走/删除时，MCP 风格模块报错不能变成状态栏正文。 */
export function buildClaudeStatuslineCommand({ rootDir, env = process.env, fsImpl = fs }) {
  const root = resolveStatuslineRoot({ rootDir, env, fsImpl });
  const cli = `node ${root}/scripts/aios.mjs`;
  return `(${cli} plan statusline || ${cli} plan status) 2>/dev/null`;
}

export function buildClaudeStatuslineFragment({ rootDir, env = process.env, fsImpl = fs }) {
  return {
    statusLine: {
      type: 'command',
      command: buildClaudeStatuslineCommand({ rootDir, env, fsImpl }),
    },
  };
}

/* 中文注释：所有权按**形状**判定，不按绝对路径逐字比对。
 * 理由：安装根会变（仓库树 → ~/.rexcil/aios → 另一台机器），逐字比对会让
 * 「用旧根写下的 AIOS statusLine」变成“用户自有值”，于是升级既不会重指新根、
 * 卸载也不敢清理——两个方向都卡死。命令形态是本模块唯一写出的形态：
 * 以 `scripts/aios.mjs plan statusline` 结尾即视为 AIOS 所有。 */
const AIOS_STATUSLINE_COMMAND = /(?:^|[\s"'/\\])aios\.mjs["']?\s+plan\s+statusline\b/u;

export function isAiosStatusline(entry) {
  return Boolean(entry && typeof entry === 'object' && !Array.isArray(entry))
    && entry.type === 'command'
    && typeof entry.command === 'string'
    && AIOS_STATUSLINE_COMMAND.test(entry.command);
}

function statuslineOwned(existing, fragment) {
  if (!existing || typeof existing !== 'object') return false;
  if (isAiosStatusline(existing.statusLine)) return true;
  return JSON.stringify(existing.statusLine) === JSON.stringify(fragment.statusLine);
}

export async function syncClaudeHomeStatusline({
  rootDir,
  env = process.env,
  homeDir = '',
  fsImpl = fs,
  tmpdir = os.tmpdir(),
} = {}) {
  const targetPath = path.join(resolveClaudeConfigDir({ env, homeDir }), 'settings.json');
  if (isVolatileAiosRoot(rootDir, { env, tmpdir }) && !isVolatileAiosRoot(targetPath, { env, tmpdir })) {
    return { status: 'skipped', reason: 'volatile-root', path: targetPath };
  }
  const previous = await fsImpl.promises.readFile(targetPath, 'utf8').catch((error) => {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return '';
    throw error;
  });

  let parsed = {};
  if (previous.trim()) {
    try {
      parsed = JSON.parse(previous);
    } catch {
      // 非法 JSON 不能 reset：这是用户的全局配置，可能是手写正在编辑的文件。
      return { status: 'skipped', reason: 'invalid-json', path: targetPath };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { status: 'skipped', reason: 'invalid-json', path: targetPath };
    }
  }

  const fragment = buildClaudeStatuslineFragment({ rootDir, env, fsImpl });
  if (Object.hasOwn(parsed, 'statusLine')) {
    if (JSON.stringify(parsed.statusLine) === JSON.stringify(fragment.statusLine)) {
      return { status: 'reused', path: targetPath };
    }
    // 仍是 AIOS 的形状、只是指向另一个安装根（升级/搬家）→ 重指；用户自有值 → 让位。
    if (!isAiosStatusline(parsed.statusLine)) {
      return { status: 'skipped', reason: 'user-owned', path: targetPath };
    }
  }

  const next = `${JSON.stringify({ ...parsed, ...fragment }, null, 2)}\n`;
  await fsImpl.promises.mkdir(path.dirname(targetPath), { recursive: true });
  const tmp = `${targetPath}.tmp.${process.pid}`;
  await fsImpl.promises.writeFile(tmp, next, 'utf8');
  await fsImpl.promises.rename(tmp, targetPath);
  return { status: previous ? 'updated' : 'created', path: targetPath };
}

// 只读探针：给 doctor 用。口径与 sync 一致——用户自有值不算问题。
export async function checkClaudeHomeStatusline({
  rootDir,
  env = process.env,
  homeDir = '',
  fsImpl = fs,
  tmpdir = os.tmpdir(),
} = {}) {
  const targetPath = path.join(resolveClaudeConfigDir({ env, homeDir }), 'settings.json');
  if (isVolatileAiosRoot(rootDir, { env, tmpdir }) && !isVolatileAiosRoot(targetPath, { env, tmpdir })) {
    return { ok: true, skipped: 'volatile-root', targetPath };
  }
  const previous = await fsImpl.promises.readFile(targetPath, 'utf8').catch((error) => {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return null;
    throw error;
  });
  if (previous === null) return { ok: false, issue: `[missing] ${targetPath}#statusLine`, targetPath };
  let parsed;
  try {
    parsed = JSON.parse(previous);
  } catch {
    return { ok: false, issue: `[invalid json] ${targetPath}`, targetPath };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, issue: `[invalid json] ${targetPath}`, targetPath };
  }
  const fragment = buildClaudeStatuslineFragment({ rootDir, env, fsImpl });
  if (!Object.hasOwn(parsed, 'statusLine')) {
    return { ok: false, issue: `[missing] ${targetPath}#statusLine`, targetPath };
  }
  if (!isAiosStatusline(parsed.statusLine)) {
    return { ok: true, owned: false, targetPath };
  }
  if (JSON.stringify(parsed.statusLine) !== JSON.stringify(fragment.statusLine)) {
    // 指向旧的安装根：内容可执行但可能已失效，属于 drift 而非用户选择。
    return { ok: false, issue: `[drift] ${targetPath}#statusLine`, targetPath };
  }
  return { ok: true, owned: true, targetPath };
}

// 卸载只收回仍然是 AIOS 写下的那个值。用户改写过就不动。
export async function removeClaudeHomeStatusline({
  rootDir,
  env = process.env,
  homeDir = '',
  fsImpl = fs,
  tmpdir = os.tmpdir(),
} = {}) {
  const targetPath = path.join(resolveClaudeConfigDir({ env, homeDir }), 'settings.json');
  if (isVolatileAiosRoot(rootDir, { env, tmpdir }) && !isVolatileAiosRoot(targetPath, { env, tmpdir })) {
    return { status: 'skipped', reason: 'volatile-root', path: targetPath };
  }
  const previous = await fsImpl.promises.readFile(targetPath, 'utf8').catch((error) => {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return '';
    throw error;
  });
  if (!previous.trim()) return { status: 'reused', path: targetPath };

  let parsed;
  try {
    parsed = JSON.parse(previous);
  } catch {
    return { status: 'skipped', reason: 'invalid-json', path: targetPath };
  }
  const fragment = buildClaudeStatuslineFragment({ rootDir, env, fsImpl });
  if (!statuslineOwned(parsed, fragment)) {
    return { status: 'reused', path: targetPath };
  }
  const next = { ...parsed };
  delete next.statusLine;
  const nextText = Object.keys(next).length > 0 ? `${JSON.stringify(next, null, 2)}\n` : '';
  await fsImpl.promises.mkdir(path.dirname(targetPath), { recursive: true });
  if (!nextText) {
    await fsImpl.promises.rm(targetPath, { force: true });
    return { status: 'removed', path: targetPath };
  }
  const tmp = `${targetPath}.tmp.${process.pid}`;
  await fsImpl.promises.writeFile(tmp, nextText, 'utf8');
  await fsImpl.promises.rename(tmp, targetPath);
  return { status: 'removed', path: targetPath };
}
