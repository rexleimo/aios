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

export async function installSuperpowers({
  rootDir = '',
  client = 'all',
  repoUrl = DEFAULT_REPO_URL,
  update = false,
  force = false,
  installClaudePlugin = true,
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

  const gitDir = path.join(superpowersDir, '.git');
  if (path.dirname(gitDir) && commandExists('git')) {
    // noop; keeps branch explicit and stable
  }

  if (captureCommand('git', ['-C', superpowersDir, 'rev-parse', '--git-dir']).status === 0) {
    io.log(`[ok] superpowers repo found: ${superpowersDir}`);
    if (update) {
      io.log(`+ git -C ${superpowersDir} pull --ff-only`);
      runCommand('git', ['-C', superpowersDir, 'pull', '--ff-only']);
    }
  } else if (await import('node:fs').then((mod) => mod.default.existsSync(superpowersDir))) {
    if (!force) {
      throw new Error(`path exists but is not a git repo: ${superpowersDir}`);
    }
    (await import('node:fs')).default.rmSync(superpowersDir, { recursive: true, force: true });
    io.log(`+ git clone ${repoUrl} ${superpowersDir}`);
    runCommand('git', ['clone', repoUrl, superpowersDir]);
  } else {
    io.log(`+ git clone ${repoUrl} ${superpowersDir}`);
    runCommand('git', ['clone', repoUrl, superpowersDir]);
  }

  // 中文注释：~/.agents/skills/superpowers 是所有受支持客户端的共享投递点：
  // opencode 通过外部 skill 扫描读取它，gemini 通过 ~/.agents/skills 别名读取它，codex/claude 也复用它。
  // 由于上方在 supported.length===0 时已提前返回，此处至少有一个受支持客户端，故无条件建立共享链接。
  {
    const status = ensureManagedLink(skillsTarget, skillsSource, { force });
    if (status === 'reused') {
      io.log(`[ok] superpowers link already configured: ${skillsTarget}`);
    } else {
      io.log(`[link] superpowers linked: ${skillsTarget} -> ${skillsSource}`);
    }
  }

  const fs = (await import('node:fs')).default;
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
      // 中文注释：source.sourcePath 是 superpowers 这个受信外部 bundle 的 skills 目录，
      // 其中每个都是应当为 claude 安装的 superpowers skill。AIOS 自有 catalog 不收录它们，
      // 旧逻辑用 catalog 过滤会把全部 14 个滤掉（0 linked），等于 claude 装了 superpowers 却用不上。
      // 这里全量链接，与 codex/opencode 经 ~/.agents/skills/superpowers 拿到的集合保持一致。
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

  // 中文注释：把规划核心 skill 投影到每个支持 superpowers 的客户端 skill root（含 Hermes）。
  // 否则 CLAUDE.md/AGENTS.md 要求 invoke writing-plans，但 Hermes/部分 client 发现不了 skill。
  let planningProjection = null;
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
    }
  } catch (error) {
    io.log(`[warn] planning skill projection failed: ${error.message}`);
  }

  io.log('[done] superpowers install complete');
  return {
    ok: true,
    skipped: false,
    clients: clientSelection.selected,
    supportedClients: clientSelection.supported,
    permissionErrors: permissionsResult.errors || 0,
    planningProjection,
  };
}
