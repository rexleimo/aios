import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { isManagedInstalledSkill } from '../../../skills/install/install-metadata.mjs';
import { resolveProjectSkillRoot } from '../catalog.mjs';
import { SKILL_NAME_ALIASES } from '../normalizers.mjs';
import { isManagedLinkInstall, matchesManagedInstall } from './install-targets.mjs';

function ownedLegacyInstall({ rootDir, legacyPath, oldName, clientName, scope }) {
  const stat = fs.lstatSync(legacyPath);
  if (stat.isSymbolicLink()) {
    // Compare the link itself, including broken links after the source rename.
    // Never follow it into a user directory or modify its destination.
    const destination = path.resolve(path.dirname(legacyPath), fs.readlinkSync(legacyPath));
    const sources = [
      path.join(rootDir, 'skill-sources', oldName),
      path.join(resolveProjectSkillRoot(rootDir, clientName), oldName),
    ];
    return sources.some((source) => path.relative(source, destination) === '');
  }
  return stat.isDirectory() && isManagedInstalledSkill(legacyPath, {
    skillName: oldName,
    relativeSkillPath: oldName,
    client: clientName,
    scope,
    catalogSource: `skill-sources/${oldName}`,
  });
}

// Run only after installation, so a blocked new target never retires a working
// old install. Archive on the same volume and outside the skill discovery root.
export function archiveRenamedSkillInstalls({ rootDir, targetRoot, entry, clientName, scope, io }) {
  const oldNames = Object.entries(SKILL_NAME_ALIASES)
    .filter(([, canonicalName]) => canonicalName === entry.name)
    .map(([oldName]) => oldName);
  if (oldNames.length === 0) return;
  const currentPath = path.join(targetRoot, entry.name);
  if (!matchesManagedInstall(currentPath, entry, clientName, scope)
    && !isManagedLinkInstall(currentPath, entry)) return;

  for (const oldName of oldNames) {
    const legacyPath = path.join(targetRoot, oldName);
    try {
      fs.lstatSync(legacyPath);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    let owned = false;
    try {
      owned = ownedLegacyInstall({ rootDir, legacyPath, oldName, clientName, scope });
    } catch {
      // Invalid ownership metadata cannot authorize a migration.
    }
    if (!owned) {
      io.log(`[skip] ${clientName} renamed skill is unmanaged; preserved: ${oldName}`);
      continue;
    }
    const archiveRoot = path.join(path.dirname(targetRoot), '.aios-retired-skills');
    fs.mkdirSync(archiveRoot, { recursive: true });
    const archivePath = path.join(archiveRoot, `${oldName}-${randomUUID()}`);
    fs.renameSync(legacyPath, archivePath);
    io.log(`[archive] ${clientName} renamed skill ${oldName} -> ${entry.name}; backup: ${archivePath}`);
  }
}
