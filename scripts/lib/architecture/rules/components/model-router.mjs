/* 中文注释：模型路由 facade 规则独立维护，避免组件治理入口继续膨胀。 */
export const MODEL_ROUTER_ARCHITECTURE_RULES = Object.freeze([
  Object.freeze({
    id: 'model-router-facade',
    label: 'Model Router Facade',
    path: 'scripts/lib/model-router.mjs',
    maxLines: 120,
    requiredModules: Object.freeze([
      'scripts/lib/model-router/shared.mjs',
      'scripts/lib/model-router/registry.mjs',
      'scripts/lib/model-router/profile.mjs',
      'scripts/lib/model-router/signals.mjs',
      'scripts/lib/model-router/selection.mjs',
      'scripts/lib/model-router/client-cli.mjs',
      'scripts/lib/model-router/routing.mjs',
      'scripts/lib/model-router/reporting.mjs',
      'scripts/lib/model-router/history.mjs',
      'scripts/lib/model-router/command.mjs',
    ]),
  }),
]);
