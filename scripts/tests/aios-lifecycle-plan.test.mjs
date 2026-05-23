import assert from 'node:assert/strict';
import test from 'node:test';

import { planDoctor } from '../lib/lifecycle/doctor.mjs';
import { planEntropyGc } from '../lib/lifecycle/entropy-gc.mjs';
import { planReleaseStatus } from '../lib/lifecycle/release-status.mjs';
import { planSetup, runSetup } from '../lib/lifecycle/setup.mjs';
import { planUninstall } from '../lib/lifecycle/uninstall.mjs';
import { runUpdate } from '../lib/lifecycle/update.mjs';

test('planSetup uses the current lifecycle defaults', () => {
  const plan = planSetup();
  assert.equal(plan.command, 'setup');
  assert.deepEqual(plan.options.components, ['browser', 'shell', 'skills', 'native', 'superpowers']);
  assert.equal(plan.options.wrapMode, 'opt-in');
  assert.equal(plan.options.client, 'all');
  assert.match(plan.preview, /setup --components browser,shell,skills,native,superpowers/);
});

test('planUninstall defaults to shell and skills only', () => {
  const plan = planUninstall();
  assert.equal(plan.command, 'uninstall');
  assert.deepEqual(plan.options.components, ['shell', 'skills']);
  assert.equal(plan.options.client, 'all');
});

test('planDoctor preserves strict and global security flags', () => {
  const plan = planDoctor({
    strict: true,
    globalSecurity: true,
    client: 'opencode',
    nativeOnly: true,
    verbose: true,
    fix: true,
    dryRun: true,
  });
  assert.equal(plan.command, 'doctor');
  assert.equal(plan.options.strict, true);
  assert.equal(plan.options.globalSecurity, true);
  assert.equal(plan.options.client, 'opencode');
  assert.equal(plan.options.nativeOnly, true);
  assert.equal(plan.options.verbose, true);
  assert.equal(plan.options.fix, true);
  assert.equal(plan.options.dryRun, true);
  assert.match(plan.preview, /doctor --strict --global-security --client opencode --native --verbose --fix --dry-run/);
});

test('planEntropyGc preserves explicit options', () => {
  const plan = planEntropyGc({
    sessionId: 'codex-cli-20260303T080437-065e16c0',
    mode: 'dry-run',
    retain: 9,
    minAgeHours: 72,
    format: 'json',
  });
  assert.equal(plan.command, 'entropy-gc');
  assert.equal(plan.options.mode, 'dry-run');
  assert.equal(plan.options.sessionId, 'codex-cli-20260303T080437-065e16c0');
  assert.equal(plan.options.retain, 9);
  assert.equal(plan.options.minAgeHours, 72);
  assert.equal(plan.options.format, 'json');
  assert.match(plan.preview, /entropy-gc dry-run/);
  assert.match(plan.preview, /--retain 9/);
});

test('planReleaseStatus preserves strict health-gate options', () => {
  const plan = planReleaseStatus({
    statePath: 'experiments/rl-mixed-v1/release/custom.state.json',
    recent: 12,
    strict: true,
    minSamples: 10,
    maxFailureRate: 0.25,
    maxFallbackRate: 0.15,
    outputPath: 'tmp/release-status.json',
    historyOutputPath: 'tmp/release-history.csv',
    historyFormat: 'ndjson',
    historyDays: 21,
    format: 'json',
  }, { rootDir: '/tmp/aios-test' });
  assert.equal(plan.command, 'release-status');
  assert.equal(plan.options.recent, 12);
  assert.equal(plan.options.strict, true);
  assert.equal(plan.options.minSamples, 10);
  assert.equal(plan.options.maxFailureRate, 0.25);
  assert.equal(plan.options.maxFallbackRate, 0.15);
  assert.equal(plan.options.format, 'json');
  assert.equal(plan.options.historyOutputPath.replace(/\\/g, '/').endsWith('/tmp/release-history.csv'), true);
  assert.equal(plan.options.historyFormat, 'ndjson');
  assert.equal(plan.options.historyDays, 21);
  assert.match(plan.preview, /release-status/);
  assert.match(plan.preview, /--strict/);
  assert.match(plan.preview, /--min-samples 10/);
  assert.match(plan.preview, /--max-failure-rate 0.25/);
  assert.match(plan.preview, /--max-fallback-rate 0.15/);
  assert.match(plan.preview, /--output tmp\/release-status.json/);
  assert.match(plan.preview, /--history-output tmp\/release-history.csv/);
  assert.match(plan.preview, /--history-format ndjson/);
  assert.match(plan.preview, /--history-days 21/);
});

