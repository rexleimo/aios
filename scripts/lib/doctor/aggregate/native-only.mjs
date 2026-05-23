import { doctorNativeEnhancements } from '../../components/native.mjs';
import { addDoctorCheck, printDoctorCheckSummary } from './reporting.mjs';

export async function runNativeOnlyDoctor({
  rootDir,
  projectRoot,
  client,
  verbose,
  fix,
  dryRun,
  env,
  io,
}) {
  let effectiveWarns = 0;
  const checks = [];

  io.log('');
  io.log('== doctor-native ==');
  const nativeResult = await doctorNativeEnhancements({ rootDir, projectRoot, client, verbose, fix, dryRun, env, io });
  effectiveWarns += nativeResult.effectiveWarnings;
  addDoctorCheck(checks, {
    id: 'doctor:native',
    item: 'Repo-local native enhancement surfaces',
    status: nativeResult.errors > 0 ? 'error' : (nativeResult.effectiveWarnings > 0 ? 'warn' : 'ok'),
    fix: `Run: node scripts/aios.mjs update --components native --client ${client}`,
    note: `errors=${nativeResult.errors}; effectiveWarnings=${nativeResult.effectiveWarnings}`,
  });
  printDoctorCheckSummary(io, checks);
  io.log('');
  io.log(`[summary] effective_warn=${effectiveWarns}`);
  if (nativeResult.errors > 0 || nativeResult.effectiveWarnings > 0) {
    io.log('[fail] native doctor found actionable issues');
    return { effectiveWarns, exitCode: 1 };
  }
  io.log('[ok] verify-aios complete');
  return { effectiveWarns, exitCode: 0 };
}
