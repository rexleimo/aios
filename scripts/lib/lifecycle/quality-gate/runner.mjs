import path from 'node:path';

import { evaluateArchitectureGovernance } from '../../architecture/governance.mjs';
import { getDisabledGateIds, isHarnessGateEnabled } from '../../harness/profile.mjs';
import { persistQualityGateEvidence } from '../../harness/verification-evidence.mjs';
import { runReleaseStatus } from '../release-status.mjs';
import {
  auditConsoleLogs,
  countNonEmptyLines,
  deriveQualityFailureCategory,
  extractFailedChecks,
  runCheck,
  summarizeCommandResult,
  summarizeGitStatus,
} from './commands.mjs';
import { planQualityGate } from './options.mjs';
import { isReleaseStateUnavailable, resolveReleaseGateThresholds } from './release-thresholds.mjs';

function gateEnabled(id, options, disabledGates, profiles) {
  return isHarnessGateEnabled(id, { profile: options.profile, disabledGates, profiles });
}

function pushCommandGate(results, { label, gateId, command, args, cwd, options, disabledGates, profiles, checkRunner }) {
  if (!gateEnabled(gateId, options, disabledGates, profiles)) {
    results.push({ label, status: 'SKIP', detail: 'disabled by profile/gates' });
    return;
  }

  const result = checkRunner(command, args, { cwd });
  results.push({ label, status: summarizeCommandResult(result), detail: result.stderr || result.stdout });
}

function pushLogAuditGate(results, { rootDir, options, disabledGates, checkRunner }) {
  if (!gateEnabled('quality:logs', options, disabledGates, ['standard', 'strict'])) {
    results.push({ label: 'Logs', status: 'SKIP', detail: 'disabled by profile/gates' });
    return;
  }

  const result = auditConsoleLogs(rootDir, { checkRunner });
  if (result.status === 0) {
    const count = countNonEmptyLines(result.stdout);
    results.push({
      label: 'Logs',
      status: count === 0 ? 'OK' : 'FAIL',
      detail: count === 0 ? '0 console.log hits' : `${count} console.log hits`,
    });
  } else if (result.status === 1) {
    results.push({ label: 'Logs', status: 'OK', detail: '0 console.log hits' });
  } else {
    const detail = (result.error?.message || result.stderr || result.stdout || `rg exit=${result.status}`).trim();
    results.push({ label: 'Logs', status: 'FAIL', detail });
  }
}

async function pushArchitectureGate(results, { rootDir, options, disabledGates }) {
  if (!gateEnabled('quality:architecture', options, disabledGates, ['standard', 'strict'])) {
    results.push({ label: 'Architecture', status: 'SKIP', detail: 'disabled by profile/gates' });
    return;
  }

  const result = await evaluateArchitectureGovernance({ rootDir });
  results.push({ label: 'Architecture', status: result.status, detail: result.detail });
}

async function pushReleaseGate(results, { rootDir, options, disabledGates, env }) {
  if (!gateEnabled('quality:release', options, disabledGates, ['standard', 'strict'])) {
    results.push({ label: 'Release', status: 'SKIP', detail: 'disabled by profile/gates' });
    return null;
  }

  let releaseThresholds = null;
  try {
    releaseThresholds = resolveReleaseGateThresholds(env);
  } catch (error) {
    results.push({
      label: 'Release',
      status: 'FAIL',
      detail: `invalid release threshold env: ${String(error?.message || error || 'unknown error')}`,
    });
    return null;
  }

  const releaseResult = await runReleaseStatus(
    {
      strict: true,
      format: 'json',
      minSamples: releaseThresholds.minSamples,
      maxFailureRate: releaseThresholds.maxFailureRate,
      maxFallbackRate: releaseThresholds.maxFallbackRate,
    },
    {
      rootDir,
      io: { log() {} },
      env,
    }
  );

  if (releaseResult.exitCode === 0) {
    results.push({
      label: 'Release',
      status: 'OK',
      detail: `status=${releaseResult?.health?.status || 'healthy'} samples=${releaseResult?.health?.metrics?.samples ?? 0} thresholds=min=${releaseThresholds.minSamples},failure<=${releaseThresholds.maxFailureRate},fallback<=${releaseThresholds.maxFallbackRate}`,
    });
  } else if (isReleaseStateUnavailable(releaseResult)) {
    results.push({ label: 'Release', status: 'SKIP', detail: 'release state unavailable (state file not found)' });
  } else {
    const reasons = Array.isArray(releaseResult?.health?.reasons) ? releaseResult.health.reasons : [];
    results.push({
      label: 'Release',
      status: 'FAIL',
      detail: reasons.length > 0 ? reasons.join(', ') : (releaseResult?.error || 'release strict gate failed'),
    });
  }

  return releaseThresholds;
}