test('runSetup browser flow enables doctor auto-heal by default', async () => {
  const calls = [];
  const io = { log: () => {} };
  await runSetup({
    components: ['browser'],
    skipPlaywrightInstall: true,
    skipDoctor: false,
  }, {
    rootDir: '/tmp/aios-test',
    projectRoot: '/tmp/aios-test',
    io,
    deps: {
      installBrowserMcp: async (options) => { calls.push({ kind: 'install', options }); },
      doctorBrowserMcp: async (options) => { calls.push({ kind: 'doctor', options }); },
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].kind, 'install');
  assert.equal(calls[1].kind, 'doctor');
  assert.equal(calls[1].options.fix, true);
});

test('runSetup browser flow does not block lifecycle when browser-use runtime is missing', async () => {
  const calls = [];
  const logs = [];
  await runSetup({
    components: ['browser'],
    skipPlaywrightInstall: true,
    skipDoctor: false,
  }, {
    rootDir: '/tmp/aios-test',
    projectRoot: '/tmp/aios-test',
    io: { log: (line) => logs.push(String(line)) },
    deps: {
      installBrowserMcp: async () => {
        throw new Error('browser-use MCP project not found.\nSet AIOS_BROWSER_USE_REPO to your ai-browser-book repository path.');
      },
      doctorBrowserMcp: async (options) => { calls.push({ kind: 'doctor', options }); },
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, 'doctor');
  assert.equal(calls[0].options.fix, false);
  assert.match(logs.join('\n'), /\[warn\] browser component skipped:/);
  assert.match(logs.join('\n'), /node scripts\/aios\.mjs internal browser doctor --fix/);
});

test('runUpdate browser flow enables doctor auto-heal by default', async () => {
  const calls = [];
  const io = { log: () => {} };
  await runUpdate({
    components: ['browser'],
    withPlaywrightInstall: false,
    skipDoctor: false,
  }, {
    rootDir: '/tmp/aios-test',
    projectRoot: '/tmp/aios-test',
    io,
    deps: {
      installBrowserMcp: async (options) => { calls.push({ kind: 'install', options }); },
      doctorBrowserMcp: async (options) => { calls.push({ kind: 'doctor', options }); },
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].kind, 'install');
  assert.equal(calls[1].kind, 'doctor');
  assert.equal(calls[1].options.fix, true);
});

test('runUpdate performs runtime self-update when requested', async () => {
  const calls = [];
  await runUpdate({
    selfUpdate: true,
    components: ['skills'],
    skipDoctor: true,
  }, {
    rootDir: '/tmp/aios-test',
    projectRoot: '/tmp/aios-test',
    io: { log: () => {} },
    deps: {
      updateHarnessRuntime: async (options) => { calls.push({ kind: 'runtime', options }); },
      installContextDbSkills: async (options) => { calls.push({ kind: 'skills', options }); },
    },
  });

  assert.equal(calls[0].kind, 'runtime');
  assert.equal(calls[0].options.rootDir, '/tmp/aios-test');
  assert.equal(calls[1].kind, 'skills');
});

test('runSetup scopes native, agents, and superpowers project writes to projectRoot and client', async () => {
  const calls = [];
  await runSetup({
    components: ['native', 'agents', 'superpowers'],
    client: 'opencode',
    skipDoctor: true,
  }, {
    rootDir: '/tmp/aios-install',
    projectRoot: '/tmp/user-project',
    io: { log: () => {} },
    deps: {
      installNativeEnhancements: async (options) => { calls.push({ kind: 'native', options }); },
      installOrchestratorAgents: async (options) => { calls.push({ kind: 'agents', options }); },
      installSuperpowers: async (options) => { calls.push({ kind: 'superpowers', options }); },
    },
  });

  assert.equal(calls[0].kind, 'native');
  assert.equal(calls[0].options.rootDir, '/tmp/aios-install');
  assert.equal(calls[0].options.projectRoot, '/tmp/user-project');
  assert.equal(calls[0].options.client, 'opencode');
  assert.equal(calls[1].kind, 'agents');
  assert.equal(calls[1].options.rootDir, '/tmp/aios-install');
  assert.equal(calls[1].options.projectRoot, '/tmp/user-project');
  assert.equal(calls[1].options.client, 'opencode');
  assert.equal(calls[2].kind, 'superpowers');
  assert.equal(calls[2].options.rootDir, '/tmp/user-project');
  assert.equal(calls[2].options.client, 'opencode');
});

test('runUpdate scopes native, agents, and superpowers project writes to projectRoot and client', async () => {
  const calls = [];
  await runUpdate({
    components: ['native', 'agents', 'superpowers'],
    client: 'claude',
    skipDoctor: true,
  }, {
    rootDir: '/tmp/aios-install',
    projectRoot: '/tmp/user-project',
    io: { log: () => {} },
    deps: {
      updateNativeEnhancements: async (options) => { calls.push({ kind: 'native', options }); },
      installOrchestratorAgents: async (options) => { calls.push({ kind: 'agents', options }); },
      installSuperpowers: async (options) => { calls.push({ kind: 'superpowers', options }); },
    },
  });

  assert.equal(calls[0].kind, 'native');
  assert.equal(calls[0].options.rootDir, '/tmp/aios-install');
  assert.equal(calls[0].options.projectRoot, '/tmp/user-project');
  assert.equal(calls[0].options.client, 'claude');
  assert.equal(calls[1].kind, 'agents');
  assert.equal(calls[1].options.rootDir, '/tmp/aios-install');
  assert.equal(calls[1].options.projectRoot, '/tmp/user-project');
  assert.equal(calls[1].options.client, 'claude');
  assert.equal(calls[2].kind, 'superpowers');
  assert.equal(calls[2].options.rootDir, '/tmp/user-project');
  assert.equal(calls[2].options.client, 'claude');
});

test('runUpdate browser flow does not block lifecycle when browser-use runtime is missing', async () => {
  const calls = [];
  const logs = [];
  await runUpdate({
    components: ['browser'],
    withPlaywrightInstall: false,
    skipDoctor: false,
  }, {
    rootDir: '/tmp/aios-test',
    projectRoot: '/tmp/aios-test',
    io: { log: (line) => logs.push(String(line)) },
    deps: {
      installBrowserMcp: async () => {
        throw new Error('browser-use MCP project not found.\nSet AIOS_BROWSER_USE_REPO to your ai-browser-book repository path.');
      },
      doctorBrowserMcp: async (options) => { calls.push({ kind: 'doctor', options }); },
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, 'doctor');
  assert.equal(calls[0].options.fix, false);
  assert.match(logs.join('\n'), /\[warn\] browser component skipped:/);
  assert.match(logs.join('\n'), /node scripts\/aios\.mjs internal browser doctor --fix/);
});
