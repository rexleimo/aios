// scripts/lib/privacy-guard/redaction.mjs — 敏感内容检测与脱敏逻辑
// 从 privacy-guard.mjs 拆分：正则脱敏、Ollama 脱敏、敏感检测

import path from 'node:path';

import { SENSITIVE_PATH_RE } from './config.mjs';

export function shouldDebug() {
  const value = String(process.env.REXCIL_PRIVACY_DEBUG || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

export function debug(message) {
  if (shouldDebug()) {
    process.stderr.write(`[privacy-guard] ${message}\n`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegExp(glob) {
  const normalized = glob.replace(/\\/g, '/');
  let out = '';
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    if (ch === '*' && next === '*') {
      out += '.*';
      i += 1;
      continue;
    }
    if (ch === '*') {
      out += '[^/]*';
      continue;
    }
    if (ch === '?') {
      out += '[^/]';
      continue;
    }
    out += escapeRegExp(ch);
  }
  return new RegExp(`^${out}$`, 'i');
}

export function isPatternProtected(filePath, patterns) {
  const normalized = path.resolve(filePath).replace(/\\/g, '/');
  const basename = path.basename(normalized);
  for (const pattern of patterns) {
    const regex = globToRegExp(pattern);
    if (regex.test(normalized) || regex.test(basename)) {
      return true;
    }
  }
  return false;
}

export function isSensitivePath(filePath, config) {
  const normalized = path.resolve(filePath).replace(/\\/g, '/');
  return SENSITIVE_PATH_RE.test(normalized) || isPatternProtected(normalized, config.protectPatterns);
}

export function hasSensitiveContent(text) {
  const checks = [
    /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/i,
    /\bsk-[A-Za-z0-9]{20,}\b/,
    /\b(AKIA|ASIA)[0-9A-Z]{16}\b/,
    /\b(ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})\b/,
    /\bAIza[0-9A-Za-z-_]{30,}\b/,
    /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
    /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|passwd|secret|client[_-]?secret|authorization|cookie|session(?:id)?)\s*[:=]\s*["']?[^\s"',;]+/i,
    /"(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|client[_-]?secret|authorization|cookie|session(?:id)?)"\s*:\s*"[^"\r\n]+"/i,
    /\b[A-Za-z0-9._-]*_(?:key|token|password|passwd|secret|session(?:id)?)\b\s*[:=]\s*["']?[^\s"',;]+/i,
    /\b[A-Za-z0-9._-]*_key\b\s*[:=]\s*["']?[^\s"',;]+/i,
  ];
  return checks.some((re) => re.test(text));
}

export function applyRegexRedaction(input) {
  let text = String(input);
  const literalRules = [
    { re: /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/g, value: '[REDACTED_PRIVATE_KEY]' },
    { re: /\bsk-[A-Za-z0-9]{20,}\b/g, value: '[REDACTED_OPENAI_KEY]' },
    { re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, value: '[REDACTED_AWS_ACCESS_KEY]' },
    { re: /\b(ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})\b/g, value: '[REDACTED_GITHUB_TOKEN]' },
    { re: /\bAIza[0-9A-Za-z-_]{30,}\b/g, value: '[REDACTED_GOOGLE_API_KEY]' },
    { re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, value: '[REDACTED_JWT]' },
  ];
  for (const rule of literalRules) {
    text = text.replace(rule.re, rule.value);
  }
  text = text.replace(
    /(\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|passwd|secret|client[_-]?secret|authorization|cookie|session(?:id)?|[A-Za-z0-9._-]*_(?:key|token|password|passwd|secret|session(?:id)?))\b\s*[:=]\s*)(["']?)([^"'\r\n,;]+)\2/gi,
    (_, prefix, quote) => `${prefix}${quote}[REDACTED]${quote}`,
  );
  text = text.replace(
    /("\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|secret|client[_-]?secret|authorization|cookie|session(?:id)?|[A-Za-z0-9._-]*_(?:key|token|password|passwd|secret|session(?:id)?))\b"\s*:\s*")([^"\r\n]*)(")/gi,
    '$1[REDACTED]$3',
  );
  text = text.replace(
    /^(\s*[A-Za-z0-9._-]*_(?:key|token|password|passwd|secret|session(?:id)?)\s*=\s*)([^\r\n]*)$/gim,
    '$1[REDACTED]',
  );
  text = text.replace(
    /(Authorization\s*:\s*Bearer\s+)([A-Za-z0-9._\-~+/]+=*)/gi,
    '$1[REDACTED_BEARER_TOKEN]',
  );
  text = text.replace(
    /(Set-Cookie\s*:\s*[^=\s;]+=*\s*)([^;\r\n]+)/gi,
    '$1[REDACTED_COOKIE]',
  );
  text = text.replace(
    /(https?:\/\/)([^:@\/\s]+):([^@\/\s]+)@/gi,
    '$1[REDACTED_USER]:[REDACTED_PASS]@',
  );
  return text;
}

function isAbortLikeError(error) {
  if (!error) return false;
  const name = typeof error.name === 'string' ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  return name === 'AbortError' || /aborted/i.test(message);
}

async function runOllamaRedaction(input, config) {
  if (input.length > 120000) {
    throw new Error('Input too large for ollama mode (max 120000 chars)');
  }
  const endpoint = String(config.ollama.endpoint || '').trim();
  const model = String(config.ollama.model || '').trim();
  const timeoutMs = Number(config.ollama.timeoutMs) || 12000;
  if (!endpoint) throw new Error('ollama.endpoint is empty');
  if (!model) throw new Error('ollama.model is empty');

  const prompt = [
    'You are a security redaction engine.',
    'Redact sensitive values in the following text.',
    'Rules:',
    '- Preserve structure and non-sensitive text.',
    '- Replace only sensitive values with tags like [REDACTED], [REDACTED_TOKEN], [REDACTED_PASSWORD].',
    '- Never explain anything.',
    '- Output only the redacted text.',
    '',
    input,
  ].join('\n');

  const payload = { model, stream: false, options: { temperature: 0 }, prompt };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      if (!isAbortLikeError(error)) throw error;
      debug('ollama request aborted once, retrying without timeout guard');
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`Ollama request failed: HTTP ${response.status}`);
  }
  const data = await response.json();
  const output = typeof data.response === 'string' ? data.response : '';
  if (!output || output.trim() === '') {
    throw new Error('Ollama returned empty response');
  }
  return output;
}

export async function redactByMode(text, config, mode) {
  const { parseMode } = await import('./config.mjs');
  const normalizedMode = parseMode(mode || config.mode);
  if (normalizedMode === 'regex') {
    return applyRegexRedaction(text);
  }
  if (!config.ollama.enabled) {
    debug('ollama is disabled in config, fallback to regex mode');
    return applyRegexRedaction(text);
  }
  if (normalizedMode === 'ollama') {
    try {
      return await runOllamaRedaction(text, config);
    } catch (error) {
      debug(`ollama mode failed, fallback to regex: ${error instanceof Error ? error.message : String(error)}`);
      return applyRegexRedaction(text);
    }
  }
  // hybrid
  const regexFirst = applyRegexRedaction(text);
  try {
    return await runOllamaRedaction(regexFirst, config);
  } catch (error) {
    debug(`hybrid ollama step failed, returning regex result: ${error instanceof Error ? error.message : String(error)}`);
    return regexFirst;
  }
}
