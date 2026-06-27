// scripts/lib/skills/sync/check.mjs — 技能同步检查模块
// 从 sync.mjs 拆分出的独立模块，专注 checkGeneratedSkillsSync 逻辑

import fs from 'node:fs';
import path from 'node:path';

import { getClientSkillFormat } from '../../clients/registry.mjs';
import {
  readGeneratedSkillMetadata,
} from '../install-metadata.mjs';
import {
  listCanonicalSkills,
  loadSkillsSyncManifest,
  materializeSkillTree,
  resolveGeneratedTargetPath,
  resolveGeneratedTargetRelativePath,
} from '../source-tree.mjs';
import {
  buildGeneratedSkillMetadata,
  GENERATED_SKILL_META_FILE,
  writeGeneratedSkillMetadata,
} from '../install-metadata.mjs';
import { snapshotDirectory, snapshotsEqual } from '../directory-snapshot.mjs';
import {
  convertSkillToTomlCommand,
} from '../emitters/toml-command.mjs';

import {
  collectManagedGeneratedTargets,
  collectTomlManagedPaths,
  formatTargetPath,
} from './targets.mjs';

function materializeWithMetadata({ rootDir, entry, surface }) {
  const materialized = materializeSkillTree({ rootDir, relativeSkillPath: entry.relativeSkillPath, client: surface });
  const targetRelativePath = resolveGeneratedTargetRelativePath(entry, surface);
  writeGeneratedSkillMetadata(materialized.directoryPath, buildGeneratedSkillMetadata({
    relativeSkillPath: entry.relativeSkillPath,
    targetSurface: surface,
    targetRelativePath,
    source: path.posix.join('skill-sources', entry.relativeSkillPath.split(path.sep).join('/')),
  }));
  return materialized;
}

export async function checkGeneratedSkillsSync({
  rootDir,
  targetRootDir = rootDir,
  io = console,
  manifest = null,
  surfaces = [],
} = {}) {
  const sourceRootDir = path.resolve(rootDir);
  const resolvedTargetRootDir = path.resolve(targetRootDir || rootDir);
  const resolvedManifest = manifest || loadSkillsSyncManifest(rootDir);
  const canonicalSkills = listCanonicalSkills(sourceRootDir, resolvedManifest);
  const selectedSurfaces = Array.isArray(surfaces) && surfaces.length > 0
    ? [...new Set(surfaces.map((surface) => String(surface || '').trim()).filter(Boolean))]
    : Object.keys(resolvedManifest.generatedRoots);
  const seenRoots = new Set();
  const dedupedSurfaces = [];
  for (const surface of selectedSurfaces) {
    const root = resolvedManifest.generatedRoots[surface];
    if (!root || seenRoots.has(root)) continue;
    seenRoots.add(root);
    dedupedSurfaces.push(surface);
  }
  const expectedBySurface = new Map(dedupedSurfaces.map((surface) => [surface, new Map()]));
  const issues = [];

  for (const entry of canonicalSkills) {
    for (const surface of entry.repoTargets) {
      if (!expectedBySurface.has(surface)) {
        continue;
      }
      const format = getClientSkillFormat(surface);
      const basePath = resolveGeneratedTargetPath({
        rootDir: resolvedTargetRootDir,
        entry,
        surface,
        manifest: resolvedManifest,
      });
      const targetPath = format === 'toml-command' ? `${basePath}.toml` : basePath;
      expectedBySurface.get(surface).set(targetPath, { entry, format });
    }
  }

  for (const surface of dedupedSurfaces) {
    const rootAbs = path.join(resolvedTargetRootDir, resolvedManifest.generatedRoots[surface]);
    const format = getClientSkillFormat(surface);
    const expected = expectedBySurface.get(surface) || new Map();

    for (const [targetPath, { entry, format: entryFormat }] of expected.entries()) {
      if (entryFormat === 'toml-command') {
        if (!fs.existsSync(targetPath)) {
          issues.push(`[missing] ${formatTargetPath(resolvedTargetRootDir, targetPath)}`);
          continue;
        }
        const materialized = materializeWithMetadata({ rootDir: sourceRootDir, entry, surface });
        try {
          const { toml } = convertSkillToTomlCommand(materialized.directoryPath, {
            relativeSkillPath: entry.relativeSkillPath,
            targetSurface: surface,
          });
          const currentContent = fs.readFileSync(targetPath, 'utf8');
          if (currentContent !== toml) {
            issues.push(`[drift] ${formatTargetPath(resolvedTargetRootDir, targetPath)}`);
          }
        } finally {
          materialized.cleanup();
        }
        continue;
      }

      const materialized = materializeWithMetadata({ rootDir: sourceRootDir, entry, surface });
      try {
        if (!fs.existsSync(targetPath)) {
          issues.push(`[missing] ${formatTargetPath(resolvedTargetRootDir, targetPath)}`);
          continue;
        }
        const currentSnapshot = snapshotDirectory(targetPath);
        const nextSnapshot = snapshotDirectory(materialized.directoryPath);
        if (!snapshotsEqual(currentSnapshot, nextSnapshot)) {
          issues.push(`[drift] ${formatTargetPath(resolvedTargetRootDir, targetPath)}`);
        }
      } finally {
        materialized.cleanup();
      }
    }

    if (format === 'toml-command') {
      for (const absPath of collectTomlManagedPaths(rootAbs)) {
        if (!expected.has(absPath)) {
          issues.push(`[stale] ${formatTargetPath(resolvedTargetRootDir, absPath)}`);
        }
      }
    } else {
      for (const managedTargetPath of collectManagedGeneratedTargets(rootAbs)) {
        if (!expected.has(managedTargetPath)) {
          issues.push(`[stale] ${formatTargetPath(resolvedTargetRootDir, managedTargetPath)}`);
        }
      }
    }
  }

  if (issues.length > 0) {
    for (const issue of issues) {
      io.log(issue);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}
