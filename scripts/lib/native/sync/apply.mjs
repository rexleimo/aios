import path from 'node:path';

import { buildNativeSyncMetadata } from '../install-metadata.mjs';
import { stringifyJsonObject } from '../emitters/shared.mjs';

import { backupTarget, rollbackTargets } from './fs-ops.mjs';
import { applyJsonMergeOperation, applyJsonTopLevelMergeOperation, applyManagedExactFileOperation, applyManagedFileOperation, applyMarkdownBlockOperation, removeOperation } from './operations.mjs';

// 纯函数：创建单个客户端/tier 的 native 同步统计桶。
export function resultBucket(client, tier) {
  return {
    client,
    tier,
    installed: 0,
    updated: 0,
    reused: 0,
    skipped: 0,
    removed: 0,
  };
}

export async function applyRenderedOperations({ rootDir, client, mode, rendered, plan, fsOps, repair }) {
  const backups = new Map();
  const result = resultBucket(client, plan.tier);
  try {
    for (const operation of rendered.operations) {
      const targetPath = path.join(rootDir, operation.targetPath);
      let status = 'reused';

      if (mode === 'uninstall') {
        status = await removeOperation(targetPath, operation.kind, fsOps, backups);
      } else if (operation.kind === 'markdown-block') {
        status = await applyMarkdownBlockOperation(targetPath, operation.content, fsOps, backups);
      } else if (operation.kind === 'managed-file') {
        status = await applyManagedFileOperation(targetPath, operation.content, fsOps, backups, repair);
      } else if (operation.kind === 'managed-exact-file') {
        status = await applyManagedExactFileOperation(targetPath, operation.content, fsOps, backups, repair);
      } else if (operation.kind === 'json-merge') {
        status = await applyJsonMergeOperation(targetPath, operation.content, fsOps, backups, repair);
      } else if (operation.kind === 'json-top-level-merge') {
        status = await applyJsonTopLevelMergeOperation(targetPath, operation.content, fsOps, backups, repair);
      } else {
        throw new Error(`unsupported native operation: ${operation.kind}`);
      }

      result[status] += 1;
    }

    if (mode === 'uninstall') {
      const metadataPath = plan.metadataPath;
      await backupTarget(metadataPath, fsOps, backups);
      await fsOps.removeTarget(metadataPath);
    } else {
      const metadataPath = plan.metadataPath;
      const metadataText = stringifyJsonObject(buildNativeSyncMetadata({
        client,
        tier: plan.tier,
        managedTargets: rendered.managedTargets,
      }));
      await backupTarget(metadataPath, fsOps, backups);
      await fsOps.writeTextTarget(metadataPath, metadataText);
    }
  } catch (error) {
    await rollbackTargets(backups, fsOps);
    throw error;
  }

  return result;
}
