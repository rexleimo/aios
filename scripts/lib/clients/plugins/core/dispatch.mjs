// core/dispatch.mjs — 统一 contribution 分派（深层模块，纯函数）。
// 输入：已归一化的 manifests + adapters（满足 ports.mjs 的函数）。
// 输出：按类别分组的"意图"，由外层 adapter 消费。领域层不碰 fs / 网络 / 框架。
// 纪律：用 ts-pattern 的 match 链式分派替代 switch/if-else 级联；用 attempt 替代 try-catch。
import { match } from 'ts-pattern';

import { CONTRIBUTION_KINDS } from './ports.mjs';
import { projectPanelContributions, projectIntegrationIntents } from './contributions.mjs';
import { attempt, errorOf } from './result.mjs';

const hasContribution = (c, kind) => match(kind)
  .with('onUsage', () => Array.isArray(c.onUsage) && c.onUsage.length > 0)
  .otherwise(() => Array.isArray(c[kind]) && c[kind].length > 0);

/** 按 kind 分派一条 contribution，返回对累积结果的变更函数（纯）。 */
const applyContribution = ({ kind, ctx }) => match(kind)
  .with('panels', () => () => {
    ctx.result.panelViews = projectPanelContributions(ctx.result.panelViews, ctx.c.panels, ctx.id);
  })
  .with('integrations', () => () => {
    const validator = ctx.adapters.validateIntegration;
    if (typeof validator !== 'function') {
      ctx.result.integrationErrors.push({ id: ctx.id, error: 'no validateIntegration adapter' });
      return;
    }
    const projected = projectIntegrationIntents(ctx.c.integrations, validator, ctx.id);
    ctx.result.integrationIntents.push(...projected.entries);
    ctx.result.integrationErrors.push(...projected.errors);
  })
  .with('providers', () => () => {
    for (const p of ctx.c.providers) ctx.result.providerSources.push({ plugin: ctx.id, dir: ctx.dir, ...p });
  })
  .with('actions', () => () => {
    for (const a of ctx.c.actions) ctx.result.actions.push({ plugin: ctx.id, ...a });
  })
  .with('middleware', () => () => {
    for (const m of ctx.c.middleware) ctx.result.middlewareHooks.push({ id: ctx.id, source: String(m.source || m.code || ''), hook: String(m.hook || 'onRequest') });
  })
  .with('clients', () => () => {
    for (const k of ctx.c.clients) ctx.result.clientKinds.push({ plugin: ctx.id, ...k });
  })
  .with('onUsage', () => () => {
    ctx.result.usageCollectors.push(ctx.id);
  })
  .otherwise(() => () => {});

/**
 * @param {{manifests:Array<{id:string,manifest:object,dir?:string}>, adapters:object, baseViews?:object, enabledIds?:Set<string>}}
 */
export function dispatchContributions({ manifests = [], adapters = {}, baseViews = {}, enabledIds = null } = {}) {
  const result = {
    panelViews: { ...baseViews },
    integrationIntents: [], integrationErrors: [],
    providerSources: [], actions: [], clientKinds: [], middlewareHooks: [], usageCollectors: [],
    loaded: [], failed: [],
  };

  for (const { id, manifest, dir = '' } of manifests) {
    if (enabledIds && !enabledIds.has(id)) continue;
    result.loaded.push(id);
    const c = manifest?.contributes || {};
    for (const kind of CONTRIBUTION_KINDS) {
      if (!hasContribution(c, kind)) continue;
      const ctx = { id, dir, c, adapters, result };
      const apply = attempt(() => applyContribution({ kind, ctx })());
      const failed = errorOf(apply);
      if (failed) result.failed.push({ id, kind, error: failed });
    }
  }
  return result;
}
