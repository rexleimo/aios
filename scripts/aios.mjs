#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseArgs } from './lib/cli/parse-args.mjs';
import { getCommandHelpText, getInternalHelpText, getRootHelpText } from './lib/cli/help.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = process.cwd();

function printHelp(parsed) {
  if (!parsed || parsed.command === 'root') {
    process.stdout.write(getRootHelpText());
    return;
  }

  if (parsed.command === 'internal') {
    process.stdout.write(getInternalHelpText(parsed.options.target, parsed.options.action));
    return;
  }

  process.stdout.write(getCommandHelpText(parsed.command));
}

async function runInternal(options) {
  const { target, action } = options;

  if (target === 'shell') {
    const module = await import('./lib/components/shell.mjs');
    if (action === 'install') return module.installContextDbShell({ rootDir, mode: options.mode ?? 'opt-in', force: Boolean(options.force), rcFile: options.rcFile });
    if (action === 'update') return module.installContextDbShell({ rootDir, mode: options.mode ?? 'opt-in', force: true, rcFile: options.rcFile });
    if (action === 'uninstall') return module.uninstallContextDbShell({ rcFile: options.rcFile });
    if (action === 'doctor') return module.doctorContextDbShell({ rcFile: options.rcFile });
  }

  if (target === 'skills') {
    const module = await import('./lib/components/skills.mjs');
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
    const module = await import('./lib/components/native.mjs');
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
    const module = await import('./lib/components/superpowers.mjs');
    if (action === 'install') return module.installSuperpowers({ rootDir, repoUrl: options.repoUrl, update: Boolean(options.update), force: Boolean(options.force) });
    if (action === 'update') return module.installSuperpowers({ rootDir, repoUrl: options.repoUrl, update: true, force: true });
    if (action === 'doctor') return module.doctorSuperpowers();
    if (action === 'sync-claude-permissions') {
      return module.syncClaudeSkillPermissions({
        rootDir,
        includeGlobal: true,
        includeProject: true,
      });
    }
  }

  if (target === 'browser') {
    const module = await import('./lib/components/browser.mjs');
    if (action === 'install') return module.installBrowserMcp({ rootDir, dryRun: Boolean(options.dryRun), skipPlaywrightInstall: Boolean(options.skipPlaywrightInstall) });
    if (action === 'doctor') return module.doctorBrowserMcp({ rootDir, fix: Boolean(options.fix), dryRun: Boolean(options.dryRun) });
    if (action === 'mcp-migrate') return module.migrateBrowserMcpConfig({ rootDir, dryRun: Boolean(options.dryRun) });
    if (action === 'cdp-start') return module.startBrowserCdpService({ rootDir });
    if (action === 'cdp-stop') return module.stopBrowserCdpService({ rootDir });
    if (action === 'cdp-restart' || action === 'cdp-reload') return module.restartBrowserCdpService({ rootDir });
    if (action === 'cdp-status') return module.statusBrowserCdpService({ rootDir });
  }

  if (target === 'privacy') {
    const module = await import('./lib/components/shell.mjs');
    if (action === 'install') return module.installPrivacyGuard({ rootDir, enable: options.enable !== false, disable: Boolean(options.disable), mode: options.mode ?? '' });
  }

  throw new Error(`Unsupported internal action: ${target} ${action}`);
}


function resolveRuntimeWorkspace(command, options = {}) {
  const workspaceScoped = new Set(['harness', 'hud', 'memo', 'orchestrate', 'team', 'quality-gate', 'snapshot-rollback', 'entropy-gc', 'learn-eval', 'release-status', 'perception']);
  if (!workspaceScoped.has(command)) return rootDir;
  const explicit = String(options.workspaceRoot || options.rootDir || '').trim();
  if (explicit) return path.resolve(explicit);
  return projectRoot;
}

