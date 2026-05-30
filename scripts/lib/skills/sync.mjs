import fs from 'node:fs';
import path from 'node:path';

import { getClientSkillFormat } from '../clients/registry.mjs';
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
import { snapshotDirectory, snapshotsEqual } from './directory-snapshot.mjs';
import {
  convertSkillToTomlCommand,
  isManagedTomlCommand,
  parseManagedMarker,
  writeTomlCommandTarget,
} from './emitters/toml-command.mjs';
import { withRepoLock } from '../fs/repo-lock.mjs';

const SYNC_LOCK_NAME = 'native-skills-sync';

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

function formatTargetPath(targetRootDir, targetPath) {
  return (path.relative(targetRootDir, targetPath) || '.').replace(/\\/g, '/');
}

// Write a TOML command file for a single skill target. Returns counters increment object.
function syncTomlCommandTarget({
  sourceRootDir,
  resolvedTargetRootDir,
  entry,
  surface,
  targetPath,
  metadata,
  legacyReplaceable,
  legacyUnmanaged,
  io,
  counters,
}) {
  const result = { installed: 0 };
  const materialized = materializeWithMetadata({ rootDir: sourceRootDir, entry, surface });
  try {
    const { toml } = convertSkillToTomlCommand(materialized.directoryPath, {
      relativeSkillPath: entry.relativeSkillPath,
      targetSurface: surface,
    });

    const writeMeta = (tgtPath, meta) => {
      // Write companion metadata for stale detection
      const metaPath = tgtPath + '.meta.json';
      fs.mkdirSync(path.dirname(metaPath), { recursive: true });
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
    };

    if (!fs.existsSync(targetPath)) {
      writeTomlCommandTarget(targetPath, toml, metadata, writeMeta);
      result.installed = 1;
      return result;
    }

    if (!isManagedTomlCommand(targetPath)) {
      const resolved = path.resolve(targetPath);
      if (legacyReplaceable.has(resolved)) {
        writeTomlCommandTarget(targetPath, toml, metadata, writeMeta);
        io.log(`[skills] replaced legacy TOML target: ${formatTargetPath(resolvedTargetRootDir, targetPath)}`);
        counters.updated += 1;
        return result;
      }
      if (!legacyUnmanaged.has(resolved)) {
        io.log(`[skills] skip unmanaged TOML blocker: ${formatTargetPath(resolvedTargetRootDir, targetPath)}`);
      }
      counters.skipped += 1;
      return result;
    }

    const currentContent = fs.readFileSync(targetPath, 'utf8');
    if (currentContent === toml) {
      // Content identical — update companion metadata only
      writeMeta(targetPath, metadata);
      counters.reused += 1;
      return result;
    }

    writeTomlCommandTarget(targetPath, toml, metadata, writeMeta);
    counters.updated += 1;
    return result;
  } finally {
    materialized.cleanup();
  }
}

// Scan a directory for stale AIOS-managed TOML files and remove them.
// Returns the count of removed files.
function collectStaleTomlTargets(rootAbs, expected) {
  let removed = 0;
  if (!fs.existsSync(rootAbs)) return removed;
  for (const entry of fs.readdirSync(rootAbs, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.toml')) continue;
    const absPath = path.join(rootAbs, entry.name);
    if (expected.has(absPath)) continue;
    if (!isManagedTomlCommand(absPath)) continue;
    fs.rmSync(absPath, { force: true });
    // Also clean up companion metadata
    const metaPath = absPath + '.meta.json';
    if (fs.existsSync(metaPath)) fs.rmSync(metaPath, { force: true });
    removed += 1;
  }
  return removed;
}

// Collect absolute paths of AIOS-managed TOML files (for check mode, non-destructive).
function collectTomlManagedPaths(rootAbs) {
  const paths = [];
  if (!fs.existsSync(rootAbs)) return paths;
  for (const entry of fs.readdirSync(rootAbs, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.toml')) continue;
    const absPath = path.join(rootAbs, entry.name);
    if (isManagedTomlCommand(absPath)) paths.push(absPath);
  }
  return paths;
}

async function syncGeneratedSkillsUnlocked({
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
  const expectedBySurface = new Map(selectedSurfaces.map((surface) => [surface, new Map()]));
  const results = [];
  const legacyUnmanaged = new Set(resolvedManifest.legacyUnmanaged.map((item) => path.resolve(resolvedTargetRootDir, item)));
  const legacyReplaceable = new Set((resolvedManifest.legacyReplaceable || []).map((item) => path.resolve(resolvedTargetRootDir, item)));

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
      // TOML-command surfaces use <name>.toml files, not <name>/ directories.
      const targetPath = format === 'toml-command' ? `${basePath}.toml` : basePath;
      expectedBySurface.get(surface).set(targetPath, { entry, format });
    }
  }

  for (const surface of selectedSurfaces) {
    const rootRel = resolvedManifest.generatedRoots[surface];
    const rootAbs = path.join(resolvedTargetRootDir, rootRel);
    const format = getClientSkillFormat(surface);
    const expected = expectedBySurface.get(surface) || new Map();
    let installed = 0;
    let updated = 0;
    let reused = 0;
    let skipped = 0;
    let removed = 0;

    for (const [targetPath, { entry, format: entryFormat }] of expected.entries()) {
      const targetRelativePath = resolveGeneratedTargetRelativePath(entry, surface);
      const metadata = buildGeneratedSkillMetadata({
        relativeSkillPath: entry.relativeSkillPath,
        targetSurface: surface,
        targetRelativePath,
        source: path.posix.join('skill-sources', entry.relativeSkillPath.split(path.sep).join('/')),
      });

      // TOML-command path: convert SKILL.md → .toml file (for Gemini CLI)
      if (entryFormat === 'toml-command') {
        installed += syncTomlCommandTarget({
          sourceRootDir,
          resolvedTargetRootDir,
          entry,
          surface,
          targetPath,
          metadata,
          legacyReplaceable,
          legacyUnmanaged,
          io,
          counters: { updated, reused, skipped },
        }).installed;
        continue;
      }

      const materialized = materializeWithMetadata({ rootDir: sourceRootDir, entry, surface });
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
            io.log(`[skills] replaced legacy target: ${formatTargetPath(resolvedTargetRootDir, targetPath)}`);
            updated += 1;
            continue;
          }
          if (!legacyUnmanaged.has(path.resolve(targetPath))) {
            io.log(`[skills] skip unmanaged blocker: ${formatTargetPath(resolvedTargetRootDir, targetPath)}`);
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

    if (format === 'toml-command') {
      // Stale detection for TOML: scan *.toml files with managed marker.
      removed += collectStaleTomlTargets(rootAbs, expected);
    } else {
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
  targetRootDir = rootDir,
  io = console,
  manifest = null,
  surfaces = [],
  withLock = true,
  lockOptions = {},
} = {}) {
  if (!withLock) {
    return syncGeneratedSkillsUnlocked({ rootDir, targetRootDir, io, manifest, surfaces });
  }
  return withRepoLock({ rootDir, lockName: SYNC_LOCK_NAME, io, ...lockOptions }, () => (
    syncGeneratedSkillsUnlocked({ rootDir, targetRootDir, io, manifest, surfaces })
  ));
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
  const expectedBySurface = new Map(selectedSurfaces.map((surface) => [surface, new Map()]));
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

  for (const surface of selectedSurfaces) {
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
