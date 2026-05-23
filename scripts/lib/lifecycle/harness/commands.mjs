import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  clearSoloHarnessStop,
  initSoloRunJournal,
  readSoloRunStatus,
  readSoloRunSummary,
  requestSoloHarnessStop,
  writeSoloRunSummary,
} from '../../harness/solo-journal.mjs';
import { finalizeSoloWorktree, prepareSoloWorktree } from '../../harness/solo-worktree.mjs';
import { checkSoloHarnessProfileReadiness } from '../../harness/solo-profiles.mjs';
import { runSoloHarnessLoop } from '../../harness/solo-runtime.mjs';
import { normalizeText } from './shared.mjs';
import { ensureSoloHarnessSession } from './session.mjs';
import { runHarnessDryRunChecks } from './dry-run.mjs';
import { renderStatus } from './status.mjs';
import { buildProductionExecuteTurn } from './execute-turn.mjs';
import { createLifecycleHooks } from './hooks.mjs';
import { resolveResumeWorktree } from './worktree.mjs';

export async function runHarnessCommand(options = {}, {
  rootDir,
  aiosRootDir = '',
  io = console,
  executeTurn = null,
  sleepImpl,
} = {}) {
  const subcommand = normalizeText(options.subcommand, 'run');
  const runtimeAiosRootDir = path.resolve(normalizeText(aiosRootDir, rootDir));

  if (subcommand === 'status') {
    const status = await readSoloRunStatus({ rootDir, sessionId: options.sessionId });
    if (!status) {
      return { exitCode: 1 };
    }
    await renderStatus(io, status, options.json === true);
    return { exitCode: 0, status };
  }

  if (subcommand === 'stop') {
    const existing = await readSoloRunSummary({ rootDir, sessionId: options.sessionId });
    if (!existing) {
      return { exitCode: 1 };
    }
    await requestSoloHarnessStop({
      rootDir,
      sessionId: options.sessionId,
      reason: normalizeText(options.reason, 'operator-request'),
    });
    const summary = await writeSoloRunSummary({
      rootDir,
      ...existing,
      stopRequested: true,
      updatedAt: new Date().toISOString(),
    });
    const status = await readSoloRunStatus({ rootDir, sessionId: summary.sessionId });
    await renderStatus(io, status, options.json === true);
    return { exitCode: 0, status };
  }

  if (subcommand === 'run') {
    const provider = normalizeText(options.provider, 'codex');
    const objective = normalizeText(options.objective);
    if (!objective) {
      throw new Error('harness run requires --objective');
    }
    const hooksEnabled = options.lifecycleHooks !== false;
    const session = ensureSoloHarnessSession({
      rootDir,
      sessionId: options.sessionId,
      provider,
      objective,
    });

    const journal = await initSoloRunJournal({
      rootDir,
      sessionId: session.sessionId,
      objective,
      provider: session.profile.provider,
      clientId: session.profile.clientId,
      profile: normalizeText(options.profile, 'standard'),
      worktree: {
        enabled: options.worktree === true,
        baseRef: normalizeText(options.baseRef, 'HEAD'),
        path: '',
        preserved: false,
        cleanupReason: '',
      },
      aiosRootDir: runtimeAiosRootDir,
      workspaceRoot: path.resolve(rootDir),
    });

    if (options.dryRun === true) {
      const checks = await runHarnessDryRunChecks({ rootDir, provider, sessionId: session.sessionId, objective, worktree: options.worktree === true });
      const status = await readSoloRunStatus({ rootDir, sessionId: session.sessionId });
      const result = {
        verdict: checks.verdict,
        checks: checks.results,
        nextActions: checks.nextActions,
        session: status,
      };
      if (options.json === true) {
        io.log(JSON.stringify(result, null, 2));
      } else {
        const verdictIcon = checks.verdict === 'ready' ? 'OK' : checks.verdict === 'warning' ? 'WARN' : 'BLOCKED';
        io.log(`\nHarness Dry-Run: ${verdictIcon} (${checks.verdict})`);
        io.log(`Objective: ${objective}`);
        io.log(`Session:   ${session.sessionId}`);
        io.log(`Provider:  ${provider}\n`);
        for (const check of checks.results) {
          const icon = check.ok ? '✓' : '✗';
          io.log(`  ${icon} ${check.label}`);
          if (check.detail) io.log(`    ${check.detail}`);
        }
        io.log('');
        for (const action of checks.nextActions) {
          io.log(`  → ${action}`);
        }
        io.log('');
      }
      return { exitCode: checks.verdict === 'blocked' ? 1 : 0, result };
    }

    const readiness = await checkSoloHarnessProfileReadiness({
      provider,
    });
    if (!readiness.ok) {
      if (options.json === true) {
        io.log(JSON.stringify(readiness, null, 2));
      } else {
        io.log(`AIOS Harness: readiness blocked\nReason: ${readiness.reason}\n- ${readiness.nextActions.join('\n- ')}\n`);
      }
      return { exitCode: 1 };
    }

    let prepared = null;
    let preservedWorktree = journal.summary.worktree;
    if (options.worktree === true) {
      prepared = await prepareSoloWorktree({
        rootDir,
        sessionId: session.sessionId,
        objective,
        enabled: true,
        baseRef: normalizeText(options.baseRef, 'HEAD'),
      });
      preservedWorktree = {
        enabled: true,
        baseRef: prepared.baseRef,
        path: prepared.path,
        preserved: false,
        cleanupReason: '',
        workspacePath: prepared.workspacePath,
        initialHead: prepared.initialHead,
      };
      await writeSoloRunSummary({
        rootDir,
        ...journal.summary,
        worktree: preservedWorktree,
        updatedAt: new Date().toISOString(),
      });
    }

    if (preservedWorktree?.enabled && preservedWorktree.path) {
      const codemapStatePath = path.join(rootDir, '.aios', 'codemap.json');
      if (existsSync(codemapStatePath)) {
        try {
          const { buildCodemap } = await import('../../components/codemap.mjs');
          await buildCodemap({ projectRoot: preservedWorktree.workspacePath || preservedWorktree.path, io: { log: (msg) => {} } });
        } catch (buildErr) {
          io.log(`[warn] codemap build in worktree failed: ${buildErr instanceof Error ? buildErr.message : String(buildErr)}`);
        }
      }
    }

    try {
      const result = await runSoloHarnessLoop({
        rootDir,
        sessionId: session.sessionId,
        objective,
        provider: session.profile.provider,
        clientId: session.profile.clientId,
        profile: normalizeText(options.profile, 'standard'),
        worktree: preservedWorktree,
        executeTurn: executeTurn || buildProductionExecuteTurn({
          rootDir,
          sessionId: session.sessionId,
          objective,
          provider,
          aiosRootDir: runtimeAiosRootDir,
        }),
        maxIterations: options.maxIterations,
        lifecycleHooks: createLifecycleHooks({ enabled: hooksEnabled }),
        sleepImpl,
      });
      let summary = result.summary;
      if (prepared) {
        const finalized = await finalizeSoloWorktree({
          rootDir,
          worktree: {
            ...prepared,
            path: prepared.path,
            workspacePath: prepared.workspacePath,
            initialHead: prepared.initialHead,
          },
          finalStatus: summary.status,
        });
        summary = await writeSoloRunSummary({
          rootDir,
          ...summary,
          worktree: {
            enabled: finalized.enabled,
            baseRef: finalized.baseRef,
            path: finalized.path,
            preserved: finalized.preserved,
            cleanupReason: finalized.cleanupReason,
          },
          updatedAt: new Date().toISOString(),
        });
      }
      const status = await readSoloRunStatus({ rootDir, sessionId: summary.sessionId });
      await renderStatus(io, status, options.json === true);
      return { exitCode: 0, status };
    } catch (error) {
      if (prepared) {
        await finalizeSoloWorktree({
          rootDir,
          worktree: prepared,
          finalStatus: 'failed',
        });
      }
      throw error;
    }
  }

  if (subcommand === 'resume') {
    const hooksEnabled = options.lifecycleHooks !== false;
    const existing = await readSoloRunSummary({ rootDir, sessionId: options.sessionId });
    if (!existing) {
      return { exitCode: 1 };
    }
    await clearSoloHarnessStop({ rootDir, sessionId: existing.sessionId });
    const restoredWorktree = await resolveResumeWorktree({ rootDir, summary: existing });
    const summary = await writeSoloRunSummary({
      rootDir,
      ...existing,
      stopRequested: false,
      worktree: restoredWorktree,
      updatedAt: new Date().toISOString(),
    });
    let result = await runSoloHarnessLoop({
      rootDir,
      sessionId: summary.sessionId,
      objective: summary.objective,
      provider: summary.provider,
      clientId: summary.clientId,
      profile: summary.profile,
      worktree: restoredWorktree,
      executeTurn: executeTurn || buildProductionExecuteTurn({
        rootDir,
        aiosRootDir: existing.aiosRootDir || runtimeAiosRootDir,
        sessionId: summary.sessionId,
        objective: summary.objective,
        provider: summary.provider,
      }),
      maxIterations: options.maxIterations,
      lifecycleHooks: createLifecycleHooks({ enabled: hooksEnabled }),
      sleepImpl,
    });
    if (restoredWorktree?.enabled && restoredWorktree?.path) {
      const finalized = await finalizeSoloWorktree({
        rootDir,
        worktree: restoredWorktree,
        finalStatus: result.summary.status,
      });
      const finalSummary = await writeSoloRunSummary({
        rootDir,
        ...result.summary,
        worktree: {
          enabled: finalized.enabled,
          baseRef: finalized.baseRef,
          path: finalized.path,
          workspacePath: finalized.workspacePath,
          initialHead: finalized.initialHead,
          preserved: finalized.preserved,
          cleanupReason: finalized.cleanupReason,
        },
        updatedAt: new Date().toISOString(),
      });
      result = {
        ...result,
        summary: finalSummary,
      };
    }
    const status = await readSoloRunStatus({ rootDir, sessionId: result.summary.sessionId });
    await renderStatus(io, status, options.json === true);
    return { exitCode: 0, status };
  }

  return { exitCode: 1 };
}
