// Skill inventory and content fingerprints. Client paths remain owned by the client registry.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ALL_CLIENTS, CLIENT_DEFINITIONS } from '../../../../foundation/clients/registry.mjs';
import { loadSkillsCatalog, resolveTargetRoot } from '../catalog.mjs';
import { resolveHomeMap } from '../normalizers.mjs';
import { resolveExternalSkillRegistry } from '../external/external-registry.mjs';
import { readInstalledSkillMetadata, INSTALLED_SKILL_META_FILE, GENERATED_SKILL_META_FILE } from '../../../skills/install/install-metadata.mjs';

export const safeSkillName = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,127}$/iu.test(value) && value !== '..';
const ignored = new Set([INSTALLED_SKILL_META_FILE, GENERATED_SKILL_META_FILE, '.git']);

export function skillDigest(directory) {
  const hash = createHash('sha256');
  function visit(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (ignored.has(entry.name)) continue;
      const relative = `${prefix}${entry.name}`;
      const absolute = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`symlink inside skill is not supported: ${relative}`);
      if (entry.isDirectory()) { hash.update(`dir:${relative}\0`); visit(absolute, `${relative}/`); }
      else if (entry.isFile()) { hash.update(`file:${relative}\0`); hash.update(fs.readFileSync(absolute)); hash.update('\0'); }
      else throw new Error(`unsupported skill entry: ${relative}`);
    }
  }
  visit(directory);
  return hash.digest('hex');
}

export function skillContext(options = {}) {
  const rootDir = path.resolve(options.rootDir || process.cwd());
  const projectRoot = path.resolve(options.projectRoot || rootDir);
  const registryRoot = options.registryRoot || resolveExternalSkillRegistry(options);
  const homes = resolveHomeMap(options.homeMap, options.env);
  const warnings = [];
  let catalog = [];
  try { catalog = loadSkillsCatalog(rootDir); } catch (error) { warnings.push({ kind: 'catalog-unavailable', reason: error.message }); }
  return { rootDir, projectRoot, registryRoot, homes, catalog, warnings };
}

export function targetFor(context, client, scope, name = '') {
  return path.join(resolveTargetRoot({ ...context, clientName: client, scope }), name);
}

export function inspectSkill(target) {
  try {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) return { ownership: 'linked', reason: 'shared or linked directory; manage its source explicitly', fingerprint: '' };
    if (!stat.isDirectory()) return { ownership: 'external', reason: 'target is not a directory', fingerprint: '' };
    const fingerprint = skillDigest(target);
    const metadata = readInstalledSkillMetadata(target);
    if (metadata?.managedBy !== 'aios' || metadata?.kind !== 'installed-skill' || metadata.skillName !== path.basename(target)) {
      return { ownership: 'external', reason: 'not an AIOS-owned installed skill', fingerprint, metadata };
    }
    const ownership = !metadata.contentFingerprint ? 'unverified' : metadata.contentFingerprint === fingerprint ? 'owned' : 'conflict';
    return { ownership, fingerprint, metadata, reason: ownership === 'unverified' ? 'legacy installation has no content fingerprint; verify against source before changing' : ownership === 'conflict' ? 'content changed after installation' : '' };
  } catch (error) {
    if (error.code === 'ENOENT') return { ownership: 'absent', fingerprint: '', reason: '' };
    return { ownership: 'error', fingerprint: '', reason: error.message };
  }
}

export function readSkillDirectories(root, warnings) {
  try { return fs.readdirSync(root, { withFileTypes: true }).filter(entry => (entry.isDirectory() || entry.isSymbolicLink()) && safeSkillName(entry.name)).map(entry => entry.name); }
  catch (error) { if (error.code !== 'ENOENT') warnings.push({ path: root, reason: error.message }); return []; }
}

export async function listManagedSkills(options = {}) {
  const context = skillContext(options);
  const clients = ALL_CLIENTS.map(id => ({ id, command: CLIENT_DEFINITIONS[id].commandName,
    capabilities: CLIENT_DEFINITIONS[id].capabilities,
    roots: { global: targetFor(context, id, 'global'), project: targetFor(context, id, 'project') } }));
  const available = context.catalog.map(entry => ({ name: entry.name, kind: 'builtin', source: entry.source,
    description: entry.description, clients: entry.clients, scopes: entry.scopes, version: null }));
  for (const name of readSkillDirectories(context.registryRoot, context.warnings)) {
    const location = path.join(context.registryRoot, name);
    const state = inspectSkill(location);
    available.push({ name, kind: 'external', source: state.metadata?.catalogSource || location,
      clients: [...ALL_CLIENTS], scopes: ['global', 'project'], version: state.metadata?.sourceVersion || null,
      ownership: state.ownership });
  }
  const skills = [];
  for (const client of clients) for (const scope of ['global', 'project']) {
    const root = client.roots[scope];
    for (const name of readSkillDirectories(root, context.warnings)) {
      const target = path.join(root, name);
      const state = inspectSkill(target);
      const kind = state.metadata?.sourceKind || (context.catalog.some(item => item.name === name) ? 'builtin' : 'external');
      skills.push({ name, client: client.id, scope, path: target, kind,
        ownership: state.ownership, reason: state.reason, fingerprint: state.fingerprint,
        source: state.metadata?.catalogSource || null, version: state.metadata?.sourceVersion || null,
        loaded: null, affectedClients: clients.filter(item => item.roots[scope] === root).map(item => item.id) });
    }
  }
  return { ok: true, schema: 'skill.inventory.v1', clients, available, skills, warnings: context.warnings };
}
