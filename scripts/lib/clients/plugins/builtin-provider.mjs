// scripts/lib/clients/plugins/builtin-provider.mjs — 内置真实 provider 插件（边界2：接真实数据源）。
// 它从本机真实 model-registry.json 读 providers/models，通过子进程 RPC 暴露，
// 作为"provider 贡献类型接真实数据"的可运行范例（不依赖外部服务）。
import fs from 'node:fs';
import path from 'node:path';

import { readJson } from './core/result.mjs';

/**
 * 从真实 model registry 读取 provider 视图。
 * @param {{rootDir:string, registryRelPath?:string, readFileImpl?:Function}}
 */
export function readProviderView({ rootDir, registryRelPath = path.join('memory', 'specs', 'model-registry.json'), readFileImpl = fs.readFileSync } = {}) {
  const filePath = path.join(rootDir, registryRelPath);
  const read = readJson(filePath, { readFileImpl, empty: null });
  if (!read.ok) return { ok: false, error: read.error };
  const doc = read.value;
  const providers = Object.entries(doc?.providers || {}).map(([id, value]) => ({
    id,
    baseUrl: String(value?.baseUrl || ''),
    protocols: Array.isArray(value?.protocols) ? value.protocols : [],
    modelCount: Array.isArray(value?.models) ? value.models.length : 0,
  }));
  const models = Object.entries(doc?.models || {}).map(([id, value]) => ({
    id,
    provider: String(value?.provider || ''),
    upstreamModel: String(value?.upstreamModel || ''),
    enabled: value?.enabled !== false,
  }));
  return { ok: true, providers, models };
}

/**
 * 处理一次 provider RPC 请求（与 provider-host.callProviderHost 的 method 对应）。
 * method: 'models' → 模型列表；'providers' → provider 列表；'usage' → 诚实返回未记录（无真实额度账本）。
 */
export function handleProviderRpc({ rootDir, method, params = {}, readFileImpl } = {}) {
  if (method === 'models' || method === 'providers') {
    const view = readProviderView({ rootDir, readFileImpl });
    if (!view.ok) return { ok: false, error: view.error };
    return { ok: true, data: method === 'models' ? view.models : view.providers };
  }
  if (method === 'usage') {
    // 诚实：模型注册表没有额度账本，不编造用量/重置时间。
    return { ok: true, data: { recorded: false, note: 'no quota ledger in model registry' } };
  }
  return { ok: false, error: `unknown method ${method}` };
}