function pushGitGate(results, { rootDir, options, disabledGates, checkRunner }) {
  if (!gateEnabled('quality:git', options, disabledGates, ['minimal', 'standard', 'strict'])) {
    results.push({ label: 'Git', status: 'SKIP', detail: 'disabled by profile/gates' });
    return;
  }

  const result = summarizeGitStatus(rootDir, { checkRunner });
  const changedCount = countNonEmptyLines(result.stdout);
  results.push({
    label: 'Git',
    status: result.status === 0 ? 'OK' : 'FAIL',
    detail: changedCount === 0 ? 'clean working tree' : `${changedCount} changed paths`,
  });
}

function printQualityGateReport(io, results) {
  let failed = false;
  for (const result of results) {
    io.log(`${result.label}: ${result.status} ${result.detail ? `- ${String(result.detail).split(/\r?\n/)[0]}` : ''}`.trim());
    if (result.status === 'FAIL') {
      failed = true;
    }
  }

  io.log('');
  io.log(`Ready for PR: ${failed ? 'NO' : 'YES'}`);
  return failed;
}

export async function runQualityGate(
  rawOptions = {},
  {
    rootDir,
    io = console,
    env = process.env,
    checkRunner = runCheck,
    persistVerification = persistQualityGateEvidence,
  } = {}
) {
  const startedAt = Date.now();
  const { options } = planQualityGate(rawOptions);
  const disabledGates = getDisabledGateIds(env);
  const mcpDir = path.join(rootDir, 'mcp-server');
  const results = [];

  io.log(`QUALITY GATE: ${options.mode.toUpperCase()}`);
  io.log('--------------------------');
  io.log(`Profile: ${options.profile}`);

  pushCommandGate(results, {
    label: 'Build',
    gateId: 'quality:build',
    command: 'npm',
    args: ['run', 'build'],
    cwd: mcpDir,
    options,
    disabledGates,
    profiles: ['minimal', 'standard', 'strict'],
    checkRunner,
  });

  pushCommandGate(results, {
    label: 'Types',
    gateId: 'quality:types',
    command: 'npm',
    args: ['run', 'typecheck'],
    cwd: mcpDir,
    options,
    disabledGates,
    profiles: ['minimal', 'standard', 'strict'],
    checkRunner,
  });

  if (options.mode !== 'quick') {
    pushCommandGate(results, {
      label: 'Scripts',
      gateId: 'quality:scripts',
      command: 'npm',
      args: ['run', 'test:scripts'],
      cwd: rootDir,
      options,
      disabledGates,
      profiles: ['standard', 'strict'],
      checkRunner,
    });

    pushCommandGate(results, {
      label: 'ContextDB',
      gateId: 'quality:contextdb',
      command: 'npm',
      args: ['run', 'test:contextdb'],
      cwd: mcpDir,
      options,
      disabledGates,
      profiles: ['standard', 'strict'],
      checkRunner,
    });

    pushLogAuditGate(results, { rootDir, options, disabledGates, checkRunner });
    await pushArchitectureGate(results, { rootDir, options, disabledGates });
  }

  if (options.mode === 'pre-pr') {
    pushCommandGate(results, {
      label: 'Security',
      gateId: 'quality:security',
      command: process.execPath,
      args: ['scripts/doctor-security-config.mjs', '--workspace', rootDir, ...(options.globalSecurity ? ['--global'] : [])],
      cwd: rootDir,
      options,
      disabledGates,
      profiles: ['standard', 'strict'],
      checkRunner,
    });
  }

  const releaseThresholds = await pushReleaseGate(results, { rootDir, options, disabledGates, env });
  pushGitGate(results, { rootDir, options, disabledGates, checkRunner });

  const failed = printQualityGateReport(io, results);
  const failedChecks = extractFailedChecks(results);
  const report = {
    ok: !failed,
    exitCode: failed ? 1 : 0,
    results,
    failedChecks,
    failureCategory: deriveQualityFailureCategory(results),
    profile: options.profile,
    mode: options.mode,
    sessionId: options.sessionId,
    ...(releaseThresholds ? { releaseThresholds } : {}),
  };

  if (options.sessionId) {
    report.verificationEvidence = await persistVerification({
      rootDir,
      sessionId: options.sessionId,
      report,
      elapsedMs: Date.now() - startedAt,
    });
  }

  return report;
}