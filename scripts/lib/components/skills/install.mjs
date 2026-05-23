import fs from 'node:fs';
import path from 'node:path';

import { resolveClientSelection } from '../../clients/registry.mjs';

import { loadSkillsCatalog, resolveCatalogEntries, resolveTargetRoot, tryLoadSkillsSyncManifest } from './catalog.mjs';
import {
  buildExpectedInstallMetadata,
  ensureLinkSourceAvailable,
  installCopyTarget,
  installLinkTarget,
  isLegacyManagedLinkInstall,
  isManagedLinkInstall,
  matchesManagedInstall,
  materializeCatalogEntry,
} from './install-targets.mjs';
import { normalizeInstallMode, normalizeScope, resolveHomeMap } from './normalizers.mjs';
import { assertProjectScopeAllowed } from './safety.mjs';

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

  for (const clientName of resolveClientSelection(client)) {
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
