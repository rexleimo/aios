// scripts/lib/tooling/cli/dispatch/dispatch.mjs — barrel index + 剩余的 createAiosDispatch 路由逻辑
// 原文件 425 行拆分为 helpers.mjs（printHelp/applyResultExitCode/runInteractiveTui）+ 本文件（路由表）

import { chooseInteractiveCommand } from '../commander/interactive.mjs';
import { runMemoryFamilyCommand } from './memory.mjs';
import { runInternal } from './internal.mjs';
import { runInterceptionCommand } from './interception.mjs';
import { runCanvasCommand, runRefsCommand } from './offload.mjs';
import { buildTeamRuntimeEnv, getRuntimeVersion, resolveRuntimeWorkspace } from './runtime.mjs';
import { printHelp, applyResultExitCode, runInteractiveTui } from './helpers.mjs';
import { getRootHelpText } from '../help/help.mjs';
import { applyProjectRootFlag } from '../project-root.mjs';

export { applyResultExitCode } from './helpers.mjs';

/**
 * 特性自带 `cli.mjs` 的命令：装载方式与参数三件套完全同形，所以一张表配一条分支，
 * 而不是每个命令抄一遍那 6 行——抄出来的副本 standards 按重复计，更要紧的是四份会各自漂移
 * （`integration` 与 `search` 今天少传一个键，就是因为它们是各写各的）。
 * `withProjectRoot: true` = 该 runner 要把「工作区」和「项目根」分开（只有往项目里写配置的命令需要）。
 */
const FEATURE_CLI_ROUTES = Object.freeze({
  integration: { load: () => import('../../../clients/integrations/cli.mjs'), exportName: 'runIntegrationCommand', withProjectRoot: true },
  mcp: { load: () => import('../../../clients/mcp/cli.mjs'), exportName: 'runMcpCommand', withProjectRoot: true },
  judgment: { load: () => import('../../../learning/judgment/cli.mjs'), exportName: 'runJudgmentCommand', withProjectRoot: false },
  search: { load: () => import('../../../memory/search/cli.mjs'), exportName: 'runSearchCommand', withProjectRoot: false },
});

