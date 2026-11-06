// A single lifecycle for built-in materialized skills and registered external skills.
// Never replace unknown or modified content; every changed target retains a recoverable backup.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ALL_CLIENTS, CLIENT_DEFINITIONS } from '../../../../foundation/clients/registry.mjs';
import { resolveCatalogEntries, tryLoadSkillsSyncManifest } from '../catalog.mjs';
import { materializeCatalogEntry } from './install-targets.mjs';
import { resolveExternalSkillSource } from '../external/external-source.mjs';
import { buildInstalledSkillMetadata, writeInstalledSkillMetadata } from '../../../skills/install/install-metadata.mjs';
import { inspectSkill, listManagedSkills, safeSkillName, skillContext, skillDigest, targetFor } from './inventory.mjs';
export { listManagedSkills };

function validate(input) {
  if (!['install', 'sync', 'remove', 'diagnose'].includes(input.action)) throw new Error('unknown skill action');
  if (!['global', 'project'].includes(input.scope)) throw new Error('scope must be global or project');
  if (!Array.isArray(input.clients) || !input.clients.length || input.clients.some(id => !ALL_CLIENTS.includes(id))) throw new Error('choose known clients explicitly');
  if (input.name && !safeSkillName(input.name)) throw new Error('unsafe skill name');
  if (input.action !== 'install' && !input.name) throw new Error('skill name is required');
  if (input.kind && !['builtin', 'external'].includes(input.kind)) throw new Error('unknown skill kind');
}

function assertNoLinkAncestors(target) {
  let current = path.dirname(target);
  while (path.dirname(current) !== current) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`linked ancestor requires explicit source management: ${current}`);
    current = path.dirname(current);
  }
}

function sourceFor(input, context, client) {
  if (input.kind === 'builtin') {
    const entries = resolveCatalogEntries({ ...context, clientName: client, scope: input.scope,
      selectedSkills: [input.name], manifest: tryLoadSkillsSyncManifest(context.rootDir) });
    if (!entries.length) throw new Error('skill is not available for this client and scope');
    const entry = entries[0];
    const materialized = materializeCatalogEntry({ rootDir: context.rootDir, entry, clientName: client });
    return { directory: materialized.directoryPath, source: entry.source, name: entry.name, cleanup: materialized.cleanup };
  }
  const directory = path.join(context.registryRoot, input.name);
  const state = inspectSkill(directory);
  if (!['owned', 'unverified'].includes(state.ownership) || state.metadata?.client !== 'registry') throw new Error('external registry source is unavailable or modified');
  return { directory, name: input.name, source: state.metadata.catalogSource, cleanup() {} };
}

function replaceTarget(target, source, metadata, context) {
  assertNoLinkAncestors(target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(target), '.aios-stage-'));
  let backup = null;
  try {
    fs.cpSync(source, staging, { recursive: true, filter: file => !['.git', '.aios-skill-install.json', '.aios-skill-sync.json'].includes(path.basename(file)) });
    writeInstalledSkillMetadata(staging, metadata);
    if (fs.existsSync(target)) {
      backup = path.join(context.projectRoot, '.aios', 'skill-backups', randomUUID(), path.basename(target));
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.cpSync(target, backup, { recursive: true });
      fs.rmSync(target, { recursive: true });
    }
    fs.renameSync(staging, target);
    return backup;
  } catch (error) {
    if (backup && !fs.existsSync(target)) fs.cpSync(backup, target, { recursive: true });
    throw error;
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
}

