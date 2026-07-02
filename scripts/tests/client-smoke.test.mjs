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

test('buildSmokeInvocation throws for unknown client', () => {
  assert.throws(() => buildSmokeInvocation('nope'), /unknown smoke client/i);
});

test('runClientTriggerLiveSmoke records OpenCode trigger evidence', async () => {
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
