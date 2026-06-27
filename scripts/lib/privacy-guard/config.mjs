// scripts/lib/privacy-guard/config.mjs — 隐私保护配置管理
// 从 privacy-guard.mjs 拆分：配置常量、加载/保存/合并/消毒逻辑

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const VALID_MODES = new Set(['regex', 'ollama', 'hybrid']);
export const DEFAULT_REXCIL_HOME = path.join(os.homedir(), '.rexcil');
export const SENSITIVE_PATH_RE = /(\/|^)(\.env(\.|$)|.*(secret|token|password|credential|cookie|session|auth|api[-_]?key|private|mcp|config|settings|profile|key|pem).*)/i;

export const DEFAULT_CONFIG = {
  enabled: true,
  mode: 'regex',
  protectPatterns: [
    '**/.env',
    '**/.env.*',
    '**/*secret*',
    '**/*token*',
    '**/*password*',
    '**/*credential*',
    '**/*config*',
    '**/*settings*',
    '**/*.pem',
    '**/*.key',
    '**/*.p12',
    '**/.claude/*.json',
    '**/.codex/*.toml',
    '**/.gemini/*.json',
    '**/.opencode/*.json',
    '**/config/**/*',
  ],
  ollama: {
    enabled: false,
    endpoint: 'http://127.0.0.1:11434/api/generate',
    model: 'qwen3.5:4b',
    timeoutMs: 12000,
  },
  enforcement: {
    requiredForSensitiveFiles: true,
    blockWhenGuardDisabled: true,
    detectSensitiveContent: true,
  },
};

export function parseBoolean(raw, name) {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(`Invalid boolean for ${name}`);
  }
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`Invalid boolean for ${name}: ${raw}`);
}

export function parseMode(raw) {
  const mode = String(raw || '').trim().toLowerCase();
  if (!VALID_MODES.has(mode)) {
    throw new Error(`Invalid mode: ${raw}. Use regex|ollama|hybrid`);
  }
  return mode;
}

export function expandHome(inputPath) {
  if (!inputPath) return inputPath;
  if (inputPath === '~') return os.homedir();
  if (inputPath.startsWith('~/')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

export function normalizeHomeDir(raw, fallback) {
  if (!raw) return fallback;
  const expanded = expandHome(raw);
  if (!path.isAbsolute(expanded)) return fallback;
  return expanded;
}

export function resolveConfigPath(explicitPath) {
  if (explicitPath) {
    return path.resolve(expandHome(explicitPath));
  }
  const envConfig = process.env.REXCIL_PRIVACY_CONFIG;
  if (envConfig && String(envConfig).trim() !== '') {
    return path.resolve(expandHome(envConfig));
  }
  const rexcilHome = normalizeHomeDir(process.env.REXCIL_HOME, DEFAULT_REXCIL_HOME);
  return path.join(rexcilHome, 'privacy-guard.json');
}

function ensureDirectoryFor(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeConfig(base, overlay) {
  const out = deepClone(base);
  if (!isObject(overlay)) return out;
  for (const [key, value] of Object.entries(overlay)) {
    if (Array.isArray(value)) {
      out[key] = [...value];
      continue;
    }
    if (isObject(value) && isObject(out[key])) {
      out[key] = mergeConfig(out[key], value);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function sanitizeConfig(rawConfig) {
  const merged = mergeConfig(DEFAULT_CONFIG, rawConfig);
  const config = deepClone(merged);
  config.enabled = Boolean(config.enabled);
  if (!VALID_MODES.has(config.mode)) {
    config.mode = DEFAULT_CONFIG.mode;
  }
  if (!Array.isArray(config.protectPatterns)) {
    config.protectPatterns = [...DEFAULT_CONFIG.protectPatterns];
  } else {
    config.protectPatterns = config.protectPatterns
      .map((v) => String(v).trim())
      .filter((v) => v.length > 0);
  }
  if (!isObject(config.ollama)) {
    config.ollama = deepClone(DEFAULT_CONFIG.ollama);
  }
  config.ollama.enabled = Boolean(config.ollama.enabled);
  config.ollama.endpoint = String(config.ollama.endpoint || DEFAULT_CONFIG.ollama.endpoint).trim();
  config.ollama.model = String(config.ollama.model || DEFAULT_CONFIG.ollama.model).trim();
  const timeout = Number(config.ollama.timeoutMs);
  config.ollama.timeoutMs = Number.isFinite(timeout) && timeout > 0
    ? Math.trunc(timeout)
    : DEFAULT_CONFIG.ollama.timeoutMs;
  if (!isObject(config.enforcement)) {
    config.enforcement = deepClone(DEFAULT_CONFIG.enforcement);
  }
  config.enforcement.requiredForSensitiveFiles = Boolean(config.enforcement.requiredForSensitiveFiles);
  config.enforcement.blockWhenGuardDisabled = Boolean(config.enforcement.blockWhenGuardDisabled);
  config.enforcement.detectSensitiveContent = Boolean(config.enforcement.detectSensitiveContent);
  return config;
}

export function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return sanitizeConfig(DEFAULT_CONFIG);
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${configPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return sanitizeConfig(parsed);
}

export function saveConfig(configPath, config) {
  ensureDirectoryFor(configPath);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}
