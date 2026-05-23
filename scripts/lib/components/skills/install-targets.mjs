import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  copyDirRecursive,
  ensureParentDir,
  isLegacyManagedSkillLink,
  isManagedLink,
} from '../../platform/fs.mjs';
import {
  buildInstalledSkillMetadata,
  GENERATED_SKILL_META_FILE,
  INSTALLED_SKILL_META_FILE,
  isManagedInstalledSkill,
  writeInstalledSkillMetadata,
} from '../../skills/install-metadata.mjs';
import {
  hashFileBuffer,
  snapshotDirectory,
  snapshotsEqual,
} from '../../skills/directory-snapshot.mjs';
import { materializeSkillTree } from '../../skills/source-tree.mjs';

import { arePathsEqual } from './path-utils.mjs';

export { INSTALLED_SKILL_META_FILE };
export { hashFileBuffer, snapshotDirectory, snapshotsEqual };

export function buildExpectedInstallMetadata({ entry, clientName, scope, installMode }) {
  return buildInstalledSkillMetadata({
    skillName: entry.name,
    relativeSkillPath: entry.relativeSkillPath,
    client: clientName,
    scope,
    installMode,
    catalogSource: entry.source,
  });
}

export function matchesManagedInstall(targetPath, entry, clientName, scope) {
  return isManagedInstalledSkill(targetPath, {
    skillName: entry.name,
    relativeSkillPath: entry.relativeSkillPath,
    client: clientName,
    scope,
    catalogSource: entry.source,
  });
}

export function isManagedLinkInstall(targetPath, entry) {
  return Boolean(entry.linkSourcePath && fs.existsSync(entry.linkSourcePath))
    && isManagedLink(targetPath, entry.linkSourcePath);
}

export function isLegacyManagedLinkInstall(targetPath, entry) {
  if (!entry.legacyLinkSourcePath || !fs.existsSync(entry.legacyLinkSourcePath)) {
    return false;
  }
  if (entry.linkSourcePath && arePathsEqual(entry.linkSourcePath, entry.legacyLinkSourcePath)) {
    return false;
  }
  return isLegacyManagedSkillLink(targetPath, { sourcePath: entry.legacyLinkSourcePath });
}

export function materializeCatalogEntry({ rootDir, entry, clientName }) {
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

export function ensureLinkSourceAvailable(entry) {
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

export function installCopyTarget({ targetPath, materializedPath, metadata }) {
  copyDirRecursive(materializedPath, targetPath);
  writeInstalledSkillMetadata(targetPath, metadata);
}

export function installLinkTarget({ targetPath, sourcePath }) {
  ensureParentDir(targetPath);
  fs.symlinkSync(sourcePath, targetPath, process.platform === 'win32' ? 'junction' : 'dir');
}
