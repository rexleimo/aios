// scripts/lib/aios-init/agent-config.mjs — AIOS agent 配置与检测
// 从 aios-init.mjs 拆分：AGENT_CONFIG 常量、agent 检测、marker 管理

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const AGENT_CONFIG = {
  claude: {
    cli: 'claude',
    bridgeName: 'claude-code',
    configFile: 'CLAUDE.md',
    hookFile: '.claude/settings.local.json',
    hasHook: true,
  },
  codex: {
    cli: 'codex',
    bridgeName: 'codex-cli',
    configFile: 'AGENTS.md',
    hookFile: null,
    hasHook: false,
  },
  gemini: {
    cli: 'gemini',
    bridgeName: 'gemini-cli',
    configFile: 'GEMINI.md',
    hookFile: '.gemini/settings.json',
    hasHook: true,
  },
  opencode: {
    cli: 'opencode',
    bridgeName: 'opencode-cli',
    configFile: 'AGENTS.md',
    hookFile: null,
    hasHook: false,
  },
  hermes: {
    cli: 'hermes',
    bridgeName: 'hermes-cli',
    configFile: 'AGENTS.md',
    hookFile: null,
    hasHook: false,
  },
};

export const MARKER = '<!-- AIOS: .aios/context-db/index.json -->';
export const LEGACY_MARKER = '<!-- AIOS: memory/context-db/index.json -->';
export const MARKERS = [MARKER, LEGACY_MARKER];

export function which(cmd) {
  try {
    return execSync(`which ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

export function detectAgents() {
  const installed = [];
  const seenConfigs = new Set();
  for (const [name, cfg] of Object.entries(AGENT_CONFIG)) {
    if (!which(cfg.cli)) continue;
    if (seenConfigs.has(cfg.configFile)) {
      installed.push(name);
      continue;
    }
    seenConfigs.add(cfg.configFile);
    installed.push(name);
  }
  return installed;
}

export function hasMarker(workspaceRoot, configFile) {
  try {
    const content = readFileSync(resolve(workspaceRoot, configFile), 'utf8');
    return MARKERS.some((marker) => content.includes(marker));
  } catch {
    return false;
  }
}

export function ensureMarker(workspaceRoot, configFile, { dryRun = false } = {}) {
  const absPath = resolve(workspaceRoot, configFile);
  if (hasMarker(workspaceRoot, configFile)) {
    return { path: absPath, action: 'skip', reason: 'marker already present' };
  }
  if (dryRun) {
    return { path: absPath, action: 'would-add', reason: 'marker missing' };
  }
  try {
    const existing = readFileSync(absPath, 'utf8');
    writeFileSync(absPath, `${MARKER}\n${existing}`, 'utf8');
    return { path: absPath, action: 'prepended', reason: 'marker prepended to existing file' };
  } catch {
    writeFileSync(absPath, `${MARKER}\n`, 'utf8');
    return { path: absPath, action: 'created', reason: 'file created with marker' };
  }
}
