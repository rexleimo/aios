import { DEFAULT_POLICY, createDefaultExecutionPolicy } from './policy.mjs';

export function buildNoProgressFingerprint(event) {
  const actionType = event.action?.action || 'unknown';
  if (actionType === 'read') {
    return `${actionType}:${event.status}:${event.payload?.path || 'unknown'}`;
  }
  if (actionType === 'run') {
    return `${actionType}:${event.status}:${event.action?.command || ''}:${event.payload?.exit_code ?? 'unknown'}`;
  }
  if (actionType === 'patch') {
    return `${actionType}:${event.status}:${event.payload?.reject_reason || ''}:${event.payload?.diff_excerpt || ''}`;
  }
  return `${actionType}:${event.status}:${event.payload?.message || ''}`;
}

export function isNoProgressObservation(event) {
  if (event.status === 'rejected' || event.status === 'timeout' || event.status === 'error') {
    return true;
  }
  if (event.action?.action === 'patch' && event.payload?.applied === false) {
    return true;
  }
  return false;
}

export function getStopConditionCandidate({ workspace, policy = createDefaultExecutionPolicy() }) {
  const windowSize = Math.max(1, Number(policy.no_progress_window || DEFAULT_POLICY.no_progress_window));
  const recent = workspace?.observations?.slice(-windowSize) || [];
  if (recent.length < windowSize) {
    return null;
  }
  if (!recent.every(isNoProgressObservation)) {
    return null;
  }
  const fingerprints = recent.map(buildNoProgressFingerprint);
  const reference = fingerprints[0];
  return fingerprints.every((fingerprint) => fingerprint === reference) ? 'repeated_no_progress' : null;
}
