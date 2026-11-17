import { GatewayRouteError, resolveGatewayRoutes } from '../router.mjs';
import { listGatewayModels, loadProviders, readyProviderAccounts, resolveProviderApiKey, resolveProviderRequestHeaders } from '../../providers/registry.mjs';
import { orderedGroupMembers } from '../../routing/groups.mjs';
import { serializeWireTarget } from '../../routing/targets.mjs';
import { supportsProtocolTranslation } from './protocol-codec.mjs';
import { getClientModelRouting } from '../../../../foundation/clients/registry.mjs';

const CLIENT_PREFIX = /^\/clients\/(claude|codex|pi)(?=\/|$)/u;
const CLIENTS = new Set(['claude', 'codex', 'pi']);
const FIXED_DATE = '2026-01-01T00:00:00Z';

export function gatewayPath(request) {
  return new URL(request.url).pathname.replace(CLIENT_PREFIX, '') || '/';
}

export function gatewayClient(c, fallback = '') {
  const path = new URL(c.req.url).pathname;
  const prefix = path.match(CLIENT_PREFIX)?.[1];
  const explicit = c.req.header('x-aios-client')?.trim().toLowerCase();
  const legacy = c.req.header('x-gateway-client')?.trim().toLowerCase();
  if ((path.startsWith('/clients/') && !prefix) || (explicit !== undefined && !CLIENTS.has(explicit))) {
    throw new GatewayRouteError('Unknown explicit gateway client identity', 'INVALID_CLIENT_IDENTITY', 400);
  }
  const identities = [prefix, explicit, legacy].filter(Boolean);
  if (new Set(identities).size > 1) throw new GatewayRouteError('Conflicting gateway client identities', 'CLIENT_IDENTITY_CONFLICT', 400);
  return identities[0] || fallback;
}

export function registerGatewayCatalog(app, { registry, env, clientId }) {
  const catalog = (c) => {
    if (c.req.header('origin') || c.req.header('sec-fetch-site')) return c.json({ error: { code: 'CROSS_ORIGIN_REJECTED' } }, 403);
    try {
      const client = gatewayClient(c, clientId);
      if (client && getClientModelRouting(client) !== 'relay') throw new GatewayRouteError('This client does not use gateway model routing');
      const providers = loadProviders(registry);
      const protocol = client === 'codex' ? 'openai-response' : client === 'pi' ? 'openai-chat' : 'claude';
      const available = (requestedModel) => {
        try {
          return resolveGatewayRoutes({ registry, env, clientId: client, clientProtocol: protocol, requestedModel }).some((route) => {
            if (![false, true].every((stream) => supportsProtocolTranslation(protocol, route.targetProtocol, { stream }))) return false;
            const provider = providers[route.providerId];
            return readyProviderAccounts(provider, env).some((account) => {
              try { resolveProviderRequestHeaders(provider, route.targetProtocol, resolveProviderApiKey(provider, env, account), env); return true; }
              catch { return false; }
            });
          });
        } catch { return false; }
      };
      const entry = (id, label) => ({ id, object: 'model', created: 1767225600, owned_by: 'aios', type: 'model', display_name: label, created_at: FIXED_DATE });
      const data = [entry('aios-auto', 'Auto')];
      for (const id of listGatewayModels(registry, { env })) {
        const wire = serializeWireTarget({ kind: 'model', id });
        if (available(wire)) data.push(entry(wire, registry.models[id].name || registry.models[id].label || id));
      }
      for (const id of Object.keys(registry?.routingGroups || {})) {
        try {
          orderedGroupMembers(registry, id);
          const wire = serializeWireTarget({ kind: 'group', id });
          if (available(wire)) data.push(entry(wire, registry.routingGroups[id].name || id));
        } catch { /* Invalid/disabled groups are not advertised as usable choices. */ }
      }
      const requestPath = gatewayPath(c.req.raw);
      const prefix = ['/v1/models/', '/models/', '/claude/v1/models/', '/claude/models/'].find((path) => requestPath.startsWith(path));
      const rawId = prefix ? requestPath.slice(prefix.length) : undefined;
      const modelId = rawId === undefined || rawId.startsWith('aios/') ? rawId : decodeURIComponent(rawId);
      if (modelId !== undefined) {
        const item = data.find((model) => model.id === modelId);
        return item ? c.json(item) : c.json({ error: { code: 'UNKNOWN_TARGET' } }, 404);
      }
      const claude = client === 'claude' || c.req.header('anthropic-version') || c.req.path.startsWith('/claude/');
      return c.json(claude
        ? { data, has_more: false, first_id: data[0]?.id || null, last_id: data.at(-1)?.id || null }
        : { object: 'list', data });
    } catch (error) {
      return c.json({ error: { code: error.code || 'INVALID_PROVIDER_CONFIG' } }, error.status || 503);
    }
  };
  for (const path of ['/v1/models', '/models', '/claude/v1/models', '/claude/models']) {
    app.get(path, catalog);
    app.get(`${path}/*`, catalog);
  }
}
