import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readSkillFrontmatter, stripAiosFrontmatter } from './frontmatter.mjs';

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

/**
 * Scan skill-sources/ directory and discover all skills from SKILL.md frontmatter.
 * This is the unified source of truth for skill metadata.
 */
export function scanSkillsSources(rootDir) {
  const skillsDir = path.join(rootDir, 'skill-sources');
  const results = [];

  function scan(dir, relativePrefix = '') {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // Skip hidden dirs (like .system) at top level — handled separately
      if (!relativePrefix && entry.name.startsWith('.')) continue;

      const skillMd = path.join(dir, entry.name, 'SKILL.md');
      const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;

      if (fs.existsSync(skillMd)) {
        const fm = readSkillFrontmatter(skillMd) || {};
        if (fm.name) {
          results.push({
            relativeSkillPath: relPath,
            installCatalogName: fm.installCatalogName === null ? null : normalizeString(fm.installCatalogName || fm.name),
            repoTargets: normalizeStringArray(fm.repoTargets),
            targetRelativePathBySurface: fm.targetRelativePathBySurface && typeof fm.targetRelativePathBySurface === 'object'
              ? Object.fromEntries(Object.entries(fm.targetRelativePathBySurface)
                .map(([surface, relPath]) => [normalizeString(surface), normalizeString(relPath)])
                .filter(([, relPath]) => relPath))
              : {},
            description: typeof fm.description === 'string' ? fm.description : '',
            clients: normalizeStringArray(fm.clients),
            scopes: normalizeStringArray(fm.scopes),
            defaultInstall: typeof fm.defaultInstall === 'object' && fm.defaultInstall
              ? fm.defaultInstall
              : { global: false, project: false },
            tags: normalizeStringArray(fm.tags),
          });
        }
      }
    }
  }

  scan(skillsDir);

  // Also scan .system/ for hidden system skills
  const systemDir = path.join(skillsDir, '.system');
  if (fs.existsSync(systemDir)) {
    for (const entry of fs.readdirSync(systemDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillMd = path.join(systemDir, entry.name, 'SKILL.md');
      if (fs.existsSync(skillMd)) {
        const fm = readSkillFrontmatter(skillMd) || {};
        if (fm.name) {
          results.push({
            relativeSkillPath: `.system/${entry.name}`,
            installCatalogName: fm.installCatalogName === null ? null : normalizeString(fm.installCatalogName || fm.name),
            repoTargets: normalizeStringArray(fm.repoTargets),
            targetRelativePathBySurface: fm.targetRelativePathBySurface && typeof fm.targetRelativePathBySurface === 'object'
              ? Object.fromEntries(Object.entries(fm.targetRelativePathBySurface)
                .map(([surface, relPath]) => [normalizeString(surface), normalizeString(relPath)])
                .filter(([, relPath]) => relPath))
              : {},
            description: typeof fm.description === 'string' ? fm.description : '',
            clients: normalizeStringArray(fm.clients),
            scopes: normalizeStringArray(fm.scopes),
            defaultInstall: typeof fm.defaultInstall === 'object' && fm.defaultInstall
              ? fm.defaultInstall
              : { global: false, project: false },
            tags: normalizeStringArray(fm.tags),
          });
        }
      }
    }
  }

  return results;
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
  const legacyUnmanaged = normalizeStringArray(parsed.legacyUnmanaged);
  const legacyReplaceable = normalizeStringArray(parsed.legacyReplaceable);

  // Use manifest skills array if present (backward compat), otherwise scan from sources
  const skills = Array.isArray(parsed.skills) && parsed.skills.length > 0
    ? parsed.skills.map((entry) => ({
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
    })).filter((entry) => entry.relativeSkillPath)
    : scanSkillsSources(rootDir);

  return {
    schemaVersion: Number(parsed.schemaVersion) || 1,
    generatedRoots,
    skills,
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

  // Strip AIOS-internal frontmatter fields from SKILL.md so client skill
  // engines only see the standard fields (name, description, etc.).
  // Done AFTER overlay application so a clients/<client>/SKILL.md overlay
  // cannot leak AIOS-only metadata into generated client output.
  const skillMdPath = path.join(materializedPath, 'SKILL.md');
  if (fs.existsSync(skillMdPath)) {
    const raw = fs.readFileSync(skillMdPath, 'utf8');
    const stripped = stripAiosFrontmatter(raw);
    if (stripped !== raw) {
      fs.writeFileSync(skillMdPath, stripped, 'utf8');
    }
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
