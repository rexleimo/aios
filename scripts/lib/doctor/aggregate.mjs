import path from 'node:path';

import { inspectBootstrapTask } from '../../doctor-bootstrap-task.mjs';
import { doctorBrowserMcp } from '../components/browser.mjs';
import { doctorNativeEnhancements } from '../components/native.mjs';
import { doctorContextDbShell } from '../components/shell.mjs';
import { doctorContextDbSkills } from '../components/skills.mjs';
import { doctorSuperpowers } from '../components/superpowers.mjs';
import { getDisabledGateIds, isHarnessGateEnabled } from '../harness/profile.mjs';
import { commandExists, captureCommand, runCommand } from '../platform/process.mjs';

export function countEffectiveWarnLines(input) {
  const lines = Array.isArray(input) ? input : String(input || '').split(/\r?\n/);
  return lines
    .filter((line) => line.startsWith('[warn] '))
    .filter((line) => !/^\[warn\] (codex|claude|gemini) not found in PATH$/u.test(line))
    .length;
}

function printCaptured(io, text) {
  for (const line of String(text || '').split(/\r?\n/)) {
    if (line.length > 0) {
      io.log(line);
    }
  }
}

function logSkippedGate(io, gateId, profile) {
  io.log(`[skip] ${gateId} disabled for profile=${profile}`);
}

function addDoctorCheck(checks, check) {
  checks.push({
    id: String(check.id || '').trim() || 'unknown',
    item: String(check.item || '').trim() || 'unspecified',
    status: String(check.status || 'unknown').trim() || 'unknown',
    fix: String(check.fix || '').trim() || 'review logs and rerun doctor',
    note: String(check.note || '').trim(),
  });
}

function printDoctorCheckSummary(io, checks = []) {
  io.log('');
  io.log('Doctor Check Summary');
  io.log('--------------------');
  for (const check of checks) {
    io.log(`[check] ${check.id}`);
    io.log(`  item: ${check.item}`);
    io.log(`  status: ${check.status}`);
    io.log(`  fix: ${check.fix}`);
    if (check.note) {
      io.log(`  note: ${check.note}`);
    }
  }
}

