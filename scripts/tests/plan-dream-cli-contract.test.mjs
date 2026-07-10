import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getCommandHelpText, getRootHelpText } from '../lib/cli/help.mjs';
import { parseArgs } from '../lib/cli/parse-args.mjs';

const CLI_PATH = path.join(process.cwd(), 'scripts', 'aios.mjs');

function runCli(args, { cwd = process.cwd() } = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

test('P11 root and subcommand help surfaces advertise plan and dream', () => {
  const rootHelp = getRootHelpText();
  assert.match(rootHelp, /\bplan\b/);
  assert.match(rootHelp, /\bdream\b/);

  const planHelp = getCommandHelpText('plan');
  assert.match(planHelp, /node scripts\/aios\.mjs plan show --html/);
  assert.match(planHelp, /--workspace <path>/);
  assert.match(planHelp, /--json/);

  const dreamHelp = getCommandHelpText('dream');
  assert.match(dreamHelp, /node scripts\/aios\.mjs dream --preview --to pin --json/);
  assert.match(dreamHelp, /--workspace <path>/);
  assert.match(dreamHelp, /--apply/);
});

test('P11 CLI routes plan and dream help without unknown-option fallback', () => {
  const planHelp = runCli(['plan', '--help']);
  assert.equal(planHelp.status, 0, planHelp.stderr || planHelp.stdout);
  assert.doesNotMatch(planHelp.stderr || '', /unknown option/i);
  assert.match(planHelp.stdout, /node scripts\/aios\.mjs plan show --html/);
  assert.match(planHelp.stdout, /--workspace <path>/);

  const dreamHelp = runCli(['dream', '--help']);
  assert.equal(dreamHelp.status, 0, dreamHelp.stderr || dreamHelp.stdout);
  assert.doesNotMatch(dreamHelp.stderr || '', /unknown option/i);
  assert.match(dreamHelp.stdout, /node scripts\/aios\.mjs dream --preview --to pin --json/);
  assert.match(dreamHelp.stdout, /--workspace <path>/);
});

test('P11/P12 parseArgs accepts workspace and json for plan and dream', () => {
  const plan = parseArgs([
    'plan',
    'start',
    '--title',
    'workspace plan',
    '--task',
    'workspace task',
    '--workspace',
    '/tmp/plan-workspace',
    '--json',
  ]);
  assert.equal(plan.command, 'plan');
  assert.equal(plan.mode, 'command');
  assert.equal(plan.options.subcommand, 'start');
  assert.equal(plan.options.workspaceRoot, '/tmp/plan-workspace');
  assert.equal(plan.options.json, true);

  const dream = parseArgs([
    'dream',
    '--preview',
    '--to',
    'pin',
    '--workspace',
    '/tmp/dream-workspace',
    '--json',
  ]);
  assert.equal(dream.command, 'dream');
  assert.equal(dream.mode, 'command');
  assert.equal(dream.options.mode, 'preview');
  assert.equal(dream.options.to, 'pin');
  assert.equal(dream.options.workspaceRoot, '/tmp/dream-workspace');
  assert.equal(dream.options.json, true);
});

test('P12 plan and dream honor workspace roots', async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-plan-dream-workspace-'));
  try {
    const start = runCli([
      'plan',
      'start',
      '--title',
      'workspace plan',
      '--task',
      'workspace task',
      '--workspace',
      workspaceRoot,
      '--json',
    ]);
    assert.equal(start.status, 0, start.stderr || start.stdout);
    const started = JSON.parse(start.stdout);
    assert.equal(started.title, 'workspace plan');
    await access(path.join(workspaceRoot, '.aios', 'planning', 'active.json'));

    const shown = runCli([
      'plan',
      'show',
      '--workspace',
      workspaceRoot,
      '--json',
    ]);
    assert.equal(shown.status, 0, shown.stderr || shown.stdout);
    const shownJson = JSON.parse(shown.stdout);
    assert.equal(shownJson.plan.title, 'workspace plan');

    const activePlan = JSON.parse(await readFile(path.join(workspaceRoot, '.aios', 'planning', 'active.json'), 'utf8'));
    assert.equal(activePlan.title, 'workspace plan');

    const dream = runCli([
      'dream',
      '--preview',
      '--to',
      'pin',
      '--workspace',
      workspaceRoot,
      '--json',
    ]);
    assert.equal(dream.status, 0, dream.stderr || dream.stdout);
    const dreamJson = JSON.parse(dream.stdout);
    assert.equal(dreamJson.targets, 'pin');
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
});
