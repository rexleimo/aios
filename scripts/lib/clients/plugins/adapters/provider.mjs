// adapters/provider.mjs — provider 贡献的加载适配器（外层）。
// 从 core dispatch 的 providerSources 加载插件脚本，经 provider-host RPC 取真实数据。
// 纪律：零 try-catch——attemptAsync + ts-pattern match。
import path from 'node:path';
import { match } from 'ts-pattern';

import { callProviderHost } from '../runtime/provider-host.mjs';
import { attempt, attemptAsync, err, ok } from '../core/result.mjs';

/** 解析插件 provider 脚本绝对路径，返回 Result。 */
export function resolveProviderEntry({ rootDir, plugin, dir, entry }) {
  const raw = String(entry || '').trim();
  if (!raw) return err('provider entry is required');
  if (path.isAbsolute(raw)) return ok(raw);
  if (dir) return ok(path.isAbsolute(dir) ? path.join(dir, raw) : path.join(rootDir, dir, raw));
  return ok(path.join(rootDir, plugin, raw));
}

/** 从插件 provider 脚本取真实数据。 */
export async function queryPluginProviders({ rootDir, sources = [], method = 'models', timeoutMs = 5000 } = {}) {
  const out = [];
  for (const source of sources) {
    const entryResult = resolveProviderEntry({ rootDir, plugin: source.plugin, dir: source.dir, entry: source.entry });
    if (!entryResult.ok) {
      out.push({ plugin: source.plugin, ok: false, error: entryResult.error });
      continue;
    }
    const response = await attemptAsync(() => callProviderHost({ entry: entryResult.value, method, params: source.params || {}, timeoutMs }));
    match(response)
      .with({ ok: true }, ({ value }) => out.push({ plugin: source.plugin, ok: value.ok !== false, data: value.data ?? value }))
      .with({ ok: false }, ({ error }) => out.push({ plugin: source.plugin, ok: false, error }))
      .exhaustive();
  }
  return out;
}
