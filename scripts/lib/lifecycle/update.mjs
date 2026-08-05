import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  createDefaultUpdateOptions,
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
import { updateNativeEnhancements } from '../components/native.mjs';
import { doctorContextDbShell, installContextDbShell, installPrivacyGuard } from '../components/shell.mjs';
import { doctorContextDbSkills, installContextDbSkills } from '../components/skills.mjs';
import { installRexClientProjections } from '../rex-harness/client-projection.mjs';
import { updateHarnessRuntime } from './self-update.mjs';
import { prepareRexWorkflowSurface } from '../workflows/rex-workflow-surface-lifecycle.mjs';

/**
 * After a successful runtime replace, re-run update in a fresh Node process so
 * ESM module cache cannot keep pre-update compose/partials (e.g. retired
 * superpowers.md) while the on-disk install already deleted them.
 */
export function buildPostSelfUpdateArgv(rawOptions = {}) {
  const { options } = planUpdate({ ...rawOptions, selfUpdate: false });
  const args = [
    'update',
    '--skip-self-update',
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
  if (options.withPlaywrightInstall) args.push('--with-playwright-install');
  if (options.skipDoctor) args.push('--skip-doctor');
  return args;
}

export function reexecUpdateAfterRuntimeReplace({
  rootDir,
  rawOptions = {},
  io = console,
  spawnImpl = spawnSync,
  execPath = process.execPath,
} = {}) {
  const entry = path.join(path.resolve(rootDir), 'scripts', 'aios.mjs');
  if (!existsSync(entry)) {
    throw new Error(
      `post-self-update re-exec entry missing after runtime replace: ${entry}. `
      + 'The installer likely failed to replace the install tree (locked files, '
      + 'or the working directory was inside the install tree on Windows). '
      + 'Close other aios/node processes and re-run the installer manually.'
    );
  }
  const args = buildPostSelfUpdateArgv(rawOptions);
  io.log('[info] runtime files replaced; continuing update in a fresh process to reload modules');
  io.log(`[info] ${execPath} ${entry} ${args.join(' ')}`);
  const result = spawnImpl(execPath, [entry, ...args], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.stdout) io.log(String(result.stdout).trimEnd());
  if (result.stderr) {
    if (typeof io.error === 'function') io.error(String(result.stderr).trimEnd());
    else io.log(String(result.stderr).trimEnd());
  }
  if ((result.status ?? 1) !== 0) {
    throw new Error(
      result.error?.message
        || `post-self-update component update failed with exit ${result.status ?? 1}`
    );
  }
  return { reexec: true, exitCode: 0, args };
}

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

export function normalizeUpdateOptions(rawOptions = {}) {
  const defaults = createDefaultUpdateOptions();
  return {
    selfUpdate: Boolean(rawOptions.selfUpdate ?? defaults.selfUpdate),
    components: normalizeComponents(rawOptions.components, defaults.components),
    wrapMode: normalizeWrapMode(rawOptions.wrapMode ?? defaults.wrapMode),
    client: normalizeClient(rawOptions.client ?? defaults.client),
    scope: normalizeSkillScope(rawOptions.scope ?? defaults.scope),
    installMode: normalizeSkillInstallMode(rawOptions.installMode ?? defaults.installMode),
    skills: normalizeSkillNames(rawOptions.skills ?? defaults.skills),
    tokenProfile: normalizeTokenProfile(rawOptions.tokenProfile ?? defaults.tokenProfile),
    adoptLegacySuperpowers: Boolean(rawOptions.adoptLegacySuperpowers ?? defaults.adoptLegacySuperpowers),
    applyClientCostSettings: Boolean(rawOptions.applyClientCostSettings ?? defaults.applyClientCostSettings),
    withPlaywrightInstall: Boolean(rawOptions.withPlaywrightInstall ?? defaults.withPlaywrightInstall),
    skipDoctor: Boolean(rawOptions.skipDoctor ?? defaults.skipDoctor),
    dryRun: Boolean(rawOptions.dryRun ?? defaults.dryRun),
  };
}

export function planUpdate(rawOptions = {}) {
  const options = normalizeUpdateOptions(rawOptions);
  const args = [
    'update',
    '--components', options.components.join(','),
    '--mode', options.wrapMode,
    '--client', options.client,
    '--scope', options.scope,
    '--install-mode', options.installMode,
    '--token-profile', options.tokenProfile,
  ];
  if (options.adoptLegacySuperpowers) args.push('--adopt-legacy-superpowers');
  if (options.selfUpdate) args.push('--self-update');
  if (options.skills.length > 0) args.push('--skills', options.skills.join(','));
  if (options.applyClientCostSettings) args.push('--apply-client-cost-settings');
  if (options.withPlaywrightInstall) args.push('--with-playwright-install');
  if (options.skipDoctor) args.push('--skip-doctor');
  if (options.dryRun) args.push('--dry-run');
  return {
    command: 'update',
    options,
    preview: `node scripts/aios.mjs ${args.join(' ')}`,
  };
}

export async function runUpdate(rawOptions = {}, { rootDir, projectRoot = rootDir, io = console, deps = {} } = {}) {
  const plan = planUpdate(rawOptions);
  const { options } = plan;
  if (options.dryRun) {
    io.log(`[plan] ${plan.preview}`);
    return plan;
  }
  const browserInstaller = deps.installBrowserMcp ?? installBrowserMcp;
  const browserDoctor = deps.doctorBrowserMcp ?? doctorBrowserMcp;
  const shellInstaller = deps.installContextDbShell ?? installContextDbShell;
  const privacyInstaller = deps.installPrivacyGuard ?? installPrivacyGuard;
  const shellDoctor = deps.doctorContextDbShell ?? doctorContextDbShell;
  const skillsInstaller = deps.installContextDbSkills ?? installContextDbSkills;
  const skillsDoctor = deps.doctorContextDbSkills ?? doctorContextDbSkills;
  const rexSkillsInstaller = deps.installRexClientProjections ?? installRexClientProjections;
  const nativeUpdater = deps.updateNativeEnhancements ?? updateNativeEnhancements;
  const agentsInstaller = deps.installOrchestratorAgents ?? installOrchestratorAgents;
  const runtimeUpdater = deps.updateHarnessRuntime ?? updateHarnessRuntime;

  // 中文注释：更新前先保证规划内核存在，避免更新完成后才在 workflow import 阶段失败。
  {
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
  }

  if (options.selfUpdate) {
    const runtimeResult = await runtimeUpdater({ rootDir, io });
    // When the install tree was replaced, continue in a child process so native
    // emitters re-read the new compose plan / partials from disk.
    if (runtimeResult?.updated === true && runtimeResult?.skipped !== true) {
      const reexec = deps.reexecUpdateAfterRuntimeReplace ?? reexecUpdateAfterRuntimeReplace;
      return reexec({
        rootDir,
        projectRoot,
        rawOptions,
        io,
        spawnImpl: deps.spawnImpl,
        execPath: deps.execPath,
      });
    }
  }

  io.log(`Update components: ${options.components.join(',')}`);

  if (hasComponent(options.components, 'browser')) {
    let browserInstallReady = true;
    try {
      await browserInstaller({ rootDir, skipPlaywrightInstall: !options.withPlaywrightInstall, io });
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
  }

  if (hasComponent(options.components, 'shell')) {
    await shellInstaller({ rootDir, mode: options.wrapMode, force: true, io });
    await privacyInstaller({ rootDir, io });
    if (!options.skipDoctor) {
      await shellDoctor({ io });
    }
  }

  if (hasComponent(options.components, 'skills')) {
    await skillsInstaller({
      rootDir,
      projectRoot,
      client: options.client,
      scope: options.scope,
      installMode: options.installMode,
      selectedSkills: options.skills,
      force: true,
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
  }

  if (hasComponent(options.components, 'native')) {
    await nativeUpdater({
      rootDir,
      projectRoot,
      client: options.client,
      io,
    });
  }

  if (hasComponent(options.components, 'agents')) {
    await agentsInstaller({ rootDir, projectRoot, client: options.client, io });
  }

  if (hasComponent(options.components, 'shell')) {
    io.log('');
    io.log(process.platform === 'win32' ? 'Run: . $PROFILE' : 'Run: source ~/.zshrc');
  }

  io.log('Done.');
}
