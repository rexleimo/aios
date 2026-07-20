import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { writeFileAtomic } from '../fs/atomic-write.mjs';
import { getAgentsHome, getClientHomes } from '../platform/paths.mjs';

const LEDGER_SCHEMA_VERSION = 1;
const OWNERSHIP_MARKER = 'aios';
const LEDGER_FILE_NAME = 'rex-workflow-projections.json';
const LEGACY_ROUTER_SKILL_NAME = 'aios-workflow-router';
const LEGACY_ROUTER_INSTALL_METADATA_FILE = '.aios-skill-install.json';
const LEGACY_ROUTER_SIGNATURE = Object.freeze([
  'name: aios-workflow-router',
  'Route tasks to appropriate superpowers workflows.',
  'superpowers:brainstorming',
  'superpowers:verification-before-completion',
]);
const LEGACY_ROUTER_INSTALL_METADATA_KEYS = Object.freeze([
  'catalogSource',
  'client',
  'generatedAt',
  'installMode',
  'kind',
  'managedBy',
  'relativeSkillPath',
  'schemaVersion',
  'scope',
  'skillName',
]);
const LEGACY_ROUTER_CLIENTS = new Set(['codex', 'claude', 'gemini', 'opencode', 'hermes', 'grok']);

function createReport({ status, removed = [], conflicts = [], retired = [] } = {}) {
  const report = {
    kind: 'aios.rex-workflow-surface-reconciliation.v1',
    status,
    removed,
    conflicts,
  };
  if (retired.length > 0) report.retired = retired;
  return report;
}

function createConflict(managedProjection, reason, status = 'legacy-workflow-conflict') {
  return createReport({
    status,
    conflicts: [{ path: managedProjection, reason }],
  });
}

function resolveAiosHome(env, homeDir) {
  return env.AIOS_HOME && path.isAbsolute(env.AIOS_HOME)
    ? env.AIOS_HOME
    : path.join(homeDir, '.aios');
}

function resolveLedgerPath(env, homeDir) {
  return path.join(resolveAiosHome(env, homeDir), 'workflow-surfaces', LEDGER_FILE_NAME);
}

function fingerprintProjection(entry) {
  return createHash('sha256').update(JSON.stringify({
    schemaVersion: LEDGER_SCHEMA_VERSION,
    projectionPath: entry.projectionPath,
    sourcePath: entry.sourcePath,
    entryType: entry.entryType,
    linkTarget: entry.linkTarget,
    createdAt: entry.createdAt,
    linkIdentity: entry.linkIdentity,
  })).digest('hex');
}

function isMissingPath(error) {
  return error?.code === 'ENOENT';
}

async function inspectLink(linkPath) {
  try {
    const stat = await fs.lstat(linkPath, { bigint: true });
    if (!stat.isSymbolicLink()) return { kind: 'not-link', stat };
    return {
      kind: 'link',
      stat,
      linkTarget: await fs.readlink(linkPath),
      linkIdentity: {
        device: String(stat.dev),
        inode: String(stat.ino),
        mode: String(stat.mode),
      },
    };
  } catch (error) {
    if (isMissingPath(error)) return { kind: 'absent' };
    return { kind: 'error', error };
  }
}

async function readLedger(ledgerPath) {
  try {
    const ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8'));
    if (ledger?.schemaVersion !== LEDGER_SCHEMA_VERSION || !Array.isArray(ledger.entries)) {
      return { kind: 'invalid' };
    }
    return { kind: 'valid', ledger };
  } catch (error) {
    if (isMissingPath(error)) return { kind: 'absent' };
    return { kind: 'error', error };
  }
}

function isValidTimestamp(value) {
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value));
}

function isLinkIdentity(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && ['device', 'inode', 'mode'].every((field) => /^(0|[1-9]\d*)$/.test(value[field]));
}