function buildTeamRuntimeEnv(options = {}, baseEnv = process.env) {
  const runtimeEnv = { ...baseEnv };
  const clientId = String(options.clientId || '').trim();
  if (clientId) {
    runtimeEnv.AIOS_SUBAGENT_CLIENT = clientId;
  }
  if (runtimeEnv.AIOS_MODEL_ROUTER === undefined) {
    runtimeEnv.AIOS_MODEL_ROUTER = '1';
  }
  const workers = Number.parseInt(String(options.workers ?? '').trim(), 10);
  if (Number.isFinite(workers) && workers > 0) {
    runtimeEnv.AIOS_SUBAGENT_CONCURRENCY = String(workers);
  }
  if (String(options.executionMode || '').trim().toLowerCase() === 'live') {
    runtimeEnv.AIOS_EXECUTE_LIVE = '1';
  }
  return runtimeEnv;
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.stderr.write(getRootHelpText());
    process.exitCode = 1;
    return;
  }

  if (parsed.mode === 'help') {
    printHelp(parsed);
    return;
  }

  if (parsed.mode === 'interactive') {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      process.stderr.write('[warn] interactive TUI requires a TTY\n');
      process.stdout.write(getRootHelpText());
      process.exitCode = 1;
      return;
    }

    // Use dynamic import with tsx loader via wrapper
    const { execSync } = await import('node:child_process');
    const cliPath = path.join(rootDir, 'scripts/lib/tui-ink/cli.tsx');

    // Run tsx as a subprocess with proper TTY handling
    process.env.AIOS_ROOT_DIR = rootDir;
    process.env.AIOS_PROJECT_ROOT = projectRoot;

    try {
      execSync(`npx tsx "${cliPath}"`, {
        stdio: 'inherit',
        env: process.env,
      });
    } catch (err) {
      process.exitCode = 1;
    }
    return;
  }

  if (parsed.command === 'internal') {
    await runInternal(parsed.options);
    return;
  }

  if (parsed.command === 'init') {
    const { main: runAiosInit } = await import('./aios-init.mjs');
    const args = [];
    if (parsed.options.agent) args.push('--agent', parsed.options.agent);
    if (parsed.options.all) args.push('--all');
    if (parsed.options.dryRun) args.push('--dry-run');
    await runAiosInit(args);
    return;
  }

  if (parsed.command === 'setup') {
    const { runSetup } = await import('./lib/lifecycle/setup.mjs');
    await runSetup(parsed.options, { rootDir, projectRoot });
    return;
  }

  if (parsed.command === 'update') {
    const { runUpdate } = await import('./lib/lifecycle/update.mjs');
    await runUpdate(parsed.options, { rootDir, projectRoot });
    return;
  }

  if (parsed.command === 'uninstall') {
    const { runUninstall } = await import('./lib/lifecycle/uninstall.mjs');
    await runUninstall(parsed.options, { rootDir, projectRoot });
    return;
  }

  if (parsed.command === 'doctor') {
    const { runDoctor } = await import('./lib/lifecycle/doctor.mjs');
    await runDoctor(parsed.options, { rootDir });
    return;
  }

  if (parsed.command === 'quality-gate') {
    const { runQualityGate } = await import('./lib/lifecycle/quality-gate.mjs');
    const result = await runQualityGate(parsed.options, { rootDir: resolveRuntimeWorkspace(parsed.command, parsed.options) });
    if (result.exitCode !== 0) {
      process.exitCode = result.exitCode;
    }
    return;
  }

  if (parsed.command === 'orchestrate') {
    const { runOrchestrate } = await import('./lib/lifecycle/orchestrate.mjs');
    const result = await runOrchestrate(parsed.options, { rootDir: resolveRuntimeWorkspace(parsed.command, parsed.options) });
    if (result.exitCode !== 0) {
      process.exitCode = result.exitCode;
    }
    return;
  }

  if (parsed.command === 'snapshot-rollback') {
    const { runSnapshotRollback } = await import('./lib/lifecycle/snapshot-rollback.mjs');
    const result = await runSnapshotRollback(parsed.options, { rootDir: resolveRuntimeWorkspace(parsed.command, parsed.options) });
    if (result.exitCode !== 0) {
      process.exitCode = result.exitCode;
    }
    return;
  }

  if (parsed.command === 'team') {
    // Dry-run readiness check (before full orchestration)
    if (parsed.options.executionMode === 'dry-run' && !parsed.options.taskTitle) {
      const { runReadinessCheck } = await import('./lib/lifecycle/preflight-contracts.mjs');
      const result = await runReadinessCheck({ rootDir: resolveRuntimeWorkspace(parsed.command, parsed.options), mode: 'team' });
      console.log(JSON.stringify(result, null, 2));
      if (result.verdict === 'blocked') process.exitCode = 1;
      return;
    }
    if (parsed.options.subcommand === 'status') {
      const { runTeamStatus } = await import('./lib/lifecycle/team-ops.mjs');
      const result = await runTeamStatus(parsed.options, { rootDir: resolveRuntimeWorkspace(parsed.command, parsed.options) });
      if (result.exitCode !== 0) {
        process.exitCode = result.exitCode;
      }
      return;
    }
    if (parsed.options.subcommand === 'history') {
      const { runTeamHistory } = await import('./lib/lifecycle/team-ops.mjs');
      const result = await runTeamHistory(parsed.options, { rootDir: resolveRuntimeWorkspace(parsed.command, parsed.options) });
      if (result.exitCode !== 0) {
        process.exitCode = result.exitCode;
      }
      return;
    }
    if (parsed.options.subcommand === 'watchdog') {
      const { runTeamWatchdog } = await import('./lib/lifecycle/watchdog.mjs');
      const result = await runTeamWatchdog(parsed.options, { rootDir: resolveRuntimeWorkspace(parsed.command, parsed.options) });
      if (result.exitCode !== 0) {
        process.exitCode = result.exitCode;
      }
      return;
    }
    if (parsed.options.subcommand === 'skill-candidates') {
      if (parsed.options.action === 'list') {
        const { runTeamSkillCandidatesList } = await import('./lib/lifecycle/team-ops.mjs');
        const result = await runTeamSkillCandidatesList(parsed.options, { rootDir: resolveRuntimeWorkspace(parsed.command, parsed.options) });
        if (result.exitCode !== 0) {
          process.exitCode = result.exitCode;
        }
        return;
      }
      if (parsed.options.action === 'export') {
        const { runTeamSkillCandidatesExport } = await import('./lib/lifecycle/team-ops.mjs');
        const result = await runTeamSkillCandidatesExport(parsed.options, { rootDir: resolveRuntimeWorkspace(parsed.command, parsed.options) });
        if (result.exitCode !== 0) {
          process.exitCode = result.exitCode;
        }
        return;
      }
    }

    const { runOrchestrate } = await import('./lib/lifecycle/orchestrate.mjs');
    const runtimeEnv = buildTeamRuntimeEnv(parsed.options, process.env);
    const result = await runOrchestrate({
      blueprint: parsed.options.blueprint,
      taskTitle: parsed.options.taskTitle,
      contextSummary: parsed.options.contextSummary,
      planPath: parsed.options.planPath,
      sessionId: parsed.options.sessionId,
      resumeSessionId: parsed.options.resumeSessionId,
      retryBlocked: Boolean(parsed.options.retryBlocked),
      force: Boolean(parsed.options.force),
      limit: parsed.options.limit,
      recommendationId: parsed.options.recommendationId,
      dispatchMode: 'local',
      executionMode: parsed.options.executionMode,
      preflightMode: parsed.options.preflightMode,
      format: parsed.options.format,
    }, {
      rootDir: resolveRuntimeWorkspace(parsed.command, parsed.options),
      env: runtimeEnv,
    });
    if (result.exitCode !== 0) {
      process.exitCode = result.exitCode;
    }
    return;
  }

  if (parsed.command === 'harness') {
    // Dry-run readiness check (before harness run)
    if (parsed.options.executionMode === 'dry-run' && parsed.options.action !== 'run') {
      const { runReadinessCheck } = await import('./lib/lifecycle/preflight-contracts.mjs');
      const result = await runReadinessCheck({ rootDir: resolveRuntimeWorkspace(parsed.command, parsed.options), mode: 'harness' });
      console.log(JSON.stringify(result, null, 2));
      if (result.verdict === 'blocked') process.exitCode = 1;
      return;
    }
    const { runHarnessCommand } = await import('./lib/lifecycle/harness.mjs');
    const result = await runHarnessCommand(parsed.options, {
      rootDir: resolveRuntimeWorkspace(parsed.command, parsed.options),
      aiosRootDir: rootDir,
    });
    if (result.exitCode !== 0) {
      process.exitCode = result.exitCode;
    }
    return;
  }

  if (parsed.command === 'hud') {
    const { runHud } = await import('./lib/lifecycle/hud.mjs');
    const result = await runHud(parsed.options, { rootDir: resolveRuntimeWorkspace(parsed.command, parsed.options) });
    if (result.exitCode !== 0) {
      process.exitCode = result.exitCode;
    }
    return;
  }

  if (parsed.command === 'learn-eval') {
    const { runLearnEval } = await import('./lib/lifecycle/learn-eval.mjs');
    const result = await runLearnEval(parsed.options, { rootDir: resolveRuntimeWorkspace(parsed.command, parsed.options) });
    if (result.exitCode !== 0) {
      process.exitCode = result.exitCode;
    }
    return;
  }

  if (parsed.command === 'entropy-gc') {
    const { runEntropyGc } = await import('./lib/lifecycle/entropy-gc.mjs');
    const result = await runEntropyGc(parsed.options, { rootDir: resolveRuntimeWorkspace(parsed.command, parsed.options) });
    if (result.exitCode !== 0) {
      process.exitCode = result.exitCode;
    }
    return;
  }

  if (parsed.command === 'release-status') {
    const { runReleaseStatus } = await import('./lib/lifecycle/release-status.mjs');
    const result = await runReleaseStatus(parsed.options, { rootDir: resolveRuntimeWorkspace(parsed.command, parsed.options) });
    if (result.exitCode !== 0) {
      process.exitCode = result.exitCode;
    }
    return;
  }

  if (parsed.command === 'memo') {
    const { runMemo } = await import('./lib/memo/memo.mjs');
    await runMemo(parsed.options, { rootDir: resolveRuntimeWorkspace(parsed.command, parsed.options) });
    return;
  }

  if (parsed.command === 'model-router') {
    const { runModelRouterCommand } = await import('./lib/model-router.mjs');
    const result = await runModelRouterCommand(parsed.options, { rootDir: resolveRuntimeWorkspace(parsed.command, parsed.options) });
    if (result.exitCode !== 0) {
      process.exitCode = result.exitCode;
    }
    return;
  }

  if (parsed.command === 'perception') {
    const sub = parsed.options.subcommand || 'summary';
    const rootDir = resolveRuntimeWorkspace(parsed.command, parsed.options);
    if (sub === 'record') {
      const { recordOutcomeSnapshot } = await import('./lib/perception/outcome-recorder.mjs');
      await recordOutcomeSnapshot(parsed.options, { rootDir });
    } else if (sub === 'insights') {
      const { generateInsights } = await import('./lib/perception/insight-generator.mjs');
      await generateInsights(parsed.options, { rootDir });
    } else if (sub === 'summary') {
      const { runPerceptionSummary } = await import('./lib/perception/perception-summary.mjs');
      await runPerceptionSummary(parsed.options, { rootDir });
    } else {
      throw new Error(`Unknown perception subcommand: ${sub}. Use: record, insights, summary`);
    }
    return;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
