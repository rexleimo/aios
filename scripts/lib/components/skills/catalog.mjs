import fs from 'node:fs';
import path from 'node:path';

import { getClientProjectSkillRoot } from '../../clients/registry.mjs';
import {
  loadSkillsSyncManifest,
  resolveGeneratedTargetPath,
  resolveGeneratedTargetRelativePath,
} from '../../skills/source-tree.mjs';

import { normalizeSelectedSkills } from './normalizers.mjs';

export function toPosixPath(inputPath) {
  return String(inputPath || '').split(path.sep).join('/');
}

export function resolveCatalogSourcePath(rootDir, source) {
  return fs.realpathSync(path.resolve(rootDir, source));
}

export function resolveCatalogRelativeSkillPath(rootDir, sourcePath) {
  const canonicalRootPath = path.resolve(rootDir, 'skill-sources');
  const canonicalRoot = fs.existsSync(canonicalRootPath)
    ? fs.realpathSync(canonicalRootPath)
    : canonicalRootPath;
  const relative = path.relative(canonicalRoot, sourcePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return '';
  }
  return toPosixPath(relative);
}

export function resolveProjectSkillRoot(rootDir, client) {
  return path.join(rootDir, getClientProjectSkillRoot(client));
}

export function resolveTargetRoot({ rootDir, projectRoot, clientName, scope, homes }) {
  if (scope === 'project') {
    return resolveProjectSkillRoot(projectRoot || rootDir, clientName);
  }
  return path.join(homes[clientName], 'skills');
}

export function tryLoadSkillsSyncManifest(rootDir) {
  try {
    return loadSkillsSyncManifest(rootDir);
  } catch {
    return null;
  }
}

export function findSyncEntryForCatalogEntry(manifest, entry, relativeSkillPath) {
  if (!manifest) {
    return null;
  }
  return manifest.skills.find((candidate) => (
    candidate.installCatalogName === entry.name
    || (relativeSkillPath && candidate.relativeSkillPath === relativeSkillPath)
  )) || null;
}

export function resolveGeneratedSourceDetails({ rootDir, clientName, relativeSkillPath, manifestEntry, manifest }) {
  const repoRoot = resolveProjectSkillRoot(rootDir, clientName);
  if (!repoRoot) {
    return { generatedSourcePath: '', generatedRelativePath: '' };
  }
  if (manifestEntry && manifest) {
    return {
      generatedSourcePath: resolveGeneratedTargetPath({ rootDir, entry: manifestEntry, surface: clientName, manifest }),
      generatedRelativePath: resolveGeneratedTargetRelativePath(manifestEntry, clientName),
    };
  }
  const fallbackRelativePath = relativeSkillPath || '';
  return {
    generatedSourcePath: fallbackRelativePath ? path.join(repoRoot, fallbackRelativePath) : '',
    generatedRelativePath: fallbackRelativePath,
  };
}

function compareStableStrings(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareResolvedCatalogEntries(left, right) {
  return compareStableStrings(left.name, right.name)
    || compareStableStrings(left.sourcePath, right.sourcePath)
    || compareStableStrings(left.relativeSkillPath, right.relativeSkillPath);
}

function formatCatalogConflicts(conflicts) {
  return conflicts
    .map((conflict) => `${conflict.name} (${conflict.sources.join(', ')})`)
    .join('; ');
}

export function analyzeCatalogEntries({ rootDir, catalog, clientName, scope, selectedSkills, manifest }) {
  const selected = new Set(normalizeSelectedSkills(selectedSkills));
  const entries = catalog
    .filter((entry) => entry.clients.includes(clientName))
    .filter((entry) => entry.scopes.includes(scope))
    .filter((entry) => selected.size === 0 || selected.has(entry.name))
    .map((entry) => {
      const sourcePath = resolveCatalogSourcePath(rootDir, entry.source);
      const relativeSkillPath = resolveCatalogRelativeSkillPath(rootDir, sourcePath);
      const manifestEntry = findSyncEntryForCatalogEntry(manifest, entry, relativeSkillPath);
      const { generatedSourcePath, generatedRelativePath } = resolveGeneratedSourceDetails({
        rootDir,
        clientName,
        relativeSkillPath,
        manifestEntry,
        manifest,
      });
      const hasClientOverlay = relativeSkillPath
        ? fs.existsSync(path.join(rootDir, 'skill-sources', relativeSkillPath, 'clients', clientName))
        : false;
      const needsGeneratedLinkSource = Boolean(relativeSkillPath)
        && (hasClientOverlay || (generatedRelativePath && generatedRelativePath !== relativeSkillPath));
      return {
        ...entry,
        sourcePath,
        relativeSkillPath: relativeSkillPath || entry.name,
        sourceIsCanonical: Boolean(relativeSkillPath),
        manifestEntry,
        generatedSourcePath,
        generatedRelativePath,
        hasClientOverlay,
        needsGeneratedLinkSource,
        linkSourcePath: needsGeneratedLinkSource ? generatedSourcePath : sourcePath,
        legacyLinkSourcePath: generatedSourcePath,
      };
    })
    .sort(compareResolvedCatalogEntries);

  const entriesByName = new Map();
  for (const entry of entries) {
    const sources = entriesByName.get(entry.name) || new Map();
    if (!sources.has(entry.sourcePath)) {
      sources.set(entry.sourcePath, entry);
    }
    entriesByName.set(entry.name, sources);
  }

  const uniqueEntries = [];
  const conflicts = [];
  for (const [name, sources] of entriesByName) {
    const sourcePaths = [...sources.keys()].sort(compareStableStrings);
    uniqueEntries.push(...sourcePaths.map((sourcePath) => sources.get(sourcePath)));
    if (sourcePaths.length > 1) {
      conflicts.push(Object.freeze({
        client: clientName,
        scope,
        name,
        sources: Object.freeze(sourcePaths),
      }));
    }
  }

  return Object.freeze({
    entries: Object.freeze(uniqueEntries),
    conflicts: Object.freeze(conflicts),
  });
}

export function resolveCatalogEntries(options) {
  const analysis = analyzeCatalogEntries(options);
  if (analysis.conflicts.length > 0) {
    const { clientName, scope } = options;
    throw new Error(`Ambiguous skills for ${clientName} scope=${scope}: ${formatCatalogConflicts(analysis.conflicts)}`);
  }
  return analysis.entries;
}

export function loadSkillsCatalog(rootDir) {
  let manifest;
  try {
    manifest = loadSkillsSyncManifest(rootDir);
  } catch {
    throw new Error(`Skills sync manifest not found. Run: node scripts/sync-skills.mjs`);
  }

  return manifest.skills
    .filter((entry) => entry.installCatalogName !== null)
    .map((entry) => ({
      name: String(entry.installCatalogName || '').trim(),
      description: String(entry.description || '').trim(),
      source: path.posix.join('skill-sources', entry.relativeSkillPath),
      clients: Array.isArray(entry.clients)
        ? entry.clients.map((c) => String(c || '').trim().toLowerCase()).filter(Boolean)
        : [],
      scopes: Array.isArray(entry.scopes)
        ? entry.scopes.map((s) => String(s || '').trim().toLowerCase()).filter(Boolean)
        : [],
      defaultInstall: typeof entry.defaultInstall === 'object' && entry.defaultInstall
        ? entry.defaultInstall
        : { global: false, project: false },
      tags: Array.isArray(entry.tags)
        ? entry.tags.map((t) => String(t || '').trim()).filter(Boolean)
        : [],
    }))
    .filter((entry) => entry.name && entry.source);
}
