import {
  createDefaultQualityGateOptions,
  normalizeHarnessProfile,
  normalizeQualityGateMode,
} from '../options.mjs';

export function normalizeQualityGateOptions(rawOptions = {}) {
  const defaults = createDefaultQualityGateOptions();
  return {
    mode: normalizeQualityGateMode(rawOptions.mode ?? defaults.mode),
    profile: normalizeHarnessProfile(rawOptions.profile ?? defaults.profile),
    globalSecurity: Boolean(rawOptions.globalSecurity ?? defaults.globalSecurity),
    sessionId: String(rawOptions.sessionId ?? defaults.sessionId ?? '').trim(),
  };
}

export function planQualityGate(rawOptions = {}) {
  const options = normalizeQualityGateOptions(rawOptions);
  const args = ['quality-gate', options.mode];
  if (options.profile !== 'standard') args.push('--profile', options.profile);
  if (options.globalSecurity) args.push('--global-security');
  if (options.sessionId) args.push('--session', options.sessionId);
  return {
    command: 'quality-gate',
    options,
    preview: `node scripts/aios.mjs ${args.join(' ')}`,
  };
}