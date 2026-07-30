import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import { handleMessage } from '../aios-mcp-server.mjs';
import { readActivePlan, startPlan } from '../lib/planning/contract.mjs';

const execFileAsync = promisify(execFile);
const cliPath = path.resolve('scripts/aios.mjs');

async function initializeGitRepository(rootDir) {
  const runGit = (args) => execFileAsync('git', args, { cwd: rootDir, windowsHide: true });
  await runGit(['init', '--quiet']);
  await runGit(['config', 'user.name', 'AIOS Test']);
  await runGit(['config', 'user.email', 'aios-test@example.invalid']);
  await runGit(['add', '--all']);
  await runGit(['commit', '--quiet', '-m', 'fixture']);
}

async function withRoot(fn) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-context-mcp-'));
  try {
    await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

async function writeCodemapFixture(rootDir) {
  const graphDir = path.join(rootDir, '.code-review-graph');
  await mkdir(graphDir, { recursive: true });
  const db = new DatabaseSync(path.join(graphDir, 'graph.db'));
  try {
    db.exec(`
      CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE nodes (
        qualified_name TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        kind TEXT NOT NULL,
        is_test INTEGER DEFAULT 0
      );
      CREATE TABLE edges (
        kind TEXT NOT NULL,
        source_qualified TEXT NOT NULL,
        target_qualified TEXT NOT NULL
      );
    `);
    const insertNode = db.prepare('INSERT INTO nodes (qualified_name, file_path, kind, is_test) VALUES (?, ?, ?, ?)');
    const insertEdge = db.prepare('INSERT INTO edges (kind, source_qualified, target_qualified) VALUES (?, ?, ?)');
    const absolute = (relativePath) => path.join(rootDir, relativePath);
    insertNode.run('src/feature.mjs', absolute('src/feature.mjs'), 'File', 0);
    insertNode.run('src/feature.mjs::feature', absolute('src/feature.mjs'), 'Function', 0);
    insertNode.run('src/caller.mjs', absolute('src/caller.mjs'), 'File', 0);
    insertNode.run('src/caller.mjs::run', absolute('src/caller.mjs'), 'Function', 0);
    insertNode.run('tests/feature.test.mjs', absolute('tests/feature.test.mjs'), 'Test', 1);
    insertEdge.run('CALLS', 'src/caller.mjs::run', 'src/feature.mjs::feature');
    insertEdge.run('TESTED_BY', 'src/feature.mjs::feature', 'tests/feature.test.mjs');
    db.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)').run('last_updated', '2026-07-29T00:00:00Z');
  } finally {
    db.close();
  }
}

test('MCP orchestrate tool uses the real dry-run lifecycle and returns only public context metadata', async () => {
  await withRoot(async (rootDir) => {
    await mkdir(path.join(rootDir, 'docs'), { recursive: true });
    await mkdir(path.join(rootDir, 'src'), { recursive: true });
    await writeFile(path.join(rootDir, 'docs', 'context.md'), 'MCP RUNTIME DELIVERY BODY', 'utf8');
    await writeFile(path.join(rootDir, 'src', 'feature.mjs'), 'export const feature = true;\n', 'utf8');
    startPlan({
      rootDir,
      title: 'MCP lifecycle test',
      objective: 'Exercise the MCP production entry.',
      sessionId: 'mcp-context-session',
      tasks: [{
        id: 'mcp-context-task',
        title: 'Use MCP context',
        targets: ['src/feature.mjs'],
        allowedWrites: ['src/**'],
        contextRequirements: [{ ref: 'docs/context.md', reason: 'Required MCP context', required: true }],
      }],
    });
    await initializeGitRepository(rootDir);

    const listed = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    assert.ok(listed.result.tools.some((tool) => tool.name === 'aios_orchestrate'));

    const response = await handleMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'aios_orchestrate',
        arguments: {
          workspace: rootDir,
          task: 'Use MCP context',
          context_task: 'mcp-context-task',
          context_budget: 256,
          executionMode: 'live',
        },
      },
    });
    const report = JSON.parse(response.result.content[0].text);
    assert.ok(report.contextLifecycle, response.result.content[0].text);
    assert.equal(report.contextLifecycle.status, 'observed');
    assert.equal(report.contextLifecycle.preflight.verdict, 'ready');
    assert.equal(report.contextLifecycle.reconciliation.gitAvailable, true);
    assert.equal(report.contextLifecycle.reconciliation.wouldBlock, false);
    assert.equal(report.dispatchRun.mode, 'dry-run');
    assert.equal(JSON.stringify(report).includes('MCP RUNTIME DELIVERY BODY'), false);
  });
});

