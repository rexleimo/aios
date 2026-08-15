import { resolveOwnedPathPrefixes } from './file-policy.mjs';
import { evaluateAiosSoftwareRequest } from '../../workflows/rex-harness-adapter.mjs';
import { startStoredAiosCapabilityActivation } from '../../workflows/rex-activation-store.mjs';

export function resolvePhaseJobWorkItemKey(job) {
  const workItemRef = Array.isArray(job?.launchSpec?.workItemRefs)
    ? job.launchSpec.workItemRefs.map((item) => String(item || '').trim()).find(Boolean)
    : '';
  return workItemRef || String(job?.jobId || '').trim();
}

export function phaseJobRequiresRexIsolation(job, phase) {
  const canEditFiles = phase?.canEditFiles === true || job?.launchSpec?.canEditFiles === true;
  const hasWorkItemRef = Array.isArray(job?.launchSpec?.workItemRefs)
    && job.launchSpec.workItemRefs.some((item) => String(item || '').trim());
  return canEditFiles && hasWorkItemRef;
}

export function bindPhaseJobRexActivation({ rootDir, plan, job, phase }) {
  const workItemKey = resolvePhaseJobWorkItemKey(job);
  if (!rootDir || !workItemKey) {
    return { ok: false, reason: 'rex-bind-missing-identity' };
  }
  const message = [
    String(plan?.taskTitle || '').trim(),
    String(phase?.responsibility || job?.label || '').trim(),
  ].filter(Boolean).join(' — ');
  try {
    const decision = evaluateAiosSoftwareRequest({
      message,
      explicitIntent: job?.launchSpec?.canEditFiles ? 'implement' : null,
    }).decision;
    if (decision?.blocked) {
      return { ok: false, reason: 'rex-bind-blocked' };
    }
    if (!decision) {
      return {
        ok: true,
        skipped: true,
        workItemKey: `work:${workItemKey}`,
        ownedPathPrefixes: job?.launchSpec?.ownedPathPrefixes || [],
      };
    }
    const stored = startStoredAiosCapabilityActivation({
      rootDir,
      decision,
      workItemKey: `work:${workItemKey}`,
      request: {
        message,
        ownedPathPrefixes: job?.launchSpec?.ownedPathPrefixes || [],
        jobId: job?.jobId,
      },
    });
    return {
      ok: true,
      workItemKey: `work:${workItemKey}`,
      ownedPathPrefixes: job?.launchSpec?.ownedPathPrefixes || [],
      activationId: stored.activation?.activationId || '',
      capabilityId: stored.command?.capabilityId || decision.capabilityId || '',
      providerId: stored.command?.provider?.id || '',
      stageId: stored.command?.stageId || '',
    };
  } catch (error) {
    return {
      ok: false,
      reason: String(error?.message || 'rex-bind-failed'),
    };
  }
}

export function evaluatePhaseJobRexLaunchGate({
  plan,
  job,
  phase,
  rootDir,
  bindRexActivationImpl = bindPhaseJobRexActivation,
} = {}) {
  const isolation = phaseJobRequiresRexIsolation(job, phase);
  const ownedPathPrefixes = resolveOwnedPathPrefixes(phase, job);
  let rexBinding;
  try {
    rexBinding = bindRexActivationImpl({ rootDir, plan, job, phase });
  } catch (error) {
    rexBinding = { ok: false, reason: String(error?.message || 'rex-bind-failed') };
  }
  if (isolation && ownedPathPrefixes.length > 0 && rootDir && !rexBinding?.ok) {
    return {
      ok: false,
      rexBinding,
      reason: `Rex isolation bind failed: ${rexBinding?.reason || 'missing'}`,
    };
  }
  return {
    ok: true,
    rexBinding: rexBinding?.ok ? rexBinding : null,
    reason: '',
  };
}
