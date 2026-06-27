// scripts/lib/privacy-guard/commands.mjs — CLI 命令实现
// 从 privacy-guard.mjs 拆分：init/status/set/redact 命令逻辑

import fs from 'node:fs';
import path from 'node:path';

import {
  parseBoolean,
  parseMode,
  expandHome,
  resolveConfigPath,
  loadConfig,
  saveConfig,
  sanitizeConfig,
} from './config.mjs';
import {
  debug,
  isSensitivePath,
  hasSensitiveContent,
  redactByMode,
} from './redaction.mjs';

export function commandInit(options) {
  const configPath = resolveConfigPath(options.path);
  let config = loadConfig(configPath);
  if (options.enable) config.enabled = true;
  if (options.disable) config.enabled = false;
  if (typeof options.enabled !== 'undefined') {
    config.enabled = parseBoolean(options.enabled, '--enabled');
  }
  if (typeof options.mode !== 'undefined') {
    config.mode = parseMode(options.mode);
  }
  config = sanitizeConfig(config);
  saveConfig(configPath, config);
  process.stdout.write(`[ok] initialized privacy guard config: ${configPath}\n`);
}

export function commandStatus(options) {
  const configPath = resolveConfigPath(options.path);
  const exists = fs.existsSync(configPath);
  const config = loadConfig(configPath);
  const output = {
    configPath,
    exists,
    rexcilHome: path.dirname(configPath),
    enabled: config.enabled,
    mode: config.mode,
    protectPatterns: config.protectPatterns,
    ollama: config.ollama,
    enforcement: config.enforcement,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

export function commandSet(options) {
  const configPath = resolveConfigPath(options.path);
  const config = loadConfig(configPath);
  if (options.enable) config.enabled = true;
  if (options.disable) config.enabled = false;
  if (typeof options.enabled !== 'undefined') {
    config.enabled = parseBoolean(options.enabled, '--enabled');
  }
  if (typeof options.mode !== 'undefined') {
    config.mode = parseMode(options.mode);
  }
  if (typeof options['ollama-enabled'] !== 'undefined') {
    config.ollama.enabled = parseBoolean(options['ollama-enabled'], '--ollama-enabled');
  }
  if (typeof options.model !== 'undefined') {
    config.ollama.model = String(options.model).trim();
  }
  if (typeof options.endpoint !== 'undefined') {
    config.ollama.endpoint = String(options.endpoint).trim();
  }
  if (typeof options['timeout-ms'] !== 'undefined') {
    const timeout = Number(options['timeout-ms']);
    if (!Number.isFinite(timeout) || timeout <= 0) {
      throw new Error('Invalid --timeout-ms value');
    }
    config.ollama.timeoutMs = Math.trunc(timeout);
  }
  if (typeof options.enforce !== 'undefined') {
    config.enforcement.requiredForSensitiveFiles = parseBoolean(options.enforce, '--enforce');
  }
  if (typeof options['block-when-disabled'] !== 'undefined') {
    config.enforcement.blockWhenGuardDisabled = parseBoolean(options['block-when-disabled'], '--block-when-disabled');
  }
  if (typeof options['detect-content'] !== 'undefined') {
    config.enforcement.detectSensitiveContent = parseBoolean(options['detect-content'], '--detect-content');
  }
  saveConfig(configPath, sanitizeConfig(config));
  process.stdout.write(`[ok] updated privacy guard config: ${configPath}\n`);
}

export async function commandRedact(options) {
  const filePathRaw = options.file;
  if (!filePathRaw) {
    throw new Error('redact requires --file <path>');
  }
  const filePath = path.resolve(expandHome(filePathRaw));
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }
  const configPath = resolveConfigPath(options.path);
  const config = loadConfig(configPath);
  const mode = options.mode ? parseMode(options.mode) : config.mode;
  const content = fs.readFileSync(filePath, 'utf8');
  const force = Boolean(options.force);
  const pathSensitive = isSensitivePath(filePath, config);
  const contentSensitive = config.enforcement.detectSensitiveContent ? hasSensitiveContent(content) : false;
  const sensitive = pathSensitive || contentSensitive;

  debug(`file=${filePath} pathSensitive=${pathSensitive ? 'yes' : 'no'} contentSensitive=${contentSensitive ? 'yes' : 'no'} enabled=${config.enabled ? 'yes' : 'no'} force=${force ? 'yes' : 'no'} mode=${mode}`);

  if (!sensitive && !force) {
    process.stdout.write(content);
    return;
  }
  if (!config.enabled && !force) {
    const mustProtect = config.enforcement.requiredForSensitiveFiles && sensitive;
    if (mustProtect && config.enforcement.blockWhenGuardDisabled) {
      throw new Error(`Sensitive file requires redaction. Enable guard first: node scripts/privacy-guard.mjs set --enabled true (file: ${filePath})`);
    }
    process.stdout.write(content);
    return;
  }
  const redacted = await redactByMode(content, config, mode);
  process.stdout.write(redacted);
}
