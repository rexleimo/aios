// Closed action-to-argv mapping; facts come from the inventory CLI, never a duplicate client list.
import { runCapabilityJson } from './capability.mjs';

const identifier = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,127}$/iu.test(value) && value !== '..';
export const loadManagement = options => runCapabilityJson(['skill', 'list', '--json'], options);

export function buildManagementArgv(body, inventory) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'expected an object' };
  const { resource, action } = body;
  const clients = Array.isArray(body.clients) ? [...new Set(body.clients)] : [];
  if (!clients.length || clients.some(id => !inventory.clients?.some(client => client.id === id))) return { error: 'choose known clients' };
  if (resource === 'skills') {
    if (!['install', 'sync', 'remove'].includes(action)) return { error: 'unknown skill action' };
    if (!identifier(body.name)) return { error: 'invalid skill name' };
    if (!['builtin', 'external'].includes(body.kind)) return { error: 'invalid source kind' };
    if (!['global', 'project'].includes(body.scope)) return { error: 'invalid scope' };
    if (body.source !== undefined && (typeof body.source !== 'string' || body.source.length > 2048 || body.source.startsWith('-'))) return { error: 'invalid source' };
    const argv = ['skill', action, body.name, '--client', clients.join(','), '--scope', body.scope, '--kind', body.kind, '--json'];
    if (body.source) argv.push('--source', body.source);
    if (body.dryRun === true) argv.push('--dry-run');
    if (body.expectedRevision) {
      if (typeof body.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/u.test(body.expectedRevision)) return { error: 'invalid preview revision' };
      argv.push('--expected-revision', body.expectedRevision);
    }
    return { argv, writes: body.dryRun !== true };
  }
  if (resource === 'integrations') {
    if (!['add', 'remove', 'doctor'].includes(action) || !identifier(body.name)) return { error: 'invalid integration action' };
    const argv = ['integration', action, body.name, '--client', clients.join(','), '--json'];
    if (body.dryRun === true && action !== 'doctor') argv.push('--dry-run');
    return { argv, writes: action !== 'doctor' && body.dryRun !== true };
  }
  if (resource === 'agents' && action === 'doctor') return { argv: ['agents', 'doctor', '--json'], writes: false };
  return { error: 'unknown management resource or action' };
}
