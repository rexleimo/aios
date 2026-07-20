import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  advanceLongRunningDelivery,
  captureStandaloneExecutionReceipt,
  resolveStandaloneExecutionReceipt,
  startLongRunningDelivery,
} from '../../rex-harness/src/index.mjs';
import {
  persistAiosLongRunningDelivery,
  readAiosLongRunningDelivery,
  runAiosLongRunningDeliveryIteration,
} from '../lib/workflows/rex-long-running-delivery-store.mjs';

function scenarioCommand(rootDir, args) {
  return {
    executable: process.execPath,
    args,
    cwd: rootDir,
  };
}

async function createDelivery(rootDir) {
  const runner = path.join(rootDir, 'scenario-runner.mjs');
  const validationControl = path.join(rootDir, 'validation-exit.txt');
  const receiptControl = path.join(rootDir, 'receipt-exit.txt');
  await writeFile(runner, [
    "import fs from 'node:fs';",
    "process.exit(Number(fs.readFileSync(process.argv[2], 'utf8')));",
    '',
  ].join('\n'), 'utf8');
  await Promise.all([
    writeFile(validationControl, '0', 'utf8'),
    writeFile(receiptControl, '0', 'utf8'),
  ]);

  const baselineCommand = scenarioCommand(rootDir, ['-e', 'process.exit(0)']);
  const validationCommand = scenarioCommand(rootDir, [runner, validationControl]);
  const receiptCommand = scenarioCommand(rootDir, [runner, receiptControl]);
  const baselineReceipt = captureStandaloneExecutionReceipt({ rootDir, ...baselineCommand });
  const resolveReceipt = (ref) => resolveStandaloneExecutionReceipt({ rootDir, ref });
  const started = startLongRunningDelivery({
    workItemKey: 'checkout-opaque-store',
    baseline: {
      publicEntry: 'checkout public baseline',
      setup: 'Run the existing checkout acceptance scenario before feature delivery.',
      command: baselineCommand,
      expected: 'The pre-existing checkout behavior passes.',
      observed: 'The pre-existing checkout behavior passed.',
      receiptRef: baselineReceipt.ref,
    },
    features: [
      {
        id: 'checkout-validation',
        acceptance: 'Invalid checkout input is rejected through the public entry.',
        verificationScenario: {
          publicEntry: 'checkout validation endpoint',
          setup: 'Submit invalid checkout input.',
          command: validationCommand,
          expected: 'The invalid checkout is rejected.',
        },
      },
      {
        id: 'checkout-receipt',
        acceptance: 'A valid checkout returns a receipt through the public entry.',
        verificationScenario: {
          publicEntry: 'checkout receipt endpoint',
          setup: 'Submit a valid checkout request.',
          command: receiptCommand,
          expected: 'The checkout returns a receipt.',
        },
      },
    ],
  }, { resolveReceipt });
  return { started, validationCommand, resolveReceipt };
}

test('AIOS persists an opaque Rex ledger and runs exactly one Rex-issued feature after restart', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-long-running-store-'));
  try {
    const fixture = await createDelivery(rootDir);
    const deliveryId = 'checkout-long-running';
    persistAiosLongRunningDelivery({
      rootDir,
      deliveryId,
      result: fixture.started,
    });

    const reloaded = readAiosLongRunningDelivery({ rootDir, deliveryId });
    assert.deepEqual(reloaded, fixture.started);

    const receipt = captureStandaloneExecutionReceipt({
      rootDir,
      ...fixture.validationCommand,
    });
    const evidence = {
      kind: 'feature-verification-observed',
      featureId: 'checkout-validation',
      receiptRef: receipt.ref,
    };
    const expected = advanceLongRunningDelivery(reloaded.ledger, evidence, {
      resolveReceipt: fixture.resolveReceipt,
    });
    let callbackCount = 0;
    const advanced = await runAiosLongRunningDeliveryIteration({
      rootDir,
      deliveryId,
      resolveReceipt: fixture.resolveReceipt,
      runIteration: async (context) => {
        callbackCount += 1;
        assert.deepEqual(context, {
          deliveryId,
          decision: reloaded.decision,
        });
        return evidence;
      },
    });

    assert.equal(callbackCount, 1);
    assert.deepEqual(advanced, expected);
    assert.deepEqual(advanced.decision, {
      kind: 'continue',
      currentFeatureId: 'checkout-receipt',
    });
    assert.deepEqual(
      readAiosLongRunningDelivery({ rootDir, deliveryId }),
      advanced,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
