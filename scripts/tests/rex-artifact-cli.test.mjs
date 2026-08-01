import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parsePlanArgs } from '../lib/cli/parse-args/plan.mjs';
import { runPlanCommand } from '../lib/planning/cli.mjs';
import { evaluateAiosSoftwareRequest } from '../lib/workflows/rex-harness-adapter.mjs';
import {
  readStoredAiosCapabilityActivation,
  startStoredAiosCapabilityActivation,
} from '../lib/workflows/rex-activation-store.mjs';

const WAYFINDER_ARTIFACT = Object.freeze({
  schemaVersion: 1,
  kind: 'rex.wayfinding-artifact.v1',
  status: 'complete',
  destination: {
    name: 'workspace artifact input',
    successSignal: 'the current command consumes a bounded artifact file',
    scope: ['capability evidence CLI'],
    evidenceRefs: ['artifact:destination'],
  },
  decisionGraph: {
    nodes: [{
      id: 'node-cli',
      question: 'where is the artifact read?',
      decision: 'read it from the selected workspace only',
      evidenceRefs: ['path:scripts/lib/planning/cli.mjs'],
    }],
    edges: [],
  },
  unknowns: [],
  decisionTicket: {
    ticketId: 'decision-workspace-artifact',
    facts: ['the CLI has a selected workspace root'],
    decision: 'resolve artifact files inside that root',
    consequences: ['outside files are rejected'],
    evidenceRefs: ['path:scripts/lib/planning/cli.mjs'],
  },
  nextSlice: {
    id: 'slice-cli-artifact',
    outcome: 'record one typed artifact on the current activation',
    verification: 'node --test scripts/tests/rex-artifact-cli.test.mjs',
    evidenceRefs: ['path:scripts/tests/rex-artifact-cli.test.mjs'],
  },
});

function outputBuffer() {
  let value = '';
  return {
    stream: { write(chunk) { value += String(chunk); } },
    read() { return value; },
  };
}

test('capability evidence CLI round-trips typed Wayfinder and Planning file options', () => {
  const parsed = parsePlanArgs([
    'plan',
    'capability-evidence',
    '--activation', 'activation-1',
    '--command-token', 'token-1',
    '--evidence-kind', 'next-slice-identified',
    '--evidence-ref', 'artifact:next-slice',
    '--wayfinder-file', '.rex/wayfinder.json',
    '--planning-file', '.rex/planning.json',
    '--json',
  ]);
  assert.equal(parsed.mode, 'command');
  assert.equal(parsed.options.subcommand, 'capability-evidence');
  assert.equal(parsed.options.wayfinderFile, '.rex/wayfinder.json');
  assert.equal(parsed.options.planningFile, '.rex/planning.json');
});

test('capability evidence CLI reads artifacts only from the selected workspace', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'rex-artifact-cli-workspace-'));
  const outsideRoot = await mkdtemp(path.join(os.tmpdir(), 'rex-artifact-cli-outside-'));
  try {
    const artifactPath = path.join(rootDir, 'wayfinder.json');
    const outsideArtifactPath = path.join(outsideRoot, 'wayfinder.json');
    await writeFile(artifactPath, `${JSON.stringify(WAYFINDER_ARTIFACT, null, 2)}\n`, 'utf8');
    await writeFile(outsideArtifactPath, `${JSON.stringify(WAYFINDER_ARTIFACT, null, 2)}\n`, 'utf8');

    const decision = evaluateAiosSoftwareRequest({
      message: 'Map the unknown execution path.',
      explicitIntent: 'wayfinder',
    }).decision;
    const started = startStoredAiosCapabilityActivation({
      rootDir,
      decision,
      activationId: 'activation-cli-wayfinder',
      workItemKey: 'work-item:cli-wayfinder',
      request: { message: 'Map the unknown execution path.', explicitIntent: 'wayfinder' },
    });
    const stdout = outputBuffer();
    const stderr = outputBuffer();
    const accepted = await runPlanCommand({
      subcommand: 'capability-evidence',
      activationId: started.activation.activationId,
      commandToken: started.command.executionToken,
      evidenceKind: 'destination-recorded',
      evidenceRef: 'artifact:destination',
      wayfinderFile: 'wayfinder.json',
      json: true,
    }, { rootDir, stdout: stdout.stream, stderr: stderr.stream });

    assert.equal(accepted.exitCode, 0, stderr.read());
    assert.equal(accepted.result.outcome, 'blocked');
    assert.equal(accepted.result.artifacts.wayfinderArtifact.kind, 'rex.wayfinding-artifact.v1');
    const stored = readStoredAiosCapabilityActivation({
      rootDir,
      activationId: started.activation.activationId,
    });
    assert.equal(stored.artifacts.wayfinderArtifact.nextSlice.id, 'slice-cli-artifact');

    const outsideStdout = outputBuffer();
    const outsideStderr = outputBuffer();
    const rejected = await runPlanCommand({
      subcommand: 'capability-evidence',
      activationId: started.activation.activationId,
      commandToken: stored.command.executionToken,
      evidenceKind: 'decision-map-recorded',
      evidenceRef: 'artifact:decision-graph',
      wayfinderFile: outsideArtifactPath,
      json: true,
    }, { rootDir, stdout: outsideStdout.stream, stderr: outsideStderr.stream });
    assert.equal(rejected.exitCode, 1);
    assert.match(outsideStderr.read(), /inside the selected workspace/u);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
    await rm(outsideRoot, { recursive: true, force: true });
  }
});
