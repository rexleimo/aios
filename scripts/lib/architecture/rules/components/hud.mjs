/* 中文注释：HUD state/render 规则独立维护，避免 UI 状态治理和组件治理混在一起。 */
export const HUD_COMPONENT_RULES = Object.freeze([
  Object.freeze({
    id: 'hud-state-facade',
    label: 'HUD State Facade',
    path: 'scripts/lib/hud/state.mjs',
    maxLines: 80,
    requiredModules: Object.freeze([
      'scripts/lib/hud/state/shared.mjs',
      'scripts/lib/hud/state/providers.mjs',
      'scripts/lib/hud/state/quality-gate.mjs',
      'scripts/lib/hud/state/dispatch-insights.mjs',
      'scripts/lib/hud/state/dispatch-progress.mjs',
      'scripts/lib/hud/state/io.mjs',
      'scripts/lib/hud/state/sessions.mjs',
      'scripts/lib/hud/state/artifacts.mjs',
      'scripts/lib/hud/state/commands.mjs',
      'scripts/lib/hud/state/compose.mjs',
    ]),
  }),
  Object.freeze({
    id: 'hud-state-artifacts-facade',
    label: 'HUD State Artifacts Facade',
    path: 'scripts/lib/hud/state/artifacts.mjs',
    maxLines: 80,
    requiredModules: Object.freeze([
      'scripts/lib/hud/state/artifacts/cache.mjs',
      'scripts/lib/hud/state/artifacts/dispatch.mjs',
      'scripts/lib/hud/state/artifacts/skill-candidates.mjs',
    ]),
  }),
  Object.freeze({
    id: 'hud-render-facade',
    label: 'HUD Render Facade',
    path: 'scripts/lib/hud/render.mjs',
    maxLines: 180,
    requiredModules: Object.freeze([
      'scripts/lib/hud/render/shared.mjs',
      'scripts/lib/hud/render/telemetry.mjs',
      'scripts/lib/hud/render/harness.mjs',
      'scripts/lib/hud/render/dispatch.mjs',
      'scripts/lib/hud/render/watchdog.mjs',
      'scripts/lib/hud/render/quality.mjs',
      'scripts/lib/hud/render/skill-candidate.mjs',
      'scripts/lib/hud/render/messages.mjs',
    ]),
  }),
]);
