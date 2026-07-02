import path from 'node:path';

import { loadNativeSyncManifest, resolveNativeClients } from '../source-tree.mjs';
import { inspectClient } from './inspect-client.mjs';

export async function checkNativeEnhancementsSync({ rootDir, targetRootDir = rootDir, client = 'all' } = {}) {
  const manifest = loadNativeSyncManifest(rootDir);
  const resolvedTargetRootDir = path.resolve(targetRootDir || rootDir);
  const clients = resolveNativeClients(client);
  // Deduplicate clients that share the same metadataRoot.
  // Keep only the first client per metadataRoot to avoid false drift from metadata.client mismatches.
  const seenRoots = new Set();
  const dedupedClients = [];
  for (const c of clients) {
    const entry = manifest.clients[c];
    const root = entry && entry.metadataRoot;
    if (!root || seenRoots.has(root)) continue;
    seenRoots.add(root);
    dedupedClients.push(c);
  }
  const reports = [];
  const issues = [];

  for (const currentClient of dedupedClients) {
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