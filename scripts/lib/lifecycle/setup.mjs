import {
  createDefaultSetupOptions,
  hasComponent,
  normalizeClient,
  normalizeComponents,
  normalizeSkillInstallMode,
  normalizeSkillNames,
  normalizeSkillScope,
  normalizeWrapMode,
} from './options.mjs';
import { installOrchestratorAgents } from '../components/agents.mjs';
import { installBrowserMcp } from '../components/browser.mjs';
import { doctorBrowserMcp } from '../components/browser.mjs';
import { installNativeEnhancements } from '../components/native.mjs';
import { doctorContextDbShell, installContextDbShell, installPrivacyGuard } from '../components/shell.mjs';
import { doctorContextDbSkills, installContextDbSkills } from '../components/skills.mjs';
import { doctorSuperpowers, installSuperpowers } from '../components/superpowers.mjs';

function isMissingBrowserUseRuntimeError(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('browser-use MCP project not found')
    || message.includes('mcp-browser-use project not found');
}

function logBrowserUseRuntimeWarning(io, error) {
  const message = error instanceof Error ? error.message : String(error || '');
  const [firstLine = message] = message.split(/\r?\n/u).filter(Boolean);
  io.log(`[warn] browser component skipped: ${firstLine}`);
  io.log('[warn] Browser MCP needs the external ai-browser-book/mcp-browser-use checkout.');
  io.log('[warn] Auto-discovery checks ../ai-browser-book and ./ai-browser-book from this repo root.');
  io.log('[warn] If your checkout is elsewhere, set AIOS_BROWSER_USE_REPO to that path.');
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
    skipPlaywrightInstall: Boolean(rawOptions.skipPlaywrightInstall ?? defaults.skipPlaywrightInstall),
    skipDoctor: Boolean(rawOptions.skipDoctor ?? defaults.skipDoctor),
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
  ];
  if (options.skills.length > 0) args.push('--skills', options.skills.join(','));
  if (options.skipPlaywrightInstall) args.push('--skip-playwright-install');
  if (options.skipDoctor) args.push('--skip-doctor');
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
  const nativeInstaller = deps.installNativeEnhancements ?? installNativeEnhancements;
  const agentsInstaller = deps.installOrchestratorAgents ?? installOrchestratorAgents;
  const superpowersInstaller = deps.installSuperpowers ?? installSuperpowers;
  const superpowersDoctor = deps.doctorSuperpowers ?? doctorSuperpowers;
  io.log(`Setup components: ${options.components.join(',')}`);

  if (hasComponent(options.components, 'browser')) {
    let browserInstallReady = true;
    try {
      await browserInstaller({ rootDir, skipPlaywrightInstall: options.skipPlaywrightInstall, io });
    } catch (error) {
      if (!isMissingBrowserUseRuntimeError(error)) {
        throw error;
      }
      browserInstallReady = false;
      logBrowserUseRuntimeWarning(io, error);
    }
    if (!options.skipDoctor) {
      await browserDoctor({ rootDir, fix: browserInstallReady, io });
    }
  }

  if (hasComponent(options.components, 'shell')) {
    await shellInstaller({ rootDir, mode: options.wrapMode, io });
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
      io,
    });
    if (!options.skipDoctor) {
      await skillsDoctor({ rootDir, projectRoot, client: options.client, scope: options.scope, selectedSkills: options.skills, io });
    }
  }

  if (hasComponent(options.components, 'native')) {
    await nativeInstaller({
      rootDir,
      projectRoot,
      client: options.client,
      io,
    });
  }

  if (hasComponent(options.components, 'agents')) {
    await agentsInstaller({ rootDir, projectRoot, client: options.client, io });
  }

  if (hasComponent(options.components, 'superpowers')) {
    await superpowersInstaller({ rootDir: projectRoot, client: options.client, io });
    if (!options.skipDoctor) {
      const result = await superpowersDoctor({ client: options.client, io });
      if (result.errors > 0) {
        throw new Error(`doctor-superpowers failed (${result.errors} errors)`);
      }
    }
  }

  if (hasComponent(options.components, 'shell')) {
    io.log('');
    io.log(process.platform === 'win32' ? 'Run: . $PROFILE' : 'Run: source ~/.zshrc');
  }

  io.log('Done.');
}
