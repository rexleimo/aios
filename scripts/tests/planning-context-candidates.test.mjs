import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  readActivePlan,
  startPlan,
  updatePlanTask,
} from '../lib/planning/contract.mjs';
import {
  confirmTaskContextCandidates,
  proposeTaskContextCandidates,
  readTaskContextCandidate,
  resolveTaskContextCandidatePath,
} from '../lib/planning/context-candidates.mjs';

async function withRoot(name, work) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), name));
  try {
    await work(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

async function writeSourceTree(rootDir) {
  await mkdir(path.join(rootDir, 'src'), { recursive: true });
  await mkdir(path.join(rootDir, 'tests'), { recursive: true });
  await writeFile(path.join(rootDir, 'src', 'feature.mjs'), 'export function feature() { return helper(); }\n', 'utf8');
  await writeFile(path.join(rootDir, 'src', 'caller.mjs'), 'import { feature } from "./feature.mjs";\nfeature();\n', 'utf8');
  await writeFile(path.join(rootDir, 'src', 'helper.mjs'), 'export const helper = () => 1;\n', 'utf8');
  await writeFile(path.join(rootDir, 'tests', 'feature.test.mjs'), 'import test from "node:test";\ntest("feature", () => {});\n', 'utf8');
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
    insertNode.run('src/helper.mjs', absolute('src/helper.mjs'), 'File', 0);
    insertNode.run('src/helper.mjs::helper', absolute('src/helper.mjs'), 'Function', 0);
    insertNode.run('tests/feature.test.mjs', absolute('tests/feature.test.mjs'), 'Test', 1);
    insertEdge.run('CALLS', 'src/caller.mjs::run', 'src/feature.mjs::feature');
    insertEdge.run('CALLS', 'src/feature.mjs::feature', 'src/helper.mjs::helper');
    insertEdge.run('TESTED_BY', 'src/feature.mjs::feature', 'tests/feature.test.mjs');
    db.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)').run('last_updated', '2026-07-29T00:00:00Z');
  } finally {
    db.close();
  }
}

test('target and codemap inference writes a proposal without changing the active task', async () => {
  await withRoot('aios-context-candidate-proposal-', async (rootDir) => {
    await writeSourceTree(rootDir);
    await writeCodemapFixture(rootDir);
    startPlan({
      rootDir,
      title: 'Candidate proposal',
      tasks: [{ id: 'implement', title: 'Implement', status: 'pending', dependsOn: [] }],
    });

    const proposal = await proposeTaskContextCandidates({
      rootDir,
      taskId: 'implement',
      targets: ['src/feature.mjs'],
      proposedBy: 'mcp:aios_plan_task',
    });
    const activeBeforeConfirmation = readActivePlan(rootDir).tasks[0];

    assert.equal(proposal.status, 'proposed');
    assert.deepEqual(activeBeforeConfirmation.targets, []);
    assert.deepEqual(activeBeforeConfirmation.contextRequirements, []);
    assert.deepEqual(proposal.proposedTargets, ['src/feature.mjs']);
    assert.deepEqual(proposal.candidates.map((candidate) => candidate.ref), [
      'src/feature.mjs',
      'tests/feature.test.mjs',
      'src/caller.mjs',
      'src/helper.mjs',
    ]);
    assert.equal(proposal.candidates.some((candidate) => candidate.source === 'codemap'), true);
    assert.equal((await readTaskContextCandidate(rootDir, 'implement')).proposalId, proposal.proposalId);
  });
});

test('explicit human confirmation applies selected candidates and rejects a stale proposal', async () => {
  await withRoot('aios-context-candidate-confirm-', async (rootDir) => {
    await writeSourceTree(rootDir);
    await writeCodemapFixture(rootDir);
    startPlan({
      rootDir,
      title: 'Candidate confirmation',
      tasks: [{ id: 'implement', title: 'Implement', status: 'pending', dependsOn: [] }],
    });

    await proposeTaskContextCandidates({
      rootDir,
      taskId: 'implement',
      targets: ['src/feature.mjs'],
      proposedBy: 'mcp:aios_plan_task',
    });
    const confirmed = await confirmTaskContextCandidates({
      rootDir,
      taskId: 'implement',
      refs: ['src/feature.mjs', 'tests/feature.test.mjs'],
      confirmedBy: 'human-cli',
    });
    const active = readActivePlan(rootDir).tasks[0];

    assert.equal(confirmed.proposal.status, 'confirmed');
    assert.equal(confirmed.proposal.confirmation.confirmedBy, 'human-cli');
    assert.deepEqual(active.targets, ['src/feature.mjs']);
    assert.deepEqual(active.contextRequirements.map((item) => item.ref), [
      'src/feature.mjs',
      'tests/feature.test.mjs',
    ]);

    await proposeTaskContextCandidates({
      rootDir,
      taskId: 'implement',
      targets: ['src/feature.mjs'],
      proposedBy: 'mcp:aios_plan_task',
    });
    updatePlanTask(rootDir, 'implement', { targets: ['src/caller.mjs'] });
    await assert.rejects(
      confirmTaskContextCandidates({ rootDir, taskId: 'implement', confirmedBy: 'human-cli' }),
      /stale context candidate/i,
    );
  });
});


