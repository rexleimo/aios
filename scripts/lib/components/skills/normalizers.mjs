import { getClientHomes } from '../../platform/paths.mjs';

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

// 纯函数：规整用户选择的技能列表，去空值并保持顺序去重。
export function normalizeSelectedSkills(selectedSkills = []) {
  if (Array.isArray(selectedSkills)) {
    return [...new Set(selectedSkills.map((item) => String(item || '').trim()).filter(Boolean))];
  }
  return [...new Set(String(selectedSkills || '').split(',').map((item) => item.trim()).filter(Boolean))];
}

export function resolveHomeMap(homeMap = {}, env = process.env) {
  return { ...getClientHomes(env), ...homeMap };
}
