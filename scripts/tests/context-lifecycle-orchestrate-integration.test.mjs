import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createDispatchRuntimeRegistry } from '../lib/harness/orchestrator-runtimes.mjs';
import { runOrchestrate } from '../lib/lifecycle/orchestrate.mjs';
import { startPlan } from '../lib/planning/contract.mjs';
import { captureSessionWorkspaceSnapshot } from '../lib/session/changed-files.mjs';

const cliPath = path.resolve(process.cwd(), 'scripts', 'aios.mjs');

async function withRoot(prefix, fn) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

async function createContextPlan(rootDir) {
  await mkdir(path.join(rootDir, 'docs'), { recursive: true });
  await mkdir(path.join(rootDir, 'src'), { recursive: true });
  await writeFile(path.join(rootDir, 'docs', 'required.md'), 'REQUIRED DELIVERY CONTENT\n', 'utf8');
  await writeFile(
    path.join(rootDir, 'docs', 'optional.md'),
    'OPTIONAL DELIVERY CONTENT '.repeat(16),
    'utf8',
  );
  return startPlan({
    rootDir,
    title: 'Context lifecycle orchestrate integration',
    sessionId: 'context-lifecycle-session',
    tasks: [{
      id: 'deliver-context',
      title: 'Deliver governed context to dispatch',
      status: 'pending',
      targets: ['src/feature.mjs'],
      allowedWrites: ['src/**'],
      contextRequirements: [
        { ref: 'docs/required.md', reason: 'Required implementation contract', required: true },
        { ref: 'docs/optional.md', reason: 'Optional background', required: false },
      ],
    }],
  });
}

function parseJsonLogs(logs) {
  return JSON.parse(logs.join('\n'));
}

test('runOrchestrate assembles actual context, injects the matching representation, and records the full shadow chain', async () => {
  await withRoot('context-orchestrate-runtime-', async (rootDir) => {
    const activePlan = await createContextPlan(rootDir);
    const logs = [];
    let dispatchedPlan = null;
    const dispatchRuntimeRegistry = createDispatchRuntimeRegistry({
      executeDryRunPlan(plan) {
        dispatchedPlan = plan;
        return {
          mode: 'dry-run',
          ok: true,
          executorRegistry: [],
          executorDetails: [],
          jobRuns: [],
          finalOutputs: [],
        };
      },
    });

    const result = await runOrchestrate({
      taskTitle: 'Deliver governed context',
      contextTaskId: 'deliver-context',
      contextBudgetUnits: 600,
      dispatchMode: 'local',
      executionMode: 'dry-run',
      format: 'json',
    }, {
      rootDir,
      io: { log: (line) => logs.push(line) },
      dispatchRuntimeRegistry,
    });
    const report = parseJsonLogs(logs);

    assert.equal(result.exitCode, 0);
    assert.equal(report.contextLifecycle.status, 'observed');
    assert.equal(report.contextLifecycle.taskId, 'deliver-context');
    assert.equal(report.contextLifecycle.assembly.evidenceSource, 'orchestrator_assembler');
    assert.equal(report.contextLifecycle.assembly.brokerVerified, false);
    assert.equal(report.contextLifecycle.preflight.verdict, 'ready');
    assert.equal(report.contextLifecycle.preflight.wouldBlock, false);
    assert.equal(report.contextLifecycle.reconciliation.kind, 'contextdb.context-reconciliation-receipt');

    const packetPath = path.join(rootDir, '.aios', 'context-db', 'execution-context');
    const serializedDispatch = JSON.stringify(dispatchedPlan);
    assert.match(serializedDispatch, /REQUIRED DELIVERY CONTENT/);
    assert.match(serializedDispatch, /context ref=docs\/required\.md representation=full/);
    assert.match(serializedDispatch, /context ref=docs\/optional\.md representation=summary\+ref/);
    assert.equal(JSON.stringify(report).includes('REQUIRED DELIVERY CONTENT'), false);
    assert.equal(JSON.stringify(report).includes('OPTIONAL DELIVERY CONTENT'), false);

    const packetDirs = await (await import('node:fs/promises')).readdir(packetPath, { recursive: true });
    assert.equal(packetDirs.some((entry) => String(entry).endsWith('packet.json')), true);
    assert.equal(packetDirs.some((entry) => String(entry).endsWith('receipt.json')), true);
    assert.equal(activePlan.tasks[0].id, 'deliver-context');
  });
});

