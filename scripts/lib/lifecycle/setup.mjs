import {
  createDefaultSetupOptions,
  hasComponent,
  normalizeClient,
  normalizeComponents,
  normalizeSkillInstallMode,
  normalizeSkillNames,
  normalizeSkillScope,
  normalizeTokenProfile,
  normalizeWrapMode,
} from './options.mjs';
import { installOrchestratorAgents } from '../components/agents.mjs';
import { installBrowserMcp } from '../components/browser.mjs';
import { doctorBrowserMcp } from '../components/browser.mjs';
import { installNativeEnhancements } from '../components/native.mjs';
import { doctorContextDbShell, installContextDbShell, installPrivacyGuard } from '../components/shell.mjs';
import { doctorContextDbSkills, installContextDbSkills } from '../components/skills.mjs';
import { installRexClientProjections } from '../rex-harness/client-projection.mjs';
import { prepareRexWorkflowSurface } from '../workflows/rex-workflow-surface-lifecycle.mjs';

function isMissingBrowserMcpRuntimeError(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('repository-local browser MCP is unavailable')
    || message.includes('repository-local browser MCP launcher not found')
    || message.includes('repository-local browser MCP package not found');
}

function logBrowserMcpRuntimeWarning(io, error) {
  const message = error instanceof Error ? error.message : String(error || '');
  const [firstLine = message] = message.split(String.fromCharCode(10)).filter(Boolean);
  io.log(`[warn] browser component skipped: ${firstLine}`);
  io.log('[warn] Browser MCP uses the repository-local Node/Playwright runtime.');
  io.log('[warn] Install recovery: node scripts/aios.mjs internal browser install');
  io.log('[warn] Browser-only recovery: node scripts/aios.mjs internal browser doctor --fix');
}

export function normalizeSetupOptions(rawOptions = {}) {
  const defaults = createDefaultSetupOptions();
  return {
    components: normalizeComponents(rawOptions.components, defaults.components),
    wrapMode: normalizeWrapMode(rawOptions.wrapMode ?? defaults.wrapMode),
    client: normalizeClient(rawOptions.client ?? defaults.client),
    scope: normalizeSkillScope(rawOptions.scope ?? defaults.scope),
    installMode: normalizeSkillInstallMode(rawOptions.installMode ?? defaults.installMode),
    skills: normalizeSkillNames(rawOptions.skills ?? defaults.skills),
    tokenProfile: normalizeTokenProfile(rawOptions.tokenProfile ?? defaults.tokenProfile),
    adoptLegacySuperpowers: Boolean(rawOptions.adoptLegacySuperpowers ?? defaults.adoptLegacySuperpowers),
    applyClientCostSettings: Boolean(rawOptions.applyClientCostSettings ?? defaults.applyClientCostSettings),
    skipPlaywrightInstall: Boolean(rawOptions.skipPlaywrightInstall ?? defaults.skipPlaywrightInstall),
    skipDoctor: Boolean(rawOptions.skipDoctor ?? defaults.skipDoctor),
    yes: Boolean(rawOptions.yes ?? defaults.yes),
    retry: Boolean(rawOptions.retry ?? defaults.retry),
    force: Boolean(rawOptions.force ?? defaults.force),
  };
}

export function planSetup(rawOptions = {}) {
  const options = normalizeSetupOptions(rawOptions);
  const args = [
    'setup',
    '--components', options.components.join(','),
    '--mode', options.wrapMode,
    '--client', options.client,
    '--scope', options.scope,
    '--install-mode', options.installMode,
    '--token-profile', options.tokenProfile,
  ];
  if (options.adoptLegacySuperpowers) args.push('--adopt-legacy-superpowers');
  if (options.skills.length > 0) args.push('--skills', options.skills.join(','));
  if (options.applyClientCostSettings) args.push('--apply-client-cost-settings');
  if (options.skipPlaywrightInstall) args.push('--skip-playwright-install');
  if (options.skipDoctor) args.push('--skip-doctor');
  if (options.yes) args.push('--yes');
  if (options.retry) args.push('--retry');
  if (options.force) args.push('--force');
  return {
    command: 'setup',
    options,
    preview: `node scripts/aios.mjs ${args.join(' ')}`,
  };
}

