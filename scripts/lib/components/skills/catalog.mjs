import fs from 'node:fs';
import path from 'node:path';

import { getClientProjectSkillRoot } from '../../clients/registry.mjs';
import {
  loadSkillsSyncManifest,
  resolveGeneratedTargetPath,
  resolveGeneratedTargetRelativePath,
} from '../../skills/source-tree.mjs';

import { normalizeSelectedSkills } from './normalizers.mjs';

export function resolveCatalogPath(rootDir) {
  return path.join(rootDir, 'config', 'skills-catalog.json');
}

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

export function resolveCatalogEntries({ rootDir, catalog, clientName, scope, selectedSkills, manifest }) {
  const selected = new Set(normalizeSelectedSkills(selectedSkills));
  return catalog
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
    });
}

export function loadSkillsCatalog(rootDir) {
  const catalogPath = resolveCatalogPath(rootDir);
  if (!fs.existsSync(catalogPath)) {
    throw new Error(`Skills catalog not found: ${catalogPath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const skills = Array.isArray(parsed.skills) ? parsed.skills : [];
  return skills.map((entry) => ({
    ...entry,
    clients: Array.isArray(entry.clients) ? entry.clients.map((client) => String(client || '').trim().toLowerCase()).filter(Boolean) : [],
    scopes: Array.isArray(entry.scopes) ? entry.scopes.map((scope) => String(scope || '').trim().toLowerCase()).filter(Boolean) : [],
    source: String(entry.source || '').trim(),
    name: String(entry.name || '').trim(),
    description: String(entry.description || '').trim(),
    defaultInstall: typeof entry.defaultInstall === 'object' && entry.defaultInstall
      ? entry.defaultInstall
      : { global: false, project: false },
    tags: Array.isArray(entry.tags) ? entry.tags.map((tag) => String(tag || '').trim()).filter(Boolean) : [],
  })).filter((entry) => entry.name && entry.source);
}
