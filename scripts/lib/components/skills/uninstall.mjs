import fs from 'node:fs';
import path from 'node:path';

import { removeManagedDirectory, removeManagedLink } from '../../platform/fs.mjs';
import { resolveClientSelection } from '../../clients/registry.mjs';

import { loadSkillsCatalog, resolveCatalogEntries, resolveTargetRoot, tryLoadSkillsSyncManifest } from './catalog.mjs';
import { isLegacyManagedLinkInstall, matchesManagedInstall } from './install-targets.mjs';
import { normalizeScope, resolveHomeMap } from './normalizers.mjs';
import { assertProjectScopeAllowed } from './safety.mjs';

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

  for (const clientName of resolveClientSelection(client)) {
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
