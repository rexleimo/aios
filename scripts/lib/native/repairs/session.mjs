import path from 'node:path';
import { cp, copyFile, lstat, mkdir, readFile } from 'node:fs/promises';

import { buildNativeOutputPlan, loadNativeSyncManifest, resolveNativeClients } from '../source-tree.mjs';
import { MANIFEST_FILE, REPAIRS_ROOT_REL, REPAIR_KIND } from './constants.mjs';
import { normalizeRelativePath, toAbsolute } from './paths.mjs';
import { diffSnapshots, formatRepairId, snapshotTargets } from './snapshot.mjs';
import { readRepairManifest, writeRepairManifest } from './manifest.mjs';

function buildManagedTargetsForClients({ rootDir, clients }) {
  const manifest = loadNativeSyncManifest(rootDir);
  const selectedClients = resolveNativeClients('all')
    .filter((clientName) => clients.includes(clientName));
  const targets = new Set();

  for (const clientName of selectedClients) {
    const plan = buildNativeOutputPlan({ rootDir, manifest, client: clientName });
    for (const output of plan.outputs) {
      targets.add(normalizeRelativePath(output));
    }
    const metadataRelative = normalizeRelativePath(path.relative(rootDir, plan.metadataPath));
    targets.add(metadataRelative);
  }

  return [...targets].sort();
}

async function readTargetState(absPath) {
  try {
    const details = await lstat(absPath);
    if (details.isDirectory()) {
      return { exists: true, type: 'dir' };
    }
    return { exists: true, type: 'file' };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { exists: false, type: 'missing' };
    }
    throw error;
  }
}

async function copyToBackup(sourceAbsPath, backupAbsPath, type) {
  if (type === 'dir') {
    await cp(sourceAbsPath, backupAbsPath, { recursive: true, force: true, errorOnExist: false });
    return;
  }
  await mkdir(path.dirname(backupAbsPath), { recursive: true });
  await copyFile(sourceAbsPath, backupAbsPath);
}

function normalizeSelectedClients(clients) {
  return Array.isArray(clients)
    ? [...new Set(clients.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))]
    : [];
}

export async function createNativeRepairSession({
  rootDir,
  clients = [],
  reason = 'doctor-native-fix',
  dryRun = false,
} = {}) {
  if (!rootDir) {
    throw new Error('createNativeRepairSession requires rootDir');
  }

  const selectedClients = normalizeSelectedClients(clients);
  if (selectedClients.length === 0) {
    throw new Error('createNativeRepairSession requires at least one client');
  }

  const targets = buildManagedTargetsForClients({ rootDir, clients: selectedClients });
  const repairId = formatRepairId();
  const repairDirRel = path.join(REPAIRS_ROOT_REL, repairId).split(path.sep).join('/');
  const repairDirAbs = toAbsolute(rootDir, repairDirRel);
  const backupDirAbs = path.join(repairDirAbs, 'backup');
  const manifestRelPath = path.join(repairDirRel, MANIFEST_FILE).split(path.sep).join('/');
  const manifestAbsPath = toAbsolute(rootDir, manifestRelPath);
  const beforeSnapshot = await snapshotTargets(rootDir, targets);
  const targetsState = [];

  if (!dryRun) {
    await mkdir(backupDirAbs, { recursive: true });
  }

  for (const target of targets) {
    const absTargetPath = toAbsolute(rootDir, target);
    const state = await readTargetState(absTargetPath);
    targetsState.push({ path: target, existed: state.exists, type: state.type });
    if (!dryRun && state.exists) {
      await copyToBackup(absTargetPath, path.join(backupDirAbs, target), state.type);
    }
  }

  const manifest = {
    schemaVersion: 1,
    kind: REPAIR_KIND,
    repairId,
    createdAt: new Date().toISOString(),
    completedAt: '',
    status: 'running',
    reason: String(reason || 'doctor-native-fix'),
    dryRun: Boolean(dryRun),
    clients: selectedClients,
    targets: targetsState,
    summary: { totalChanged: 0, added: 0, updated: 0, removed: 0 },
    changedEntries: [],
    rollbackHistory: [],
  };

  await writeRepairManifest(manifestAbsPath, manifest);

  return {
    repairId,
    repairDirRel,
    manifestRelPath,
    manifestAbsPath,
    targets,
    beforeSnapshot,
    dryRun: Boolean(dryRun),
  };
}

export async function finalizeNativeRepairSession({
  rootDir,
  session,
  status = 'completed',
  errorMessage = '',
} = {}) {
  if (!rootDir) {
    throw new Error('finalizeNativeRepairSession requires rootDir');
  }
  if (!session || typeof session !== 'object') {
    throw new Error('finalizeNativeRepairSession requires session');
  }

  const afterSnapshot = await snapshotTargets(rootDir, session.targets || []);
  const { entries, summary } = diffSnapshots(session.beforeSnapshot || new Map(), afterSnapshot);
  const payload = await readRepairManifest(session.manifestAbsPath);
  payload.completedAt = new Date().toISOString();
  payload.status = String(status || 'completed');
  payload.errorMessage = String(errorMessage || '');
  payload.summary = summary;
  payload.changedEntries = entries;

  await writeRepairManifest(session.manifestAbsPath, payload);

  return {
    repairId: session.repairId,
    manifestRelPath: session.manifestRelPath,
    summary,
    changedEntries: entries,
  };
}
