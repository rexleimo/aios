import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { piModels } from './artifacts.mjs';

export const contentHash = (text) => createHash('sha256').update(text).digest('hex');
export function fileHash(file, fsImpl = fs) {
  try { return contentHash(fsImpl.readFileSync(file, 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}
export function isolatedArtifactPath(stateDir, client) {
  const relative = client === 'claude' ? 'claude-settings.json' : client === 'codex' ? 'codex-home/config.toml' : 'pi-home/.pi/agent/models.json';
  return path.join(stateDir, relative);
}
export const isolatedStale = (file) => Object.assign(new Error(`isolated config changed outside connect: ${file}; preserve recovery metadata and reconcile before retrying`), { code: 'CLIENT_CONFIG_STALE' });

// Reconstruct only the exact old generated artifacts, never claim an arbitrary file.
function legacyArtifact(client, state) {
  const base = String(state.gatewayUrl || '').replace(/\/+$/u, '');
  if (client === 'claude') return `${JSON.stringify({ env: { ANTHROPIC_BASE_URL: base, ANTHROPIC_AUTH_TOKEN: 'aios-gateway' } }, null, 2)}\n`;
  if (client === 'codex') return `model_provider = "aios-gateway"
model = "${state.codexModel}"

[model_providers.aios-gateway]
name = "aios-gateway"
wire_api = "responses"
base_url = "${base}/v1"
env_key = "OPENAI_API_KEY"
requires_openai_auth = false

[model_providers.aios-gateway.http_headers]
x-gateway-client = "codex"
`;
  const provider = JSON.parse(piModels(base, state.piModel || 'gateway-default').content).providers['aios-gateway'];
  delete provider.headers;
  provider.baseUrl = base;
  return `${JSON.stringify({ providers: { 'aios-gateway': { api: provider.api, apiKey: provider.apiKey, baseUrl: base, models: provider.models } } }, null, 2)}\n`;
}

export const legacyArtifactHash = (client, state) => contentHash(legacyArtifact(client, state));

export function isolatedOwnership(file, client, state, fsImpl = fs) {
  const current = fileHash(file, fsImpl);
  const owned = state?.clients?.includes(client) === true;
  const pending = state?.pendingArtifacts?.[client];
  const hashes = [state?.artifactHashes?.[client], ...(pending ? [pending.before, pending.after] : [])].filter((value) => value !== undefined);
  if (owned && !hashes.length && state.targetRefVersion === undefined) hashes.push(legacyArtifactHash(client, state));
  // The old registry-pending journal was written before any isolated artifacts.
  const legacyPending = state?.targetRefVersion === undefined && state?.codexDefaultStatus === 'pending';
  if (legacyPending) hashes.push(null);
  return { owned, exists: current !== null, matches: owned && hashes.includes(current), pending: Boolean(pending || legacyPending) };
}

export function assertIsolatedOwned(file, client, state, { allowMissing = false } = {}) {
  const result = isolatedOwnership(file, client, state);
  if (result.matches || (!result.exists && (!result.owned || allowMissing))) return;
  throw isolatedStale(file);
}
