// adapters/assemble.mjs — 把已安装插件装配成网关可注入的 hook。
// 纪律：零 try-catch——ts-pattern match 处理 Result，坏插件 fail-open。
import path from 'node:path';
import { match } from 'ts-pattern';

import { readPluginsRegistry } from '../core/registry.mjs';
import { loadPluginManifest } from '../loader.mjs';
import { runRequestChain } from '../runtime/middleware-chain.mjs';
import { aggregateUsageRow, emptyUsageAggregate } from '../runtime/usage.mjs';
import { errorOf } from '../core/result.mjs';

export function assemblePluginHooks({ rootDir, readFileImpl } = {}) {
  const installedResult = readPluginsRegistry({ rootDir, ...(readFileImpl ? { readFileImpl } : {}) });
  const installed = match(installedResult)
    .with({ ok: true }, ({ value }) => value)
    .with({ ok: false }, () => [])
    .exhaustive();
  const middlewareHooks = [];
  const usagePlugins = [];
  const loaded = [];
  const failed = errorOf(installedResult) ? [{ id: 'plugins.json', error: errorOf(installedResult) }] : [];
  for (const entry of installed) {
    const manifestResult = loadPluginManifest({ dir: requirePath(rootDir, entry.manifest), ...(readFileImpl ? { readFileImpl } : {}) });
    match(manifestResult)
      .with({ ok: true }, ({ value }) => {
        loaded.push(entry.id);
        for (const mw of value.contributes?.middleware || []) middlewareHooks.push({ id: entry.id, source: mw.source || mw.code || '', hook: mw.hook || 'onRequest' });
        if (Array.isArray(value.contributes?.onUsage) && value.contributes.onUsage.length) usagePlugins.push(entry.id);
      })
      .with({ ok: false }, ({ error }) => failed.push({ id: entry.id, error }))
      .exhaustive();
  }
  let usageAggregate = emptyUsageAggregate();
  const onRequest = (body, ctx) => runRequestChain({ body, ctx, hooks: middlewareHooks }).body;
  const onUsage = (row) => { usageAggregate = aggregateUsageRow(usageAggregate, row); return usageAggregate; };
  return { onRequest, onUsage, getUsage: () => usageAggregate, loaded: Object.freeze(loaded), failed: Object.freeze(failed) };
}

function requirePath(rootDir, manifest) {
  return path.isAbsolute(manifest) ? manifest : path.join(rootDir, manifest);
}
