import {
  createDefaultUninstallOptions,
  hasComponent,
  normalizeClient,
  normalizeComponents,
  normalizeSkillNames,
  normalizeSkillScope,
} from './options.mjs';
import { uninstallOrchestratorAgents } from '../components/agents.mjs';
import { uninstallNativeEnhancements } from '../components/native.mjs';
import { uninstallContextDbShell } from '../components/shell.mjs';
import { uninstallContextDbSkills } from '../components/skills.mjs';

export function normalizeUninstallOptions(rawOptions = {}) {
  const defaults = createDefaultUninstallOptions();
  return {
    components: normalizeComponents(rawOptions.components, defaults.components),
    client: normalizeClient(rawOptions.client ?? defaults.client),
    scope: normalizeSkillScope(rawOptions.scope ?? defaults.scope),
    skills: normalizeSkillNames(rawOptions.skills ?? defaults.skills),
  };
}

export function planUninstall(rawOptions = {}) {
  const options = normalizeUninstallOptions(rawOptions);
  const args = [
    'uninstall',
    '--components', options.components.join(','),
    '--client', options.client,
    '--scope', options.scope,
  ];
  if (options.skills.length > 0) args.push('--skills', options.skills.join(','));
  return {
    command: 'uninstall',
    options,
    preview: `node scripts/aios.mjs ${args.join(' ')}`,
  };
}

export async function runUninstall(rawOptions = {}, { io = console, rootDir, projectRoot = rootDir } = {}) {
  const { options } = planUninstall(rawOptions);
  io.log(`Uninstall components: ${options.components.join(',')}`);

  if (hasComponent(options.components, 'shell')) {
    await uninstallContextDbShell({ io });
  }

  if (hasComponent(options.components, 'skills')) {
    await uninstallContextDbSkills({ rootDir, projectRoot, client: options.client, scope: options.scope, selectedSkills: options.skills, io });
  }

  if (hasComponent(options.components, 'native')) {
    await uninstallNativeEnhancements({ rootDir, projectRoot, client: options.client, io });
  }

  if (hasComponent(options.components, 'agents')) {
    await uninstallOrchestratorAgents({ rootDir, client: options.client, io });
  }

  if (hasComponent(options.components, 'browser')) {
    io.log('[info] Browser MCP has no destructive auto-uninstall script.');
    io.log('[info] It is safe to keep mcp-server build/runtime artifacts.');
  }

  if (hasComponent(options.components, 'shell')) {
    io.log('');
    io.log(process.platform === 'win32' ? 'Run: . $PROFILE' : 'Run: source ~/.zshrc');
  }

  io.log('Done.');
}
