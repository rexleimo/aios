// 中文注释：magpie 式导入——从客户端真实配置里读取已配的 provider/base URL，只读不改原文件。
// 返回候选 provider 列表（{id, baseUrl, apiKeyEnv, endpointStyle, protocols}），由调用方合并进注册表。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function safeReadJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function extractClaude(home) {
  const doc = safeReadJson(path.join(home, '.claude', 'settings.json'));
  if (!doc) return [];
  const out = [];
  const env = doc?.env || {};
  const baseUrl = String(env.ANTHROPIC_BASE_URL || '').trim();
  if (baseUrl) {
    out.push({ id: 'claude-imported', baseUrl, apiKeyEnv: env.ANTHROPIC_AUTH_TOKEN ? 'env:ANTHROPIC_AUTH_TOKEN' : '', endpointStyle: 'standard', protocols: ['claude'] });
  }
  return out;
}

function parseCodexConfig(text) {
  // 简易 TOML：取 model_provider + [model_providers.<id>] base_url
  const providers = [];
  const defaultProvider = (text.match(/^model_provider\s*=\s*"([^"]+)"/m) || [])[1];
  const blockRe = /\[model_providers\.([^\]]+)\]([\s\S]*?)(?=\n\[|$)/g;
  let m;
  while ((m = blockRe.exec(text)) !== null) {
    const id = m[1].trim();
    const body = m[2];
    const baseUrl = (body.match(/base_url\s*=\s*"([^"]+)"/) || [])[1];
    if (baseUrl) providers.push({ id: `codex-${id}`, baseUrl, apiKeyEnv: '', endpointStyle: 'standard', protocols: ['openai-chat', 'openai-response'] });
  }
  return providers;
}

function extractCodex(home) {
  const file = path.join(home, '.codex', 'config.toml');
  try {
    const text = fs.readFileSync(file, 'utf8');
    return parseCodexConfig(text);
  } catch { return []; }
}

export function importProvidersFromClients({ home = os.homedir() } = {}) {
  return [...extractClaude(home), ...extractCodex(home)];
}
