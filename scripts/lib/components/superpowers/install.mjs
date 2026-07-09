import os from 'node:os';
import path from 'node:path';

import { ensureManagedLink } from '../../platform/fs.mjs';
import { commandExists, captureCommand, runCommand } from '../../platform/process.mjs';
import { getAgentsHome, getClientHomes } from '../../platform/paths.mjs';

import { CLAUDE_PLUGIN_NAME, DEFAULT_REPO_URL } from './constants.mjs';
import { resolveSuperpowersClients } from './clients.mjs';
import { isClaudePluginInstalled, resolveClaudeSkillSource } from './claude-plugin.mjs';
import { linkClaudeSkills } from './skills.mjs';
import { syncClaudeSkillPermissions } from './permissions.mjs';
import {
  MIN_SUPERPOWERS_VERSION,
  readSuperpowersVersion,
  tryPullSuperpowers,
} from './version.mjs';

export async function installSuperpowers({
  rootDir = '',
  client = 'all',
  repoUrl = DEFAULT_REPO_URL,
  // 默认 true：setup/install 都尝试 ff-only 更新到最新（无 origin 时跳过，不阻断离线）
  update = true,
  force = false,
  installClaudePlugin = true,
  requirePlanningProjection = true,
  env = process.env,
  io = console,
} = {}) {
  const clientSelection = resolveSuperpowersClients(client);
  if (clientSelection.supported.length === 0) {
    io.log(`[skip] superpowers skipped for unsupported client selection: ${clientSelection.selected.join(', ')}`);
    return {
      ok: true,
      skipped: true,
      clients: clientSelection.selected,
      supportedClients: [],
    };
  }

  if (!commandExists('git')) {
    throw new Error('Missing required command: git');
  }

  const homeDir = os.homedir();
  const homes = getClientHomes(env, homeDir);
  const codexHome = homes.codex;
  const claudeHome = homes.claude;
  const agentsHome = getAgentsHome(env, homeDir);
  const superpowersDir = path.join(codexHome, 'superpowers');
  const skillsSource = path.join(superpowersDir, 'skills');
  const skillsTarget = path.join(agentsHome, 'skills', 'superpowers');
  const fs = (await import('node:fs')).default;

  let pullResult = { pulled: false, reason: 'not-attempted' };

  if (captureCommand('git', ['-C', superpowersDir, 'rev-parse', '--git-dir']).status === 0) {
    io.log(`[ok] superpowers repo found: ${superpowersDir}`);
    if (update) {
      pullResult = tryPullSuperpowers(superpowersDir, { io });
    } else {
      io.log('[note] superpowers update skipped (update=false); pass --update or use: internal superpowers update');
    }
  } else if (fs.existsSync(superpowersDir)) {
    if (!force) {
      throw new Error(`path exists but is not a git repo: ${superpowersDir}`);
    }
    fs.rmSync(superpowersDir, { recursive: true, force: true });
    io.log(`+ git clone ${repoUrl} ${superpowersDir}`);
    runCommand('git', ['clone', repoUrl, superpowersDir]);
    pullResult = { pulled: true, reason: 'cloned' };
  } else {
    io.log(`+ git clone ${repoUrl} ${superpowersDir}`);
    runCommand('git', ['clone', repoUrl, superpowersDir]);
    pullResult = { pulled: true, reason: 'cloned' };
  }

  const versionInfo = readSuperpowersVersion(superpowersDir, { fsModule: fs });
  if (versionInfo.version) {
    io.log(`[ok] superpowers version: v${versionInfo.version} (source=${versionInfo.source}, min=v${MIN_SUPERPOWERS_VERSION})`);
  } else {
    io.log(`[warn] superpowers version unknown (raw=${versionInfo.raw || 'n/a'}); recommend ≥ v${MIN_SUPERPOWERS_VERSION}`);
  }
  if (versionInfo.outdated) {
    io.log(`[warn] superpowers is below AIOS minimum v${MIN_SUPERPOWERS_VERSION}`);
    io.log('       Run: node scripts/aios.mjs internal superpowers update --client all');
  }

  // 中文注释：~/.agents/skills/superpowers 是所有受支持客户端的共享投递点
  {
    const status = ensureManagedLink(skillsTarget, skillsSource, { force });
    if (status === 'reused') {
      io.log(`[ok] superpowers link already configured: ${skillsTarget}`);
    } else {
      io.log(`[link] superpowers linked: ${skillsTarget} -> ${skillsSource}`);
    }
  }

  let permissionsResult = { errors: 0 };
  if (clientSelection.hasClaude) {
    const pluginInstalled = installClaudePlugin ? await isClaudePluginInstalled(claudeHome) : false;
    const source = resolveClaudeSkillSource({
      fs,
      claudeHome,
      repoSkillsSource: skillsSource,
      pluginInstalled,
    });

    if (pluginInstalled) {
      io.log(`[ok] Claude Code plugin installed: ${CLAUDE_PLUGIN_NAME}`);
    } else if (installClaudePlugin) {
      io.log(`[note] Claude Code plugin not detected (${CLAUDE_PLUGIN_NAME}); using repo-linked superpowers skills`);
    }

    if (!fs.existsSync(source.sourcePath)) {
      io.log(`[warn] Claude Code skill source not found: ${source.sourcePath}`);
      if (source.sourceKind === 'plugin') {
        io.log(`       Run /reload-plugins in Claude Code to refresh plugin cache`);
        io.log(`       Plugin cache base: ${source.pluginCacheBase}`);
      }
    } else {
      const claudeSkillsRoot = path.join(claudeHome, 'skills');
      const allowedSkills = null;
      const linkResult = linkClaudeSkills({
        fs,
        sourcePath: source.sourcePath,
        claudeSkillsRoot,
        allowedSkills,
        force,
        io,
      });
      io.log(`[ok] Claude Code skills (${source.sourceKind} source): ${linkResult.linked} linked, ${linkResult.reused} reused, ${linkResult.skipped} skipped`);
      if (linkResult.skipped > 0) {
        io.log('       Re-run with --force to replace unmanaged existing skill directories.');
      }
    }

    permissionsResult = await syncClaudeSkillPermissions({
      rootDir,
      env,
      io,
      includeGlobal: true,
      includeProject: Boolean(rootDir),
    });
    if (permissionsResult.errors > 0) {
      io.log('[warn] Claude skill permission sync completed with warnings.');
    }
  } else {
    io.log('[skip] Claude Code superpowers sync skipped (client not selected)');
  }

  // 规划核心 skill 投影到全客户端 — always-on 规划依赖
  // 仅当源仓库已有 writing-plans 时强制成功（完整 superpowers）；测试用残缺 stub 只 warn
  let planningProjection = null;
  const sourceHasPlanningCore = fs.existsSync(path.join(skillsSource, 'writing-plans', 'SKILL.md'));
  try {
    const { projectPlanningSkills } = await import('../../planning/project-skills.mjs');
    planningProjection = projectPlanningSkills({
      rootDir: rootDir || process.cwd(),
      client,
      force,
      env,
      io,
    });
    if (planningProjection.ok) {
      io.log(`[ok] planning skills projected to ${planningProjection.supportedClients?.length || 0} client(s)`);
    } else {
      io.log('[warn] planning skill projection incomplete; run: node scripts/aios.mjs plan project-skills --force');
      if (requirePlanningProjection && sourceHasPlanningCore) {
        throw new Error('planning skill projection failed — always-on planning skills must be discoverable on all selected clients');
      }
    }
  } catch (error) {
    if (error.message?.includes('planning skill projection failed')) throw error;
    io.log(`[warn] planning skill projection failed: ${error.message}`);
    if (requirePlanningProjection && sourceHasPlanningCore) {
      throw new Error(`planning skill projection failed: ${error.message}`);
    }
  }

  io.log('[done] superpowers install complete');
  return {
    ok: true,
    skipped: false,
    clients: clientSelection.selected,
    supportedClients: clientSelection.supported,
    permissionErrors: permissionsResult.errors || 0,
    planningProjection,
    version: versionInfo,
    pull: pullResult,
  };
}
