import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expandHome, parseBoolEnv } from './shared.mjs';

const KNOWN_ENDPOINT_ENV_NAMES = new Set([
  'OPENAI_BASE_URL',
  'OPENAI_API_BASE',
  'OPENAI_API_URL',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_API_URL',
  'GOOGLE_AI_BASE_URL',
  'GEMINI_BASE_URL',
  'GEMINI_API_BASE_URL',
  'CODEX_BASE_URL',
  'CLAUDE_BASE_URL',
  'CLAUDE_CODE_BASE_URL',
  'OPENCODE_BASE_URL',
  'OPENROUTER_BASE_URL',
]);

const MODEL_ENDPOINT_NAME_RE = /(?:OPENAI|ANTHROPIC|GOOGLE|GEMINI|CODEX|CLAUDE|OPENCODE|OPENROUTER|LLM|MODEL).*(?:BASE_URL|API_BASE|API_URL|ENDPOINT)$/u;
const OFFICIAL_ENDPOINT_SUFFIXES = Object.freeze([
  'api.openai.com',
  'openai.com',
  'api.anthropic.com',
  'anthropic.com',
  'generativelanguage.googleapis.com',
  'googleapis.com',
]);

export function resolvePrivacyConfigPath(env) {
  const explicit = String(env.REXCIL_PRIVACY_CONFIG || '').trim();
  if (explicit) {
    return path.resolve(expandHome(explicit, env));
  }

  const home = env.HOME || env.USERPROFILE || '';
  const rexcilHomeRaw = String(env.REXCIL_HOME || '').trim();
  const rexcilHome = rexcilHomeRaw
    ? path.resolve(expandHome(rexcilHomeRaw, env))
    : path.join(home, '.rexcil');
  return path.join(rexcilHome, 'privacy-guard.json');
}

export function summarizePrivacyGuard(env) {
  const configPath = resolvePrivacyConfigPath(env);
  if (!existsSync(configPath)) {
    return {
      enabled: true,
      mode: 'regex',
      strict: true,
      label: 'enabled (regex, strict defaults; config missing)',
      severity: 'ok',
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    return {
      enabled: false,
      mode: 'unknown',
      strict: false,
      label: 'unknown (invalid config; run aios privacy status)',
      severity: 'warn',
    };
  }

  const enforcement = parsed && typeof parsed === 'object' && parsed.enforcement && typeof parsed.enforcement === 'object'
    ? parsed.enforcement
    : {};
  const enabled = parsed?.enabled !== false;
  const mode = typeof parsed?.mode === 'string' && parsed.mode.trim() ? parsed.mode.trim() : 'regex';
  const strict = Boolean(
    enforcement.requiredForSensitiveFiles !== false
      && enforcement.blockWhenGuardDisabled !== false
      && enforcement.detectSensitiveContent !== false
  );
  const strictText = strict ? ', strict' : ', relaxed';
  return {
    enabled,
    mode,
    strict,
    label: `${enabled ? 'enabled' : 'disabled'} (${mode}${strictText})`,
    severity: enabled && strict ? 'ok' : 'warn',
  };
}

export function isEndpointEnvName(name) {
  return KNOWN_ENDPOINT_ENV_NAMES.has(name) || MODEL_ENDPOINT_NAME_RE.test(name);
}

export function parseEndpointHost(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  try {
    const normalized = /^[a-z][a-z0-9+.-]*:\/\//iu.test(raw) ? raw : `https://${raw}`;
    const url = new URL(normalized);
    return url.hostname || '';
  } catch {
    return '';
  }
}

export function isLocalEndpointHost(host) {
  const normalized = String(host || '').trim().toLowerCase();
  return normalized === 'localhost'
    || normalized === '::1'
    || normalized === '[::1]'
    || normalized === '0.0.0.0'
    || normalized.startsWith('127.')
    || normalized.endsWith('.local');
}

// 纯函数：按域名后缀判断官方端点，避免误把 relay.exampleopenai.com 当官方域名。
export function matchesHostSuffix(host, suffix) {
  return host === suffix || host.endsWith(`.${suffix}`);
}

export function isOfficialEndpointHost(host) {
  const normalized = String(host || '').trim().toLowerCase();
  return OFFICIAL_ENDPOINT_SUFFIXES.some((suffix) => matchesHostSuffix(normalized, suffix));
}

export function summarizeModelEndpoints(env) {
  const endpoints = Object.entries(env)
    .filter(([name, value]) => isEndpointEnvName(name) && String(value || '').trim())
    .map(([name, value]) => ({ name, host: parseEndpointHost(value) }))
    .filter((item) => item.host);

  const custom = endpoints.filter((item) => {
    const host = item.host.toLowerCase();
    return !isLocalEndpointHost(host) && !isOfficialEndpointHost(host);
  });

  if (custom.length > 0) {
    const preview = custom
      .slice(0, 2)
      .map((item) => `${item.name} -> ${item.host}`)
      .join(', ');
    const suffix = custom.length > 2 ? ` (+${custom.length - 2} more)` : '';
    return {
      severity: 'warn',
      label: `custom relay endpoint: ${preview}${suffix}`,
    };
  }

  if (endpoints.length > 0) {
    return {
      severity: 'ok',
      label: 'official/local endpoint only',
    };
  }

  return {
    severity: 'ok',
    label: 'default provider endpoint (no override detected)',
  };
}

function shouldUsePrivacyColor(env) {
  if ('NO_COLOR' in env) return false;
  return parseBoolEnv(env.CTXDB_PRIVACY_COLOR, true);
}

function ansi(env, code, value) {
  if (!shouldUsePrivacyColor(env)) return String(value);
  return `\u001b[${code}m${value}\u001b[0m`;
}

function stripAnsi(value) {
  return String(value).replace(/\u001b\[[0-9;]*m/gu, '');
}

function renderPrivacyPanel(lines, env) {
  const width = Math.max(...lines.map((line) => stripAnsi(line).length), 24);
  const border = `+${'-'.repeat(width + 2)}+`;
  const rendered = [ansi(env, '36', border)];
  for (const line of lines) {
    const padding = ' '.repeat(Math.max(0, width - stripAnsi(line).length));
    rendered.push(`${ansi(env, '36', '|')} ${line}${padding} ${ansi(env, '36', '|')}`);
  }
  rendered.push(ansi(env, '36', border));
  return `${rendered.join('\n')}\n`;
}

export function buildPrivacyBanner({ command, agent, shouldWrap, env }) {
  const guard = summarizePrivacyGuard(env);
  const endpoints = summarizeModelEndpoints(env);
  const guardText = ansi(env, guard.severity === 'ok' ? '32' : '33', guard.label);
  const endpointText = ansi(env, endpoints.severity === 'ok' ? '32' : '33', endpoints.label);
  const contextText = shouldWrap ? ansi(env, '32', 'wrapped') : ansi(env, '33', 'passthrough');

  return renderPrivacyPanel([
    ansi(env, '1;36', 'AIOS Privacy Shield'),
    `Agent: ${agent} (${command}) | ContextDB: ${contextText}`,
    `Privacy Guard: ${guardText}`,
    `Relay check: ${endpointText}`,
    'Secret handling: sensitive files -> aios privacy read --file <path>',
    'Model compliance: advisory only; deterministic AIOS gates verify enforcement',
  ], env);
}

export function shouldPrintPrivacyBanner(env, interactive) {
  if (!interactive) return false;
  return parseBoolEnv(env.CTXDB_PRIVACY_BANNER, true);
}
