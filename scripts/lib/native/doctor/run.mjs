import path from 'node:path';

import { createNativeRepairSession, finalizeNativeRepairSession } from '../repairs.mjs';
import { syncNativeEnhancements } from '../sync.mjs';
import { checkNativeEnhancementsSync } from './check.mjs';
import { printNativeReportDetails } from './report.mjs';
import {
  areSamePath,
  buildFixCommand,
  collectPlannedFixTargets,
  printPathList,
} from './shared.mjs';

export async function doctorNativeEnhancements({
  rootDir,
  targetRootDir = rootDir,
  client = 'all',
  verbose = false,
  fix = false,
  dryRun = false,
  io = console,
} = {}) {
  const resolvedTargetRootDir = path.resolve(targetRootDir || rootDir);
  let result = await checkNativeEnhancementsSync({ rootDir, targetRootDir: resolvedTargetRootDir, client });
  let autoFixErrors = 0;
  let effectiveWarnings = 0;
  let errors = 0;

  io.log('Native Enhancements Doctor');
  io.log('--------------------------');

  if (dryRun && !fix) {
    io.log('[warn] --dry-run is effective only with --fix');
  }

  if (fix) {
    const clientsToFix = result.reports
      .filter((report) => report.issues.length > 0)
      .map((report) => report.client);
    let repairSession = null;
    let repairFinalized = null;

    if (clientsToFix.length === 0) {
      io.log('[ok] native auto-fix: no actionable issues');
    } else {
      io.log('');
      io.log('Native Auto-Fix');
      io.log('---------------');
      if (!dryRun) {
        if (areSamePath(rootDir, resolvedTargetRootDir)) {
          repairSession = await createNativeRepairSession({
            rootDir,
            clients: clientsToFix,
            reason: 'doctor-native-fix',
            dryRun: false,
          });
          io.log(`[repair] id=${repairSession.repairId}`);
          io.log(`[repair] manifest=${repairSession.manifestRelPath}`);
        } else {
          io.log('[repair] skipped: project target differs from AIOS source root');
        }
      }

      for (const targetClient of clientsToFix) {
        const fixCommand = buildFixCommand(targetClient);
        if (dryRun) {
          io.log(`[plan] native ${targetClient}: ${fixCommand}`);
          continue;
        }
        io.log(`[fix] native ${targetClient}: ${fixCommand}`);
        try {
          await syncNativeEnhancements({
            rootDir,
            targetRootDir: resolvedTargetRootDir,
            client: targetClient,
            mode: 'install',
            repair: { force: true },
            io,
          });
          io.log(`[ok] native ${targetClient}: auto-fix applied`);
        } catch (error) {
          autoFixErrors += 1;
          const message = error instanceof Error ? error.message : String(error);
          io.log(`[error] native ${targetClient}: auto-fix failed (${message})`);
        }
      }
      if (!dryRun) {
        if (repairSession) {
          repairFinalized = await finalizeNativeRepairSession({
            rootDir,
            session: repairSession,
            status: autoFixErrors > 0 ? 'completed-with-errors' : 'completed',
            errorMessage: autoFixErrors > 0 ? `${autoFixErrors} auto-fix failures` : '',
          });
          io.log(`[repair] summary changed=${repairFinalized.summary.totalChanged} added=${repairFinalized.summary.added} updated=${repairFinalized.summary.updated} removed=${repairFinalized.summary.removed}`);
          const changed = (repairFinalized.changedEntries || []).map((entry) => `${entry.path} (${entry.change})`);
          printPathList(io, '[repair] changed', changed, 15);
          io.log(`[repair] rollback: node scripts/aios.mjs internal native rollback --repair-id ${repairFinalized.repairId}`);
        }
        result = await checkNativeEnhancementsSync({ rootDir, targetRootDir: resolvedTargetRootDir, client });
      } else {
        const plannedTargets = collectPlannedFixTargets(result.reports.filter((report) => clientsToFix.includes(report.client)));
        printPathList(io, '[plan] native files', plannedTargets, 15);
      }
    }
  }

  for (const report of result.reports) {
    printNativeReportDetails(report, io, verbose);

    if (report.issues.length === 0) {
      io.log(`[ok] native ${report.client} tier=${report.tier}`);
      continue;
    }

    for (const issue of report.issues) {
      if (issue.status === 'error') {
        errors += 1;
      } else {
        effectiveWarnings += 1;
      }
      io.log(`[${issue.status}] native ${issue.client}: ${issue.message}`);
      if (issue.fix) {
        io.log(`  fix: ${issue.fix}`);
      }
    }
  }
  errors += autoFixErrors;

  return {
    ok: errors === 0 && effectiveWarnings === 0,
    effectiveWarnings,
    errors,
    issues: result.issues,
  };
}