function sameLinkIdentity(first, second) {
  return isLinkIdentity(first)
    && isLinkIdentity(second)
    && first.device === second.device
    && first.inode === second.inode
    && first.mode === second.mode;
}

function entriesForProjection(ledger, managedProjection) {
  return ledger.entries.filter((entry) => entry?.projectionPath === managedProjection);
}

function selectOwnedEntry(ledger, { managedProjection, sourceSkills, linkIdentity }) {
  const entries = entriesForProjection(ledger, managedProjection);
  if (entries.length !== 1) return null;

  const [entry] = entries;
  if (
    entry.ownership !== OWNERSHIP_MARKER
    || entry.ownershipVersion !== LEDGER_SCHEMA_VERSION
    || entry.projectionPath !== managedProjection
    || entry.sourcePath !== sourceSkills
    || entry.entryType !== 'symlink'
    || entry.linkTarget !== sourceSkills
    || !isValidTimestamp(entry.createdAt)
    || !isLinkIdentity(entry.linkIdentity)
    || (linkIdentity !== undefined && !sameLinkIdentity(entry.linkIdentity, linkIdentity))
    || entry.fingerprint !== fingerprintProjection(entry)
  ) return null;

  return entry;
}

async function inspectSource(sourceSkills, { requireSkillFile = false } = {}) {
  try {
    if (!(await fs.stat(sourceSkills)).isDirectory()) return { kind: 'not-directory' };
    if (requireSkillFile) {
      try {
        if (!(await fs.stat(path.join(sourceSkills, 'SKILL.md'))).isFile()) {
          return { kind: 'not-skill-source' };
        }
      } catch (error) {
        if (isMissingPath(error)) return { kind: 'not-skill-source' };
        return { kind: 'error', error };
      }
    }
    return { kind: 'directory' };
  } catch (error) {
    if (isMissingPath(error)) return { kind: 'absent' };
    return { kind: 'error', error };
  }
}

function sameLink(first, second) {
  return first.kind === 'link'
    && second.kind === 'link'
    && first.linkTarget === second.linkTarget
    && sameLinkIdentity(first.linkIdentity, second.linkIdentity);
}

function createOwnedEntry({ managedProjection, sourceSkills, linkIdentity, createdAt = new Date().toISOString() }) {
  const entry = {
    projectionPath: managedProjection,
    sourcePath: sourceSkills,
    entryType: 'symlink',
    linkTarget: sourceSkills,
    ownership: OWNERSHIP_MARKER,
    ownershipVersion: LEDGER_SCHEMA_VERSION,
    createdAt,
    linkIdentity,
  };
  return { ...entry, fingerprint: fingerprintProjection(entry) };
}

