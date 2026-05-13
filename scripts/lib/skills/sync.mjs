import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildGeneratedSkillMetadata,
  GENERATED_SKILL_META_FILE,
  isManagedGeneratedSkill,
  readGeneratedSkillMetadata,
  writeGeneratedSkillMetadata,
} from './install-metadata.mjs';
import {
  listCanonicalSkills,
  loadSkillsSyncManifest,
  materializeSkillTree,
  resolveGeneratedTargetPath,
  resolveGeneratedTargetRelativePath,
} from './source-tree.mjs';
import { withRepoLock } from '../fs/repo-lock.mjs';

const SYNC_LOCK_NAME = 'native-skills-sync';

function hashBuffer(buffer) {
  return crypto.createHash('sha1').update(buffer).digest('hex');
}

function snapshotDirectory(absDir, baseDir = absDir, output = new Map(), ignoreNames = new Set()) {
  if (!fs.existsSync(absDir)) {
    return output;
  }
  const entries = fs.readdirSync(absDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (ignoreNames.has(entry.name)) {
      continue;
    }
    const absPath = path.join(absDir, entry.name);
    const relPath = path.relative(baseDir, absPath) || '.';
    if (entry.isDirectory()) {
      output.set(relPath, { type: 'dir' });
      snapshotDirectory(absPath, baseDir, output, ignoreNames);
      continue;
    }
    const content = fs.readFileSync(absPath);
    output.set(relPath, { type: 'file', hash: hashBuffer(content) });
  }
  return output;
}

function snapshotsEqual(left, right) {
  if (left.size !== right.size) {
    return false;
  }
  for (const [relPath, value] of left.entries()) {
    const other = right.get(relPath);
    if (!other) {
      return false;
    }
    if (value.type !== other.type) {
      return false;
    }
    if (value.hash !== other.hash) {
      return false;
    }
  }
  return true;
}

function collectManagedGeneratedTargets(rootDir) {
  const results = [];
  function walk(absDir) {
    if (!fs.existsSync(absDir)) {
      return;
    }
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const absPath = path.join(absDir, entry.name);
      if (!entry.isDirectory()) {
        continue;
      }
      const metaPath = path.join(absPath, GENERATED_SKILL_META_FILE);
      if (fs.existsSync(metaPath)) {
        results.push(absPath);
      }
      walk(absPath);
    }
  }
  walk(rootDir);
  return results;
}

function ensureParentDir(targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
}

function writeMaterializedTarget({ materializedPath, targetPath, metadata }) {
  fs.rmSync(targetPath, { recursive: true, force: true });
  ensureParentDir(targetPath);
  fs.cpSync(materializedPath, targetPath, { recursive: true });
  writeGeneratedSkillMetadata(targetPath, metadata);
}

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

async function syncGeneratedSkillsUnlocked({ rootDir, io = console, manifest = null, surfaces = [] } = {}) {
  const resolvedManifest = manifest || loadSkillsSyncManifest(rootDir);
  const canonicalSkills = listCanonicalSkills(rootDir, resolvedManifest);
  const selectedSurfaces = Array.isArray(surfaces) && surfaces.length > 0
    ? [...new Set(surfaces.map((surface) => String(surface || '').trim()).filter(Boolean))]
    : Object.keys(resolvedManifest.generatedRoots);
  const supportedSurfaces = selectedSurfaces.filter((surface) => Boolean(resolvedManifest.generatedRoots[surface]));
  const skippedSurfaces = selectedSurfaces.filter((surface) => !resolvedManifest.generatedRoots[surface]);
  const expectedBySurface = new Map(selectedSurfaces.map((surface) => [surface, new Map()]));
  const results = [];
  const legacyUnmanaged = new Set(resolvedManifest.legacyUnmanaged.map((item) => path.resolve(rootDir, item)));
  const legacyReplaceable = new Set((resolvedManifest.legacyReplaceable || []).map((item) => path.resolve(rootDir, item)));

  for (const surface of skippedSurfaces) {
    io.log(`[skills] skip unsupported surface: ${surface}`);
  }

  for (const entry of canonicalSkills) {
    for (const surface of entry.repoTargets) {
      if (!expectedBySurface.has(surface) || !resolvedManifest.generatedRoots[surface]) {
        continue;
      }
      const targetPath = resolveGeneratedTargetPath({ rootDir, entry, surface, manifest: resolvedManifest });
      expectedBySurface.get(surface).set(targetPath, entry);
    }
  }

  for (const surface of supportedSurfaces) {
    const rootRel = resolvedManifest.generatedRoots[surface];
    const rootAbs = path.join(rootDir, rootRel);
    const expected = expectedBySurface.get(surface) || new Map();
    let installed = 0;
    let updated = 0;
    let reused = 0;
    let skipped = 0;
    let removed = 0;

    for (const [targetPath, entry] of expected.entries()) {
      const targetRelativePath = resolveGeneratedTargetRelativePath(entry, surface);
      const metadata = buildGeneratedSkillMetadata({
        relativeSkillPath: entry.relativeSkillPath,
        targetSurface: surface,
        targetRelativePath,
        source: path.posix.join('skill-sources', entry.relativeSkillPath.split(path.sep).join('/')),
      });
      const materialized = materializeWithMetadata({ rootDir, entry, surface });
      try {
        if (!fs.existsSync(targetPath)) {
          writeMaterializedTarget({ materializedPath: materialized.directoryPath, targetPath, metadata });
          installed += 1;
          continue;
        }

        if (!isManagedGeneratedSkill(targetPath, {
          relativeSkillPath: entry.relativeSkillPath,
          targetSurface: surface,
          targetRelativePath,
        })) {
          const currentSnapshot = snapshotDirectory(targetPath);
          const nextSnapshot = snapshotDirectory(materialized.directoryPath);
          if (snapshotsEqual(currentSnapshot, nextSnapshot)) {
            writeGeneratedSkillMetadata(targetPath, metadata);
            updated += 1;
            continue;
          }
          const currentSnapshotWithoutMeta = snapshotDirectory(targetPath, targetPath, new Map(), new Set([GENERATED_SKILL_META_FILE]));
          const nextSnapshotWithoutMeta = snapshotDirectory(
            materialized.directoryPath,
            materialized.directoryPath,
            new Map(),
            new Set([GENERATED_SKILL_META_FILE])
          );
          if (snapshotsEqual(currentSnapshotWithoutMeta, nextSnapshotWithoutMeta)) {
            writeGeneratedSkillMetadata(targetPath, metadata);
            updated += 1;
            continue;
          }
          if (legacyReplaceable.has(path.resolve(targetPath))) {
            writeMaterializedTarget({ materializedPath: materialized.directoryPath, targetPath, metadata });
            io.log(`[skills] replaced legacy target: ${path.relative(rootDir, targetPath)}`);
            updated += 1;
            continue;
          }
          if (!legacyUnmanaged.has(path.resolve(targetPath))) {
            io.log(`[skills] skip unmanaged blocker: ${path.relative(rootDir, targetPath)}`);
          }
          skipped += 1;
          continue;
        }

        const currentSnapshot = snapshotDirectory(targetPath);
        const nextSnapshot = snapshotDirectory(materialized.directoryPath);
        if (snapshotsEqual(currentSnapshot, nextSnapshot)) {
          reused += 1;
          continue;
        }

        writeMaterializedTarget({ materializedPath: materialized.directoryPath, targetPath, metadata });
        updated += 1;
      } finally {
        materialized.cleanup();
      }
    }

    for (const managedTargetPath of collectManagedGeneratedTargets(rootAbs)) {
      if (expected.has(managedTargetPath)) {
        continue;
      }
      const meta = readGeneratedSkillMetadata(managedTargetPath);
      if (!meta || meta.targetSurface !== surface) {
        continue;
      }
      fs.rmSync(managedTargetPath, { recursive: true, force: true });
      removed += 1;
    }

    results.push({
      surface,
      targetRoot: rootRel,
      installed,
      updated,
      reused,
      skipped,
      removed,
    });
  }

  return {
    ok: true,
    results,
  };
}

