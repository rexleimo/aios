// UI-safe connection schema; keep protocol and safety rules aligned with runtime providers.
import { ConfigError, isRecord } from './common.mjs';

export const ENV_REF = /^env:([A-Za-z_][A-Za-z0-9_]*)$/u;
const UNSAFE_CREDENTIAL = /[\u0000-\u001f\u007f-\u009f]/u;

// Inline API keys are allowed (pasted in the UI, stored in the local config). They
// travel as HTTP header values, so reject control characters but accept any printable
// string. env:VAR refs are validated separately and keep their stricter shape.
export function validateInlineCredential(value, path) {
  if (value === undefined || value === null || value === '') return;
  if (typeof value !== 'string' || !value.trim() || UNSAFE_CREDENTIAL.test(value)) {
    throw new ConfigError(`${path}: credential must be a nonempty printable string`, path);
  }
}

const PROTOCOLS = Object.freeze(['openai-chat', 'openai-response', 'claude', 'gemini']);
export const CONNECTION_FIELDS = Object.freeze(['protocolBaseUrls', 'baseProtocol', 'preset', 'presetRegion', 'authHeader', 'headers']);
const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;
const TRANSPORT_HEADERS = new Set([
  'host', 'content-length', 'cookie', 'set-cookie', 'proxy-authorization', 'proxy-authenticate', 'proxy-connection',
  'connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade',
  'content-type', 'accept', 'accept-encoding', 'content-encoding', 'expect',
  'cookie2', 'set-cookie2', 'http2-settings', 'forwarded', 'via', 'x-real-ip', 'origin', 'referer',
]);

// Keep protocol aliases in sync with providers/protocols.mjs without tracing scripts/lib into Next.
export function normalizeProtocol(value) {
  const token = String(value || '').trim().toLowerCase().replace(/[._]/g, '-');
  if (token.includes('anthropic') || token === 'claude' || token === 'messages') return 'claude';
  if (token.includes('responses') || token === 'openai-response' || token === 'responses-api') return 'openai-response';
  if (token.includes('gemini') || token === 'google') return 'gemini';
  if (token.includes('completion') || ['openai-chat', 'openai', 'compatible'].includes(token)) return 'openai-chat';
  return PROTOCOLS.includes(token) ? token : '';
}

export function declaredModelProtocols(model) {
  // An explicit protocols field wins even when malformed; never repair it via singular fallback.
  return model.protocols === undefined ? (model.protocol === undefined ? [] : [model.protocol]) : model.protocols;
}

function validateConnectionUrl(value, path) {
  const text = typeof value === 'string' ? value.trim() : '';
  let url;
  try { url = new URL(text); } catch { /* Report a field error without echoing potentially secret URL contents. */ }
  if (!url || !/^https?:\/\/[^/]/iu.test(text) || !url.hostname || url.username || url.password
    || /[\u0000-\u001f\u007f-\u009f]/u.test(value) || /[\s\\?#]/u.test(text) || /%(?![\da-f]{2})/iu.test(text) || text.split('/')[2].includes('@')) {
    throw new ConfigError(`${path}: URL must be valid http(s) without userinfo, query or fragment`, path);
  }
}

export function validateProviderConnection(provider, path) {
  validateConnectionUrl(provider.baseUrl, `${path}.baseUrl`);
  if (provider.protocolBaseUrls !== undefined) {
    const at = `${path}.protocolBaseUrls`;
    if (!isRecord(provider.protocolBaseUrls)) throw new ConfigError(`${at} must be an object`, at);
    for (const [protocol, url] of Object.entries(provider.protocolBaseUrls)) {
      if (!PROTOCOLS.includes(protocol)) throw new ConfigError(`${at}: keys must be canonical protocols`, at);
      validateConnectionUrl(url, `${at}.${protocol}`);
    }
    for (const protocol of new Set((provider.protocols || []).map(normalizeProtocol))) {
      if (!Object.hasOwn(provider.protocolBaseUrls, protocol)) throw new ConfigError(`${at}: endpoint required for ${protocol}`, at);
    }
  }
  if (provider.baseProtocol !== undefined && (typeof provider.baseProtocol !== 'string' || !normalizeProtocol(provider.baseProtocol))) {
    throw new ConfigError(`${path}.baseProtocol must be a supported protocol`, `${path}.baseProtocol`);
  }
  for (const field of ['preset', 'presetRegion']) {
    if (provider[field] !== undefined && (typeof provider[field] !== 'string' || !provider[field].trim() || /[\r\n]/u.test(provider[field]))) {
      throw new ConfigError(`${path}.${field} must be a nonempty string`, `${path}.${field}`);
    }
  }
  if (provider.authHeader !== undefined && !['x-api-key', 'bearer', 'both'].includes(provider.authHeader)) {
    throw new ConfigError(`${path}.authHeader must be x-api-key, bearer or both`, `${path}.authHeader`);
  }
  if (provider.headers === undefined) return;
  const at = `${path}.headers`;
  if (!isRecord(provider.headers)) throw new ConfigError(`${at} must be an object`, at);
  const seen = new Set();
  for (const [name, value] of Object.entries(provider.headers)) {
    const key = name.toLowerCase();
    if (!HEADER_NAME.test(name) || seen.has(key) || TRANSPORT_HEADERS.has(key) || /^(?:proxy-|sec-|x-forwarded-)/u.test(key)) throw new ConfigError(`${at}: invalid, duplicate or transport-controlled header name`, at);
    seen.add(key);
    if (typeof value !== 'string' || /[^\u0020-\u007e]/u.test(value)) throw new ConfigError(`${at}.${name}: value must be a safe ASCII header string`, at);
    const envRef = ENV_REF.test(value);
    const sensitive = /auth|key|token|secret|credential|signature/iu.test(key);
    if ((/^env:/iu.test(value.trim()) && !envRef) || (sensitive && !envRef)) {
      throw new ConfigError(`${at}.${name}: credentials must use env:VAR references`, at);
    }
    if (provider.authMode === 'none' && (sensitive || envRef)) throw new ConfigError(`${at}: authMode none forbids credential-bearing headers`, at);
  }
}
