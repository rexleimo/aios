import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  collectUnexpectedSkillRootFindings,
  copyDirRecursive,
  ensureParentDir,
  isLegacyManagedSkillLink,
  isManagedLink,
  removeManagedDirectory,
  removeManagedLink,
} from '../platform/fs.mjs';
import { getClientHomes } from '../platform/paths.mjs';
import {
  buildInstalledSkillMetadata,
  GENERATED_SKILL_META_FILE,
  INSTALLED_SKILL_META_FILE,
  isManagedInstalledSkill,
  writeInstalledSkillMetadata,
} from '../skills/install-metadata.mjs';
import {
  loadSkillsSyncManifest,
  materializeSkillTree,
  resolveGeneratedTargetPath,
  resolveGeneratedTargetRelativePath,
} from '../skills/source-tree.mjs';

const ALL_CLIENTS = ['codex', 'claude', 'gemini', 'opencode', 'kiro'];
const ALL_SCOPES = ['global', 'project'];
const INSTALL_MODES = ['copy', 'link'];

function enabledClients(client) {
  return client === 'all' ? ALL_CLIENTS : [client];
}

function normalizeScope(scope = 'global') {
  const value = String(scope || 'global').trim().toLowerCase();
  if (!ALL_SCOPES.includes(value)) {
    throw new Error(`Unsupported skills scope: ${value}`);
  }
  return value;
}

function normalizeInstallMode(installMode = 'copy') {
  const value = String(installMode || 'copy').trim().toLowerCase();
  if (!INSTALL_MODES.includes(value)) {
    throw new Error(`Unsupported install mode: ${value}`);
  }
  return value;
}

function normalizeSelectedSkills(selectedSkills = []) {
  if (Array.isArray(selectedSkills)) {
    return [...new Set(selectedSkills.map((item) => String(item || '').trim()).filter(Boolean))];
  }
  return [...new Set(String(selectedSkills || '').split(',').map((item) => item.trim()).filter(Boolean))];
}

function resolveHomeMap(homeMap = {}, env = process.env) {
  return { ...getClientHomes(env), ...homeMap };
}

function resolveCatalogPath(rootDir) {
  return path.join(rootDir, 'config', 'skills-catalog.json');
}

function normalizePathForCompare(inputPath) {
  let output = path.resolve(inputPath);
  try {
    output = fs.realpathSync(output);
  } catch {
    // Keep resolved path when the target does not exist yet.
  }
  return process.platform === 'win32' ? output.toLowerCase() : output;
}

function arePathsEqual(leftPath, rightPath) {
  return normalizePathForCompare(leftPath) === normalizePathForCompare(rightPath);
}

function hashFileBuffer(buffer) {
  return buffer.toString('base64');
}

