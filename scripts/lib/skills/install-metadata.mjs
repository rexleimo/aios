import fs from 'node:fs';
import path from 'node:path';

export const GENERATED_SKILL_META_FILE = '.aios-skill-sync.json';
export const INSTALLED_SKILL_META_FILE = '.aios-skill-install.json';

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

export function resolveGeneratedSkillMetadataPath(targetDir) {
  return path.join(targetDir, GENERATED_SKILL_META_FILE);
}

export function resolveInstalledSkillMetadataPath(targetDir) {
  return path.join(targetDir, INSTALLED_SKILL_META_FILE);
}

export function buildGeneratedSkillMetadata({
  relativeSkillPath,
  targetSurface,
  targetRelativePath,
  source,
} = {}) {
  return {
    schemaVersion: 1,
    managedBy: 'aios',
    kind: 'generated-skill',
    relativeSkillPath: String(relativeSkillPath || '').trim(),
    targetSurface: String(targetSurface || '').trim(),
    targetRelativePath: String(targetRelativePath || '').trim(),
    source: String(source || '').trim(),
  };
}

export function buildInstalledSkillMetadata({
  skillName,
  relativeSkillPath,
  client,
  scope,
  installMode,
  catalogSource,
  generatedAt = new Date().toISOString(),
} = {}) {
  return {
    schemaVersion: 1,
    managedBy: 'aios',
    kind: 'installed-skill',
    skillName: String(skillName || '').trim(),
    relativeSkillPath: String(relativeSkillPath || '').trim(),
    client: String(client || '').trim(),
    scope: String(scope || '').trim(),
    installMode: String(installMode || '').trim(),
    catalogSource: String(catalogSource || '').trim(),
    generatedAt,
  };
}

export function readGeneratedSkillMetadata(targetDir) {
  return readJsonIfExists(resolveGeneratedSkillMetadataPath(targetDir));
}

export function writeGeneratedSkillMetadata(targetDir, payload) {
  writeJson(resolveGeneratedSkillMetadataPath(targetDir), payload);
}

export function readInstalledSkillMetadata(targetDir) {
  return readJsonIfExists(resolveInstalledSkillMetadataPath(targetDir));
}

export function writeInstalledSkillMetadata(targetDir, payload) {
  writeJson(resolveInstalledSkillMetadataPath(targetDir), payload);
}

export function isManagedGeneratedSkill(targetDir, expected = {}) {
  const meta = readGeneratedSkillMetadata(targetDir);
  if (!meta || meta.managedBy !== 'aios' || meta.kind !== 'generated-skill') {
    return false;
  }
  if (expected.relativeSkillPath && meta.relativeSkillPath !== expected.relativeSkillPath) {
    return false;
  }
  if (expected.targetSurface && meta.targetSurface !== expected.targetSurface) {
    return false;
  }
  if (expected.targetRelativePath && meta.targetRelativePath !== expected.targetRelativePath) {
    return false;
  }
  return true;
}

// Older AIOS projections could be written under a different discovery root
// while retaining their original managed-source identity. They remain AIOS
// owned only when every source identity field still matches.
export function isLegacyManagedGeneratedSkillProjection(targetDir, expected = {}) {
  const meta = readGeneratedSkillMetadata(targetDir);
  if (!meta || meta.managedBy !== 'aios' || meta.kind !== 'generated-skill') {
    return false;
  }
  if (expected.relativeSkillPath && meta.relativeSkillPath !== expected.relativeSkillPath) {
    return false;
  }
  if (expected.targetRelativePath && meta.targetRelativePath !== expected.targetRelativePath) {
    return false;
  }
  if (expected.source && meta.source !== expected.source) {
    return false;
  }
  return Boolean(
    expected.targetSurface
    && meta.targetSurface
    && meta.targetSurface !== expected.targetSurface
  );
}

// A legacy projection can be retired only when its metadata still describes
// this exact target and canonical source; a stale surface alone is not enough.
export function isMisprojectedManagedGeneratedSkillProjection(targetDir, expected = {}) {
  const meta = readGeneratedSkillMetadata(targetDir);
  const targetSurface = String(expected.targetSurface || '').trim();
  const targetRelativePath = String(expected.targetRelativePath || '').trim();
  const relativeSkillPath = String(meta?.relativeSkillPath || '').trim();
  const normalizedSkillPath = relativeSkillPath.replaceAll('\\', '/');

  if (
    !targetSurface
    || !targetRelativePath
    || !relativeSkillPath
    || normalizedSkillPath === '.'
    || normalizedSkillPath === '..'
    || normalizedSkillPath.startsWith('../')
    || path.posix.isAbsolute(normalizedSkillPath)
    || path.posix.normalize(normalizedSkillPath) !== normalizedSkillPath
  ) {
    return false;
  }

  return isLegacyManagedGeneratedSkillProjection(targetDir, {
    relativeSkillPath,
    targetSurface,
    targetRelativePath,
    source: path.posix.join('skill-sources', normalizedSkillPath),
  });
}

export function isManagedInstalledSkill(targetDir, expected = {}) {
  const meta = readInstalledSkillMetadata(targetDir);
  if (!meta || meta.managedBy !== 'aios' || meta.kind !== 'installed-skill') {
    return false;
  }
  if (expected.skillName && meta.skillName !== expected.skillName) {
    return false;
  }
  if (expected.relativeSkillPath && meta.relativeSkillPath !== expected.relativeSkillPath) {
    return false;
  }
  if (expected.client && meta.client !== expected.client) {
    return false;
  }
  if (expected.scope && meta.scope !== expected.scope) {
    return false;
  }
  if (expected.catalogSource && meta.catalogSource !== expected.catalogSource) {
    return false;
  }
  return true;
}
