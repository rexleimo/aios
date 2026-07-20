import { reconcileRexWorkflowSurface } from './rex-workflow-surface-reconciliation.mjs';
import { ensureRexHarness, isAiosRuntimeRoot } from '../rex-harness/runtime.mjs';

/**
 * Lifecycle callers share this adapter so a preserved user-owned projection is
 * visible without turning an otherwise valid setup/update into a failed run.
 */
export async function reconcileLegacyWorkflowSurface({
  reconciler = reconcileRexWorkflowSurface,
  io = console,
  dryRun = false,
  adoptLegacySuperpowers = false,
} = {}) {
  try {
    const report = await reconciler({ dryRun, adoptLegacySuperpowers });
    if (report?.status === 'removed') {
      io.log(`[ok] removed ${report.removed.length} AIOS-managed legacy workflow projection(s)`);
    }
    if (report?.status === 'would-remove') {
      io.log(`[plan] would remove ${report.removed.length} AIOS-managed legacy workflow projection(s)`);
    }
    if (report?.retired?.length > 0) {
      io.log(`[ok] retired ${report.retired.length} historical Superpowers checkout(s) outside client discovery roots`);
    }
    for (const conflict of report?.conflicts ?? []) {
      io.log(`[warn] legacy workflow projection retained: ${conflict.path} (${conflict.reason})`);
    }
    return report;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.log(`[warn] legacy workflow projection inspection failed: ${message}`);
    return {
      kind: 'aios.rex-workflow-surface-reconciliation.v1',
      status: 'inspection-failed',
      removed: [],
      conflicts: [],
    };
  }
}

/**
 * Runtime lifecycle callers share the Rex readiness and reconciliation order.
 * A non-runtime project remains outside this migration boundary.
 */
export async function prepareRexWorkflowSurface({
  rootDir,
  fix = false,
  dryRun = false,
  adoptLegacySuperpowers = false,
  io = console,
  ensureRexHarnessImpl = ensureRexHarness,
  isAiosRuntimeRootImpl = isAiosRuntimeRoot,
  reconciler = reconcileRexWorkflowSurface,
} = {}) {
  if (!isAiosRuntimeRootImpl(rootDir)) {
    return { runtime: false, rex: null, reconciliation: null };
  }

  const rex = await ensureRexHarnessImpl({ rootDir, fix, io });
  if (!rex.ready) {
    return { runtime: true, rex, reconciliation: null };
  }

  const reconciliation = await reconcileLegacyWorkflowSurface({
    reconciler,
    io,
    dryRun,
    adoptLegacySuperpowers,
  });
  return { runtime: true, rex, reconciliation };
}