test('real aios orchestrate CLI emits observed context lifecycle metadata and no raw delivered text', async () => {
  await withRoot('context-orchestrate-cli-', async (rootDir) => {
    await createContextPlan(rootDir);
    const result = spawnSync(process.execPath, [
      cliPath,
      'orchestrate',
      '--task', 'Deliver governed context',
      '--context-task', 'deliver-context',
      '--context-budget', '600',
      '--dispatch', 'local',
      '--execute', 'dry-run',
      '--format', 'json',
    ], {
      cwd: rootDir,
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.contextLifecycle.status, 'observed');
    assert.equal(report.contextLifecycle.taskId, 'deliver-context');
    assert.equal(report.contextLifecycle.preflight.verdict, 'ready');
    assert.equal(report.contextLifecycle.reconciliation.kind, 'contextdb.context-reconciliation-receipt');
    assert.equal(JSON.stringify(report).includes('REQUIRED DELIVERY CONTENT'), false);
    assert.equal(JSON.stringify(report).includes('OPTIONAL DELIVERY CONTENT'), false);

    const receiptsRoot = path.join(rootDir, '.aios', 'context-db', 'execution-context');
    const top = await (await import('node:fs/promises')).readdir(receiptsRoot, { recursive: true });
    const receiptEntry = top.find((entry) => String(entry).endsWith('receipt.json'));
    assert.ok(receiptEntry);
    const receiptPath = path.join(receiptsRoot, receiptEntry);
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    assert.equal(receipt.evidenceBoundary.readEvidenceSource, 'orchestrator_assembler');
    assert.equal(receipt.evidenceBoundary.brokerVerified, false);
    assert.equal(receipt.evidenceBoundary.callerAssertionsAccepted, false);
    assert.equal(receipt.included.some((item) => item.ref === 'docs/required.md'), true);
    assert.equal(receipt.degraded.some((item) => item.ref === 'docs/optional.md' && item.representation === 'summary+ref'), true);
  });
});

test('runOrchestrate records runtime-observed mutations before reconciliation in a non-Git workspace', async () => {
  await withRoot('context-orchestrate-mutation-observation-', async (rootDir) => {
    await createContextPlan(rootDir);
    const logs = [];
    const dispatchRuntimeRegistry = createDispatchRuntimeRegistry({
      executeDryRunPlan() {
        writeFileSync(path.join(rootDir, 'docs', 'undeclared.mjs'), 'export const changed = true;\n', 'utf8');
        return {
          mode: 'dry-run',
          ok: true,
          executorRegistry: [],
          executorDetails: [],
          jobRuns: [],
          finalOutputs: [],
        };
      },
    });

    await runOrchestrate({
      taskTitle: 'Observe runtime mutations',
      contextTaskId: 'deliver-context',
      dispatchMode: 'local',
      executionMode: 'dry-run',
      format: 'json',
    }, {
      rootDir,
      io: { log: (line) => logs.push(line) },
      dispatchRuntimeRegistry,
    });
    const report = parseJsonLogs(logs);
    const observation = report.contextLifecycle.mutationObservation;
    const reconciliation = report.contextLifecycle.reconciliation;

    assert.equal(observation.available, true);
    assert.deepEqual(observation.files, [{ path: 'docs/undeclared.mjs', changeType: 'created' }]);
    assert.ok(reconciliation.ledgerPaths.includes('docs/undeclared.mjs'));
    assert.ok(reconciliation.actualPaths.includes('docs/undeclared.mjs'));
    assert.ok(reconciliation.undeclaredPaths.includes('docs/undeclared.mjs'));
    assert.ok(reconciliation.wouldBlockReasons.includes('undeclared_target'));
  });
});

test('runOrchestrate reconciles runtime-observed mutations even when dispatch throws', async () => {
  await withRoot('context-orchestrate-mutation-error-', async (rootDir) => {
    await createContextPlan(rootDir);
    const dispatchRuntimeRegistry = createDispatchRuntimeRegistry({
      executeDryRunPlan() {
        writeFileSync(path.join(rootDir, 'docs', 'undeclared-after-error.mjs'), 'export const changed = true;\n', 'utf8');
        throw new Error('dispatch failed after mutation');
      },
    });

    await assert.rejects(
      runOrchestrate({
        taskTitle: 'Observe failing runtime mutation',
        contextTaskId: 'deliver-context',
        dispatchMode: 'local',
        executionMode: 'dry-run',
        format: 'json',
      }, {
        rootDir,
        io: { log() {} },
        dispatchRuntimeRegistry,
      }),
      /dispatch failed after mutation/u,
    );

    const reconciliationRoot = path.join(rootDir, '.aios', 'context-db', 'reconciliation', 'context-lifecycle-session');
    const entries = await (await import('node:fs/promises')).readdir(reconciliationRoot);
    assert.equal(entries.length, 1);
    const receipt = JSON.parse(await readFile(path.join(reconciliationRoot, entries[0]), 'utf8'));
    assert.ok(receipt.ledgerPaths.includes('docs/undeclared-after-error.mjs'));
    assert.ok(receipt.undeclaredPaths.includes('docs/undeclared-after-error.mjs'));
  });
});

test('real plan task CLI declarations reach default orchestration without a manual state edit', async () => {
  await withRoot('context-orchestrate-cli-producer-', async (rootDir) => {
    await mkdir(path.join(rootDir, 'docs'), { recursive: true });
    await writeFile(path.join(rootDir, 'docs', 'required.md'), 'REAL CLI DELIVERY CONTENT\n', 'utf8');

    const started = spawnSync(process.execPath, [
      cliPath,
      'plan', 'start',
      '--title', 'CLI context producer',
      '--workspace', rootDir,
      '--json',
    ], {
      cwd: rootDir,
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(started.status, 0, started.stderr || started.stdout);

    const declared = spawnSync(process.execPath, [
      cliPath,
      'plan', 'task', 't1-understand',
      '--context', 'docs/required.md:Required delivery contract',
      '--target', 'src/feature.mjs',
      '--allow-write', 'src/**',
      '--workspace', rootDir,
      '--json',
    ], {
      cwd: rootDir,
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(declared.status, 0, declared.stderr || declared.stdout);
    const task = JSON.parse(declared.stdout).state.tasks.find((item) => item.id === 't1-understand');
    assert.deepEqual(task.targets, ['src/feature.mjs']);
    assert.deepEqual(task.allowedWrites, ['src/**']);
    assert.deepEqual(task.contextRequirements, [{
      ref: 'docs/required.md',
      reason: 'Required delivery contract',
      required: true,
      verification: [],
    }]);

    const orchestrated = spawnSync(process.execPath, [
      cliPath,
      'orchestrate',
      '--task', 'Deliver declared context',
      '--dispatch', 'local',
      '--execute', 'dry-run',
      '--format', 'json',
    ], {
      cwd: rootDir,
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(orchestrated.status, 0, orchestrated.stderr || orchestrated.stdout);
    const report = JSON.parse(orchestrated.stdout);
    assert.equal(report.contextLifecycle.status, 'observed');
    assert.equal(report.contextLifecycle.taskId, 't1-understand');
    assert.ok(report.contextLifecycle.assembly.deliveryUnits > 0);
    assert.equal(JSON.stringify(report).includes('REAL CLI DELIVERY CONTENT'), false);
  });
});

test('default orchestration selects the first pending task in dependency-topological order', async () => {
  await withRoot('context-orchestrate-topological-default-', async (rootDir) => {
    await mkdir(path.join(rootDir, 'docs'), { recursive: true });
    await writeFile(path.join(rootDir, 'docs', 'first.md'), 'FIRST TASK CONTEXT\n', 'utf8');
    await writeFile(path.join(rootDir, 'docs', 'second.md'), 'SECOND TASK CONTEXT\n', 'utf8');
    startPlan({
      rootDir,
      title: 'Topological task selection',
      tasks: [
        {
          id: 'second',
          title: 'Second task is intentionally listed first',
          status: 'pending',
          dependsOn: ['first'],
          contextRequirements: [{ ref: 'docs/second.md', reason: 'Second task context' }],
        },
        {
          id: 'first',
          title: 'First dependency node',
          status: 'pending',
          dependsOn: [],
          contextRequirements: [{ ref: 'docs/first.md', reason: 'First task context' }],
        },
      ],
    });

    const logs = [];
    const result = await runOrchestrate({
      taskTitle: 'Select the first pending task',
      dispatchMode: 'local',
      executionMode: 'dry-run',
      format: 'json',
    }, {
      rootDir,
      io: { log: (line) => logs.push(line) },
    });
    const report = parseJsonLogs(logs);

    assert.equal(result.exitCode, 0);
    assert.equal(report.contextLifecycle.status, 'observed');
    assert.equal(report.contextLifecycle.taskId, 'first');

    const explicitLogs = [];
    await runOrchestrate({
      taskTitle: 'Explicit task still overrides the default',
      contextTaskId: 'second',
      dispatchMode: 'local',
      executionMode: 'dry-run',
      format: 'json',
    }, {
      rootDir,
      io: { log: (line) => explicitLogs.push(line) },
    });
    assert.equal(parseJsonLogs(explicitLogs).contextLifecycle.taskId, 'second');
  });
});


test('default orchestration prefers a pending task with confirmed context over earlier empty pending tasks', async () => {
  await withRoot('context-orchestrate-confirmed-default-', async (rootDir) => {
    await mkdir(path.join(rootDir, 'docs'), { recursive: true });
    await writeFile(path.join(rootDir, 'docs', 'confirmed.md'), 'CONFIRMED CONTEXT WINS\n', 'utf8');
    startPlan({
      rootDir,
      title: 'Confirmed context default selection',
      tasks: [
        {
          id: 'first',
          title: 'Earlier empty task',
          status: 'pending',
          dependsOn: [],
        },
        {
          id: 'confirmed',
          title: 'Later contextualized task',
          status: 'pending',
          dependsOn: ['first'],
          targets: ['docs/confirmed.md'],
          contextRequirements: [{ ref: 'docs/confirmed.md', reason: 'Human-confirmed context', required: true }],
        },
      ],
    });

    const logs = [];
    await runOrchestrate({
      taskTitle: 'Prefer confirmed context',
      dispatchMode: 'local',
      executionMode: 'dry-run',
      format: 'json',
    }, {
      rootDir,
      io: { log: (line) => logs.push(line) },
    });
    const report = parseJsonLogs(logs);

    assert.equal(report.contextLifecycle.status, 'observed');
    assert.equal(report.contextLifecycle.taskId, 'confirmed');
    assert.ok(report.contextLifecycle.assembly.deliveryUnits > 0);
  });
});

test('workspace snapshots skip generated, build, cache, and virtualenv trees', async () => {
  await withRoot('context-workspace-snapshot-exclusions-', async (rootDir) => {
    for (const relativePath of [
      'src/kept.mjs',
      'dist/generated.js',
      'build/generated.js',
      'temp/report.json',
      'coverage/lcov.info',
      '.venv/bin/python',
      'nested/dist/generated.js',
    ]) {
      await mkdir(path.dirname(path.join(rootDir, relativePath)), { recursive: true });
      await writeFile(path.join(rootDir, relativePath), relativePath, 'utf8');
    }

    const snapshot = await captureSessionWorkspaceSnapshot({ rootDir });
    assert.equal(snapshot.available, true);
    assert.deepEqual([...snapshot.entries.keys()], ['src/kept.mjs']);
  });
});
