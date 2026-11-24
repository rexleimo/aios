// core/contributions.mjs — 纯 contribution 投影（领域层，不碰 fs / 不依赖其他领域）。
// 只做数据变换；集成硬门由外层 adapter 通过 validator 注入（依赖倒置）。
import { match } from 'ts-pattern';

import { attempt } from './result.mjs';

/**
 * panel 贡献 → 导航视图数组。
 * @param {object} views 现有视图表
 * @param {Array} panels contributes.panels
 * @param {string} source 插件 id
 */
export function projectPanelContributions(views, panels, source = '') {
  if (!Array.isArray(panels)) return views;
  const out = { ...views };
  for (const panel of panels) {
    if (!panel || typeof panel !== 'object') continue;
    const id = String(panel.id || '').trim();
    if (!id || Object.hasOwn(out, id) || !String(panel.href || '').startsWith('/')) continue;
    const ui = panel.ui?.kind === 'html'
      ? Object.freeze({
          kind: 'html',
          ...(typeof panel.ui.html === 'string' ? { html: panel.ui.html } : {}),
          ...(typeof panel.ui.error === 'string' ? { error: panel.ui.error } : {}),
        })
      : undefined;
    out[`plugin:${id}`] = Object.freeze({
      id: `plugin:${id}`,
      href: String(panel.href),
      label: String(panel.label || id),
      title: String(panel.title || panel.label || id),
      source,
      ...(ui ? { ui } : {}),
    });
  }
  return out;
}

/**
 * integration 贡献 → 待写盘条目。validator(id,raw) 由外层注入（真实 sha256/commit 硬门）。
 * 返回 {entries, errors}，不直接写盘。来源记录在独立结果里，不污染条目（修 __origin）。
 * @param {Array} declared contributes.integrations
 * @param {(id:string,raw:object)=>object} validator 外层注入的校验归一函数
 * @param {string} source 插件 id
 */
export function projectIntegrationIntents(declared, validator, source = '') {
  const entries = [];
  const errors = [];
  if (!Array.isArray(declared)) return { entries, errors };
  for (const raw of declared) {
    const id = String(raw?.id || '').trim();
    if (!id) { errors.push({ id: '', error: 'integration id is required' }); continue; }
    const validated = attempt(() => validator(id, raw)); // 外层硬门：缺 sha256/commit 在此失败
    match(validated)
      .with({ ok: true }, ({ value }) => entries.push({ id, normalized: value, source }))
      .with({ ok: false }, ({ error }) => errors.push({ id, error }))
      .exhaustive();
  }
  return { entries, errors };
}