async function writeLedger(ledgerPath, ledger) {
  await writeFileAtomic(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
}

async function removeLedgerEntry(ledgerPath, ledger, entry) {
  const nextLedger = {
    ...ledger,
    entries: ledger.entries.filter((candidate) => candidate !== entry),
  };
  await writeLedger(ledgerPath, nextLedger);
}

async function adoptLegacyProjection({
  ledgerPath,
  ledgerResult,
  managedProjection,
  sourceSkills,
  initialLink,
  dryRun = false,
  requireSkillFile = false,
}) {
  if (initialLink.linkTarget !== sourceSkills) {
    return createConflict(managedProjection, 'legacy-projection-target-is-not-managed-source');
  }
  if (ledgerResult.kind !== 'absent' && ledgerResult.kind !== 'valid') {
    return createConflict(managedProjection, 'ownership-ledger-inspection-failed', 'inspection-failed');
  }

  const ledger = ledgerResult.kind === 'valid'
    ? ledgerResult.ledger
    : { schemaVersion: LEDGER_SCHEMA_VERSION, entries: [] };
  if (entriesForProjection(ledger, managedProjection).length > 0) {
    return createConflict(managedProjection, 'ownership-ledger-does-not-match-projection');
  }

  const source = await inspectSource(sourceSkills, { requireSkillFile });
  if (source.kind === 'error') return createConflict(managedProjection, 'source-inspection-failed', 'inspection-failed');
  if (source.kind !== 'directory') return createConflict(managedProjection, 'ownership-ledger-source-is-unavailable');

  const finalLink = await inspectLink(managedProjection);
  if (!sameLink(initialLink, finalLink)) {
    return createConflict(managedProjection, 'projection-changed-before-adoption');
  }

  const entry = createOwnedEntry({
    managedProjection,
    sourceSkills,
    linkIdentity: initialLink.linkIdentity,
  });
  const nextLedger = { ...ledger, entries: [...ledger.entries, entry] };
  if (dryRun) {
    // Preview adoption without creating evidence that could authorize a later deletion.
    return { ledger: nextLedger, entry };
  }
  try {
    // Persist the operator-approved ownership record before any unlink can occur.
    await writeLedger(ledgerPath, nextLedger);
  } catch (error) {
    return createConflict(managedProjection, 'ownership-ledger-update-failed', 'inspection-failed');
  }

  return { ledger: nextLedger, entry };
}

async function recoverMissingProjection({
  ledgerPath,
  managedProjection,
  sourceSkills,
  dryRun = false,
  requireSkillFile = false,
}) {
  const ledgerResult = await readLedger(ledgerPath);
  if (ledgerResult.kind === 'absent') return createReport({ status: 'already-converged' });
  if (ledgerResult.kind === 'error') return createConflict(managedProjection, 'ownership-ledger-inspection-failed', 'inspection-failed');
  if (ledgerResult.kind !== 'valid') return createConflict(managedProjection, 'unproven-legacy-superpowers-projection');
  if (entriesForProjection(ledgerResult.ledger, managedProjection).length === 0) {
    return createReport({ status: 'already-converged' });
  }

  const entry = selectOwnedEntry(ledgerResult.ledger, { managedProjection, sourceSkills });
  if (!entry) return createConflict(managedProjection, 'ownership-ledger-does-not-match-missing-projection');

  if (dryRun) return createReport({ status: 'would-recover' });

  try {
    await removeLedgerEntry(ledgerPath, ledgerResult.ledger, entry);
  } catch (error) {
    return createConflict(managedProjection, 'ownership-ledger-update-failed', 'inspection-failed');
  }

  return createReport({ status: 'already-converged' });
}

async function reconcileLegacyProjection({
  ledgerPath,
  managedProjection,
  sourceSkills,
  dryRun,
  adoptLegacySuperpowers = false,
  requireSkillFile = false,
}) {
  const initialLink = await inspectLink(managedProjection);

  if (initialLink.kind === 'absent') {
    return recoverMissingProjection({
      ledgerPath,
      managedProjection,
      sourceSkills,
      dryRun,
    });
  }
  if (initialLink.kind === 'error') return createConflict(managedProjection, 'projection-inspection-failed', 'inspection-failed');
  if (initialLink.kind !== 'link') return createConflict(managedProjection, 'projection-is-not-a-symlink');

  let ledgerResult = await readLedger(ledgerPath);
  if (ledgerResult.kind === 'error') return createConflict(managedProjection, 'ownership-ledger-inspection-failed', 'inspection-failed');
  if (ledgerResult.kind === 'invalid') return createConflict(managedProjection, 'unproven-legacy-superpowers-projection');

  let entry = ledgerResult.kind === 'valid' ? selectOwnedEntry(ledgerResult.ledger, {
    managedProjection,
    sourceSkills,
    linkIdentity: initialLink.linkIdentity,
  }) : null;
  if (!entry) {
    if (!adoptLegacySuperpowers) {
      return createConflict(managedProjection, 'unproven-legacy-superpowers-projection');
    }
    const adoption = await adoptLegacyProjection({
      ledgerPath,
      ledgerResult,
      managedProjection,
      sourceSkills,
      initialLink,
      dryRun,
      requireSkillFile,
    });
    if ('kind' in adoption) return adoption;
    ledgerResult = { kind: 'valid', ledger: adoption.ledger };
    entry = adoption.entry;
  }
  if (!entry || initialLink.linkTarget !== entry.linkTarget) {
    return createConflict(managedProjection, 'ownership-ledger-does-not-match-projection');
  }

  const source = await inspectSource(sourceSkills, { requireSkillFile });
  if (source.kind === 'error') return createConflict(managedProjection, 'source-inspection-failed', 'inspection-failed');
  if (source.kind !== 'directory') return createConflict(managedProjection, 'ownership-ledger-source-is-unavailable');

  const finalLink = await inspectLink(managedProjection);
  if (!sameLink(initialLink, finalLink)) {
    return createConflict(managedProjection, 'projection-changed-before-removal');
  }

  if (dryRun) return createReport({ status: 'would-remove', removed: [managedProjection] });

  try {
    await fs.unlink(managedProjection);
  } catch (error) {
    return createConflict(managedProjection, 'projection-unlink-failed', 'inspection-failed');
  }

  try {
    await removeLedgerEntry(ledgerPath, ledgerResult.ledger, entry);
  } catch (error) {
    return createReport({
      status: 'inspection-failed',
      removed: [managedProjection],
      conflicts: [{ path: managedProjection, reason: 'ownership-ledger-update-failed' }],
    });
  }

  return createReport({ status: 'removed', removed: [managedProjection] });
}

function isExactChildPath(parentPath, candidatePath, name) {
  return path.dirname(candidatePath) === parentPath && path.basename(candidatePath) === name;
}

function isClaudePluginSkillPath({ claudeHome, sourceSkills, name }) {
  const pluginRoot = path.join(
    claudeHome,
    'plugins',
    'cache',
    'claude-plugins-official',
    'superpowers',
  );
  const relative = path.relative(pluginRoot, sourceSkills);
  const segments = relative.split(path.sep);
  return !relative.startsWith('..')
    && !path.isAbsolute(relative)
    && segments.length === 3
    && Boolean(segments[0])
    && segments[1] === 'skills'
    && segments[2] === name;
}

function resolveNativeLegacySkillSource({ client, codexHome, claudeHome, managedProjection, linkTarget }) {
  // Historical AIOS used absolute links. Requiring the exact historical shape
  // prevents a user-created relative or redirected link from being adopted.
  if (!path.isAbsolute(linkTarget) || linkTarget !== path.resolve(linkTarget)) return null;

  const name = path.basename(managedProjection);
  const codexSkillsRoot = path.join(codexHome, 'superpowers', 'skills');
  if (isExactChildPath(codexSkillsRoot, linkTarget, name)) return linkTarget;
  if (client === 'claude' && isClaudePluginSkillPath({ claudeHome, sourceSkills: linkTarget, name })) return linkTarget;
  return null;
}

function isUnrecognizedSuperpowersSkillLink({ managedProjection, linkTarget }) {
  const resolvedTarget = path.resolve(path.dirname(managedProjection), linkTarget);
  const pathSegments = resolvedTarget.split(path.sep);
  return path.basename(resolvedTarget) === path.basename(managedProjection)
    && path.basename(path.dirname(resolvedTarget)) === 'skills'
    && pathSegments.some((segment) => segment.toLowerCase().includes('superpowers'));
}

async function hasKnownLegacySkillSource({ client, codexHome, claudeHome, skillName }) {
  const repoSource = path.join(codexHome, 'superpowers', 'skills', skillName);
  if ((await inspectSource(repoSource, { requireSkillFile: true })).kind === 'directory') return true;
  if (client !== 'claude') return false;

  const pluginRoot = path.join(
    claudeHome,
    'plugins',
    'cache',
    'claude-plugins-official',
    'superpowers',
  );
  let versions;
  try {
    versions = await fs.readdir(pluginRoot, { withFileTypes: true });
  } catch (error) {
    if (isMissingPath(error)) return false;
    return false;
  }
  for (const version of versions) {
    if (!version.isDirectory()) continue;
    const pluginSource = path.join(pluginRoot, version.name, 'skills', skillName);
    if ((await inspectSource(pluginSource, { requireSkillFile: true })).kind === 'directory') return true;
  }
  return false;
}

async function discoverNativeLegacySkillProjections({ env, homeDir }) {
  const homes = getClientHomes(env, homeDir);
  const projections = [];
  const conflicts = [];
  for (const [client, clientHome] of Object.entries(homes)) {
    const skillRoot = path.join(clientHome, 'skills');
    let entries;
    try {
      entries = await fs.readdir(skillRoot, { withFileTypes: true });
    } catch (error) {
      if (isMissingPath(error)) continue;
      conflicts.push({ path: skillRoot, reason: 'native-skills-inspection-failed' });
      continue;
    }

    for (const entry of entries) {
      const managedProjection = path.join(skillRoot, entry.name);
      if (!entry.isSymbolicLink()) {
        if (entry.isDirectory() && await hasKnownLegacySkillSource({
          client,
          codexHome: homes.codex,
          claudeHome: homes.claude,
          skillName: entry.name,
        })) {
          conflicts.push({ path: managedProjection, reason: 'projection-is-not-a-symlink' });
        }
        continue;
      }
      const link = await inspectLink(managedProjection);
      if (link.kind === 'error') {
        conflicts.push({ path: managedProjection, reason: 'projection-inspection-failed' });
        continue;
      }
      if (link.kind !== 'link') continue;
      const sourceSkills = resolveNativeLegacySkillSource({
        client,
        codexHome: homes.codex,
        claudeHome: homes.claude,
        managedProjection,
        linkTarget: link.linkTarget,
      });
      if (!sourceSkills) {
        if (isUnrecognizedSuperpowersSkillLink({
          managedProjection,
          linkTarget: link.linkTarget,
        })) {
          conflicts.push({ path: managedProjection, reason: 'unrecognized-superpowers-skill-link' });
        }
        continue;
      }
      projections.push({ managedProjection, sourceSkills, requireSkillFile: true });
    }
  }

  return { projections, conflicts };
}

async function discoverSharedAgentLegacySkillProjections({ agentsHome, legacySourceRoot }) {
  const skillRoot = path.join(agentsHome, 'skills');
  let entries;
  try {
    entries = await fs.readdir(skillRoot, { withFileTypes: true });
  } catch (error) {
    if (isMissingPath(error)) return { projections: [], conflicts: [] };
    return {
      projections: [],
      conflicts: [{ path: skillRoot, reason: 'shared-agent-skills-inspection-failed' }],
    };
  }

  const projections = [];
  const conflicts = [];
  const sourceSkillsRoot = path.join(legacySourceRoot, 'skills');
  for (const entry of entries) {
    const managedProjection = path.join(skillRoot, entry.name);
    const sourceSkills = path.join(sourceSkillsRoot, entry.name);
    if (!entry.isSymbolicLink()) {
      if (
        entry.isDirectory()
        && (await inspectSource(sourceSkills, { requireSkillFile: true })).kind === 'directory'
      ) {
        conflicts.push({ path: managedProjection, reason: 'projection-is-not-a-symlink' });
      }
      continue;
    }
    const link = await inspectLink(managedProjection);
    if (link.kind === 'error') {
      conflicts.push({ path: managedProjection, reason: 'projection-inspection-failed' });
      continue;
    }
    if (link.kind === 'link') {
      if (
        path.isAbsolute(link.linkTarget)
        && link.linkTarget === path.resolve(link.linkTarget)
        && link.linkTarget === sourceSkills
      ) {
        projections.push({ managedProjection, sourceSkills, requireSkillFile: true });
      } else if (isUnrecognizedSuperpowersSkillLink({
        managedProjection,
        linkTarget: link.linkTarget,
      })) {
        conflicts.push({ path: managedProjection, reason: 'unrecognized-superpowers-skill-link' });
      }
    }
  }
  return { projections, conflicts };
}

function isExactLegacyRouterInstallMetadata(content) {
  try {
    const metadata = JSON.parse(content);
    const keys = Object.keys(metadata).sort();
    if (
      keys.length !== LEGACY_ROUTER_INSTALL_METADATA_KEYS.length
      || !keys.every((key, index) => key === LEGACY_ROUTER_INSTALL_METADATA_KEYS[index])
    ) return false;
    return metadata.schemaVersion === 1
      && metadata.managedBy === OWNERSHIP_MARKER
      && metadata.kind === 'installed-skill'
      && metadata.skillName === LEGACY_ROUTER_SKILL_NAME
      && metadata.relativeSkillPath === LEGACY_ROUTER_SKILL_NAME
      && LEGACY_ROUTER_CLIENTS.has(metadata.client)
      && metadata.scope === 'global'
      && metadata.installMode === 'copy'
      && metadata.catalogSource === `skill-sources/${LEGACY_ROUTER_SKILL_NAME}`
      && isValidTimestamp(metadata.generatedAt);
  } catch {
    return false;
  }
}

async function inspectHistoricalRouterDirectory(routerPath) {
  const entries = await fs.readdir(routerPath, { withFileTypes: true });
  const skill = entries.find((entry) => entry.name === 'SKILL.md');
  if (!skill?.isFile()) return { entries, content: '', recognized: false };

  const content = await fs.readFile(path.join(routerPath, 'SKILL.md'), 'utf8');
  if (entries.length === 1) return { entries, content, recognized: true };
  if (entries.length !== 2) return { entries, content, recognized: false };

  const metadata = entries.find((entry) => entry.name === LEGACY_ROUTER_INSTALL_METADATA_FILE);
  if (!metadata?.isFile()) return { entries, content, recognized: false };
  const metadataContent = await fs.readFile(path.join(routerPath, LEGACY_ROUTER_INSTALL_METADATA_FILE), 'utf8');
  return {
    entries,
    content,
    recognized: isExactLegacyRouterInstallMetadata(metadataContent),
  };
}

async function reconcileHistoricalSharedRouter({ agentsHome, dryRun }) {
  const routerPath = path.join(agentsHome, 'skills', LEGACY_ROUTER_SKILL_NAME);
  let initial;
  try {
    initial = await fs.lstat(routerPath, { bigint: true });
  } catch (error) {
    if (isMissingPath(error)) return createReport({ status: 'already-converged' });
    return createConflict(routerPath, 'legacy-router-inspection-failed', 'inspection-failed');
  }
  if (!initial.isDirectory()) {
    return createConflict(routerPath, 'legacy-router-is-not-a-directory');
  }

  let snapshot;
  try {
    snapshot = await inspectHistoricalRouterDirectory(routerPath);
  } catch (error) {
    return createConflict(routerPath, 'legacy-router-inspection-failed', 'inspection-failed');
  }
  const hasHistoricalSignature = LEGACY_ROUTER_SIGNATURE.every((fragment) => snapshot.content.includes(fragment));
  const hasSuperpowersReference = snapshot.content.includes('superpowers:');
  if (!hasHistoricalSignature) {
    if (hasSuperpowersReference) return createConflict(routerPath, 'unrecognized-superpowers-router');
    return createReport({ status: 'already-converged' });
  }
  if (!snapshot.recognized) {
    return createConflict(routerPath, 'legacy-router-contains-unrecognized-files');
  }

  let final;
  try {
    final = await fs.lstat(routerPath, { bigint: true });
  } catch (error) {
    return createConflict(routerPath, 'legacy-router-inspection-failed', 'inspection-failed');
  }
  if (!sameLinkIdentity({
    device: String(initial.dev),
    inode: String(initial.ino),
    mode: String(initial.mode),
  }, {
    device: String(final.dev),
    inode: String(final.ino),
    mode: String(final.mode),
  })) {
    return createConflict(routerPath, 'legacy-router-changed-before-removal');
  }
  try {
    const finalSnapshot = await inspectHistoricalRouterDirectory(routerPath);
    const finalSignature = LEGACY_ROUTER_SIGNATURE.every((fragment) => finalSnapshot.content.includes(fragment));
    if (!finalSnapshot.recognized || !finalSignature) {
      return createConflict(routerPath, 'legacy-router-changed-before-removal');
    }
  } catch (error) {
    return createConflict(routerPath, 'legacy-router-inspection-failed', 'inspection-failed');
  }
  if (dryRun) return createReport({ status: 'would-remove', removed: [routerPath] });

  try {
    await fs.rm(routerPath, { recursive: true, force: false });
  } catch (error) {
    return createConflict(routerPath, 'legacy-router-removal-failed', 'inspection-failed');
  }
  return createReport({ status: 'removed', removed: [routerPath] });
}

function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function discoverLegacySourceConsumers({ agentsHome, homes, sourceRoot, managedProjectionPaths = new Set() }) {
  const skillRoots = [...new Set([
    path.join(agentsHome, 'skills'),
    ...Object.values(homes).map((home) => path.join(home, 'skills')),
  ])];
  const conflicts = [];

  for (const skillRoot of skillRoots) {
    let entries;
    try {
      entries = await fs.readdir(skillRoot, { withFileTypes: true });
    } catch (error) {
      if (isMissingPath(error)) continue;
      conflicts.push({ path: skillRoot, reason: 'legacy-source-consumer-inspection-failed' });
      continue;
    }
    for (const entry of entries) {
      if (!entry.isSymbolicLink()) continue;
      const projectionPath = path.join(skillRoot, entry.name);
      if (managedProjectionPaths.has(projectionPath)) continue;
      try {
        const target = await fs.readlink(projectionPath);
        const resolvedTarget = path.resolve(skillRoot, target);
        if (isPathInside(sourceRoot, resolvedTarget)) {
          conflicts.push({ path: projectionPath, reason: 'legacy-source-has-unrecognized-consumer' });
        }
      } catch (error) {
        conflicts.push({ path: projectionPath, reason: 'legacy-source-consumer-inspection-failed' });
      }
    }
  }
  return conflicts;
}

async function retireHistoricalSuperpowersSource({ aiosHome, sourceRoot, dryRun }) {
  let initial;
  try {
    initial = await fs.lstat(sourceRoot, { bigint: true });
  } catch (error) {
    if (isMissingPath(error)) return createReport({ status: 'already-converged' });
    return createConflict(sourceRoot, 'legacy-source-inspection-failed', 'inspection-failed');
  }
  if (!initial.isDirectory() || initial.isSymbolicLink()) {
    return createConflict(sourceRoot, 'legacy-source-is-not-a-directory');
  }
  if ((await inspectSource(path.join(sourceRoot, 'skills'))).kind !== 'directory') {
    return createConflict(sourceRoot, 'legacy-source-does-not-contain-skills');
  }

  const recoveryRoot = path.join(aiosHome, 'workflow-surfaces', 'retired-superpowers');
  const recoveryPath = path.join(recoveryRoot, `superpowers-${new Date().toISOString().replace(/[:.]/gu, '-')}-${randomUUID()}`);
  if (dryRun) return createReport({ status: 'would-remove', retired: [recoveryPath] });

  let final;
  try {
    final = await fs.lstat(sourceRoot, { bigint: true });
  } catch (error) {
    return createConflict(sourceRoot, 'legacy-source-inspection-failed', 'inspection-failed');
  }
  if (!sameLinkIdentity({
    device: String(initial.dev),
    inode: String(initial.ino),
    mode: String(initial.mode),
  }, {
    device: String(final.dev),
    inode: String(final.ino),
    mode: String(final.mode),
  })) {
    return createConflict(sourceRoot, 'legacy-source-changed-before-retirement');
  }

  try {
    await fs.mkdir(recoveryRoot, { recursive: true });
    await fs.rename(sourceRoot, recoveryPath);
  } catch (error) {
    return createConflict(sourceRoot, 'legacy-source-retirement-failed', 'inspection-failed');
  }
  return createReport({ status: 'removed', retired: [recoveryPath] });
}

function combineReports(reports, discoveryConflicts = []) {
  const removed = reports.flatMap((report) => report.removed);
  const retired = reports.flatMap((report) => report.retired ?? []);
  const conflicts = [
    ...reports.flatMap((report) => report.conflicts),
    ...discoveryConflicts,
  ];
  if (
    reports.some((report) => report.status === 'inspection-failed')
    || discoveryConflicts.some((conflict) => conflict.reason.endsWith('inspection-failed'))
  ) {
    return createReport({ status: 'inspection-failed', removed, conflicts, retired });
  }
  if (conflicts.length > 0) return createReport({ status: 'legacy-workflow-conflict', removed, conflicts, retired });
  if (reports.some((report) => report.status === 'would-remove')) {
    return createReport({ status: 'would-remove', removed, conflicts, retired });
  }
  if (removed.length > 0 || retired.length > 0) return createReport({ status: 'removed', removed, conflicts, retired });
  return createReport({ status: 'already-converged', removed, conflicts, retired });
}

export async function reconcileRexWorkflowSurface({
  homeDir = os.homedir(),
  env = process.env,
  dryRun = false,
  adoptLegacySuperpowers = false,
} = {}) {
  const homes = getClientHomes(env, homeDir);
  const agentsHome = getAgentsHome(env, homeDir);
  const legacySourceRoot = path.join(homes.codex, 'superpowers');
  const ledgerPath = resolveLedgerPath(env, homeDir);
  const reports = [await reconcileLegacyProjection({
    ledgerPath,
    managedProjection: path.join(agentsHome, 'skills', 'superpowers'),
    sourceSkills: path.join(legacySourceRoot, 'skills'),
    dryRun,
    adoptLegacySuperpowers,
  })];
  const nativeDiscovery = await discoverNativeLegacySkillProjections({ env, homeDir });
  const sharedAgentDiscovery = await discoverSharedAgentLegacySkillProjections({
    agentsHome,
    legacySourceRoot,
  });

  for (const projection of [...nativeDiscovery.projections, ...sharedAgentDiscovery.projections]) {
    reports.push(await reconcileLegacyProjection({
      ledgerPath,
      ...projection,
      dryRun,
      adoptLegacySuperpowers,
    }));
  }

  reports.push(await reconcileHistoricalSharedRouter({ agentsHome, dryRun }));
  const discoveryConflicts = [...nativeDiscovery.conflicts, ...sharedAgentDiscovery.conflicts];
  const projectionReport = combineReports(reports, discoveryConflicts);
  if (projectionReport.conflicts.length > 0) return projectionReport;

  const consumerConflicts = await discoverLegacySourceConsumers({
    agentsHome,
    homes,
    sourceRoot: legacySourceRoot,
    // A dry run has not unlinked recognized projections yet, so exclude the
    // projections this same reconciliation has already proved removable.
    managedProjectionPaths: new Set(reports.flatMap((report) => report.removed)),
  });
  if (consumerConflicts.length > 0) return combineReports(reports, consumerConflicts);

  const sourceReport = await retireHistoricalSuperpowersSource({
    aiosHome: resolveAiosHome(env, homeDir),
    sourceRoot: legacySourceRoot,
    dryRun,
  });
  return combineReports([...reports, sourceReport], discoveryConflicts);
}