test('candidate limit reserves codemap relationships when direct targets fill the default capacity', async () => {
  await withRoot('aios-context-candidate-capacity-', async (rootDir) => {
    await writeSourceTree(rootDir);
    await writeCodemapFixture(rootDir);
    const targetRefs = ['src/feature.mjs'];
    for (let index = 2; index <= 12; index += 1) {
      const ref = `src/target-${index}.mjs`;
      targetRefs.push(ref);
      await writeFile(path.join(rootDir, ref), `export const target${index} = true;\n`, 'utf8');
    }
    const db = new DatabaseSync(path.join(rootDir, '.code-review-graph', 'graph.db'));
    try {
      const insertNode = db.prepare('INSERT INTO nodes (qualified_name, file_path, kind, is_test) VALUES (?, ?, ?, ?)');
      for (const ref of targetRefs.slice(1)) {
        insertNode.run(ref, path.join(rootDir, ref), 'File', 0);
      }
    } finally {
      db.close();
    }
    startPlan({
      rootDir,
      title: 'Candidate capacity',
      tasks: [{ id: 'implement', title: 'Implement', status: 'pending', dependsOn: [] }],
    });

    const proposal = await proposeTaskContextCandidates({
      rootDir,
      taskId: 'implement',
      targets: targetRefs,
      proposedBy: 'mcp:aios_plan_task',
    });

    assert.equal(proposal.candidates.length, 12);
    assert.equal(proposal.candidates.some((candidate) => candidate.ref === 'tests/feature.test.mjs'), true);
    assert.equal(proposal.candidates.some((candidate) => candidate.ref === 'src/caller.mjs'), true);
    assert.equal(proposal.candidates.some((candidate) => candidate.ref === 'src/helper.mjs'), true);
    assert.equal(proposal.candidates.some((candidate) => candidate.source === 'codemap'), true);
  });
});

test('codemap relation reserve is applied after high-volume relation candidates are collected', async () => {
  await withRoot('aios-context-candidate-relation-reserve-', async (rootDir) => {
    await writeSourceTree(rootDir);
    await writeCodemapFixture(rootDir);
    const db = new DatabaseSync(path.join(rootDir, '.code-review-graph', 'graph.db'));
    try {
      const insertNode = db.prepare('INSERT INTO nodes (qualified_name, file_path, kind, is_test) VALUES (?, ?, ?, ?)');
      const insertEdge = db.prepare('INSERT INTO edges (kind, source_qualified, target_qualified) VALUES (?, ?, ?)');
      for (let index = 1; index <= 90; index += 1) {
        const ref = `tests/feature-${index}.test.mjs`;
        await writeFile(path.join(rootDir, ref), `export const test${index} = true;\n`, 'utf8');
        insertNode.run(ref, path.join(rootDir, ref), 'Test', 1);
        insertEdge.run('TESTED_BY', 'src/feature.mjs::feature', ref);
      }
      const dependencyRef = 'src/dependency.mjs';
      await writeFile(path.join(rootDir, dependencyRef), 'export const dependency = true;\n', 'utf8');
      insertNode.run(dependencyRef, path.join(rootDir, dependencyRef), 'File', 0);
      insertEdge.run('IMPORTS_FROM', 'src/feature.mjs::feature', dependencyRef);
    } finally {
      db.close();
    }
    startPlan({
      rootDir,
      title: 'Relation reserve',
      tasks: [{ id: 'implement', title: 'Implement', status: 'pending', dependsOn: [] }],
    });

    const proposal = await proposeTaskContextCandidates({
      rootDir,
      taskId: 'implement',
      targets: ['src/feature.mjs'],
      proposedBy: 'mcp:aios_plan_task',
      maxCandidates: 12,
    });
    const codemapRelations = new Set(
      proposal.candidates.filter((candidate) => candidate.source === 'codemap').map((candidate) => candidate.relation),
    );
    assert.equal(proposal.candidates.length, 12);
    assert.deepEqual(
      ['tests_for', 'callers_of', 'callees_of', 'imports_from'].filter((relation) => codemapRelations.has(relation)),
      ['tests_for', 'callers_of', 'callees_of', 'imports_from'],
    );
  });
});


