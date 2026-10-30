import { getClientHomes } from '../../../foundation/platform/paths.mjs';

import { ALL_SCOPES, INSTALL_MODES } from './constants.mjs';

// 纯函数：统一技能作用域，供 install/uninstall/doctor 共用。
export function normalizeScope(scope = 'global') {
  const value = String(scope || 'global').trim().toLowerCase();
  if (!ALL_SCOPES.includes(value)) {
    throw new Error(`Unsupported skills scope: ${value}`);
  }
  return value;
}

// 纯函数：统一安装模式，避免各命令重复校验 copy/link。
export function normalizeInstallMode(installMode = 'copy') {
  const value = String(installMode || 'copy').trim().toLowerCase();
  if (!INSTALL_MODES.includes(value)) {
    throw new Error(`Unsupported install mode: ${value}`);
  }
  return value;
}

// Explicit compatibility names for renamed catalog skills; no text/intent inference.
export const SKILL_NAME_ALIASES = Object.freeze({
  'aios-long-running-harness': 'aios-harness',
});

// 纯函数：规整用户选择的技能列表，去空值并保持顺序去重。
export function normalizeSelectedSkills(selectedSkills = []) {
  const values = Array.isArray(selectedSkills)
    ? selectedSkills
    : String(selectedSkills || '').split(',');
  return [...new Set(values
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((name) => Object.hasOwn(SKILL_NAME_ALIASES, name) ? SKILL_NAME_ALIASES[name] : name))];
}

export function resolveHomeMap(homeMap = {}, env = process.env) {
  return { ...getClientHomes(env), ...homeMap };
}
