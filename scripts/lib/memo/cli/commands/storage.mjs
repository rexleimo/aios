import { printMemoDoctorReport, printMemoStorageStatus } from '../rendering.mjs';
import { usageError } from '../shared.mjs';
import { getActiveMemoStorage, loadMemoStorageApi } from '../storage-api.mjs';

export async function handleMemoStorageCommand({ secondary, rest, workspaceRoot, io }) {
  const action = String(secondary || 'status').toLowerCase();
  const storageApi = await loadMemoStorageApi();

  if (action === 'status') {
    printMemoStorageStatus(io, await storageApi.getMemoStorageStatus(workspaceRoot));
    return true;
  }

  if (action === 'use') {
    const target = String(rest.join(' ') || '').trim().toLowerCase();
    if (!target) throw usageError('Usage: memo storage use <split|file>');
    const result = await storageApi.switchMemoStorage(workspaceRoot, { target });
    const status = await storageApi.getMemoStorageStatus(workspaceRoot);
    const migrated = result?.migrated && typeof result.migrated === 'object' ? result.migrated : {};
    const manifest = result?.manifest && typeof result.manifest === 'object' ? result.manifest : {};
    io.log(`Active memo storage: ${status?.active || target}`);
    io.log(`Migrated records: ${Number.isFinite(migrated.events) ? migrated.events : 0}`);
    io.log(`Migrated pinned files: ${Number.isFinite(migrated.pinned) ? migrated.pinned : 0}`);
    if (migrated.source) io.log(`Migration source: ${migrated.source}`);
    if (manifest.records !== undefined) io.log(`Rebuilt records: ${manifest.records}`);
    return true;
  }

  if (action === 'rebuild') {
    const storage = await getActiveMemoStorage(workspaceRoot, storageApi);
    const result = await storageApi.rebuildMemoStorage(workspaceRoot, { storage });
    io.log(`Full rebuild complete: ${storage}`);
    if (result?.records !== undefined) io.log(`Records: ${result.records}`);
    return true;
  }

  if (action === 'doctor') {
    const storage = await getActiveMemoStorage(workspaceRoot, storageApi);
    const report = await storageApi.runMemoStorageDoctor(workspaceRoot, { storage });
    printMemoDoctorReport(io, report);
    if (report?.ok === false) {
      process.exitCode = 1;
    }
    return true;
  }

  throw usageError(`Unknown memo storage action: ${secondary}`);
}
