import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SYNC_MANIFEST_PATH = path.join('config', 'skills-sync-manifest.json');

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeStringArray(values = []) {
  if (!Array.isArray(values)) {
    return [];
  }
  return [...new Set(values.map((value) => normalizeString(value)).filter(Boolean))];
}

export function resolveSkillsSyncManifestPath(rootDir) {
  return path.join(rootDir, SYNC_MANIFEST_PATH);
}

export function loadSkillsSyncManifest(rootDir) {
  const manifestPath = resolveSkillsSyncManifestPath(rootDir);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Skills sync manifest not found: ${manifestPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const generatedRoots = parsed.generatedRoots && typeof parsed.generatedRoots === 'object'
    ? Object.fromEntries(Object.entries(parsed.generatedRoots)
      .map(([surface, relPath]) => [normalizeString(surface), normalizeString(relPath)])
      .filter(([, relPath]) => relPath))
    : {};
  const skills = Array.isArray(parsed.skills) ? parsed.skills : [];
  const legacyUnmanaged = normalizeStringArray(parsed.legacyUnmanaged);
  const legacyReplaceable = normalizeStringArray(parsed.legacyReplaceable);

  return {
    schemaVersion: Number(parsed.schemaVersion) || 1,
    generatedRoots,
    skills: skills.map((entry) => ({
      relativeSkillPath: normalizeString(entry.relativeSkillPath),
      installCatalogName: entry.installCatalogName == null ? null : normalizeString(entry.installCatalogName),
      repoTargets: normalizeStringArray(entry.repoTargets),
      targetRelativePathBySurface: entry.targetRelativePathBySurface && typeof entry.targetRelativePathBySurface === 'object'
        ? Object.fromEntries(Object.entries(entry.targetRelativePathBySurface)
          .map(([surface, relPath]) => [normalizeString(surface), normalizeString(relPath)])
          .filter(([, relPath]) => relPath))
        : {},
      description: typeof entry.description === 'string' ? entry.description : '',
      clients: normalizeStringArray(entry.clients),
      scopes: normalizeStringArray(entry.scopes),
      defaultInstall: typeof entry.defaultInstall === 'object' && entry.defaultInstall
        ? entry.defaultInstall
        : { global: false, project: false },
      tags: normalizeStringArray(entry.tags),
    })).filter((entry) => entry.relativeSkillPath),
    legacyUnmanaged,
    legacyReplaceable,
  };
}

export function getCanonicalSkillDir(rootDir, relativeSkillPath) {
  return path.join(rootDir, 'skill-sources', relativeSkillPath);
}

export function listCanonicalSkills(rootDir, manifest = loadSkillsSyncManifest(rootDir)) {
  return manifest.skills.map((entry) => ({
    ...entry,
    sourcePath: getCanonicalSkillDir(rootDir, entry.relativeSkillPath),
  }));
}

function copyWithoutClients(sourceDir, targetDir) {
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    filter: (sourcePath) => {
      const relPath = path.relative(sourceDir, sourcePath);
      if (!relPath) {
        return true;
      }
      const [firstSegment] = relPath.split(path.sep);
      return firstSegment !== 'clients';
    },
  });
}

export function materializeSkillTree({ rootDir, relativeSkillPath, client } = {}) {
  const sourcePath = getCanonicalSkillDir(rootDir, relativeSkillPath);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Canonical skill source not found: ${sourcePath}`);
  }

  const materializedPath = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-skill-tree-'));
  copyWithoutClients(sourcePath, materializedPath);

  const overridePath = client
    ? path.join(sourcePath, 'clients', client)
    : '';
  if (overridePath && fs.existsSync(overridePath)) {
    fs.cpSync(overridePath, materializedPath, { recursive: true });
  }

  return {
    directoryPath: materializedPath,
    sourcePath,
    overridePath: overridePath && fs.existsSync(overridePath) ? overridePath : '',
    cleanup() {
      fs.rmSync(materializedPath, { recursive: true, force: true });
    },
  };
}

export function resolveGeneratedTargetRelativePath(entry, surface) {
  const normalizedSurface = normalizeString(surface);
  if (entry?.targetRelativePathBySurface?.[normalizedSurface]) {
    return entry.targetRelativePathBySurface[normalizedSurface];
  }
  return normalizeString(entry?.relativeSkillPath);
}

export function resolveGeneratedTargetPath({
  rootDir,
  entry,
  surface,
  manifest = null,
  targetRoot = '',
} = {}) {
  const resolvedManifest = manifest || loadSkillsSyncManifest(rootDir);
  const surfaceRoot = targetRoot || resolvedManifest.generatedRoots[normalizeString(surface)];
  if (!surfaceRoot) {
    throw new Error(`No generated target root configured for surface: ${surface}`);
  }
  return path.join(rootDir, surfaceRoot, resolveGeneratedTargetRelativePath(entry, surface));
}