export async function runDoctorSuite({
  rootDir,
  strict = false,
  globalSecurity = false,
  nativeOnly = false,
  verbose = false,
  fix = false,
  dryRun = false,
  profile = 'standard',
  io = console,
  env = process.env,
} = {}) {
  let effectiveWarns = 0;
  const disabledGates = getDisabledGateIds(env);
  const checks = [];

  io.log('AIOS Verify');
  io.log('-----------');
  io.log(`Repo: ${rootDir}`);
  io.log(`Strict: ${strict}`);
  io.log(`Profile: ${profile}`);
  io.log(`Verbose: ${verbose}`);
  io.log(`Fix: ${fix}`);
  io.log(`DryRun: ${dryRun}`);

  if (nativeOnly) {
    io.log('');
    io.log('== doctor-native ==');
    const nativeResult = await doctorNativeEnhancements({ rootDir, client: 'all', verbose, fix, dryRun, env, io });
    effectiveWarns += nativeResult.effectiveWarnings;
    addDoctorCheck(checks, {
      id: 'doctor:native',
      item: 'Repo-local native enhancement surfaces',
      status: nativeResult.errors > 0 ? 'error' : (nativeResult.effectiveWarnings > 0 ? 'warn' : 'ok'),
      fix: 'Run: node scripts/aios.mjs update --components native --client all',
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

  io.log('');
  io.log('== doctor-contextdb-shell ==');
  if (isHarnessGateEnabled('doctor:shell', { profile, disabledGates, profiles: ['minimal', 'standard', 'strict'] })) {
    const shellResult = await doctorContextDbShell({ io });
    effectiveWarns += shellResult.effectiveWarnings;
    addDoctorCheck(checks, {
      id: 'doctor:shell',
      item: 'ContextDB shell wrappers and runtime',
      status: shellResult.effectiveWarnings > 0 ? 'warn' : 'ok',
      fix: 'Run: node scripts/aios.mjs setup --components shell',
      note: `effectiveWarnings=${shellResult.effectiveWarnings}`,
    });
  } else {
    logSkippedGate(io, 'doctor:shell', profile);
    addDoctorCheck(checks, {
      id: 'doctor:shell',
      item: 'ContextDB shell wrappers and runtime',
      status: 'skip',
      fix: 'Enable gate or run doctor with --profile standard/strict.',
      note: `disabled for profile=${profile}`,
    });
  }

  io.log('');
  io.log('== doctor-contextdb-skills ==');
  if (isHarnessGateEnabled('doctor:skills', { profile, disabledGates, profiles: ['minimal', 'standard', 'strict'] })) {
    const skillsResult = await doctorContextDbSkills({ rootDir, client: 'all', io });
    effectiveWarns += skillsResult.effectiveWarnings;
    addDoctorCheck(checks, {
      id: 'doctor:skills',
      item: 'Skill install integrity and repo skill roots',
      status: skillsResult.effectiveWarnings > 0 ? 'warn' : 'ok',
      fix: 'Run: node scripts/aios.mjs setup --components skills --client all',
      note: `effectiveWarnings=${skillsResult.effectiveWarnings}`,
    });
  } else {
    logSkippedGate(io, 'doctor:skills', profile);
    addDoctorCheck(checks, {
      id: 'doctor:skills',
      item: 'Skill install integrity and repo skill roots',
      status: 'skip',
      fix: 'Enable gate or run doctor with --profile standard/strict.',
      note: `disabled for profile=${profile}`,
    });
  }

  io.log('');
  io.log('== doctor-native ==');
  if (isHarnessGateEnabled('doctor:native', { profile, disabledGates, profiles: ['minimal', 'standard', 'strict'] })) {
    const nativeResult = await doctorNativeEnhancements({ rootDir, client: 'all', verbose, fix, dryRun, env, io });
    effectiveWarns += nativeResult.effectiveWarnings + nativeResult.errors;
    addDoctorCheck(checks, {
      id: 'doctor:native',
      item: 'Repo-local native enhancement surfaces',
      status: nativeResult.errors > 0 ? 'error' : (nativeResult.effectiveWarnings > 0 ? 'warn' : 'ok'),
      fix: 'Run: node scripts/aios.mjs update --components native --client all',
      note: `errors=${nativeResult.errors}; effectiveWarnings=${nativeResult.effectiveWarnings}`,
    });
  } else {
    logSkippedGate(io, 'doctor:native', profile);
    addDoctorCheck(checks, {
      id: 'doctor:native',
      item: 'Repo-local native enhancement surfaces',
      status: 'skip',
      fix: 'Enable gate or run doctor with --profile standard/strict.',
      note: `disabled for profile=${profile}`,
    });
  }

  io.log('');
  io.log('== doctor-superpowers ==');
  if (isHarnessGateEnabled('doctor:superpowers', { profile, disabledGates, profiles: ['minimal', 'standard', 'strict'] })) {
    const superpowersResult = await doctorSuperpowers({ io });
    addDoctorCheck(checks, {
      id: 'doctor:superpowers',
      item: 'Superpowers repository and managed links',
      status: superpowersResult.errors > 0 ? 'error' : (superpowersResult.effectiveWarnings > 0 ? 'warn' : 'ok'),
      fix: 'Run: node scripts/aios.mjs internal superpowers install --update',
      note: `errors=${superpowersResult.errors}; effectiveWarnings=${superpowersResult.effectiveWarnings}`,
    });
    if (superpowersResult.errors > 0) {
      throw new Error(`doctor-superpowers failed (${superpowersResult.errors} errors)`);
    }
    effectiveWarns += superpowersResult.effectiveWarnings;
  } else {
    logSkippedGate(io, 'doctor:superpowers', profile);
    addDoctorCheck(checks, {
      id: 'doctor:superpowers',
      item: 'Superpowers repository and managed links',
      status: 'skip',
      fix: 'Enable gate or run doctor with --profile standard/strict.',
      note: `disabled for profile=${profile}`,
    });
  }

  io.log('');
  io.log('== doctor-security-config ==');
  if (isHarnessGateEnabled('doctor:security', { profile, disabledGates, profiles: ['standard', 'strict'] })) {
    const securityScript = path.join(rootDir, 'scripts', 'doctor-security-config.mjs');
    const securityArgs = [securityScript, '--workspace', rootDir];
    if (globalSecurity) securityArgs.push('--global');
    const securityResult = captureCommand(process.execPath, securityArgs, { cwd: rootDir });
    printCaptured(io, securityResult.stdout);
    printCaptured(io, securityResult.stderr);
    const securityWarns = countEffectiveWarnLines(`${securityResult.stdout}\n${securityResult.stderr}`);
    effectiveWarns += securityWarns;
    addDoctorCheck(checks, {
      id: 'doctor:security',
      item: 'Security config and policy scan',
      status: securityResult.status !== 0 ? 'error' : (securityWarns > 0 ? 'warn' : 'ok'),
      fix: 'Run: node scripts/doctor-security-config.mjs --workspace <repo> --strict',
      note: `exit=${securityResult.status}; effectiveWarnings=${securityWarns}`,
    });
  } else {
    logSkippedGate(io, 'doctor:security', profile);
    addDoctorCheck(checks, {
      id: 'doctor:security',
      item: 'Security config and policy scan',
      status: 'skip',
      fix: 'Enable gate or run doctor with --profile standard/strict.',
      note: `disabled for profile=${profile}`,
    });
  }

  io.log('');
  io.log('== doctor-bootstrap-task ==');
  if (isHarnessGateEnabled('doctor:bootstrap', { profile, disabledGates, profiles: ['minimal', 'standard', 'strict'] })) {
    const bootstrap = await inspectBootstrapTask(rootDir);
    io.log('Bootstrap Task Doctor');
    io.log('---------------------');
    io.log(`Workspace: ${bootstrap.workspaceRoot}`);
    io.log(`[${bootstrap.status}] ${bootstrap.message}`);
    if (bootstrap.status !== 'ok') {
      effectiveWarns += 1;
    }
    addDoctorCheck(checks, {
      id: 'doctor:bootstrap',
      item: 'Bootstrap task pointer and pending queue',
      status: bootstrap.status === 'ok' ? 'ok' : 'warn',
      fix: 'Run aios once to bootstrap task files, then verify .aios/tasks/.current-task.',
      note: bootstrap.message,
    });
  } else {
    logSkippedGate(io, 'doctor:bootstrap', profile);
    addDoctorCheck(checks, {
      id: 'doctor:bootstrap',
      item: 'Bootstrap task pointer and pending queue',
      status: 'skip',
      fix: 'Enable gate or run doctor with --profile standard/strict.',
      note: `disabled for profile=${profile}`,
    });
  }

  io.log('');
  io.log('== doctor-browser-mcp ==');
  if (isHarnessGateEnabled('doctor:browser', { profile, disabledGates, profiles: ['standard', 'strict'] })) {
    const browserResult = await doctorBrowserMcp({ rootDir, fix, dryRun, io });
    addDoctorCheck(checks, {
      id: 'doctor:browser',
      item: 'Browser MCP prerequisites and profile health',
      status: browserResult.errors > 0 ? 'error' : (browserResult.effectiveWarnings > 0 ? 'warn' : 'ok'),
      fix: 'Run: node scripts/aios.mjs internal browser doctor --fix (or setup --components browser)',
      note: `errors=${browserResult.errors}; effectiveWarnings=${browserResult.effectiveWarnings}; autoFixHealed=${browserResult.autoFixHealed ?? 0}`,
    });
    if (browserResult.errors > 0) {
      effectiveWarns += 1;
    } else {
      effectiveWarns += browserResult.effectiveWarnings;
    }
  } else {
    logSkippedGate(io, 'doctor:browser', profile);
    addDoctorCheck(checks, {
      id: 'doctor:browser',
      item: 'Browser MCP prerequisites and profile health',
      status: 'skip',
      fix: 'Enable gate or run doctor with --profile standard/strict.',
      note: `disabled for profile=${profile}`,
    });
  }

  io.log('');
  io.log('== mcp-server build ==');
  if (isHarnessGateEnabled('doctor:mcp-build', { profile, disabledGates, profiles: ['standard', 'strict'] })) {
    const mcpDir = path.join(rootDir, 'mcp-server');
    if (!commandExists('npm')) {
      io.log('[warn] npm not found; skipping mcp-server build');
      effectiveWarns += 1;
      addDoctorCheck(checks, {
        id: 'doctor:mcp-build',
        item: 'mcp-server typecheck/build',
        status: 'warn',
        fix: 'Install Node.js/npm and rerun doctor.',
        note: 'npm not found in PATH',
      });
    } else {
      io.log('+ npm run typecheck');
      runCommand('npm', ['run', 'typecheck'], { cwd: mcpDir });
      io.log('+ npm run build');
      runCommand('npm', ['run', 'build'], { cwd: mcpDir });
      addDoctorCheck(checks, {
        id: 'doctor:mcp-build',
        item: 'mcp-server typecheck/build',
        status: 'ok',
        fix: 'If this check fails, run: cd mcp-server && npm ci && npm run typecheck && npm run build',
      });
    }
  } else {
    logSkippedGate(io, 'doctor:mcp-build', profile);
    addDoctorCheck(checks, {
      id: 'doctor:mcp-build',
      item: 'mcp-server typecheck/build',
      status: 'skip',
      fix: 'Enable gate or run doctor with --profile standard/strict.',
      note: `disabled for profile=${profile}`,
    });
  }

  printDoctorCheckSummary(io, checks);
  io.log('');
  io.log(`[summary] effective_warn=${effectiveWarns}`);
  if (strict && effectiveWarns > 0) {
    io.log('[fail] strict mode: warnings found');
    return { effectiveWarns, exitCode: 1 };
  }

  io.log('[ok] verify-aios complete');
  return { effectiveWarns, exitCode: 0 };
}
