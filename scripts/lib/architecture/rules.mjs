import { COMPONENT_ARCHITECTURE_RULES } from './rules/components.mjs';
import { LIFECYCLE_ARCHITECTURE_RULES } from './rules/lifecycle.mjs';
import { RL_ARCHITECTURE_RULES } from './rules/rl.mjs';

export const DEFAULT_ARCHITECTURE_RULES = Object.freeze([
  ...COMPONENT_ARCHITECTURE_RULES,
  ...LIFECYCLE_ARCHITECTURE_RULES,
  ...RL_ARCHITECTURE_RULES,
]);
