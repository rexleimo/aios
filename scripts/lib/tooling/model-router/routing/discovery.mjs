// 中文注释：magpie 式「问 vendor 供应哪些模型」——按协议拉每个 provider 的模型列表端点，动态发现模型。
// 实测 relay：claude /claude/v1/models（{data:[{id}]}，68 个）、gemini /gemini/v1beta/models（{models:[{name}]}，10 个）
// 返回 200；openai /openai/v1/models 404 → fail-soft 跳过该协议，不炸。纯解析 + 可注入 fetch，密钥只进请求头绝不记录。
import { normalizeId } from '../entry/shared.mjs';
import { loadProviders, ProviderConfigError, readyProviderAccounts, resolveProviderApiKey, resolveProviderModelsEndpoint, validateProvider } from './providers.mjs';

// 纯函数：从模型列表响应体解析模型 id。openai/claude 用 {data:[{id}]}；gemini 用 {models:[{name:"models/xxx"}]}。
export function parseModelList(protocol, body) {
  if (protocol === 'gemini') {
    const list = Array.isArray(body?.models) ? body.models : [];
    return list.map((item) => String(item?.name || '').replace(/^models\//u, '')).filter(Boolean);
  }
  const list = Array.isArray(body?.data) ? body.data : [];
  return list.map((item) => item?.id).filter((id) => typeof id === 'string' && id);
}

// 发现请求头：同一密钥按各协议惯例都挂上（relay 认 Bearer/x-api-key，原生 gemini 认 x-goog-api-key）。
// Explicit authMode=none (for example local Ollama) sends no authentication headers.
function discoveryHeaders(apiKey) {
  if (!apiKey) return {};
  return {
    authorization: `Bearer ${apiKey}`,
    'x-api-key': apiKey,
    'x-goog-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
}

// 发现一个 provider 的模型：逐协议拉列表，fail-soft（某协议 404/超时只记 error 不炸），按 id 去重并合并协议。
export async function discoverProviderModels(input, options = {}) {
  const { env = process.env, fetchImpl = fetch, timeoutMs = 15_000 } = options;
  const validated = validateProvider(input);
  if (!validated.ok) throw new ProviderConfigError(validated.errors, 'INVALID_PROVIDER_CONFIG');
  const provider = validated.provider;
  if (!provider.enabled) {
    return { provider: provider.id, models: [], errors: [{ provider: provider.id, code: 'PROVIDER_DISABLED' }] };
  }
  const accountId = readyProviderAccounts(provider, env)[0];
  if (!accountId) {
    return { provider: provider.id, models: [], errors: [{ provider: provider.id, code: 'MISSING_CREDENTIALS' }] };
  }
  const apiKey = resolveProviderApiKey(provider, env, accountId);
  const headers = discoveryHeaders(apiKey);
  const byId = new Map();
  const errors = [];
  for (const protocol of provider?.protocols || []) {
    const url = resolveProviderModelsEndpoint(provider, protocol);
    if (!url) continue;
    try {
      const res = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (!res?.ok) {
        errors.push({ provider: provider.id, protocol, status: res?.status ?? 0 });
        continue;
      }
      const body = await res.json();
      for (const id of parseModelList(protocol, body)) {
        const existing = byId.get(id);
        if (existing) {
          if (!existing.protocols.includes(protocol)) existing.protocols.push(protocol);
        } else {
          byId.set(id, { id, upstreamModel: id, protocols: [protocol], provider: provider.id, source: 'discovered' });
        }
      }
    } catch (error) {
      errors.push({ provider: provider.id, protocol, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { provider: provider.id, models: keyedDiscoveredModels({}, [...byId.values()]), errors };
}

function modelIdentity(model, id = model.id) {
  return JSON.stringify([normalizeId(model.provider), model.upstreamModel || id]);
}

// Reserve existing and unqualified keys first; qualification must never overwrite another channel
// or a curated/native entry. Sorting makes suffix allocation independent of discovery order.
function keyedDiscoveredModels(registry, discoveredModels) {
  const byIdentity = new Map();
  for (const model of discoveredModels || []) {
    const provider = normalizeId(model?.provider);
    const upstreamModel = model?.upstreamModel || model?.id;
    if (!provider || typeof upstreamModel !== 'string' || !normalizeId(upstreamModel)) continue;
    const record = { ...model, provider, upstreamModel, protocols: [...new Set(model.protocols || [])] };
    const identity = modelIdentity(record);
    const existing = byIdentity.get(identity);
    if (existing) {
      existing.protocols = [...new Set([...existing.protocols, ...record.protocols])];
    } else {
      byIdentity.set(identity, record);
    }
  }
  const records = [...byIdentity.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const existingIdentities = new Map();
  const occupied = new Set();
  for (const [id, model] of Object.entries(registry?.models || {}).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    occupied.add(normalizeId(id));
    if ((model?.source === 'custom' || model?.source === 'discovered') && normalizeId(model.provider)) {
      const identity = modelIdentity(model, id);
      if (!existingIdentities.has(identity)) existingIdentities.set(identity, id);
    }
  }
  const baseCounts = new Map();
  for (const [, model] of records) {
    const base = normalizeId(model.upstreamModel);
    baseCounts.set(base, (baseCounts.get(base) || 0) + 1);
  }
  const assigned = new Map();
  for (const [identity, model] of records) {
    const base = normalizeId(model.upstreamModel);
    if (existingIdentities.has(identity)) {
      assigned.set(identity, existingIdentities.get(identity));
    } else if (baseCounts.get(base) === 1 && !occupied.has(base)) {
      assigned.set(identity, base);
      occupied.add(base);
    }
  }
  for (const [identity, model] of records) {
    if (assigned.has(identity)) continue;
    const qualified = `${model.provider}::${normalizeId(model.upstreamModel)}`;
    let id = qualified;
    let suffix = 2;
    while (occupied.has(id)) id = `${qualified}::${suffix++}`;
    assigned.set(identity, id);
    occupied.add(id);
  }
  return records.map(([identity, model]) => ({ ...model, id: assigned.get(identity) }));
}

// 发现注册表里所有 provider 的模型，合并成一份「发现目录」（不含 curated 画像，合并/持久化在上层）。
export async function discoverAllModels(registry, options = {}) {
  const providers = loadProviders(registry);
  const results = [];
  for (const provider of Object.values(providers)) {
    results.push(await discoverProviderModels(provider, options));
  }
  const models = keyedDiscoveredModels(registry, results.flatMap((result) => result.models));
  const byIdentity = new Map(models.map((model) => [modelIdentity(model), model]));
  return {
    models,
    providers: results.map((result) => ({
      ...result,
      models: result.models.map((model) => byIdentity.get(modelIdentity(model))),
    })),
  };
}

// Only enrich the same explicit channel/model identity. Native metadata and routing choices stay intact.
export function mergeDiscoveredModels(registry, discoveredModels) {
  const next = structuredClone(registry || {});
  next.models = { ...(next.models || {}) };
  let added = 0;
  let enriched = 0;
  for (const model of keyedDiscoveredModels(next, discoveredModels)) {
    const { id, ...metadata } = model;
    const protocols = [...new Set(model.protocols || [])];
    const existing = Object.hasOwn(next.models, id) ? next.models[id] : null;
    if (!existing) {
      const entry = {
        label: model.upstreamModel,
        description: '动态发现的模型（能力画像待补）',
        cost: 'unknown',
        speed: 'unknown',
        contextWindow: 'unknown',
        ...metadata,
        protocols,
        source: model.source || 'discovered',
      };
      Object.defineProperty(next.models, id, { value: entry, enumerable: true, writable: true, configurable: true });
      added += 1;
    } else {
      const merged = [...new Set([...(existing.protocols || []), ...protocols])];
      if (merged.length !== (existing.protocols || []).length) {
        next.models[id] = { ...existing, protocols: merged, upstreamModel: model.upstreamModel };
        enriched += 1;
      } else if (existing.upstreamModel !== model.upstreamModel) {
        next.models[id] = { ...existing, upstreamModel: model.upstreamModel };
        enriched += 1;
      }
    }
  }
  return { registry: next, added, enriched };
}
