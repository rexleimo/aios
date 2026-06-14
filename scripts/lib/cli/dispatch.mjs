/* 中文注释：顶层分发器把 interception、refs 和维护命令挂到统一 CLI，保证整条链路可执行。 */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { chooseInteractiveCommand } from './interactive.mjs';
import { getCommandHelpText, getInternalHelpText, getMemoHelpText, getRootHelpText } from './help.mjs';
import { runInternal } from './dispatch/internal.mjs';
import { runInterceptionCommand } from './dispatch/interception.mjs';
import { runCanvasCommand, runRefsCommand } from './dispatch/offload.mjs';
import { buildTeamRuntimeEnv, getRuntimeVersion, resolveRuntimeWorkspace } from './dispatch/runtime.mjs';

/* 中文注释：帮助输出也走统一分发器，保证新增 interception 子命令后 CLI 和文档入口一致。 */
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

/* 中文注释：子命令返回 exitCode 时在这里统一映射到进程退出码，避免每个模块直接改 process。 */
export function applyResultExitCode(result) {
  if (typeof result?.exitCode === 'number') {
    process.exitCode = result.exitCode;
  }
}

/* 中文注释：TUI 是交互入口；非 TTY 下直接降级为 help，避免自动化环境挂起。 */
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

/* 中文注释：createAiosDispatch 是所有 CLI 命令的路由表；新增能力必须在这里接入才能被真实调用。 */
export function createAiosDispatch({ rootDir, projectRoot, stdout = process.stdout, stderr = process.stderr } = {}) {
  const context = { rootDir, projectRoot };
  /* 中文注释：workspace 参数优先；没传时用当前 projectRoot，确保 proof/refs 写到用户正在操作的工作区。 */
  const workspaceFor = (parsed) => resolveRuntimeWorkspace(parsed.command, parsed.options, context);

  return async function dispatchParsed(parsed) {
    process.exitCode = 0;

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

    if (parsed.command === 'clients') {
      const { runClientsCommand } = await import('../lifecycle/clients.mjs');
      applyResultExitCode(await runClientsCommand(parsed.options, { rootDir: workspaceFor(parsed), stdout }));
      return;
    }

    if (parsed.command === 'skill') {
      if (parsed.options.subcommand === 'comply') {
        const { runSkillComply } = await import('../skills/compliance.mjs');
        applyResultExitCode(await runSkillComply(parsed.options, { rootDir: workspaceFor(parsed), stdout }));
        return;
      }
      if (parsed.options.subcommand === 'health') {
        const { runSkillHealth } = await import('../skills/health.mjs');
        applyResultExitCode(await runSkillHealth(parsed.options, { rootDir: workspaceFor(parsed), stdout }));
        return;
      }
    }

    if (parsed.command === 'session') {
      const { runSessionChangedFiles } = await import('../session/changed-files.mjs');
      applyResultExitCode(await runSessionChangedFiles(parsed.options, { rootDir: workspaceFor(parsed), stdout }));
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
      /* 中文注释：team dry-run 没有任务标题时只做 preflight，防止误启动多 agent 执行。 */
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
      /* 中文注释：team 命令最终复用 orchestrate，本层只负责把团队语义翻译成 local dispatch 参数。 */
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
      /* 中文注释：非 run 的 dry-run harness 先做 readiness，避免 resume/status 误触发真实执行。 */
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
      await runRefsCommand(parsed, { ...context, stdout, stderr });
      return;
    }

    if (parsed.command === 'search') {
      const { runSearchCommand } = await import('../search/cli.mjs');
      applyResultExitCode(await runSearchCommand(parsed.options, {
        rootDir: workspaceFor(parsed),
        stdout,
      }));
      return;
    }

    if (parsed.command === 'canvas') {
      await runCanvasCommand(parsed, { ...context, stdout, stderr });
      return;
    }

    if (parsed.command === 'interception') {
      applyResultExitCode(await runInterceptionCommand(parsed, { rootDir, workspaceRoot: workspaceFor(parsed) }));
      return;
    }
  };
}
