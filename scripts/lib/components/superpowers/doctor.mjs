import os from 'node:os';
import path from 'node:path';

import { isManagedLink } from '../../platform/fs.mjs';
import { commandExists, captureCommand } from '../../platform/process.mjs';
import { getAgentsHome, getClientHomes } from '../../platform/paths.mjs';

import { CLAUDE_PLUGIN_NAME } from './constants.mjs';
import { resolveSuperpowersClients } from './clients.mjs';
import { isClaudePluginInstalled, resolveClaudeSkillSource } from './claude-plugin.mjs';
import { listSkillNames } from './skills.mjs';
import {
  MIN_SUPERPOWERS_VERSION,
  readSuperpowersVersion,
} from './version.mjs';

export async function doctorSuperpowers({
  client = 'all',
  rootDir = process.cwd(),
  env = process.env,
  io = console,
  checkPlanning = true,
} = {}) {
  const clientSelection = resolveSuperpowersClients(client);
  if (clientSelection.supported.length === 0) {
    io.log('Superpowers Doctor');
    io.log('------------------');
    io.log(`[skip] superpowers unsupported for client selection: ${clientSelection.selected.join(', ')}`);
    return { warnings: 0, effectiveWarnings: 0, errors: 0, skipped: true };
  }

  const homeDir = os.homedir();
  const homes = getClientHomes(env, homeDir);
  const codexHome = homes.codex;
  const claudeHome = homes.claude;
  const agentsHome = getAgentsHome(env, homeDir);
  const superpowersDir = path.join(codexHome, 'superpowers');
  const skillsSource = path.join(superpowersDir, 'skills');
  const skillsTarget = path.join(agentsHome, 'skills', 'superpowers');

  let warnings = 0;
  let errors = 0;
  const warn = (message) => {
    warnings += 1;
    io.log(`WARN ${message}`);
  };
  const err = (message) => {
    errors += 1;
    io.log(`ERR  ${message}`);
  };
  const ok = (message) => io.log(`OK   ${message}`);

  io.log('Superpowers Doctor');
  io.log('------------------');

  if (commandExists('git')) ok('command exists: git');
  else err('missing command: git');

  io.log(`client: ${clientSelection.selected.join(', ')}`);
  io.log(`codex_home: ${codexHome}`);
  if (clientSelection.hasClaude) {
    io.log(`claude_home: ${claudeHome}`);
  }
  io.log(`agents_home: ${agentsHome}`);
  io.log(`superpowers_dir: ${superpowersDir}`);
  io.log(`minimum_version: v${MIN_SUPERPOWERS_VERSION}`);

  const fs = (await import('node:fs')).default;

  if (captureCommand('git', ['-C', superpowersDir, 'rev-parse', '--git-dir']).status === 0) {
    ok('superpowers git repo found');
    const remote = captureCommand('git', ['-C', superpowersDir, 'config', '--get', 'remote.origin.url']);
    if (remote.stdout.trim()) ok(`origin: ${remote.stdout.trim()}`);
    else warn('origin URL is not configured (cannot auto-update)');
    const head = captureCommand('git', ['-C', superpowersDir, 'rev-parse', '--short', 'HEAD']);
    if (head.stdout.trim()) ok(`HEAD: ${head.stdout.trim()}`);
    else warn('cannot read HEAD');

    const versionInfo = readSuperpowersVersion(superpowersDir, { fsModule: fs });
    if (versionInfo.version) {
      if (versionInfo.outdated) {
        warn(`superpowers v${versionInfo.version} is below minimum v${MIN_SUPERPOWERS_VERSION}`);
        io.log('       Run: node scripts/aios.mjs internal superpowers update --client all');
      } else {
        ok(`superpowers version: v${versionInfo.version} (≥ v${MIN_SUPERPOWERS_VERSION})`);
      }
    } else {
      warn(`superpowers version unknown (raw=${versionInfo.raw || 'n/a'}); recommend ≥ v${MIN_SUPERPOWERS_VERSION}`);
      io.log('       Run: node scripts/aios.mjs internal superpowers update --client all');
    }
  } else {
    err(`missing superpowers git repo: ${superpowersDir}`);
  }

  if (fs.existsSync(skillsSource)) ok(`skills source found: ${skillsSource}`);
  else err(`missing skills source directory: ${skillsSource}`);

  if (isManagedLink(skillsTarget, skillsSource)) ok(`skills link valid: ${skillsTarget} -> ${skillsSource}`);
  else err(`skills link missing or incorrect: ${skillsTarget}`);

  const expectedSkillNames = listSkillNames(fs, skillsSource);
  if (expectedSkillNames.length === 0) {
    warn(`no superpowers skills found in source: ${skillsSource}`);
  }

  if (clientSelection.hasClaude) {
    const claudePluginInstalled = await isClaudePluginInstalled(claudeHome);
    if (claudePluginInstalled) {
      ok(`Claude Code plugin installed: ${CLAUDE_PLUGIN_NAME}`);
    } else {
      io.log(`INFO Claude Code plugin not installed: ${CLAUDE_PLUGIN_NAME} (optional)`);
    }

    const source = resolveClaudeSkillSource({
      fs,
      claudeHome,
      repoSkillsSource: skillsSource,
      pluginInstalled: claudePluginInstalled,
    });
    if (expectedSkillNames.length > 0) {
      const claudeSkillsRoot = path.join(claudeHome, 'skills');
      let availableSkills = 0;
      let managedLinks = 0;
      for (const skillName of expectedSkillNames) {
        const targetPath = path.join(claudeSkillsRoot, skillName);
        const targetSkillFile = path.join(targetPath, 'SKILL.md');
        if (!fs.existsSync(targetSkillFile)) {
          warn(`Claude Code skill missing: ${targetPath}`);
          continue;
        }
        availableSkills += 1;

        const repoSkillSource = path.join(skillsSource, skillName);
        const expectedSource = source.sourcePath ? path.join(source.sourcePath, skillName) : '';
        if ((expectedSource && isManagedLink(targetPath, expectedSource)) || isManagedLink(targetPath, repoSkillSource)) {
          managedLinks += 1;
        }
      }

      if (availableSkills === expectedSkillNames.length) {
        ok(`Claude Code skills available: ${availableSkills}/${expectedSkillNames.length}`);
      } else {
        io.log('       Run: node scripts/aios.mjs internal superpowers update --client all --force');
        if (source.sourceKind === 'plugin') {
          io.log('       If plugin cache is stale, run /reload-plugins in Claude Code.');
        }
      }

      if (managedLinks === expectedSkillNames.length) {
        ok(`Claude Code managed links healthy: ${managedLinks}/${expectedSkillNames.length}`);
      } else {
        warn(`Claude Code managed links drifted: ${managedLinks}/${expectedSkillNames.length}`);
        io.log('       Re-run: node scripts/aios.mjs internal superpowers update --client all --force');
      }
    }
  } else {
    io.log('[skip] Claude Code superpowers doctor skipped (client not selected)');
  }

  // always-on planning discovery gate
  let planningReport = null;
  if (checkPlanning && rootDir) {
    try {
      const { checkPlanningSkillDiscovery } = await import('../../planning/contract.mjs');
      planningReport = checkPlanningSkillDiscovery({
        rootDir,
        clients: clientSelection.supported,
        env,
        homes,
      });
      if (planningReport.ok) {
        ok(`planning skills discoverable on ${clientSelection.supported.length} client(s)`);
      } else {
        for (const item of planningReport.reports || []) {
          if (item.ok) continue;
          warn(`planning skills missing for ${item.clientId}`);
          if (item.recommendation) io.log(`       ${item.recommendation}`);
        }
        io.log('       Run: node scripts/aios.mjs plan project-skills --force');
      }
    } catch (error) {
      warn(`planning discovery check failed: ${error.message}`);
    }
  }

  if (errors > 0) {
    io.log(`Result: FAILED (${errors} errors, ${warnings} warnings)`);
  } else {
    io.log(`Result: OK (${warnings} warnings)`);
  }

  return {
    warnings,
    effectiveWarnings: warnings,
    errors,
    planningReport,
    version: captureCommand('git', ['-C', superpowersDir, 'describe', '--tags', '--always']).stdout?.trim?.() || null,
  };
}
