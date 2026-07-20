/* 中文注释：组件层 barrel，集中导出各子域的 doctor/install/uninstall 公开能力。 */
export {
  installOrchestratorAgents,
  uninstallOrchestratorAgents,
} from './agents.mjs';

export {
  doctorBrowserMcp,
  installBrowserMcp,
  migrateBrowserMcpConfig,
} from './browser.mjs';

export { doctorCodemap } from './codemap.mjs';

export {
  doctorNativeEnhancements,
  installNativeEnhancements,
  uninstallNativeEnhancements,
  updateNativeEnhancements,
} from './native.mjs';

export {
  doctorContextDbShell,
  installContextDbShell,
  installPrivacyGuard,
  uninstallContextDbShell,
} from './shell.mjs';

export {
  doctorContextDbSkills,
  installContextDbSkills,
  uninstallContextDbSkills,
} from './skills.mjs';

export { PRIMARY_BROWSER_ALIAS, SHELL_ALIAS } from './browser/constants.mjs';
