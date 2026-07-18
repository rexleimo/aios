import path from 'node:path';

import { inspectBootstrapTask } from '../../doctor-bootstrap-task.mjs';
import { doctorBrowserMcp } from '../components/browser.mjs';
import { doctorCodemap } from '../components/codemap.mjs';
import { doctorNativeEnhancements } from '../components/native.mjs';
import { doctorContextDbShell } from '../components/shell.mjs';
import { doctorContextDbSkills } from '../components/skills.mjs';
import { doctorSuperpowers } from '../components/superpowers.mjs';
import { getDisabledGateIds, isHarnessGateEnabled } from '../harness/profile.mjs';
import { commandExists, captureCommand, runCommand } from '../platform/process.mjs';
import { doctorRexHarness, isAiosRuntimeRoot } from '../rex-harness/runtime.mjs';
import { inspectTokenDiscipline, printTokenDisciplineReport } from '../token-discipline/index.mjs';
import { runNativeOnlyDoctor } from './aggregate/native-only.mjs';
import { addDoctorCheck, countEffectiveWarnLines, logSkippedGate, printCaptured, printDoctorCheckSummary } from './aggregate/reporting.mjs';

export { countEffectiveWarnLines } from './aggregate/reporting.mjs';

export async function runDoctorSuite({
  rootDir,
  projectRoot = rootDir,
  strict = false,
  globalSecurity = false,
  client = 'all',
  nativeOnly = false,
  verbose = false,
  fix = false,
  dryRun = false,
  profile = 'standard',
  tokenProfile = 'balanced',
  io = console,
  env = process.env,
  deps = {},
} = {}) {
  let effectiveWarns = 0;
  const disabledGates = getDisabledGateIds(env);
  const checks = [];

  io.log('AIOS Verify');
  io.log('-----------');
  io.log(`Repo: ${rootDir}`);
  if (projectRoot && projectRoot !== rootDir) {
    io.log(`Project: ${projectRoot}`);
  }
  io.log(`Strict: ${strict}`);
  io.log(`Client: ${client}`);
  io.log(`Profile: ${profile}`);
  io.log(`Verbose: ${verbose}`);
  io.log(`Fix: ${fix}`);
  io.log(`DryRun: ${dryRun}`);

  if (nativeOnly) {
    return runNativeOnlyDoctor({
      rootDir,
      projectRoot,
      client,
      verbose,
      fix,
      dryRun,
      env,
      io,
    });
  }

  io.log('');
  io.log('== doctor-rex-harness ==');
  if (isAiosRuntimeRoot(rootDir)) {
    // 中文注释：rex-harness 是 AIOS 智能规划的硬依赖，不随 token/profile 门禁关闭。
    const rexResult = await doctorRexHarness({ rootDir, fix, io });
    effectiveWarns += rexResult.effectiveWarnings + rexResult.errors;
    addDoctorCheck(checks, {
      id: 'doctor:rex-harness',
      item: 'rex-harness intelligent-planning kernel',
      status: rexResult.errors > 0 ? 'error' : 'ok',
      fix: rexResult.fixHint || 'Bundled rex-harness is ready.',
      note: `ready=${rexResult.ready}; version=${rexResult.version || 'unknown'}; attemptedFix=${rexResult.attemptedFix}`,
    });
  } else {
    addDoctorCheck(checks, {
      id: 'doctor:rex-harness',
      item: 'rex-harness intelligent-planning kernel',
      status: 'skip',
      fix: 'Run doctor from an AIOS runtime root to validate the bundled planning kernel.',
      note: 'root is not an AIOS runtime checkout or release install',
    });
  }

  io.log('');
  io.log('== doctor-token-discipline ==');
  if (isHarnessGateEnabled('doctor:token-discipline', { profile, disabledGates, profiles: ['minimal', 'standard', 'strict'] })) {
    const tokenInspector = deps.inspectTokenDiscipline ?? inspectTokenDiscipline;
    const tokenReporter = deps.printTokenDisciplineReport ?? printTokenDisciplineReport;
    const tokenResult = tokenInspector({ rootDir, projectRoot: projectRoot || rootDir, profile: tokenProfile });
    tokenReporter(tokenResult, io);
    effectiveWarns += tokenResult.effectiveWarnings;
    addDoctorCheck(checks, {
      id: 'doctor:token-discipline',
      item: 'Token profile discipline and MCP budget hygiene',
      status: tokenResult.effectiveWarnings > 0 ? 'warn' : 'ok',
      fix: `Use --token-profile minimal or disable low-value MCP servers.`,
      note: `enabledMcpServers=${tokenResult.enabledMcpServers}; maxEnabledServers=${tokenResult.maxEnabledServers}; effectiveWarnings=${tokenResult.effectiveWarnings}`,
    });
  } else {
    logSkippedGate(io, 'doctor:token-discipline', profile);
    addDoctorCheck(checks, {
      id: 'doctor:token-discipline',
      item: 'Token profile discipline and MCP budget hygiene',
      status: 'skip',
      fix: 'Enable gate or run doctor with --profile standard/strict.',
      note: `disabled for profile=${profile}`,
    });
  }

  io.log('');
  io.log('== doctor-contextdb-shell ==');
  if (isHarnessGateEnabled('doctor:shell', { profile, disabledGates, profiles: ['minimal', 'standard', 'strict'] })) {
    const shellDoctor = deps.doctorContextDbShell ?? doctorContextDbShell;
    const shellResult = await shellDoctor({ io });
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
    const skillsDoctor = deps.doctorContextDbSkills ?? doctorContextDbSkills;
    const skillsResult = await skillsDoctor({ rootDir, projectRoot, client, io });
    effectiveWarns += skillsResult.effectiveWarnings;
    addDoctorCheck(checks, {
      id: 'doctor:skills',
      item: 'Skill install integrity and repo skill roots',
      status: skillsResult.effectiveWarnings > 0 ? 'warn' : 'ok',
      fix: `Run: node scripts/aios.mjs setup --components skills --client ${client}`,
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
    const nativeDoctor = deps.doctorNativeEnhancements ?? doctorNativeEnhancements;
    const nativeResult = await nativeDoctor({ rootDir, projectRoot, client, verbose, fix, dryRun, env, io });
    effectiveWarns += nativeResult.effectiveWarnings + nativeResult.errors;
    addDoctorCheck(checks, {
      id: 'doctor:native',
      item: 'Repo-local native enhancement surfaces',
      status: nativeResult.errors > 0 ? 'error' : (nativeResult.effectiveWarnings > 0 ? 'warn' : 'ok'),
      fix: `Run: node scripts/aios.mjs update --components native --client ${client}`,
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
    const superpowersDoctor = deps.doctorSuperpowers ?? doctorSuperpowers;
    const superpowersResult = await superpowersDoctor({ client, io });
    addDoctorCheck(checks, {
      id: 'doctor:superpowers',
      item: 'Superpowers repository and managed links',
      status: superpowersResult.errors > 0 ? 'error' : (superpowersResult.effectiveWarnings > 0 ? 'warn' : 'ok'),
      fix: `Run: node scripts/aios.mjs internal superpowers install --client ${client} --update`,
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
    const bootstrap = await inspectBootstrapTask(projectRoot || rootDir);
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
  io.log('== doctor-codemap ==');
  if (isHarnessGateEnabled('doctor:codemap', { profile, disabledGates, profiles: ['standard', 'strict'] })) {
    const codemapResult = await doctorCodemap({ rootDir, projectRoot: projectRoot || rootDir, client, fix, dryRun, io });
    addDoctorCheck(checks, {
      id: 'doctor:codemap',
      item: 'Code review graph (CRG) installation and graph health',
      status: codemapResult.errors > 0 ? 'error' : (codemapResult.effectiveWarnings > 0 ? 'warn' : 'ok'),
      fix: 'Run: node scripts/aios.mjs internal codemap doctor --fix',
      note: `errors=${codemapResult.errors}; effectiveWarnings=${codemapResult.effectiveWarnings}`,
    });
    if (codemapResult.errors > 0) {
      effectiveWarns += 1;
    } else {
      effectiveWarns += codemapResult.effectiveWarnings;
    }
  } else {
    logSkippedGate(io, 'doctor:codemap', profile);
    addDoctorCheck(checks, {
      id: 'doctor:codemap',
      item: 'Code review graph (CRG) installation and graph health',
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
