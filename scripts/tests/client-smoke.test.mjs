import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildSmokeInvocation,
  formatSmokeEvidence,
  runClientSmoke,
  runClientTriggerLiveSmoke,
} from '../lib/clients/smoke.mjs';
import { runClientsCommand } from '../lib/lifecycle/clients.mjs';

test('buildSmokeInvocation returns help + task probes for crush', () => {
  const probes = buildSmokeInvocation('crush');
  assert.equal(probes.command, 'crush');
  assert.deepEqual(probes.help.args, ['run', '--help']);
  assert.deepEqual(probes.task.args, ['run', 'reply with OK']);
});

test('buildSmokeInvocation throws for unknown client', () => {
  assert.throws(() => buildSmokeInvocation('nope'), /unknown smoke client/i);
});

test('formatSmokeEvidence records pass when task exits 0', () => {
  const ev = formatSmokeEvidence({
    client: 'crush',
    timestamp: '2026-06-10T00:00:00Z',
    helpExitCode: 0,
    taskExitCode: 0,
    taskOutput: 'OK',
    resolvedPaths: { skillRoot: '.crush/skills' },
  });
  assert.equal(ev.client, 'crush');
  assert.equal(ev.status, 'pass');
  assert.equal(ev.taskExitCode, 0);
  assert.equal(ev.resolvedPaths.skillRoot, '.crush/skills');
});

test('formatSmokeEvidence records fail when task exits non-zero', () => {
  const ev = formatSmokeEvidence({
    client: 'antigravity',
    timestamp: '2026-06-10T00:00:00Z',
    helpExitCode: 0,
    taskExitCode: 1,
    taskOutput: 'error',
    resolvedPaths: {},
  });
  assert.equal(ev.status, 'fail');
});

test('runClientsCommand smoke fails when any explicitly requested client is unsupported', async () => {
  let output = '';
  const stdout = {
    write(chunk) {
      output += String(chunk);
    },
  };

  const result = await runClientsCommand(
    { subcommand: 'smoke', client: 'antigravity,crush' },
    {
      rootDir: process.cwd(),
      stdout,
      listSmokeClientsImpl: () => ['crush'],
      runClientSmokeImpl: async () => ({
        evidence: { status: 'pass', taskExitCode: 0 },
        evidencePath: '/tmp/crush-smoke.json',
      }),
    }
  );

  assert.equal(result.exitCode, 1);
  assert.match(output, /skip unknown smoke client: antigravity/i);
  assert.match(output, /smoke crush: pass/i);
});

test('runClientSmoke records actual probed filesystem paths instead of raw registry strings', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-client-smoke-root-'));
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'aios-client-smoke-home-'));
  await mkdir(path.join(rootDir, '.crush', 'skills'), { recursive: true });
  await writeFile(path.join(rootDir, 'AGENTS.md'), '# project instructions\n', 'utf8');
  await writeFile(path.join(rootDir, 'crush.json'), '{}\n', 'utf8');
  await mkdir(path.join(homeDir, '.crush'), { recursive: true });
  await writeFile(path.join(homeDir, '.crush', 'crush.json'), '{}\n', 'utf8');

  const spawnCalls = [];
  const spawnImpl = (command, args) => {
    spawnCalls.push({ command, args });
    return { status: 0, stdout: 'ok\n', stderr: '' };
  };

  const { evidence, evidencePath } = await runClientSmoke('crush', {
    rootDir,
    env: { ...process.env, HOME: homeDir },
    now: new Date('2026-06-10T00:00:00Z'),
    spawnImpl,
  });

  assert.equal(evidence.status, 'pass');
  assert.deepEqual(spawnCalls.map((call) => call.args), [['run', '--help'], ['run', 'reply with OK']]);
  assert.equal(evidence.resolvedPaths.projectSkillRoot.path, path.join(rootDir, '.crush', 'skills'));
  assert.equal(evidence.resolvedPaths.projectSkillRoot.exists, true);
  assert.equal(evidence.resolvedPaths.instructionFile.path, path.join(rootDir, 'AGENTS.md'));
  assert.equal(evidence.resolvedPaths.instructionFile.exists, true);
  assert.deepEqual(
    evidence.resolvedPaths.mcpTargets.map((target) => ({ path: target.path, exists: target.exists })),
    [
      { path: path.join(rootDir, 'crush.json'), exists: true },
      { path: path.join(rootDir, '.crush.json'), exists: false },
      { path: path.join(homeDir, '.crush', 'crush.json'), exists: true },
    ]
  );

  const persisted = JSON.parse(await readFile(evidencePath, 'utf8'));
  assert.equal(persisted.resolvedPaths.instructionFile.exists, true);
  assert.equal(persisted.resolvedPaths.mcpTargets[2].exists, true);
});

test('runClientTriggerLiveSmoke validates OpenCode one-shot trigger output without real CLI dependency', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-opencode-live-smoke-root-'));
  await writeFile(path.join(rootDir, 'AGENTS.md'), 'AIOS Token Discipline\nAIOS Superpowers Workflow\n', 'utf8');
  await mkdir(path.join(rootDir, '.opencode', 'agent'), { recursive: true });
  await writeFile(path.join(rootDir, '.opencode', 'agent', 'aios-build.md'), 'Use AGENTS.md and AIOS skills.\n', 'utf8');
  await mkdir(path.join(rootDir, '.opencode', 'skills'), { recursive: true });
  await writeFile(path.join(rootDir, 'opencode.json'), '{"agent":"aios-build"}\n', 'utf8');

  const spawnCalls = [];
  const result = await runClientTriggerLiveSmoke('opencode', {
    rootDir,
    spawnImpl: (command, args) => {
      spawnCalls.push({ command, args });
      return {
        status: 0,
        stdout: 'AIOS_TRIGGER_OK: token discipline, superpowers, skills loaded\n',
        stderr: '',
      };
    },
    now: new Date('2026-06-14T00:00:00Z'),
  });

  assert.equal(result.evidence.status, 'pass');
  assert.equal(result.evidence.client, 'opencode');
  assert.equal(result.evidence.triggerDetected, true);
  assert.equal(spawnCalls.length, 1);
  assert.match(spawnCalls[0].args.join(' '), /AIOS_TRIGGER_PROBE/);
});
