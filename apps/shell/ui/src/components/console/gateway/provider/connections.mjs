import { normalizeProtocol } from '../../../../lib/config/model-routing.mjs';
import { PROVIDER_PRESETS } from './presets.mjs';

export const API_CHOICES = [
  { value: 'openai-chat', label: 'OpenAI Chat Completions', suffix: '/chat/completions' },
  { value: 'openai-response', label: 'OpenAI Responses', suffix: '/responses' },
  { value: 'claude', label: 'Anthropic Messages', suffix: '/v1/messages' },
  { value: 'gemini', label: 'Google Gemini', suffix: '/models/{model}:generateContent' },
];

export function primaryProtocol(provider) {
  return normalizeProtocol(provider.baseProtocol) || normalizeProtocol(provider.protocols?.[0]) || 'openai-chat';
}

// This is a lossless presentation of old destinations, not a read-time migration.
/** @returns {Record<string, string>} */
export function connectionUrls(provider) {
  if (provider.protocolBaseUrls !== undefined) return { ...provider.protocolBaseUrls };
  const base = String(provider.baseUrl || '').trim().replace(/\/+$/u, '');
  return Object.fromEntries((provider.protocols || []).map(normalizeProtocol).filter(Boolean).map(protocol => {
    let url;
    if (provider.endpointStyle === 'standard') {
      url = protocol === 'gemini'
        ? base.endsWith('/v1beta') ? base : `${base.replace(/\/v1$/u, '')}/v1beta`
        : base.endsWith('/v1') ? base : `${base}/v1`;
    } else {
      url = `${base}/${protocol === 'claude' ? 'claude/v1' : protocol === 'gemini' ? 'gemini/v1beta' : 'openai/v1'}`;
    }
    return [protocol, url];
  }));
}

export function updateConnection(provider, protocol, value) {
  const urls = connectionUrls(provider);
  if (value.trim()) urls[protocol] = value;
  else delete urls[protocol];
  const order = [...new Set([...(provider.protocols || []).map(normalizeProtocol), protocol])];
  return {
    ...provider, protocolBaseUrls: urls, protocols: order.filter(key => urls[key]),
    ...(protocol === primaryProtocol(provider) ? { baseUrl: value } : {}),
  };
}

export function endpointFingerprint(provider) {
  const active = new Set((provider.protocols || []).map(normalizeProtocol));
  return JSON.stringify(Object.entries(connectionUrls(provider)).map(([protocol, url]) => [protocol, url.trim().replace(/\/+$/u, ''), active.has(protocol)]).sort());
}

export function selectPreset(provider, id, regionId) {
  const preset = PROVIDER_PRESETS.find(item => item.id === id) || PROVIDER_PRESETS[0];
  const region = preset.regions?.find(item => item.id === regionId) || preset.regions?.[0];
  const urls = { ...(region?.urls || preset.urls) };
  const baseProtocol = Object.keys(urls)[0] || 'openai-chat';
  return {
    ...provider, id: provider.id || (id === 'custom' ? '' : id), preset: id, presetRegion: region?.id || '',
    baseProtocol, protocolBaseUrls: urls, protocols: Object.keys(urls), baseUrl: urls[baseProtocol] || '',
    authMode: preset.noKey ? 'none' : 'required', authHeader: preset.authHeader || 'x-api-key',
  };
}
