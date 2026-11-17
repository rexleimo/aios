import { MODEL_PROTOCOLS } from './protocols.mjs';

export const PROVIDER_ENV_REF = /^env:([A-Za-z_][A-Za-z0-9_]*)$/u;
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;
const UNSAFE_HEADER_VALUE = /[^\u0020-\u007e]/u;
const FORBIDDEN_HEADERS = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te',
  'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length',
  'cookie', 'cookie2', 'set-cookie', 'set-cookie2', 'http2-settings',
  'forwarded', 'via', 'x-real-ip', 'origin', 'referer',
  'content-type', 'accept', 'accept-encoding', 'content-encoding', 'expect',
]);
const AUTH_PROTOCOLS = {
  authorization: ['openai-chat', 'openai-response', 'claude'],
  'x-api-key': ['claude'],
  'x-goog-api-key': ['gemini'],
  'api-key': ['openai-chat', 'openai-response'],
};

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Validate before trimming endpoint suffixes: a pasted URL must not hide credentials.
export function normalizeProviderUrl(value) {
  if (typeof value !== 'string') throw new Error('URL must be a nonempty http(s) URL');
  const raw = value.trim();
  if (!/^https?:\/\/[^/?#]/iu.test(raw) || /[\u0000-\u001f\u007f-\u009f]/u.test(value)
    || /[\s\\?#]/u.test(raw) || /%(?![\da-f]{2})/iu.test(raw)) {
    throw new Error('URL must be http(s), without userinfo, query, fragment or malformed characters');
  }
  let url;
  try { url = new URL(raw); } catch { throw new Error('URL must be a valid http(s) URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password
    || raw.slice(raw.indexOf('://') + 3).split('/')[0].includes('@')) {
    throw new Error('URL must be http(s) without userinfo');
  }
  return raw.replace(/\/+$/u, '');
}

function sdkBase(value, protocol) {
  const url = new URL(normalizeProviderUrl(value));
  let path = url.pathname.replace(/\/+$/u, '');
  path = path.replace(/\/(?:chat\/completions|responses|messages)$/u, '');
  path = path.replace(/\/models\/.+:(?:generateContent|streamGenerateContent)$/u, '');
  path = path.replace(/\/models(?:\/[^/]+)?$/u, '');
  if (!path && protocol !== 'claude') path = protocol === 'gemini' ? '/v1beta' : '/v1';
  return url.origin + path;
}

export function normalizeProtocolBaseUrls(value, protocols = []) {
  if (!record(value)) throw new Error('protocolBaseUrls must be an object');
  const entries = Object.entries(value).map(([protocol, base]) => {
    if (!MODEL_PROTOCOLS.includes(protocol)) throw new Error('protocolBaseUrls keys must be canonical protocols');
    try { return [protocol, sdkBase(base, protocol)]; }
    catch (error) { throw new Error(`protocolBaseUrls.${protocol}: ${error.message}`); }
  });
  const bases = Object.fromEntries(entries);
  for (const protocol of protocols) {
    if (!Object.hasOwn(bases, protocol)) throw new Error(`protocolBaseUrls.${protocol} required for configured protocol`);
  }
  return bases;
}

export function protocolBaseEndpoint(base, protocol, models = false) {
  if (protocol === 'claude') return `${base}${base.endsWith('/v1') ? '' : '/v1'}/${models ? 'models' : 'messages'}`;
  if (models || protocol === 'gemini') return `${base}/models`;
  return `${base}/${protocol === 'openai-chat' ? 'chat/completions' : 'responses'}`;
}

function authHeader(name) {
  return /auth|key|token|secret|credential|signature/iu.test(name);
}

export function normalizeProviderHeaders(value, authMode) {
  if (!record(value)) throw new Error('headers must be an object of header strings or env:VAR refs');
  const headers = {};
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = rawName.toLowerCase();
    if (!HEADER_NAME.test(name) || FORBIDDEN_HEADERS.has(name) || /^(?:proxy-|sec-|x-forwarded-)/u.test(name)) {
      throw new Error('headers contains an invalid or forbidden header name');
    }
    if (Object.hasOwn(headers, name)) throw new Error('headers contains duplicate case-insensitive names');
    if (typeof rawValue !== 'string' || UNSAFE_HEADER_VALUE.test(rawValue)) throw new Error(`headers.${name} must be a safe header string`);
    const ref = PROVIDER_ENV_REF.test(rawValue);
    if (/^env:/iu.test(rawValue.trim()) && !ref) throw new Error(`headers.${name} must use a valid env:VAR ref`);
    if (authMode === 'none' && ref) throw new Error(`headers.${name}: authMode none forbids env-referenced headers`);
    if (authHeader(name) && (!ref || authMode === 'none')) {
      throw new Error(`headers.${name}: authentication requires an env:VAR ref and authMode required`);
    }
    Object.defineProperty(headers, name, { value: rawValue, enumerable: true });
  }
  return headers;
}

export function resolveCustomProviderHeaders(provider, protocol, env) {
  const configured = Object.hasOwn(provider, 'headers') ? normalizeProviderHeaders(provider.headers, provider.authMode) : {};
  const headers = {};
  for (const [name, value] of Object.entries(configured)) {
    const match = PROVIDER_ENV_REF.exec(value);
    const resolved = match ? (Object.hasOwn(env || {}, match[1]) ? env[match[1]] : undefined) : value;
    if (typeof resolved !== 'string' || (match && !resolved.trim()) || UNSAFE_HEADER_VALUE.test(resolved)) {
      throw new Error(`headers.${name}: referenced environment value is missing or invalid`);
    }
    // Known credential headers belong to their API, even in a multi-host provider.
    if (Object.hasOwn(AUTH_PROTOCOLS, name) && !AUTH_PROTOCOLS[name].includes(protocol)) continue;
    Object.defineProperty(headers, name, { value: resolved, enumerable: true });
  }
  return headers;
}

export function validateProviderAuthHeader(value) {
  if (!['x-api-key', 'bearer', 'both'].includes(value)) throw new Error('authHeader must be x-api-key, bearer or both');
  return value;
}

export function validateProviderCredential(value) {
  if (typeof value !== 'string' || !value.trim() || UNSAFE_HEADER_VALUE.test(value)) {
    throw new Error('provider credential is missing or invalid');
  }
}