export async function syncGeneratedSkills({
  rootDir,
  io = console,
  manifest = null,
  surfaces = [],
  withLock = true,
  lockOptions = {},
} = {}) {
  if (!withLock) {
    return syncGeneratedSkillsUnlocked({ rootDir, io, manifest, surfaces });
  }
  return withRepoLock({ rootDir, lockName: SYNC_LOCK_NAME, io, ...lockOptions }, () => (
    syncGeneratedSkillsUnlocked({ rootDir, io, manifest, surfaces })
  ));
}

export async function checkGeneratedSkillsSync({ rootDir, io = console, manifest = null, surfaces = [] } = {}) {
  const resolvedManifest = manifest || loadSkillsSyncManifest(rootDir);
  const canonicalSkills = listCanonicalSkills(rootDir, resolvedManifest);
  const selectedSurfaces = Array.isArray(surfaces) && surfaces.length > 0
    ? [...new Set(surfaces.map((surface) => String(surface || '').trim()).filter(Boolean))]
    : Object.keys(resolvedManifest.generatedRoots);
  const supportedSurfaces = selectedSurfaces.filter((surface) => Boolean(resolvedManifest.generatedRoots[surface]));
  const skippedSurfaces = selectedSurfaces.filter((surface) => !resolvedManifest.generatedRoots[surface]);
  for (const surface of skippedSurfaces) {
    io.log(`[skills] skip unsupported surface: ${surface}`);
  }
  const expectedBySurface = new Map(supportedSurfaces.map((surface) => [surface, new Map()]));
  const issues = [];

  for (const entry of canonicalSkills) {
    for (const surface of entry.repoTargets) {
      if (!expectedBySurface.has(surface) || !resolvedManifest.generatedRoots[surface]) {
        continue;
      }
      const targetPath = resolveGeneratedTargetPath({ rootDir, entry, surface, manifest: resolvedManifest });
      expectedBySurface.get(surface).set(targetPath, entry);
    }
  }

  for (const surface of supportedSurfaces) {
    const rootAbs = path.join(rootDir, resolvedManifest.generatedRoots[surface]);
    const expected = expectedBySurface.get(surface) || new Map();

    for (const [targetPath, entry] of expected.entries()) {
      const materialized = materializeWithMetadata({ rootDir, entry, surface });
      try {
        if (!fs.existsSync(targetPath)) {
          issues.push(`[missing] ${path.relative(rootDir, targetPath)}`);
          continue;
        }
        const currentSnapshot = snapshotDirectory(targetPath);
        const nextSnapshot = snapshotDirectory(materialized.directoryPath);
        if (!snapshotsEqual(currentSnapshot, nextSnapshot)) {
          issues.push(`[drift] ${path.relative(rootDir, targetPath)}`);
        }
      } finally {
        materialized.cleanup();
      }
    }

    for (const managedTargetPath of collectManagedGeneratedTargets(rootAbs)) {
      if (!expected.has(managedTargetPath)) {
        issues.push(`[stale] ${path.relative(rootDir, managedTargetPath)}`);
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
