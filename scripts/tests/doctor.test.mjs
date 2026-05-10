import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runDoctorChecks } from '../lib/contextdb/doctor.mjs';

async function makeTmp() {
  return mkdtemp(path.join(os.tmpdir(), 'doctor-test-'));
}

async function initMeta(root, extra = {}) {
  const wsDir = path.join(root, 'memory', 'workspace');
  await mkdir(wsDir, { recursive: true });
  await writeFile(
    path.join(wsDir, 'meta.json'),
    JSON.stringify({ schemaVersion: 1, workspaceVersion: 1, ...extra })
  );
  return wsDir;
}

test('healthy for initialized workspace with valid meta', async () => {
  const tmp = await makeTmp();
  try {
    await initMeta(tmp);
    const report = await runDoctorChecks(tmp);
    assert.equal(report.status, 'healthy');
    assert(report.checks.every(c => c.status === 'pass'));
    assert(report.runAt);
  } finally {
    await rm(tmp, { recursive: true });
  }
});

test('warning when workspace not initialized (workspace-meta fails)', async () => {
  const tmp = await makeTmp();
  try {
    const report = await runDoctorChecks(tmp);
    assert.equal(report.status, 'warning');
    const meta = report.checks.find(c => c.id === 'workspace-meta');
    assert.equal(meta.status, 'warn');
  } finally {
    await rm(tmp, { recursive: true });
  }
});

test('detects skill index drift (1 skill file, 0 in index)', async () => {
  const tmp = await makeTmp();
  try {
    await initMeta(tmp);
    const skillsDir = path.join(tmp, 'memory', 'skills');
    await mkdir(skillsDir, { recursive: true });
    await writeFile(path.join(skillsDir, 'my-skill.json'), JSON.stringify({ name: 'my-skill' }));

    const report = await runDoctorChecks(tmp);
    assert.equal(report.status, 'warning');
    const drift = report.checks.find(c => c.id === 'skill-index-drift');
    assert.equal(drift.status, 'warn');
  } finally {
    await rm(tmp, { recursive: true });
  }
});

test('detects conflict markers (1 conflict file in conflicts dir)', async () => {
  const tmp = await makeTmp();
  try {
    const wsDir = await initMeta(tmp);
    const conflictsDir = path.join(wsDir, 'conflicts');
    await mkdir(conflictsDir, { recursive: true });
    await writeFile(path.join(conflictsDir, 'conflict-1.json'), JSON.stringify({ conflict: true }));

    const report = await runDoctorChecks(tmp);
    assert.equal(report.status, 'warning');
    const conflicts = report.checks.find(c => c.id === 'conflict-markers');
    assert.equal(conflicts.status, 'warn');
  } finally {
    await rm(tmp, { recursive: true });
  }
});