/** 所有 CLI 命令的路由表；新增能力必须在这里接入才能被真实调用 */
export function createAiosDispatch({ rootDir, projectRoot, stdout = process.stdout, stderr = process.stderr, runAiosInit = null } = {}) {
  const context = { rootDir, projectRoot };
  /** workspace 参数优先；没传时用当前 projectRoot，确保 proof/refs 写到用户正在操作的工作区 */
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
      await printHelp(parsed, { stdout });
      return;
    }

    /** --project-root 必须在路由表之前落到 context 上：下游命令都读同一个对象。 */
    applyProjectRootFlag(context, parsed.options);

    if (parsed.command === 'version') {
      stdout.write(`AIOS ${await getRuntimeVersion(rootDir)}\n`);
      return;
    }

    if (parsed.command === 'rex') {
      const { createRexCommandRunner } = await import('../../../clients/rex-harness/command.mjs');
      const runRex = createRexCommandRunner({ rootDir: process.env.AIOS_REX_ROOT || rootDir });
      const result = await runRex(parsed.options.args, { write: (value) => stdout.write(value) });
      process.exitCode = result.exitCode;
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
      const runInit = runAiosInit || (await import('../../../../aios-init.mjs')).main;
      const args = [];
      if (parsed.options.agent) args.push('--agent', parsed.options.agent);
      if (parsed.options.all) args.push('--all');
      if (parsed.options.dryRun) args.push('--dry-run');
      if (parsed.options.adoptLegacySuperpowers) args.push('--adopt-legacy-superpowers');
      if (parsed.options.yesCompressionTools) args.push('--yes-compression-tools');
      if (parsed.options.yesHeadroomMcp) args.push('--yes-headroom-mcp');
      if (parsed.options.defaultMode) {
        const { writeAiosConfig } = await import('../../../execution/lifecycle/govern/options/default-mode.mjs');
        await writeAiosConfig(rootDir, { defaultMode: parsed.options.defaultMode });
        args.push('--default-mode', parsed.options.defaultMode);
      }
      await runInit(args);
      return;
    }

    if (parsed.command === 'setup') {
      const { runSetup } = await import('../../../execution/lifecycle/setup/setup.mjs');
      await runSetup(parsed.options, context);
      return;
    }

    if (parsed.command === 'update') {
      const { runUpdate } = await import('../../../execution/lifecycle/setup/update.mjs');
      await runUpdate(parsed.options, context);
      return;
    }

    if (parsed.command === 'uninstall') {
      const { runUninstall } = await import('../../../execution/lifecycle/setup/uninstall.mjs');
      await runUninstall(parsed.options, context);
      return;
    }

    if (parsed.command === 'doctor') {
      const { runDoctor } = await import('../../../execution/lifecycle/govern/doctor.mjs');
      await runDoctor(parsed.options, context);
      return;
    }

    if (parsed.command === 'clients') {
      const { runClientsCommand } = await import('../../../execution/lifecycle/fleet/clients.mjs');
      applyResultExitCode(await runClientsCommand(parsed.options, { rootDir: workspaceFor(parsed), stdout }));
      return;
    }

    if (parsed.command === 'status') {
      const { runStatusCommand } = await import('../../../execution/lifecycle/fleet/status.mjs');
      applyResultExitCode(await runStatusCommand(parsed.options, { rootDir: workspaceFor(parsed), stdout }));
      return;
    }

    if (parsed.command === 'agents') {
      const { runAgentsCommand } = await import('../../../execution/lifecycle/fleet/agents.mjs');
      applyResultExitCode(await runAgentsCommand(parsed.options, { rootDir: workspaceFor(parsed), stdout }));
      return;
    }

    if (parsed.command === 'skill') {
      if (['list', 'install', 'sync', 'remove', 'diagnose'].includes(parsed.options.subcommand)) {
        const { runSkillManagement } = await import('../../components/skills/lifecycle/cli.mjs');
        applyResultExitCode(await runSkillManagement(parsed.options, { rootDir: workspaceFor(parsed), stdout }));
        return;
      }
      if (parsed.options.subcommand === 'comply') {
        const { runSkillComply } = await import('../../skills/compliance/compliance.mjs');
        applyResultExitCode(await runSkillComply(parsed.options, { rootDir: workspaceFor(parsed), stdout }));
        return;
      }
      if (parsed.options.subcommand === 'health') {
        const { runSkillHealth } = await import('../../skills/compliance/health.mjs');
        applyResultExitCode(await runSkillHealth(parsed.options, { rootDir: workspaceFor(parsed), stdout }));
        return;
      }
      if (parsed.options.subcommand === 'certify') {
        const { runSkillTrainingCertification } = await import('../../skills/training/training-gate.mjs');
        applyResultExitCode(await runSkillTrainingCertification(parsed.options, { rootDir: workspaceFor(parsed), stdout }));
        return;
      }
      if (parsed.options.subcommand === 'verify-training') {
        const { runSkillTrainingGate } = await import('../../skills/training/training-gate.mjs');
        applyResultExitCode(await runSkillTrainingGate(parsed.options, { rootDir: workspaceFor(parsed), stdout }));
        return;
      }
      /* 外部技能安装：本地目录 / git URL → 注册处 → 全客户端用户级技能根 */
      if (parsed.options.subcommand === 'add') {
        const { installExternalSkills } = await import('../../components/skills/external/index.mjs');
        applyResultExitCode(await installExternalSkills({
          source: parsed.options.source,
          client: parsed.options.client,
          selectedSkills: parsed.options.skill,
          force: Boolean(parsed.options.force),
          yes: Boolean(parsed.options.yes),
          dryRun: Boolean(parsed.options.dryRun),
          json: Boolean(parsed.options.json),
          stdout,
        }));
        return;
      }
      /* Skill Workshop — 受控技能自生成闭环 */
      if (parsed.options.subcommand === 'propose') {
        const { propose } = await import('../../skills/skill-workshop.mjs');
        applyResultExitCode(await propose({ rootDir: workspaceFor(parsed), description: parsed.options.description, stdout }));
        return;
      }
      if (parsed.options.subcommand === 'review') {
        const { review } = await import('../../skills/skill-workshop.mjs');
        applyResultExitCode(await review({ rootDir: workspaceFor(parsed), id: parsed.options.id, action: parsed.options.action, stdout, stderr }));
        return;
      }
      if (parsed.options.subcommand === 'apply') {
        const { apply: workshopApply } = await import('../../skills/skill-workshop.mjs');
        applyResultExitCode(await workshopApply({ rootDir: workspaceFor(parsed), id: parsed.options.id, policyCheck: Boolean(parsed.options.policy), stdout, stderr }));
        return;
      }
      if (parsed.options.subcommand === 'rollback') {
        const { rollback } = await import('../../skills/skill-workshop.mjs');
        applyResultExitCode(await rollback({ rootDir: workspaceFor(parsed), name: parsed.options.name, stdout, stderr }));
        return;
      }
      if (parsed.options.subcommand === 'index') {
        const { skillIndexScan } = await import('../../skills/skill-workshop.mjs');
        applyResultExitCode(await skillIndexScan({ rootDir: workspaceFor(parsed), stdout }));
        return;
      }
    }

    if (parsed.command === 'session') {
      const sub = parsed.options.subcommand;
      if (sub === 'close') {
        const { runSessionClose } = await import('../../../execution/lifecycle/run/session-hooks/close.mjs');
        applyResultExitCode(await runSessionClose(parsed.options, { rootDir: workspaceFor(parsed), stdout }));
        return;
      }
      if (sub === 'start') {
        const { runSessionStartTimeline } = await import('../../../execution/lifecycle/run/session-hooks/start-timeline.mjs');
        applyResultExitCode(await runSessionStartTimeline(parsed.options, { rootDir: workspaceFor(parsed), stdout }));
        return;
      }
      const { runSessionChangedFiles } = await import('../../../execution/session/changed-files.mjs');
      applyResultExitCode(await runSessionChangedFiles(parsed.options, { rootDir: workspaceFor(parsed), stdout }));
      return;
    }

    if (parsed.command === 'quality-gate') {
      const { runQualityGate } = await import('../../../execution/lifecycle/govern/quality-gate.mjs');
      applyResultExitCode(await runQualityGate(parsed.options, { rootDir: workspaceFor(parsed) }));
      return;
    }

    if (parsed.command === 'orchestrate') {
      const { runOrchestrate } = await import('../../../execution/lifecycle/run/orchestrate.mjs');
      applyResultExitCode(await runOrchestrate(parsed.options, { rootDir: workspaceFor(parsed) }));
      return;
    }

    if (parsed.command === 'workflow') {
      const { runWorkflowCommand } = await import('../../../execution/lifecycle/run/workflow.mjs');
      applyResultExitCode(await runWorkflowCommand(parsed.options, { rootDir: workspaceFor(parsed), stdout }));
      return;
    }

    if (parsed.command === 'work') {
      /* work 是统一并发调度入口：默认 live（AIOS_EXECUTE_LIVE=1），语义翻译在 lifecycle/run/work.mjs */
      const { runWorkCommand } = await import('../../../execution/lifecycle/run/work.mjs');
      applyResultExitCode(await runWorkCommand(parsed.options, { rootDir: workspaceFor(parsed) }));
      return;
    }

    if (parsed.command === 'snapshot-rollback') {
      const { runSnapshotRollback } = await import('../../../execution/lifecycle/setup/snapshot-rollback.mjs');
      applyResultExitCode(await runSnapshotRollback(parsed.options, { rootDir: workspaceFor(parsed) }));
      return;
    }

    if (parsed.command === 'team') {
      /* team dry-run 没有任务标题时只做 preflight，防止误启动多 agent 执行 */
      if (parsed.options.executionMode === 'dry-run' && !parsed.options.taskTitle) {
        const { runReadinessCheck } = await import('../../../execution/lifecycle/govern/preflight-contracts.mjs');
        const result = await runReadinessCheck({ rootDir: workspaceFor(parsed), mode: 'team' });
        console.log(JSON.stringify(result, null, 2));
        if (result.verdict === 'blocked') process.exitCode = 1;
        return;
      }
      if (parsed.options.subcommand === 'status') {
        const { runTeamStatus } = await import('../../../execution/lifecycle/fleet/team-ops.mjs');
        applyResultExitCode(await runTeamStatus(parsed.options, { rootDir: workspaceFor(parsed) }));
        return;
      }
      if (parsed.options.subcommand === 'history') {
        const { runTeamHistory } = await import('../../../execution/lifecycle/fleet/team-ops.mjs');
        applyResultExitCode(await runTeamHistory(parsed.options, { rootDir: workspaceFor(parsed) }));
        return;
      }
      if (parsed.options.subcommand === 'watchdog') {
        const { runTeamWatchdog } = await import('../../../execution/lifecycle/fleet/watchdog.mjs');
        applyResultExitCode(await runTeamWatchdog(parsed.options, { rootDir: workspaceFor(parsed) }));
        return;
      }
      if (parsed.options.subcommand === 'skill-candidates') {
        if (parsed.options.action === 'list') {
          const { runTeamSkillCandidatesList } = await import('../../../execution/lifecycle/fleet/team-ops.mjs');
          applyResultExitCode(await runTeamSkillCandidatesList(parsed.options, { rootDir: workspaceFor(parsed) }));
          return;
        }
        if (parsed.options.action === 'export') {
          const { runTeamSkillCandidatesExport } = await import('../../../execution/lifecycle/fleet/team-ops.mjs');
          applyResultExitCode(await runTeamSkillCandidatesExport(parsed.options, { rootDir: workspaceFor(parsed) }));
          return;
        }
      }

      const { runOrchestrate } = await import('../../../execution/lifecycle/run/orchestrate.mjs');
      const runtimeEnv = buildTeamRuntimeEnv(parsed.options, process.env);
      /* team 命令最终复用 orchestrate，本层只负责把团队语义翻译成 local dispatch 参数 */
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
      /* 非 run 的 dry-run harness 先做 readiness，避免 resume/status 误触发真实执行 */
      if (parsed.options.executionMode === 'dry-run' && parsed.options.action !== 'run') {
        const { runReadinessCheck } = await import('../../../execution/lifecycle/govern/preflight-contracts.mjs');
        const result = await runReadinessCheck({ rootDir: workspaceFor(parsed), mode: 'harness' });
        console.log(JSON.stringify(result, null, 2));
        if (result.verdict === 'blocked') process.exitCode = 1;
        return;
      }
      const { runHarnessCommand } = await import('../../../execution/lifecycle/run/harness.mjs');
      applyResultExitCode(await runHarnessCommand(parsed.options, {
        rootDir: workspaceFor(parsed),
        aiosRootDir: rootDir,
      }));
      return;
    }

    if (parsed.command === 'hud') {
      const { runHud } = await import('../../../execution/lifecycle/fleet/hud.mjs');
      applyResultExitCode(await runHud(parsed.options, { rootDir: workspaceFor(parsed) }));
      return;
    }

    if (parsed.command === 'learn-eval') {
      const { runLearnEval } = await import('../../../execution/lifecycle/evolve/learn-eval.mjs');
      applyResultExitCode(await runLearnEval(parsed.options, { rootDir: workspaceFor(parsed) }));
      return;
    }

    if (parsed.command === 'entropy-gc') {
      const { runEntropyGc } = await import('../../../execution/lifecycle/govern/entropy-gc.mjs');
      applyResultExitCode(await runEntropyGc(parsed.options, { rootDir: workspaceFor(parsed) }));
      return;
    }

    if (parsed.command === 'release-status') {
      const { runReleaseStatus } = await import('../../../execution/lifecycle/release/release-status.mjs');
      applyResultExitCode(await runReleaseStatus(parsed.options, { rootDir: workspaceFor(parsed) }));
      return;
    }

    if (parsed.command === 'evolution') {
      const { runEvolutionCommand } = await import('../../../execution/lifecycle/evolve/evolution-cli.mjs');
      applyResultExitCode(await runEvolutionCommand(parsed.options, {
        rootDir: workspaceFor(parsed) || rootDir,
        stdout,
        stderr,
      }));
      return;
    }

    if (parsed.command === 'plan') {
      const { runPlanCommand } = await import('../../../foundation/planning/ops/cli.mjs');
      const result = await runPlanCommand(parsed.options, {
        rootDir: workspaceFor(parsed) || rootDir,
        stdout,
        stderr,
      });
      applyResultExitCode(result);
      return;
    }

    if (parsed.command === 'dream') {
      const workspace = workspaceFor(parsed);
      let result;
      if (parsed.options.governanceAction) {
        const { runDreamGovernanceCommand } = await import('../../../execution/lifecycle/evolve/dream/governance.mjs');
        result = await runDreamGovernanceCommand(parsed.options, {
          rootDir: workspace,
          env: process.env,
        });
      } else if (parsed.options.to) {
        const { runDreamExport } = await import('../../../execution/lifecycle/evolve/dream/export-to.mjs');
        result = await runDreamExport({
          rootDir: workspace,
          mode: parsed.options.mode,
          spaces: parsed.options.spaces,
          to: parsed.options.to,
        });
      } else {
        const { runDream } = await import('../../../execution/lifecycle/evolve/dream/index.mjs');
        result = await runDream({
          rootDir: workspace,
          mode: parsed.options.mode,
          spaces: parsed.options.spaces,
        });
      }
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      applyResultExitCode(result);
      return;
    }

    // 特性自带 cli.mjs 的命令走同一条分支：装载与参数三件套由上面的路由表决定，这里不再逐个抄写。
    const featureRoute = FEATURE_CLI_ROUTES[parsed.command];
    if (featureRoute) {
      const loaded = await featureRoute.load();
      applyResultExitCode(await loaded[featureRoute.exportName](parsed.options, featureRoute.withProjectRoot
        ? { rootDir: workspaceFor(parsed), projectRoot: context.projectRoot, stdout }
        : { rootDir: workspaceFor(parsed), stdout }));
      return;
    }

    if (parsed.command === 'standards') {
      // 中文注释：转发到子模块命令的同一个实现入口（公开面），不 spawn 也不二次判定。
      const { runStandardsArgs } = await import('../../../../../rex-harness/src/index.mjs');
      const result = await runStandardsArgs(['check', ...(parsed.options.argv || [])], { cwd: projectRoot });
      process.exitCode = result.exitCode ?? 0;
      return;
    }

    // 记忆与留痕族（memo/memory/tokens/import）的路由在 ./memory.mjs，行为原样搬出；
    // 本文件是入口表，不是这些命令的实现处。
    if (await runMemoryFamilyCommand(parsed, { workspaceRoot: workspaceFor(parsed), stdout })) return;

    if (parsed.command === 'model-router') {
      const { runModelRouterCommand } = await import('../../model-router.mjs');
      applyResultExitCode(await runModelRouterCommand(parsed.options, { rootDir: workspaceFor(parsed) }));
      return;
    }

    if (parsed.command === 'perception') {
      const sub = parsed.options.subcommand || 'summary';
      const runtimeRoot = workspaceFor(parsed);
      if (sub === 'record') {
        const { recordOutcomeSnapshot } = await import('../../../memory/perception/outcome-recorder.mjs');
        await recordOutcomeSnapshot(parsed.options, { rootDir: runtimeRoot });
      } else if (sub === 'insights') {
        const { generateInsights } = await import('../../../memory/perception/insight-generator.mjs');
        await generateInsights(parsed.options, { rootDir: runtimeRoot });
      } else if (sub === 'summary') {
        const { runPerceptionSummary } = await import('../../../memory/perception/perception-summary.mjs');
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