test('candidate confirmation serializes concurrent requests and recovers an interrupted final sidecar write', async () => {
  await withRoot('aios-context-candidate-recovery-', async (rootDir) => {
    await writeSourceTree(rootDir);
    await writeCodemapFixture(rootDir);
    startPlan({
      rootDir,
      title: 'Candidate recovery',
      tasks: [{ id: 'implement', title: 'Implement', status: 'pending', dependsOn: [] }],
    });
    await proposeTaskContextCandidates({
      rootDir,
      taskId: 'implement',
      targets: ['src/feature.mjs'],
      proposedBy: 'mcp:aios_plan_task',
    });

    const [first, second] = await Promise.all([
      confirmTaskContextCandidates({ rootDir, taskId: 'implement', confirmedBy: 'human-cli' }),
      confirmTaskContextCandidates({ rootDir, taskId: 'implement', confirmedBy: 'human-cli' }),
    ]);
    assert.equal(first.proposal.status, 'confirmed');
    assert.equal(second.proposal.status, 'confirmed');
    assert.equal(first.proposal.confirmation.confirmationId, second.proposal.confirmation.confirmationId);
    assert.equal(
      readActivePlan(rootDir).tasks[0].contextCandidateConfirmationId,
      first.proposal.confirmation.confirmationId,
    );

    const candidatePath = resolveTaskContextCandidatePath(rootDir, 'implement');
    const interrupted = JSON.parse(await readFile(candidatePath, 'utf8'));
    interrupted.status = 'confirming';
    delete interrupted.confirmation.confirmedAt;
    await writeFile(candidatePath, `${JSON.stringify(interrupted, null, 2)}\n`, 'utf8');

    const recovered = await confirmTaskContextCandidates({ rootDir, taskId: 'implement', confirmedBy: 'human-cli' });
    assert.equal(recovered.proposal.status, 'confirmed');
    assert.equal(recovered.proposal.confirmation.confirmationId, first.proposal.confirmation.confirmationId);
  });
});


test('a confirming proposal fails closed when the task changes before its plan write resumes', async () => {
  await withRoot('aios-context-candidate-confirming-stale-', async (rootDir) => {
    await writeSourceTree(rootDir);
    await writeCodemapFixture(rootDir);
    startPlan({
      rootDir,
      title: 'Confirming stale proposal',
      tasks: [{ id: 'implement', title: 'Implement', status: 'pending', dependsOn: [] }],
    });
    await proposeTaskContextCandidates({
      rootDir,
      taskId: 'implement',
      targets: ['src/feature.mjs'],
      proposedBy: 'mcp:aios_plan_task',
    });
    const candidatePath = resolveTaskContextCandidatePath(rootDir, 'implement');
    const interrupted = JSON.parse(await readFile(candidatePath, 'utf8'));
    interrupted.status = 'confirming';
    interrupted.confirmation = {
      confirmationId: 'context-confirmation:interrupted',
      requestedAt: '2026-07-29T00:00:00.000Z',
      confirmedBy: 'human-cli',
      selectedRefs: ['src/feature.mjs'],
    };
    await writeFile(candidatePath, `${JSON.stringify(interrupted, null, 2)}\n`, 'utf8');
    updatePlanTask(rootDir, 'implement', { targets: ['src/caller.mjs'] });

    await assert.rejects(
      confirmTaskContextCandidates({ rootDir, taskId: 'implement', confirmedBy: 'human-cli' }),
      /stale context candidate/i,
    );
  });
});


test('an unreadable candidate source leaves the proposal available for a corrected re-proposal', async () => {
  await withRoot('aios-context-candidate-missing-source-', async (rootDir) => {
    await writeSourceTree(rootDir);
    await writeCodemapFixture(rootDir);
    startPlan({
      rootDir,
      title: 'Missing candidate source',
      tasks: [{ id: 'implement', title: 'Implement', status: 'pending', dependsOn: [] }],
    });
    await proposeTaskContextCandidates({
      rootDir,
      taskId: 'implement',
      targets: ['src/feature.mjs'],
      proposedBy: 'mcp:aios_plan_task',
    });
    await rm(path.join(rootDir, 'src', 'feature.mjs'));

    await assert.rejects(
      confirmTaskContextCandidates({
        rootDir,
        taskId: 'implement',
        refs: ['src/feature.mjs'],
        confirmedBy: 'human-cli',
      }),
      /no longer readable/i,
    );
    assert.equal((await readTaskContextCandidate(rootDir, 'implement')).status, 'proposed');
  });
});
