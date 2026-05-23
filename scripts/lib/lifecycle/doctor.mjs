import { createDefaultDoctorOptions, normalizeClient, normalizeHarnessProfile } from './options.mjs';
import { runDoctorSuite } from '../doctor/aggregate.mjs';

export function normalizeDoctorOptions(rawOptions = {}) {
  const defaults = createDefaultDoctorOptions();
  return {
    strict: Boolean(rawOptions.strict ?? defaults.strict),
    globalSecurity: Boolean(rawOptions.globalSecurity ?? defaults.globalSecurity),
    client: normalizeClient(rawOptions.client ?? defaults.client),
    nativeOnly: Boolean(rawOptions.nativeOnly ?? defaults.nativeOnly),
    verbose: Boolean(rawOptions.verbose ?? defaults.verbose),
    fix: Boolean(rawOptions.fix ?? defaults.fix),
    dryRun: Boolean(rawOptions.dryRun ?? defaults.dryRun),
    profile: normalizeHarnessProfile(rawOptions.profile ?? defaults.profile),
  };
}

export function planDoctor(rawOptions = {}) {
  const options = normalizeDoctorOptions(rawOptions);
  const args = ['doctor'];
  if (options.strict) args.push('--strict');
  if (options.globalSecurity) args.push('--global-security');
  if (options.client !== 'all') args.push('--client', options.client);
  if (options.nativeOnly) args.push('--native');
  if (options.verbose) args.push('--verbose');
  if (options.fix) args.push('--fix');
  if (options.dryRun) args.push('--dry-run');
  if (options.profile !== 'standard') args.push('--profile', options.profile);
  return {
    command: 'doctor',
    options,
    preview: `node scripts/aios.mjs ${args.join(' ')}`,
  };
}

export async function runDoctor(rawOptions = {}, { rootDir, projectRoot = rootDir, io = console } = {}) {
  const { options } = planDoctor(rawOptions);
  const result = await runDoctorSuite({ rootDir, projectRoot, ...options, io });
  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
  return result;
}
