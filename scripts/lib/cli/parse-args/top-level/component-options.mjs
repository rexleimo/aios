/* 中文注释：setup/update/uninstall 的组件安装参数独立处理，避免污染 workflow 命令。 */
import {
  normalizeClient,
  normalizeComponents,
  normalizeSkillInstallMode,
  normalizeSkillNames,
  normalizeSkillScope,
  normalizeWrapMode,
  takeValue,
} from '../shared.mjs';

export function applyComponentOption({ command, options, defaults, rest, index, arg }) {
  switch (arg) {
    case '--components':
      options.components = normalizeComponents(takeValue(rest, index, '--components'), defaults.components);
      return 1;
    case '--mode':
      options.wrapMode = normalizeWrapMode(takeValue(rest, index, '--mode'));
      return 1;
    case '--client':
      options.client = normalizeClient(takeValue(rest, index, '--client'));
      return 1;
    case '--scope':
      if (command !== 'setup' && command !== 'update' && command !== 'uninstall') return null;
      options.scope = normalizeSkillScope(takeValue(rest, index, '--scope'));
      return 1;
    case '--skills':
      if (command !== 'setup' && command !== 'update' && command !== 'uninstall') return null;
      options.skills = normalizeSkillNames(takeValue(rest, index, '--skills'));
      return 1;
    case '--install-mode':
      if (command !== 'setup' && command !== 'update') return null;
      options.installMode = normalizeSkillInstallMode(takeValue(rest, index, '--install-mode'));
      return 1;
    case '--skip-playwright-install':
      options.skipPlaywrightInstall = true;
      return 0;
    case '--with-playwright-install':
      options.withPlaywrightInstall = true;
      return 0;
    case '--skip-doctor':
      options.skipDoctor = true;
      return 0;
    case '--self-update':
      if (command !== 'update') return null;
      options.selfUpdate = true;
      return 0;
    case '--skip-self-update':
      if (command !== 'update') return null;
      options.selfUpdate = false;
      return 0;
    default:
      return null;
  }
}
