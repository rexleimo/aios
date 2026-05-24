/* 中文注释：组件架构规则入口只聚合分组，具体规则按组件域拆到 components/*。 */
import { BROWSER_CODEMAP_COMPONENT_RULES } from './components/browser-codemap.mjs';
import { CLI_COMPONENT_RULES } from './components/cli.mjs';
import { HARNESS_COMPONENT_RULES } from './components/harness.mjs';
import { HUD_COMPONENT_RULES } from './components/hud.mjs';
import { MODEL_ROUTER_ARCHITECTURE_RULES } from './components/model-router.mjs';
import { NATIVE_PLATFORM_COMPONENT_RULES } from './components/native-platform.mjs';

export const COMPONENT_ARCHITECTURE_RULES = Object.freeze([
  ...MODEL_ROUTER_ARCHITECTURE_RULES,
  ...BROWSER_CODEMAP_COMPONENT_RULES,
  ...CLI_COMPONENT_RULES,
  ...NATIVE_PLATFORM_COMPONENT_RULES,
  ...HARNESS_COMPONENT_RULES,
  ...HUD_COMPONENT_RULES,
]);