test('an MCP agent proposal needs human CLI confirmation before default MCP orchestration receives codemap-derived context', async () => {
  await withRoot(async (rootDir) => {
    await mkdir(path.join(rootDir, 'src'), { recursive: true });
    await mkdir(path.join(rootDir, 'tests'), { recursive: true });
    await writeFile(path.join(rootDir, 'src', 'feature.mjs'), 'export const marker = "MCP AGENT DERIVED DELIVERY BODY";\n', 'utf8');
    await writeFile(path.join(rootDir, 'src', 'caller.mjs'), 'import { marker } from "./feature.mjs";\nvoid marker;\n', 'utf8');
    await writeFile(path.join(rootDir, 'tests', 'feature.test.mjs'), 'import test from "node:test";\ntest("feature", () => {});\n', 'utf8');
    await writeCodemapFixture(rootDir);

    const started = await handleMessage({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: {
        name: 'aios_plan_start',
        arguments: { workspace: rootDir, title: 'Agent intelligence path', objective: 'Use inferred context' },
      },
    });
    assert.ok(started.result.content[0].text.includes('t1-understand'));
    await initializeGitRepository(rootDir);

    const listed = await handleMessage({ jsonrpc: '2.0', id: 11, method: 'tools/list' });
    assert.ok(listed.result.tools.some((tool) => tool.name === 'aios_plan_task'));
    const proposed = await handleMessage({
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: {
        name: 'aios_plan_task',
        arguments: {
          workspace: rootDir,
          task_id: 't1-understand',
          action: 'propose_context',
          targets: ['src/feature.mjs'],
        },
      },
    });
    const proposalPayload = JSON.parse(proposed.result.content[0].text);
    assert.equal(proposalPayload.confirmationRequired, true);
    assert.ok(proposalPayload.proposal.candidates.some((candidate) => candidate.ref === 'tests/feature.test.mjs'));
    const beforeConfirmation = readActivePlan(rootDir).tasks.find((task) => task.id === 't1-understand');
    assert.deepEqual(beforeConfirmation.targets, []);
    assert.deepEqual(beforeConfirmation.contextRequirements, []);

    const confirmation = spawnSync(process.execPath, [
      cliPath,
      'plan', 'task', 't1-understand',
      '--confirm-context-candidates',
      '--candidate-ref', 'src/feature.mjs',
      '--workspace', rootDir,
      '--json',
    ], {
      cwd: rootDir,
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(confirmation.status, 0, confirmation.stderr || confirmation.stdout);
    const afterConfirmation = readActivePlan(rootDir).tasks.find((task) => task.id === 't1-understand');
    assert.deepEqual(afterConfirmation.targets, ['src/feature.mjs']);
    assert.deepEqual(afterConfirmation.contextRequirements.map((item) => item.ref), ['src/feature.mjs']);

    const orchestrated = await handleMessage({
      jsonrpc: '2.0',
      id: 13,
      method: 'tools/call',
      params: {
        name: 'aios_orchestrate',
        arguments: { workspace: rootDir, task: 'Use inferred agent context', context_budget: 256 },
      },
    });
    const report = JSON.parse(orchestrated.result.content[0].text);
    assert.equal(report.contextLifecycle.status, 'observed');
    assert.equal(report.contextLifecycle.taskId, 't1-understand');
    assert.ok(report.contextLifecycle.assembly.deliveryUnits > 0);
    assert.equal(JSON.stringify(report).includes('MCP AGENT DERIVED DELIVERY BODY'), false);
  });
});


test('MCP returns structured confirmation argv instead of a shell-interpolated task command', async () => {
  await withRoot(async (rootDir) => {
    await mkdir(path.join(rootDir, 'src'), { recursive: true });
    await writeFile(path.join(rootDir, 'src', 'feature.mjs'), 'export const safe = true;\n', 'utf8');
    const taskId = 'review; touch SHOULD_NOT_BE_EXECUTED';
    startPlan({
      rootDir,
      title: 'Structured argv',
      tasks: [{ id: taskId, title: 'Review', status: 'pending', dependsOn: [] }],
    });

    const response = await handleMessage({
      jsonrpc: '2.0',
      id: 20,
      method: 'tools/call',
      params: {
        name: 'aios_plan_task',
        arguments: { workspace: rootDir, task_id: taskId, targets: ['src/feature.mjs'] },
      },
    });
    const payload = JSON.parse(response.result.content[0].text);

    assert.deepEqual(payload.confirmationCommand, {
      executable: 'aios',
      args: ['plan', 'task', taskId, '--confirm-context-candidates'],
    });
    assert.equal(response.result.content[0].text.includes(`aios plan task ${taskId}`), false);
  });
});

test('default MCP orchestration chooses a later human-confirmed contextual task over an earlier empty task', async () => {
  await withRoot(async (rootDir) => {
    await mkdir(path.join(rootDir, 'src'), { recursive: true });
    await writeFile(path.join(rootDir, 'src', 'confirmed.mjs'), 'export const context = "LATER CONFIRMED CONTEXT";\n', 'utf8');
    startPlan({
      rootDir,
      title: 'MCP contextual default',
      tasks: [
        { id: 'first', title: 'Earlier empty task', status: 'pending', dependsOn: [] },
        { id: 'confirmed', title: 'Later confirmed task', status: 'pending', dependsOn: ['first'] },
      ],
    });
    const proposed = await handleMessage({
      jsonrpc: '2.0',
      id: 21,
      method: 'tools/call',
      params: {
        name: 'aios_plan_task',
        arguments: { workspace: rootDir, task_id: 'confirmed', targets: ['src/confirmed.mjs'] },
      },
    });
    assert.equal(JSON.parse(proposed.result.content[0].text).proposal.status, 'proposed');
    const confirmation = spawnSync(process.execPath, [
      cliPath,
      'plan', 'task', 'confirmed',
      '--confirm-context-candidates',
      '--candidate-ref', 'src/confirmed.mjs',
      '--workspace', rootDir,
      '--json',
    ], {
      cwd: rootDir,
      encoding: 'utf8',
      windowsHide: true,
    });
    assert.equal(confirmation.status, 0, confirmation.stderr || confirmation.stdout);
    await initializeGitRepository(rootDir);

    const orchestrated = await handleMessage({
      jsonrpc: '2.0',
      id: 22,
      method: 'tools/call',
      params: {
        name: 'aios_orchestrate',
        arguments: { workspace: rootDir, task: 'Prefer confirmed context', context_budget: 256 },
      },
    });
    const report = JSON.parse(orchestrated.result.content[0].text);

    assert.equal(report.contextLifecycle.taskId, 'confirmed');
    assert.ok(report.contextLifecycle.assembly.deliveryUnits > 0);
    assert.equal(JSON.stringify(report).includes('LATER CONFIRMED CONTEXT'), false);
  });
});
