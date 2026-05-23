import path from 'node:path';

import { loadNativeSyncManifest, resolveNativeClients } from '../source-tree.mjs';
import { inspectClient } from './inspect-client.mjs';

export async function checkNativeEnhancementsSync({ rootDir, targetRootDir = rootDir, client = 'all' } = {}) {
  const manifest = loadNativeSyncManifest(rootDir);
  const resolvedTargetRootDir = path.resolve(targetRootDir || rootDir);
  const clients = resolveNativeClients(client);
  const reports = [];
  const issues = [];

  for (const currentClient of clients) {
    const report = await inspectClient({
      rootDir,
      targetRootDir: resolvedTargetRootDir,
      manifest,
      client: currentClient,
      selectedClients: clients,
    });
    reports.push(report);
    for (const issue of report.issues) {
      issues.push(`[${issue.client}] ${issue.message}`);
    }
  }

  return {
    ok: issues.length === 0,
    reports,
    issues,
  };
}