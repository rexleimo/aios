import path from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { chooseInteractiveCommand } from './interactive.mjs';
import { getCommandHelpText, getInternalHelpText, getMemoHelpText, getRootHelpText } from './help.mjs';
import { runInternal } from './dispatch/internal.mjs';
import { runCanvasCommand, runRefsCommand } from './dispatch/offload.mjs';
import { buildTeamRuntimeEnv, getRuntimeVersion, resolveRuntimeWorkspace } from './dispatch/runtime.mjs';

function printHelp(parsed, { stdout = process.stdout } = {}) {
  if (!parsed || parsed.command === 'root') {
    stdout.write(getRootHelpText());
    return;
  }

  if (parsed.command === 'internal') {
    stdout.write(getInternalHelpText(parsed.options.target, parsed.options.action));
    return;
  }

  if (parsed.command === 'memo') {
    stdout.write(getMemoHelpText(parsed.options.argv));
    return;
  }

  stdout.write(getCommandHelpText(parsed.command));
}

function applyResultExitCode(result) {
  if (result?.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

function runInteractiveTui({ rootDir, projectRoot, stderr = process.stderr }) {
  const cliPath = path.join(rootDir, 'scripts/lib/tui-ink/cli.tsx');
  const tsxCliPath = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');

  if (!existsSync(tsxCliPath)) {
    stderr.write(`[err] missing TUI runtime dependency: ${tsxCliPath}\n`);
    stderr.write('[hint] Reinstall AIOS, or run from the install root: npm install --include=dev\n');
    process.exitCode = 1;
    return;
  }

  process.env.AIOS_ROOT_DIR = rootDir;
  process.env.AIOS_PROJECT_ROOT = projectRoot;

  const result = spawnSync(process.execPath, [tsxCliPath, cliPath], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) {
    stderr.write(`[err] failed to start AIOS TUI: ${result.error.message}\n`);
    process.exitCode = 1;
    return;
  }
  const status = result.status ?? (result.signal ? 1 : 0);
  if (status !== 0) {
    process.exitCode = status;
  }
}

export function createAiosDispatch({ rootDir, projectRoot, stdout = process.stdout, stderr = process.stderr } = {}) {
  const context = { rootDir, projectRoot };
  const workspaceFor = (parsed) => resolveRuntimeWorkspace(parsed.command, parsed.options, context);

  return async function dispatchParsed(parsed) {
    if (parsed.mode === 'interactive') {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        stderr.write('[warn] interactive TUI requires a TTY\n');
        stdout.write(getRootHelpText());
        process.exitCode = 1;
        return;
      }
      if (parsed.command === 'tui') {
        runInteractiveTui({ ...context, stderr });
        return;
      }
      parsed = await chooseInteractiveCommand();
    }

    if (parsed.mode === 'help') {
      printHelp(parsed, { stdout });
      return;
    }

    if (parsed.command === 'version') {
      stdout.write(`Harness CLI ${await getRuntimeVersion(rootDir)}\n`);
      return;
    }

    if (parsed.mode === 'interactive') {
      runInteractiveTui(context);
      return;
    }

    if (parsed.command === 'internal') {
      await runInternal(parsed.options, context);
      return;
    }

    if (parsed.command === 'init') {
      const { main: runAiosInit } = await import('../../aios-init.mjs');
      const args = [];
      if (parsed.options.agent) args.push('--agent', parsed.options.agent);
      if (parsed.options.all) args.push('--all');
      if (parsed.options.dryRun) args.push('--dry-run');
      await runAiosInit(args);
      return;
    }

    if (parsed.command === 'setup') {
      const { runSetup } = await import('../lifecycle/setup.mjs');
      await runSetup(parsed.options, context);
      return;
    }

    if (parsed.command === 'update') {
      const { runUpdate } = await import('../lifecycle/update.mjs');
      await runUpdate(parsed.options, context);
      return;
    }

    if (parsed.command === 'uninstall') {
      const { runUninstall } = await import('../lifecycle/uninstall.mjs');
      await runUninstall(parsed.options, context);
      return;
    }

    if (parsed.command === 'doctor') {
      const { runDoctor } = await import('../lifecycle/doctor.mjs');
      await runDoctor(parsed.options, context);
      return;
    }

    if (parsed.command === 'quality-gate') {
      const { runQualityGate } = await import('../lifecycle/quality-gate.mjs');
      applyResultExitCode(await runQualityGate(parsed.options, { rootDir: workspaceFor(parsed) }));
      return;
    }

    if (parsed.command === 'orchestrate') {
      const { runOrchestrate } = await import('../lifecycle/orchestrate.mjs');
      applyResultExitCode(await runOrchestrate(parsed.options, { rootDir: workspaceFor(parsed) }));
      return;
    }

    if (parsed.command === 'snapshot-rollback') {
      const { runSnapshotRollback } = await import('../lifecycle/snapshot-rollback.mjs');
      applyResultExitCode(await runSnapshotRollback(parsed.options, { rootDir: workspaceFor(parsed) }));
      return;
    }

    if (parsed.command === 'team') {
      if (parsed.options.executionMode === 'dry-run' && !parsed.options.taskTitle) {
        const { runReadinessCheck } = await import('../lifecycle/preflight-contracts.mjs');
        const result = await runReadinessCheck({ rootDir: workspaceFor(parsed), mode: 'team' });
        console.log(JSON.stringify(result, null, 2));
        if (result.verdict === 'blocked') process.exitCode = 1;
        return;
      }
      if (parsed.options.subcommand === 'status') {
        const { runTeamStatus } = await import('../lifecycle/team-ops.mjs');
        applyResultExitCode(await runTeamStatus(parsed.options, { rootDir: workspaceFor(parsed) }));
        return;
      }
      if (parsed.options.subcommand === 'history') {
        const { runTeamHistory } = await import('../lifecycle/team-ops.mjs');
        applyResultExitCode(await runTeamHistory(parsed.options, { rootDir: workspaceFor(parsed) }));
        return;
      }
      if (parsed.options.subcommand === 'watchdog') {
        const { runTeamWatchdog } = await import('../lifecycle/watchdog.mjs');
        applyResultExitCode(await runTeamWatchdog(parsed.options, { rootDir: workspaceFor(parsed) }));
        return;
      }
      if (parsed.options.subcommand === 'skill-candidates') {
        if (parsed.options.action === 'list') {
          const { runTeamSkillCandidatesList } = await import('../lifecycle/team-ops.mjs');
          applyResultExitCode(await runTeamSkillCandidatesList(parsed.options, { rootDir: workspaceFor(parsed) }));
          return;
        }
        if (parsed.options.action === 'export') {
          const { runTeamSkillCandidatesExport } = await import('../lifecycle/team-ops.mjs');
          applyResultExitCode(await runTeamSkillCandidatesExport(parsed.options, { rootDir: workspaceFor(parsed) }));
          return;
        }
      }

      const { runOrchestrate } = await import('../lifecycle/orchestrate.mjs');
      const runtimeEnv = buildTeamRuntimeEnv(parsed.options, process.env);
      applyResultExitCode(await runOrchestrate({
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
        rootDir: workspaceFor(parsed),
        env: runtimeEnv,
      }));
      return;
    }

    if (parsed.command === 'harness') {
      if (parsed.options.executionMode === 'dry-run' && parsed.options.action !== 'run') {
        const { runReadinessCheck } = await import('../lifecycle/preflight-contracts.mjs');
        const result = await runReadinessCheck({ rootDir: workspaceFor(parsed), mode: 'harness' });
        console.log(JSON.stringify(result, null, 2));
        if (result.verdict === 'blocked') process.exitCode = 1;
        return;
      }
      const { runHarnessCommand } = await import('../lifecycle/harness.mjs');
      applyResultExitCode(await runHarnessCommand(parsed.options, {
        rootDir: workspaceFor(parsed),
        aiosRootDir: rootDir,
      }));
      return;
    }

    if (parsed.command === 'hud') {
      const { runHud } = await import('../lifecycle/hud.mjs');
      applyResultExitCode(await runHud(parsed.options, { rootDir: workspaceFor(parsed) }));
      return;
    }

    if (parsed.command === 'learn-eval') {
      const { runLearnEval } = await import('../lifecycle/learn-eval.mjs');
      applyResultExitCode(await runLearnEval(parsed.options, { rootDir: workspaceFor(parsed) }));
      return;
    }

    if (parsed.command === 'entropy-gc') {
      const { runEntropyGc } = await import('../lifecycle/entropy-gc.mjs');
      applyResultExitCode(await runEntropyGc(parsed.options, { rootDir: workspaceFor(parsed) }));
      return;
    }

    if (parsed.command === 'release-status') {
      const { runReleaseStatus } = await import('../lifecycle/release-status.mjs');
      applyResultExitCode(await runReleaseStatus(parsed.options, { rootDir: workspaceFor(parsed) }));
      return;
    }

    if (parsed.command === 'memo') {
      const { runMemo } = await import('../memo/memo.mjs');
      await runMemo(parsed.options, { rootDir: workspaceFor(parsed) });
      return;
    }

    if (parsed.command === 'model-router') {
      const { runModelRouterCommand } = await import('../model-router.mjs');
      applyResultExitCode(await runModelRouterCommand(parsed.options, { rootDir: workspaceFor(parsed) }));
      return;
    }

    if (parsed.command === 'perception') {
      const sub = parsed.options.subcommand || 'summary';
      const runtimeRoot = workspaceFor(parsed);
      if (sub === 'record') {
        const { recordOutcomeSnapshot } = await import('../perception/outcome-recorder.mjs');
        await recordOutcomeSnapshot(parsed.options, { rootDir: runtimeRoot });
      } else if (sub === 'insights') {
        const { generateInsights } = await import('../perception/insight-generator.mjs');
        await generateInsights(parsed.options, { rootDir: runtimeRoot });
      } else if (sub === 'summary') {
        const { runPerceptionSummary } = await import('../perception/perception-summary.mjs');
        await runPerceptionSummary(parsed.options, { rootDir: runtimeRoot });
      } else {
        throw new Error(`Unknown perception subcommand: ${sub}. Use: record, insights, summary`);
      }
      return;
    }

    if (parsed.command === 'refs') {
      await runRefsCommand(parsed, context);
      return;
    }

    if (parsed.command === 'canvas') {
      await runCanvasCommand(parsed, context);
    }
  };
}
