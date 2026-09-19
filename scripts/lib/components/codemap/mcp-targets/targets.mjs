import fs from 'node:fs';
import path from 'node:path';

import { resolveUserPath } from '../paths.mjs';
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
]);

export function injectCrgIntoClientTarget(target, projectRoot, { dryRun = false, io = console } = {}) {
  return getCodemapTargetFormat(target.format).inject(target, projectRoot, { dryRun, io });
}

export function removeCrgFromClientTarget(target, { io = console } = {}) {
  return getCodemapTargetFormat(target.format).remove(target, { io });
}

export function collectCodemapMcpTargets(projectRoot, clientHomes = {}, client = 'all') {
  const targets = [];
  const seen = new Set();
  const enabled = new Set(normalizeClientList(client));

  const addUnique = (absPath, clientKey, createIfMissing, format = 'mcp-json') => {
    if (!enabled.has(clientKey)) return;
    if (!absPath || seen.has(absPath)) return;
    seen.add(absPath);
    targets.push({ path: absPath, clientKey, createIfMissing, format });
  };

  for (const target of CODEMAP_MCP_TARGETS) {
    addUnique(
      target.resolvePath(projectRoot, clientHomes),
      target.clientKey,
      target.createIfMissing,
      target.format
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
    return getCodemapTargetFormat(target.format).inspect(raw, target);
  } catch (error) {
    return {
      exists: true,
      hasCrg: false,
      valid: false,
      reason: `parse failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
