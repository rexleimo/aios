import fs from 'node:fs';
import path from 'node:path';

import { resolveUserPath } from '../../paths.mjs';
import { normalizeClientList } from '../selection.mjs';
import { getCodemapTargetFormat } from './formats.mjs';

const CODEMAP_MCP_TARGETS = Object.freeze([
  Object.freeze({
    clientKey: 'codex',
    format: 'codex-toml',
    createIfMissing: true,
    resolvePath: (_projectRoot, clientHomes) => {
      const codexHome = resolveUserPath(clientHomes.codex);
      return codexHome ? path.join(codexHome, 'config.toml') : '';
    },
  }),
  Object.freeze({
    clientKey: 'claude',
    format: 'mcp-json',
    createIfMissing: true,
    // 用户级优先：AIOS 的 MCP 注册不该往每个项目里塞一个 `.mcp.json`（项目文件会被
    // 误提交、且换项目就得重写一遍）。拿不到 home 时才退回项目级。
    resolvePath: (projectRoot, clientHomes) => {
      const claudeHome = resolveUserPath(clientHomes.claude);
      if (!claudeHome) return path.join(projectRoot, '.mcp.json');
      // claude 的用户级 MCP 文件是与 `~/.claude` 同级的 `~/.claude.json`。
      return path.join(path.dirname(claudeHome), '.claude.json');
    },
  }),
  Object.freeze({
    clientKey: 'gemini',
    format: 'mcp-json',
    createIfMissing: true,
    // 同上：gemini 的用户级设置是 `~/.gemini/settings.json`（项目级才是 `.gemini/settings.json`）。
    resolvePath: (projectRoot, clientHomes) => {
      const geminiHome = resolveUserPath(clientHomes.gemini);
      if (!geminiHome) return path.join(projectRoot, '.gemini', 'settings.json');
      return path.join(geminiHome, 'settings.json');
    },
  }),
  Object.freeze({
    clientKey: 'opencode',
    format: 'opencode-json',
    createIfMissing: true,
    resolvePath: (_projectRoot, clientHomes) => {
      const opencodeHome = resolveUserPath(clientHomes.opencode);
      return opencodeHome ? path.join(opencodeHome, 'opencode.json') : '';
    },
  }),
  Object.freeze({
    clientKey: 'hermes',
    format: 'hermes-yaml',
    createIfMissing: true,
    resolvePath: (_projectRoot, clientHomes) => {
      const hermesHome = resolveUserPath(clientHomes.hermes);
      return hermesHome ? path.join(hermesHome, 'config.yaml') : '';
    },
  }),
  Object.freeze({
    clientKey: 'grok',
    format: 'codex-toml',
    createIfMissing: true,
    resolvePath: (_projectRoot, clientHomes) => {
      const grokHome = resolveUserPath(clientHomes.grok);
      return grokHome ? path.join(grokHome, 'config.toml') : '';
    },
  }),
  Object.freeze({
    clientKey: 'workbuddy',
    format: 'mcp-json',
    createIfMissing: true,
    resolvePath: (_projectRoot, clientHomes) => {
      const workbuddyHome = resolveUserPath(clientHomes.workbuddy);
      return workbuddyHome ? path.join(workbuddyHome, 'mcp.json') : '';
    },
  }),
  // pi 的 MCP 落点是 Pi 全局 `mcp.json`（`PI_CODING_AGENT_DIR`，默认 ~/.pi/agent）。
  // 注意：这个文件**同样由 pi 组件写入**（aios-init → buildAiosPiMcpServers），
  // 形状为 {command, args, lifecycle:'lazy'}。本表写出的 entry 必须与其逐字节一致，
  // 否则 pi 自己的 doctor（JSON.stringify 精确比对）会永久报 kept-differs；
  // 形状定义见 entries.mjs 的 buildCrgPiEntry。
  Object.freeze({
    clientKey: 'pi',
    format: 'pi-json',
    createIfMissing: true,
    resolvePath: (_projectRoot, clientHomes) => {
      const piHome = resolveUserPath(clientHomes.pi);
      return piHome ? path.join(piHome, 'mcp.json') : '';
    },
  }),
  // zcode 的 server 桶是**点路径** `mcp.servers`，且 schema 是严格白名单
  // （未知字段会被整条丢弃），故走 mcp-json-nested + 落盘前规范化。
  Object.freeze({
    clientKey: 'zcode',
    format: 'mcp-json-nested',
    namespace: 'mcp.servers',
    createIfMissing: true,
    resolvePath: (_projectRoot, clientHomes) => {
      const zcodeHome = resolveUserPath(clientHomes.zcode);
      return zcodeHome ? path.join(zcodeHome, 'cli', 'config.json') : '';
    },
  }),
  // qoder 是标准 mcpServers；home 由 resolveQoderHome 做发行版判定
  // （CN 是 ~/.qoder-cn，国际版 ~/.qoder），clientHomes.qoder 已解析完毕。
  Object.freeze({
    clientKey: 'qoder',
    format: 'mcp-json',
    createIfMissing: true,
    resolvePath: (_projectRoot, clientHomes) => {
      const qoderHome = resolveUserPath(clientHomes.qoder);
      return qoderHome ? path.join(qoderHome, 'settings.json') : '';
    },
  }),
]);

export async function injectCrgIntoClientTarget(target, projectRoot, { dryRun = false, io = console } = {}) {
  const format = getCodemapTargetFormat(target.format);
  if (!format) {
    // 旧实现会把未知标签当 `mcp-json` 写——也就是把 JSON 写进 `config.toml`。拒绝比猜安全。
    return { status: 'error', reason: `format-not-wired:${target.format || '(empty)'}` };
  }
  return format.inject(target, projectRoot, { dryRun, io });
}

export async function removeCrgFromClientTarget(target, { io = console, projectRoot = '', dryRun = false } = {}) {
  const format = getCodemapTargetFormat(target.format);
  if (!format) {
    io.log(`ERR  codemap cannot clean ${target.path}: format-not-wired:${target.format || '(empty)'}`);
    return { status: 'error', reason: `format-not-wired:${target.format || '(empty)'}` };
  }
  return format.remove(target, { io, projectRoot, dryRun });
}

export function collectCodemapMcpTargets(projectRoot, clientHomes = {}, client = 'all') {
  const targets = [];
  const seen = new Set();
  const enabled = new Set(normalizeClientList(client));

  const addUnique = (absPath, clientKey, createIfMissing, format = 'mcp-json', namespace = '') => {
    if (!enabled.has(clientKey)) return;
    if (!absPath || seen.has(absPath)) return;
    seen.add(absPath);
    targets.push({ path: absPath, clientKey, createIfMissing, format, namespace });
  };

  for (const target of CODEMAP_MCP_TARGETS) {
    addUnique(
      target.resolvePath(projectRoot, clientHomes),
      target.clientKey,
      target.createIfMissing,
      target.format,
      target.namespace || ''
    );
  }

  return targets;
}

export function inspectCodemapMcpTarget(target) {
  if (!fs.existsSync(target.path)) {
    return { exists: false, hasCrg: false, valid: false, reason: 'missing' };
  }

  try {
    const raw = fs.readFileSync(target.path, 'utf8');
    const format = getCodemapTargetFormat(target.format);
    if (!format) {
      return { exists: true, hasCrg: false, valid: false, reason: `format-not-wired:${target.format || '(empty)'}` };
    }
    return format.inspect(raw, target);
  } catch (error) {
    return {
      exists: true,
      hasCrg: false,
      valid: false,
      reason: `parse failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
