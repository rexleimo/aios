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
    resolvePath: (projectRoot) => path.join(projectRoot, '.mcp.json'),
  }),
  Object.freeze({
    clientKey: 'gemini',
    format: 'mcp-json',
    createIfMissing: true,
    resolvePath: (projectRoot) => path.join(projectRoot, '.gemini', 'settings.json'),
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
    clientKey: 'grok',
    format: 'codex-toml',
    createIfMissing: true,
    resolvePath: (_projectRoot, clientHomes) => {
      const grokHome = resolveUserPath(clientHomes.grok);
      return grokHome ? path.join(grokHome, 'config.toml') : '';
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