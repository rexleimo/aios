import path from 'node:path';
import { saveRegistryDocument } from './registry.mjs';
import { normalizeId } from './shared.mjs';
import { addGroup, removeGroup, loadGroups, orderedGroupMembers, GROUP_ROUTING_MODES } from '../routing/groups.mjs';
import { assignmentReferences, parseTargetRef } from '../routing/targets.mjs';

function groupReferences(registry, id) {
  return assignmentReferences(registry).filter(({ value }) => {
    const target = parseTargetRef(value, { targetRefVersion: registry?.targetRefVersion });
    return target?.kind === 'group' && normalizeId(target.id) === id;
  }).map(({ path }) => path);
}

export const GROUP_COMMAND_HANDLERS = Object.freeze({
  async 'group-list'({ registry, io }) {
    const groups = loadGroups(registry);
    const keys = Object.keys(groups);
    if (!keys.length) { io.log('No routing groups.'); return { exitCode: 0 }; }
    for (const k of keys) io.log(`${k}\t${(groups[k].models || []).join(',')}\t${groups[k].routing}`);
    return { exitCode: 0 };
  },

  async 'group-add'({ rawOptions, registry, registrySnapshot, registryRoot, io }) {
    const id = normalizeId(rawOptions.groupId || rawOptions.id);
    const models = String(rawOptions.models || '').split(',').map(normalizeId).filter(Boolean);
    const routing = normalizeId(rawOptions.routing || 'ordered');
    if (!id) { io.error('Missing --id'); return { exitCode: 1 }; }
    if (!GROUP_ROUTING_MODES.has(routing)) {
      io.error(`Unsupported routing mode "${routing}"; expected one of ${[...GROUP_ROUTING_MODES].join(', ')}`);
      return { exitCode: 1 };
    }
    if (Object.hasOwn(loadGroups(registry), id)) throw new Error(`Routing group "${id}" already exists; refusing to overwrite it`);
    const next = addGroup(registry, id, { models, routing });
    orderedGroupMembers(next, id);
    const backupDir = path.join(path.dirname(registrySnapshot.file), '..', '..', '.aios', 'config-backups');
    await saveRegistryDocument(next, { backupDir, rootDir: registryRoot, expectedHash: registrySnapshot.hash });
    io.log(`Added group ${id}: ${models.join(', ')} (${routing})`);
    return { exitCode: 0 };
  },

  async 'group-rm'({ rawOptions, registry, registrySnapshot, registryRoot, io }) {
    const id = normalizeId(rawOptions.groupId || rawOptions.id);
    if (!id) { io.error('Missing --id'); return { exitCode: 1 }; }
    const references = groupReferences(registry, id);
    if (references.length) throw new Error(`Routing group "${id}" is in use by ${references.join(', ')}; reassign it before deleting`);
    const next = removeGroup(registry, id);
    const backupDir = path.join(path.dirname(registrySnapshot.file), '..', '..', '.aios', 'config-backups');
    await saveRegistryDocument(next, { backupDir, rootDir: registryRoot, expectedHash: registrySnapshot.hash });
    io.log(`Removed group ${id}`);
    return { exitCode: 0 };
  },
});
