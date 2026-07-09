import path from 'node:path';

import { loadWorkspaceConfig } from './runtime.mjs';

export async function runInternal(options, { rootDir, projectRoot } = {}) {
  const { target, action } = options;

  if (target === 'shell') {
    const module = await import('../../components/shell.mjs');
    if (action === 'install') return module.installContextDbShell({ rootDir, mode: options.mode ?? 'opt-in', force: Boolean(options.force), rcFile: options.rcFile });
    if (action === 'update') return module.installContextDbShell({ rootDir, mode: options.mode ?? 'opt-in', force: true, rcFile: options.rcFile });
    if (action === 'uninstall') return module.uninstallContextDbShell({ rcFile: options.rcFile });
    if (action === 'doctor') return module.doctorContextDbShell({ rcFile: options.rcFile });
  }

  if (target === 'skills') {
    const module = await import('../../components/skills.mjs');
    if (action === 'install') {
      return module.installContextDbSkills({
        rootDir,
        projectRoot,
        client: options.client ?? 'all',
        scope: options.scope ?? 'global',
        installMode: options.installMode ?? 'copy',
        selectedSkills: options.skills ?? [],
        force: Boolean(options.force),
      });
    }
    if (action === 'update') {
      return module.installContextDbSkills({
        rootDir,
        projectRoot,
        client: options.client ?? 'all',
        scope: options.scope ?? 'global',
        installMode: options.installMode ?? 'copy',
        selectedSkills: options.skills ?? [],
        force: true,
      });
    }
    if (action === 'uninstall') return module.uninstallContextDbSkills({ rootDir, projectRoot, client: options.client ?? 'all', scope: options.scope ?? 'global', selectedSkills: options.skills ?? [] });
    if (action === 'doctor') return module.doctorContextDbSkills({ rootDir, projectRoot, client: options.client ?? 'all', scope: options.scope ?? 'global', selectedSkills: options.skills ?? [] });
  }

  if (target === 'native') {
    const module = await import('../../components/native.mjs');
    if (action === 'install') return module.installNativeEnhancements({ rootDir, projectRoot, client: options.client ?? 'all' });
    if (action === 'update') return module.updateNativeEnhancements({ rootDir, projectRoot, client: options.client ?? 'all' });
    if (action === 'uninstall') return module.uninstallNativeEnhancements({ rootDir, projectRoot, client: options.client ?? 'all' });
    if (action === 'repair') {
      return module.inspectNativeRepairHistory({
        rootDir,
        repairAction: options.repairAction ?? 'list',
        repairId: options.repairId ?? 'latest',
        limit: options.limit ?? 20,
      });
    }
    if (action === 'rollback') {
      return module.rollbackNativeEnhancements({
        rootDir,
        repairId: options.repairId ?? 'latest',
        dryRun: Boolean(options.dryRun),
      });
    }
    if (action === 'doctor') {
      return module.doctorNativeEnhancements({
        rootDir,
        projectRoot,
        client: options.client ?? 'all',
        verbose: Boolean(options.verbose),
        fix: Boolean(options.fix),
        dryRun: Boolean(options.dryRun),
      });
    }
  }

  if (target === 'superpowers') {
    const module = await import('../../components/superpowers.mjs');
    const superpowersProjectRoot = projectRoot || rootDir;
    // install 默认也尝试 update（safe pull）；显式 --update 保持兼容
    if (action === 'install') {
      return module.installSuperpowers({
        rootDir: superpowersProjectRoot,
        client: options.client ?? 'all',
        repoUrl: options.repoUrl,
        update: options.update === undefined ? true : Boolean(options.update),
        force: Boolean(options.force),
      });
    }
    if (action === 'update') {
      return module.installSuperpowers({
        rootDir: superpowersProjectRoot,
        client: options.client ?? 'all',
        repoUrl: options.repoUrl,
        update: true,
        force: true,
      });
    }
    if (action === 'doctor') {
      return module.doctorSuperpowers({
        client: options.client ?? 'all',
        rootDir: superpowersProjectRoot,
      });
    }
    if (action === 'sync-claude-permissions') {
      return module.syncClaudeSkillPermissions({
        rootDir: superpowersProjectRoot,
        includeGlobal: true,
        includeProject: true,
      });
    }
  }

  if (target === 'browser') {
    const module = await import('../../components/browser.mjs');
    if (action === 'install') return module.installBrowserMcp({ rootDir, dryRun: Boolean(options.dryRun), skipPlaywrightInstall: Boolean(options.skipPlaywrightInstall) });
    if (action === 'doctor') return module.doctorBrowserMcp({ rootDir, fix: Boolean(options.fix), dryRun: Boolean(options.dryRun) });
    if (action === 'mcp-migrate') return module.migrateBrowserMcpConfig({ rootDir, dryRun: Boolean(options.dryRun) });
    if (action === 'cdp-start') return module.startBrowserCdpService({ rootDir });
    if (action === 'cdp-stop') return module.stopBrowserCdpService({ rootDir });
    if (action === 'cdp-restart' || action === 'cdp-reload') return module.restartBrowserCdpService({ rootDir });
    if (action === 'cdp-status') return module.statusBrowserCdpService({ rootDir });
  }

  if (target === 'privacy') {
    const module = await import('../../components/shell.mjs');
    if (action === 'install') return module.installPrivacyGuard({ rootDir, enable: options.enable !== false, disable: Boolean(options.disable), mode: options.mode ?? '' });
  }

  if (target === 'codemap') {
    const module = await import('../../components/codemap.mjs');
    if (action === 'install') return module.installCodemap({ rootDir, projectRoot, dryRun: Boolean(options.dryRun), client: options.client ?? 'all', io: console });
    if (action === 'uninstall') return module.uninstallCodemap({ rootDir, projectRoot, dryRun: Boolean(options.dryRun), client: options.client ?? 'all', io: console });
    if (action === 'doctor') return module.doctorCodemap({ rootDir, projectRoot, fix: Boolean(options.fix), dryRun: Boolean(options.dryRun), client: options.client ?? 'all', io: console });
    if (action === 'build') return module.buildCodemap({ projectRoot, io: console });
    if (action === 'update') return module.updateCodemap({ projectRoot, io: console });
    if (action === 'status') return module.statusCodemap({ projectRoot, io: console });
  }

  if (target === 'offload') {
    const { captureFromStdin, resolveStorage } = await import('../../offload/tool-offload.mjs');
    if (action === 'capture') {
      const workspaceRoot = options.workspaceRoot ? path.resolve(options.workspaceRoot) : projectRoot;
      const config = await loadWorkspaceConfig(workspaceRoot);
      const storage = resolveStorage(options, process.env, config);
      await captureFromStdin(workspaceRoot, storage, config);
      return;
    }
  }

  throw new Error(`Unsupported internal action: ${target} ${action}`);
}