export async function manageSkill(input, options = {}) {
  validate(input);
  const context = skillContext(options);
  if (input.action === 'diagnose') return listManagedSkills(options);
  const dryRun = input.dryRun === true;
  let resolved;
  try {
    if (input.action === 'install' && input.kind !== 'builtin' && input.source) {
      resolved = resolveExternalSkillSource(input.source, options);
      const selected = input.name ? resolved.skills.filter(skill => skill.name === input.name) : resolved.skills;
      if (selected.length !== 1) throw new Error('select one skill by name from this source');
      input = { ...input, name: selected[0].name, kind: 'external' };
      resolved.selected = selected[0];
      skillDigest(resolved.selected.dir); // Refuse symlinks before either preview or copying.
    }
    const prepared = [];
    try {
      for (const client of [...new Set(input.clients)]) {
        const target = targetFor(context, client, input.scope, input.name);
        assertNoLinkAncestors(target);
        const before = inspectSkill(target);
        let source;
        try {
          source = input.action === 'remove' ? null : resolved
            ? { directory: resolved.selected.dir, name: input.name, source: resolved.originalSource, cleanup() {} }
            : sourceFor(input, context, client);
          const fingerprint = source ? skillDigest(source.directory) : '';
          // Legacy copies can be safely changed only when byte-identical to their declared source.
          let ownership = before.ownership;
          if (ownership === 'unverified') {
            const expectedSource = source || sourceFor(input, context, client);
            try {
              if (before.metadata?.catalogSource === expectedSource.source && before.fingerprint === skillDigest(expectedSource.directory)) ownership = 'owned';
            } finally { if (!source) expectedSource.cleanup(); }
          }
          const allowed = ['absent', 'owned'].includes(ownership);
          const status = !allowed ? ownership : input.action === 'remove' ? (ownership === 'absent' ? 'absent' : 'removed') : before.fingerprint === fingerprint ? 'unchanged' : ownership === 'absent' ? 'installed' : 'updated';
          prepared.push({ client, scope: input.scope, name: input.name, target, before, source, fingerprint, status,
            reason: allowed ? '' : before.reason, allowed });
        } catch (error) {
          source?.cleanup();
          prepared.push({ client, scope: input.scope, name: input.name, target, before, status: 'error', reason: error.message, allowed: false });
        }
      }
      const revision = createHash('sha256').update(JSON.stringify(prepared.map(row => [row.target, row.before.fingerprint, row.before.ownership, row.fingerprint, row.status]))).digest('hex');
      if (!dryRun && input.expectedRevision && input.expectedRevision !== revision) return { ok: false, error: 'preview-stale', revision, results: [] };
      const results = [];
      const changed = new Map();
      // Canonical registry is changed only when at least one target accepts this install.
      if (!dryRun && resolved && prepared.some(row => row.allowed)) {
        const registryTarget = path.join(context.registryRoot, input.name);
        const existing = inspectSkill(registryTarget);
        if (!['absent', 'owned'].includes(existing.ownership)) return { ok: false, error: 'registry-conflict', results: [] };
        replaceTarget(registryTarget, resolved.selected.dir, { ...buildInstalledSkillMetadata({ skillName: input.name, client: 'registry', scope: 'external', catalogSource: resolved.originalSource, installMode: 'copy' }), contentFingerprint: skillDigest(resolved.selected.dir), sourceKind: 'external' }, context);
      }
      for (const row of prepared) {
        let backup = null;
        let status = row.status;
        let reason = row.reason;
        if (!dryRun && row.allowed && !['unchanged', 'absent'].includes(status) && !changed.has(row.target)) {
          try {
            const current = inspectSkill(row.target);
            if (current.fingerprint !== row.before.fingerprint || current.ownership !== row.before.ownership) throw new Error('target changed during operation');
            if (input.action === 'remove') {
              assertNoLinkAncestors(row.target);
              backup = path.join(context.projectRoot, '.aios', 'skill-backups', randomUUID(), input.name);
              fs.mkdirSync(path.dirname(backup), { recursive: true });
              fs.cpSync(row.target, backup, { recursive: true });
              fs.rmSync(row.target, { recursive: true });
            } else {
              const metadata = { ...buildInstalledSkillMetadata({ skillName: input.name, client: row.client, scope: input.scope, installMode: 'copy', catalogSource: row.source.source }), contentFingerprint: row.fingerprint, sourceVersion: row.fingerprint.slice(0, 12), sourceKind: input.kind || 'external' };
              backup = replaceTarget(row.target, row.source.directory, metadata, context);
            }
            changed.set(row.target, { status, backup });
          } catch (error) { status = 'error'; reason = error.message; }
        } else if (changed.has(row.target)) ({ status, backup } = changed.get(row.target));
        const affectedClients = ALL_CLIENTS.filter(client => targetFor(context, client, input.scope, input.name) === row.target);
        results.push({ client: row.client, scope: row.scope, name: row.name, target: row.target, status, reason, backup, affectedClients });
      }
      return { ok: results.every(row => ['installed', 'updated', 'removed', 'unchanged', 'absent'].includes(row.status)), schema: 'skill.action.v1', dryRun, revision, results };
    } finally { for (const row of prepared) row.source?.cleanup(); }
  } finally { if (resolved?.cleanupPath) fs.rmSync(resolved.cleanupPath, { recursive: true, force: true }); }
}