function snapshotDirectory(absDir, baseDir = absDir, output = new Map(), ignoreNames = new Set()) {
  if (!fs.existsSync(absDir)) {
    return output;
  }
  const entries = fs.readdirSync(absDir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
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
    output.set(relPath, { type: 'file', hash: hashFileBuffer(fs.readFileSync(absPath)) });
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

function isSameOrChildPath(rootPath, targetPath) {
  const relative = path.relative(rootPath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isSourceRepoProjectRoot(rootDir, projectRoot = rootDir) {
  return arePathsEqual(rootDir, projectRoot || rootDir);
}

function assertProjectScopeAllowed(rootDir, projectRoot = rootDir, scope = 'global') {
  if (normalizeScope(scope) !== 'project') {
    return;
  }
  if (isSourceRepoProjectRoot(rootDir, projectRoot)) {
    throw new Error('[err] project installs into the source repo are owned by sync-skills; run: node scripts/sync-skills.mjs');
  }
}

function toPosixPath(inputPath) {
  return String(inputPath || '').split(path.sep).join('/');
}

function resolveCatalogSourcePath(rootDir, source) {
  return fs.realpathSync(path.resolve(rootDir, source));
}

function resolveCatalogRelativeSkillPath(rootDir, sourcePath) {
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

function resolveProjectSkillRoot(rootDir, client) {
  switch (client) {
    case 'codex':
      return path.join(rootDir, '.codex', 'skills');
    case 'claude':
      return path.join(rootDir, '.claude', 'skills');
    case 'gemini':
      return path.join(rootDir, '.gemini', 'skills');
    case 'opencode':
      return path.join(rootDir, '.opencode', 'skills');
    case 'kiro':
      return path.join(rootDir, '.kiro', 'skills');
    default:
      return '';
  }
}

function resolveTargetRoot({ rootDir, projectRoot, clientName, scope, homes }) {
  if (scope === 'project') {
    return resolveProjectSkillRoot(projectRoot || rootDir, clientName);
  }
  return path.join(homes[clientName], 'skills');
}

function tryLoadSkillsSyncManifest(rootDir) {
  try {
    return loadSkillsSyncManifest(rootDir);
  } catch {
    return null;
  }
}

function findSyncEntryForCatalogEntry(manifest, entry, relativeSkillPath) {
  if (!manifest) {
    return null;
  }
  return manifest.skills.find((candidate) => (
    candidate.installCatalogName === entry.name
    || (relativeSkillPath && candidate.relativeSkillPath === relativeSkillPath)
  )) || null;
}

function resolveGeneratedSourceDetails({ rootDir, clientName, relativeSkillPath, manifestEntry, manifest }) {
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

function resolveCatalogEntries({ rootDir, catalog, clientName, scope, selectedSkills, manifest }) {
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

function buildExpectedInstallMetadata({ entry, clientName, scope, installMode }) {
  return buildInstalledSkillMetadata({
    skillName: entry.name,
    relativeSkillPath: entry.relativeSkillPath,
    client: clientName,
    scope,
    installMode,
    catalogSource: entry.source,
  });
}

function matchesManagedInstall(targetPath, entry, clientName, scope) {
  return isManagedInstalledSkill(targetPath, {
    skillName: entry.name,
    relativeSkillPath: entry.relativeSkillPath,
    client: clientName,
    scope,
    catalogSource: entry.source,
  });
}

function isManagedLinkInstall(targetPath, entry) {
  return Boolean(entry.linkSourcePath && fs.existsSync(entry.linkSourcePath))
    && isManagedLink(targetPath, entry.linkSourcePath);
}

function isLegacyManagedLinkInstall(targetPath, entry) {
  if (!entry.legacyLinkSourcePath || !fs.existsSync(entry.legacyLinkSourcePath)) {
    return false;
  }
  if (entry.linkSourcePath && arePathsEqual(entry.linkSourcePath, entry.legacyLinkSourcePath)) {
    return false;
  }
  return isLegacyManagedSkillLink(targetPath, { sourcePath: entry.legacyLinkSourcePath });
}

function materializeCatalogEntry({ rootDir, entry, clientName }) {
  if (entry.sourceIsCanonical) {
    return materializeSkillTree({ rootDir, relativeSkillPath: entry.relativeSkillPath, client: clientName });
  }

  const materializedPath = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-skill-install-'));
  fs.cpSync(entry.sourcePath, materializedPath, {
    recursive: true,
    filter: (currentSource) => {
      const relPath = path.relative(entry.sourcePath, currentSource);
      if (!relPath) {
        return true;
      }
      const segments = relPath.split(path.sep);
      return !segments.includes(GENERATED_SKILL_META_FILE) && !segments.includes(INSTALLED_SKILL_META_FILE);
    },
  });
  return {
    directoryPath: materializedPath,
    cleanup() {
      fs.rmSync(materializedPath, { recursive: true, force: true });
    },
  };
}

function ensureLinkSourceAvailable(entry) {
  if (!entry.linkSourcePath) {
    throw new Error(`[err] link mode could not resolve a source path for ${entry.name}`);
  }
  if (fs.existsSync(entry.linkSourcePath)) {
    return;
  }
  if (entry.needsGeneratedLinkSource) {
    throw new Error(`[err] link mode requires repo-local generated skills for ${entry.name}; run: node scripts/sync-skills.mjs`);
  }
  throw new Error(`[err] link mode source missing for ${entry.name}: ${entry.linkSourcePath}`);
}

function installCopyTarget({ targetPath, materializedPath, metadata }) {
  copyDirRecursive(materializedPath, targetPath);
  writeInstalledSkillMetadata(targetPath, metadata);
}

function installLinkTarget({ targetPath, sourcePath }) {
  ensureParentDir(targetPath);
  fs.symlinkSync(sourcePath, targetPath, process.platform === 'win32' ? 'junction' : 'dir');
}

function collectOverrideWarnings({ rootDir, projectRoot, catalog, clientName, selectedSkills, homes, io, manifest }) {
  if (isSourceRepoProjectRoot(rootDir, projectRoot)) {
    return 0;
  }

  const globalRoot = resolveTargetRoot({ rootDir, projectRoot, clientName, scope: 'global', homes });
  const projectScopeRoot = resolveTargetRoot({ rootDir, projectRoot, clientName, scope: 'project', homes });
  const entries = resolveCatalogEntries({
    rootDir,
    catalog,
    clientName,
    scope: 'global',
    selectedSkills,
    manifest,
  }).filter((entry) => entry.scopes.includes('project'));

  let warnings = 0;
  for (const entry of entries) {
    const globalPath = path.join(globalRoot, entry.name);
    const projectPath = path.join(projectScopeRoot, entry.name);
    if (fs.existsSync(globalPath) && fs.existsSync(projectPath)) {
      io.log(`[warn] ${clientName}: ${entry.name} project install overrides global install`);
      warnings += 1;
    }
  }

  return warnings;
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

export async function installContextDbSkills({
  rootDir,
  projectRoot = rootDir,
  client = 'all',
  scope = 'global',
  installMode = 'copy',
  selectedSkills = [],
  force = false,
  homeMap = {},
  io = console,
} = {}) {
  const homes = resolveHomeMap(homeMap);
  const normalizedScope = normalizeScope(scope);
  const normalizedInstallMode = normalizeInstallMode(installMode);
  assertProjectScopeAllowed(rootDir, projectRoot, normalizedScope);

  const catalog = loadSkillsCatalog(rootDir);
  const manifest = tryLoadSkillsSyncManifest(rootDir);

  for (const clientName of enabledClients(client)) {
    const targetRoot = resolveTargetRoot({ rootDir, projectRoot, clientName, scope: normalizedScope, homes });
    const entries = resolveCatalogEntries({ rootDir, catalog, clientName, scope: normalizedScope, selectedSkills, manifest });
    if (entries.length === 0) {
      io.log(`[warn] ${clientName} no catalog skills matched scope=${normalizedScope}.`);
      continue;
    }

    let installed = 0;
    let reused = 0;
    let replaced = 0;
    let skipped = 0;

    for (const entry of entries) {
      const targetPath = path.join(targetRoot, entry.name);
      const expectedCopyMetadata = buildExpectedInstallMetadata({
        entry,
        clientName,
        scope: normalizedScope,
        installMode: normalizedInstallMode,
      });
      const managedCopy = matchesManagedInstall(targetPath, entry, clientName, normalizedScope);
      const managedLink = isManagedLinkInstall(targetPath, entry);
      const legacyLink = isLegacyManagedLinkInstall(targetPath, entry);
      const managedExisting = managedCopy || managedLink || legacyLink;

      if (normalizedInstallMode === 'link') {
        ensureLinkSourceAvailable(entry);
        if (!fs.existsSync(targetPath)) {
          installLinkTarget({ targetPath, sourcePath: entry.linkSourcePath });
          io.log(`[link] ${clientName} skill installed (${normalizedScope}): ${entry.name}`);
          installed += 1;
          continue;
        }
        if (managedLink) {
          io.log(`[ok] ${clientName} skill already linked (${normalizedScope}): ${entry.name}`);
          reused += 1;
          continue;
        }
        if (managedExisting && force) {
          fs.rmSync(targetPath, { recursive: true, force: true });
          installLinkTarget({ targetPath, sourcePath: entry.linkSourcePath });
          io.log(`[link] ${clientName} skill replaced (${normalizedScope}): ${entry.name}`);
          replaced += 1;
          continue;
        }
        if (managedExisting) {
          io.log(`[ok] ${clientName} skill already managed (${normalizedScope}): ${entry.name}`);
          reused += 1;
          continue;
        }
        io.log(`[skip] ${clientName} skill exists but is unmanaged: ${entry.name}`);
        skipped += 1;
        continue;
      }

      const materialized = materializeCatalogEntry({ rootDir, entry, clientName });
      try {
        if (!fs.existsSync(targetPath)) {
          installCopyTarget({ targetPath, materializedPath: materialized.directoryPath, metadata: expectedCopyMetadata });
          io.log(`[copy] ${clientName} skill installed (${normalizedScope}): ${entry.name}`);
          installed += 1;
          continue;
        }
        if (managedCopy && !force) {
          io.log(`[ok] ${clientName} skill already installed (${normalizedScope}): ${entry.name}`);
          reused += 1;
          continue;
        }
        if (managedExisting && force) {
          fs.rmSync(targetPath, { recursive: true, force: true });
          installCopyTarget({ targetPath, materializedPath: materialized.directoryPath, metadata: expectedCopyMetadata });
          io.log(`[copy] ${clientName} skill replaced (${normalizedScope}): ${entry.name}`);
          replaced += 1;
          continue;
        }
        if (managedExisting) {
          io.log(`[ok] ${clientName} skill already managed (${normalizedScope}): ${entry.name}`);
          reused += 1;
          continue;
        }
        io.log(`[skip] ${clientName} skill exists but is unmanaged: ${entry.name}`);
        skipped += 1;
      } finally {
        materialized.cleanup();
      }
    }

    io.log(`[done] ${clientName} skills scope=${normalizedScope} mode=${normalizedInstallMode} -> installed=${installed} reused=${reused} replaced=${replaced} skipped=${skipped}`);
  }
}

export async function uninstallContextDbSkills({
  rootDir,
  projectRoot = rootDir,
  client = 'all',
  scope = 'global',
  selectedSkills = [],
  homeMap = {},
  io = console,
} = {}) {
  const homes = resolveHomeMap(homeMap);
  const normalizedScope = normalizeScope(scope);
  assertProjectScopeAllowed(rootDir, projectRoot, normalizedScope);

  const catalog = loadSkillsCatalog(rootDir);
  const manifest = tryLoadSkillsSyncManifest(rootDir);

  for (const clientName of enabledClients(client)) {
    const targetRoot = resolveTargetRoot({ rootDir, projectRoot, clientName, scope: normalizedScope, homes });
    const entries = resolveCatalogEntries({ rootDir, catalog, clientName, scope: normalizedScope, selectedSkills, manifest });
    if (entries.length === 0) {
      io.log(`[warn] ${clientName} no catalog skills matched scope=${normalizedScope}.`);
      continue;
    }

    let removed = 0;
    let skipped = 0;

    for (const entry of entries) {
      const targetPath = path.join(targetRoot, entry.name);
      if (removeManagedDirectory(targetPath, (dir) => matchesManagedInstall(dir, entry, clientName, normalizedScope))) {
        io.log(`[remove] ${clientName} managed copy install removed (${normalizedScope}): ${entry.name}`);
        removed += 1;
        continue;
      }
      if (removeManagedLink(targetPath, entry.linkSourcePath)) {
        io.log(`[remove] ${clientName} managed link removed (${normalizedScope}): ${entry.name}`);
        removed += 1;
        continue;
      }
      if (isLegacyManagedLinkInstall(targetPath, entry)) {
        fs.rmSync(targetPath, { recursive: true, force: true });
        io.log(`[remove] ${clientName} legacy managed link removed (${normalizedScope}): ${entry.name}`);
        removed += 1;
        continue;
      }
      io.log(`[skip] ${clientName} skill not managed by this repo: ${entry.name}`);
      skipped += 1;
    }

    io.log(`[done] ${clientName} skills scope=${normalizedScope} -> removed=${removed} skipped=${skipped}`);
  }
}

export async function doctorContextDbSkills({
  rootDir,
  projectRoot = rootDir,
  client = 'all',
  scope = 'global',
  selectedSkills = [],
  homeMap = {},
  io = console,
} = {}) {
  const homes = resolveHomeMap(homeMap);
  const normalizedScope = normalizeScope(scope);
  if (normalizedScope === 'project') {
    assertProjectScopeAllowed(rootDir, projectRoot, normalizedScope);
  }

  const catalog = loadSkillsCatalog(rootDir);
  const manifest = tryLoadSkillsSyncManifest(rootDir);
  let warnings = 0;

  io.log('ContextDB Skills Doctor');
  io.log('-----------------------');
  io.log(`Scope: ${normalizedScope}`);

  const unexpectedRoots = collectUnexpectedSkillRootFindings(rootDir);
  for (const finding of unexpectedRoots) {
    io.log(`[warn] repo: non-discoverable skill root ${finding.root} contains SKILL.md files`);
    for (const file of finding.files) {
      io.log(`       move or convert: ${file}`);
    }
    io.log('       repo-local discoverable skills must live under .codex/skills, .claude/skills, or .kiro/skills');
    warnings += 1;
  }

  for (const clientName of enabledClients(client)) {
    const targetRoot = resolveTargetRoot({ rootDir, projectRoot, clientName, scope: normalizedScope, homes });
    const entries = resolveCatalogEntries({ rootDir, catalog, clientName, scope: normalizedScope, selectedSkills, manifest });
    io.log(`${clientName} target root: ${targetRoot}`);
    if (entries.length === 0) {
      io.log(`[warn] ${clientName} no catalog skills matched scope=${normalizedScope}.`);
      warnings += 1;
      continue;
    }

    let okCount = 0;
    let warnCount = 0;
    for (const entry of entries) {
      const targetPath = path.join(targetRoot, entry.name);
      if (matchesManagedInstall(targetPath, entry, clientName, normalizedScope)) {
        const materialized = materializeCatalogEntry({ rootDir, entry, clientName });
        try {
          const currentSnapshot = snapshotDirectory(targetPath, targetPath, new Map(), new Set([INSTALLED_SKILL_META_FILE]));
          const expectedSnapshot = snapshotDirectory(materialized.directoryPath, materialized.directoryPath, new Map());
          if (snapshotsEqual(currentSnapshot, expectedSnapshot)) {
            io.log(`[ok] ${clientName}: ${entry.name} managed copy install`);
            okCount += 1;
          } else {
            io.log(`[warn] ${clientName}: ${entry.name} managed copy install drifted from catalog source`);
            warnCount += 1;
            warnings += 1;
          }
        } finally {
          materialized.cleanup();
        }
        continue;
      }
      if (isManagedLinkInstall(targetPath, entry)) {
        io.log(`[ok] ${clientName}: ${entry.name} managed link install`);
        okCount += 1;
        continue;
      }
      if (isLegacyManagedLinkInstall(targetPath, entry)) {
        io.log(`[warn] ${clientName}: ${entry.name} legacy managed link install (run update --force to migrate to copy mode)`);
        warnCount += 1;
        warnings += 1;
        continue;
      }
      if (fs.existsSync(targetPath)) {
        io.log(`[warn] ${clientName}: ${entry.name} exists but is not managed by this repo`);
        warnCount += 1;
        warnings += 1;
        continue;
      }
      io.log(`[warn] ${clientName}: ${entry.name} not installed`);
      warnCount += 1;
      warnings += 1;
    }
    io.log(`[summary] ${clientName} ok=${okCount} warn=${warnCount}`);
    warnings += collectOverrideWarnings({ rootDir, projectRoot, catalog, clientName, selectedSkills, homes, io, manifest });
  }

  return { warnings, effectiveWarnings: warnings, errors: 0 };
}
