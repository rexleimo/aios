// scripts/lib/components/zcode/doctor.mjs — ZCode agents plugin health check.
// Verifies the inline plugin (rex role cards as executable ZCode subagents)
// is materialized, fresh against the AIOS install's agent-sources, and
// registered in the user-level plugins.dirs config. Repair hints use the
// global `aios` CLI only.
import fs from 'node:fs';
import path from 'node:path';

import { getClientHomes } from '../../platform/paths.mjs';
import {
  ZCODE_AGENTS_PLUGIN_NAME,
  buildAiosAgentsPluginContents,
  resolveZcodeAgentsPluginDir,
  resolveZcodeUserConfigPath,
} from './agents-plugin.mjs';

export async function doctorZcodeAgents({
  aiosRoot = '',
  env = process.env,
  io = console,
} = {}) {
  const result = {
    errors: 0,
    effectiveWarnings: 0,
    skipped: false,
    pluginDir: resolveZcodeAgentsPluginDir(env),
    registered: false,
    agentsInstalled: 0,
    agentsExpected: 0,
    manifestVersion: '',
    configPath: '',
  };

  const zcodeHome = getClientHomes(env).zcode;
  if (!zcodeHome || !fs.existsSync(zcodeHome)) {
    result.skipped = true;
    return result;
  }

  result.configPath = resolveZcodeUserConfigPath(zcodeHome);

  // Expected agent set comes from the AIOS install root, never a repo literal.
  let expectedNames = [];
  try {
    expectedNames = buildAiosAgentsPluginContents({ aiosRoot }).agents.map((agent) => agent.name);
  } catch {
    // AIOS install without agent-sources: treat expected set as unknown-empty.
  }
  result.agentsExpected = expectedNames.length;

  const manifestPath = path.join(result.pluginDir, '.zcode-plugin', 'plugin.json');
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    manifest = null;
  }
  if (!manifest || manifest.name !== ZCODE_AGENTS_PLUGIN_NAME) {
    result.errors += 1;
    io.log(`[zcode-agents] plugin manifest missing or invalid: ${manifestPath}`);
  } else {
    result.manifestVersion = String(manifest.version || '');
  }

  const agentsDir = path.join(result.pluginDir, 'agents');
  const installedNames = fs.existsSync(agentsDir)
    ? fs.readdirSync(agentsDir).filter((fileName) => fileName.endsWith('.md')).sort()
    : [];
  result.agentsInstalled = installedNames.length;

  if (expectedNames.length > 0) {
    const expectedFileNames = expectedNames.map((name) => `${name}.md`).sort();
    const stale = installedNames.some((fileName) => !expectedFileNames.includes(fileName))
      || expectedFileNames.some((fileName) => !installedNames.includes(fileName));
    if (stale) {
      result.effectiveWarnings += 1;
      io.log(`[zcode-agents] plugin agents drifted from AIOS agent-sources (installed=${installedNames.length}, expected=${expectedNames.length})`);
    }
  }

  let registered = false;
  try {
    const parsed = JSON.parse(fs.readFileSync(result.configPath, 'utf8'));
    const dirs = parsed?.plugins?.dirs;
    registered = Array.isArray(dirs) && dirs.includes(result.pluginDir);
  } catch {
    registered = false;
  }
  result.registered = registered;
  if (!registered) {
    result.effectiveWarnings += 1;
    io.log('[zcode-agents] plugin directory is not registered in the ZCode user config (plugins.dirs)');
  }

  return result;
}