export async function runSetup(rawOptions = {}, { rootDir, projectRoot = rootDir, io = console, deps = {} } = {}) {
  const { options } = planSetup(rawOptions);
  const browserInstaller = deps.installBrowserMcp ?? installBrowserMcp;
  const browserDoctor = deps.doctorBrowserMcp ?? doctorBrowserMcp;
  const shellInstaller = deps.installContextDbShell ?? installContextDbShell;
  const privacyInstaller = deps.installPrivacyGuard ?? installPrivacyGuard;
  const shellDoctor = deps.doctorContextDbShell ?? doctorContextDbShell;
  const skillsInstaller = deps.installContextDbSkills ?? installContextDbSkills;
  const skillsDoctor = deps.doctorContextDbSkills ?? doctorContextDbSkills;
  const rexSkillsInstaller = deps.installRexClientProjections ?? installRexClientProjections;
  const nativeInstaller = deps.installNativeEnhancements ?? installNativeEnhancements;
  const agentsInstaller = deps.installOrchestratorAgents ?? installOrchestratorAgents;
  io.log(`Setup components: ${options.components.join(',')}`);

  // 幂等状态：--force 全量重装；--retry 只跑未完成/失败的 component；默认跳过已完成项。
  const { readInstallState, writeInstallState, markComponentCompleted } = await import('./install-state.mjs');
  const { statePath, completed } = readInstallState(projectRoot);
  const pending = options.force
    ? [...options.components]
    : options.components.filter((component) => !completed.has(component));
  if (pending.length < options.components.length) {
    const skipped = options.components.filter((component) => !pending.includes(component));
    io.log(`[skip] already installed: ${skipped.join(', ')} (use --force to reinstall)`);
  }
  if (options.retry && pending.length === 0) {
    io.log('Nothing to retry: all components are already installed.');
    return;
  }
  const total = pending.length;
  let step = 0;
  const runComponent = async (component, fn) => {
    step += 1;
    io.log(`[${step}/${total}] ${component}`);
    try {
      await fn();
      markComponentCompleted(statePath, completed, component);
    } catch (error) {
      io.log(`[error] ${component} failed: ${error instanceof Error ? error.message : String(error)}`);
      io.log(`[retry] re-run with --retry to continue from here, or --force to reinstall everything`);
      throw error;
    }
  };

  // 中文注释：AIOS 规划依赖 rex-harness；源码 checkout 缺少 submodule 时由 setup 自动修复。
  const workflowSurface = await prepareRexWorkflowSurface({
    rootDir,
    fix: true,
    io,
    adoptLegacySuperpowers: options.adoptLegacySuperpowers,
    ensureRexHarnessImpl: deps.ensureRexHarness,
    reconciler: deps.reconcileRexWorkflowSurface,
  });
  if (workflowSurface.runtime && !workflowSurface.rex.ready) {
    throw new Error(`rex-harness is required for AIOS intelligent planning: ${workflowSurface.rex.fixHint}`);
  }

  if (hasComponent(pending, 'browser')) {
    await runComponent('browser', async () => {
      let browserInstallReady = true;
      try {
        await browserInstaller({ rootDir, skipPlaywrightInstall: options.skipPlaywrightInstall, io });
      } catch (error) {
        if (!isMissingBrowserMcpRuntimeError(error)) {
          throw error;
        }
        browserInstallReady = false;
        logBrowserMcpRuntimeWarning(io, error);
      }
      if (!options.skipDoctor) {
        await browserDoctor({ rootDir, fix: browserInstallReady, io });
      }
    });
  }

  if (hasComponent(pending, 'shell')) {
    await runComponent('shell', async () => {
      await shellInstaller({ rootDir, mode: options.wrapMode, io });
      await privacyInstaller({ rootDir, io });
      if (!options.skipDoctor) {
        await shellDoctor({ io });
      }
    });
  }

  if (hasComponent(pending, 'skills')) {
    await runComponent('skills', async () => {
      await skillsInstaller({
        rootDir,
        projectRoot,
        client: options.client,
        scope: options.scope,
        installMode: options.installMode,
        selectedSkills: options.skills,
        io,
      });
      await rexSkillsInstaller({
        rootDir,
        projectRoot,
        client: options.client,
        scope: options.scope,
        io,
      });
      if (!options.skipDoctor) {
        await skillsDoctor({ rootDir, projectRoot, client: options.client, scope: options.scope, selectedSkills: options.skills, io });
      }
    });
  }

  if (hasComponent(pending, 'native')) {
    await runComponent('native', async () => {
      await nativeInstaller({
        rootDir,
        projectRoot,
        client: options.client,
        io,
      });
    });
  }

  if (hasComponent(pending, 'agents')) {
    await runComponent('agents', async () => {
      await agentsInstaller({ rootDir, projectRoot, client: options.client, io });
    });
  }

  if (hasComponent(pending, 'shell')) {
    io.log('');
    io.log(process.platform === 'win32' ? 'Run: . $PROFILE' : 'Run: source ~/.zshrc');
  }

  writeInstallState(statePath, completed);
  io.log('Done.');
}
