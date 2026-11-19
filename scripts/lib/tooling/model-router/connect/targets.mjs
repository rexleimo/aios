import { supportsProtocolTranslation } from '../gateway/compatibility/protocol-codec.mjs';
import { resolveGatewayRoute } from '../gateway/router.mjs';
import { getProviderForModel, listGatewayModels } from '../providers/registry.mjs';
import { orderedGroupMembers } from '../routing/groups.mjs';
import { parseTargetRef, serializeWireTarget, TARGET_REF_VERSION } from '../routing/targets.mjs';

export const DEFAULT_CONNECT_TARGET = 'auto';
export { TARGET_REF_VERSION };
export { CONNECT_CLIENTS } from './config/clients.mjs';
import { CONNECT_CLIENTS } from './config/clients.mjs';
const PROTOCOLS = Object.freeze({
  claude: 'claude', codex: 'openai-response', pi: 'claude',
  opencode: 'openai-chat', zcode: 'openai-chat', qoder: 'openai-chat',
  gemini: 'openai-chat', hermes: 'openai-chat', grok: 'openai-chat', workbuddy: 'openai-chat',
});

const capability = (supported, reason) => ({ supported, ...(reason ? { reason } : {}) });

// Do not infer installed-client features from version numbers or run a client to probe them.
export function connectCapabilities(client) {
  return {
    auto: capability(true),
    model: capability(true),
    group: capability(true),
    native: capability(false, 'Clearing the gateway selection cannot guarantee a usable native default while the client remains connected; select Auto or a registered target instead.'),
    catalog: client === 'pi'
      ? capability(true)
      : capability(false, client === 'claude'
        ? 'availableModels is an allowlist, not a verified arbitrary-model picker. Use /model <advertised ID> or choose a fixed target here.'
        : 'A compatible Codex custom-catalog schema has not been verified. The existing catalog is preserved; model/model_provider support Auto and fixed targets.'),
  };
}

export function requestModelForTarget(target = DEFAULT_CONNECT_TARGET) {
  const parsed = parseConnectTarget(target);
  if (parsed.kind === 'auto') return 'aios-auto';
  if (parsed.kind === 'native') return null;
  return serializeWireTarget(parsed);
}

export function parseConnectTarget(value) {
  const target = value === undefined ? DEFAULT_CONNECT_TARGET : value;
  const invalid = () => Object.assign(new Error('target must be auto, native, model:<encodeURIComponent(id)> or group:<encodeURIComponent(id)>'), { code: 'INVALID_CONNECT_TARGET' });
  if (typeof target !== 'string' || !target || target.length > 2048 || /[\u0000-\u0020\u007f]/u.test(target)) throw invalid();
  if (target === 'native' || target === 'auto' || target === 'aios-auto') return { kind: target === 'aios-auto' ? 'auto' : target, ref: target === 'aios-auto' ? 'auto' : target };
  if (!/^(model|group):.+$/u.test(target)) throw invalid();
  try { return parseTargetRef(target, { targetRefVersion: TARGET_REF_VERSION }); } catch { throw invalid(); }
}

// Unversioned values are literal model IDs, including "auto" and "group:x".
export function persistedConnectTarget(value, version) {
  if (typeof value !== 'string' || !value) return null;
  return version === TARGET_REF_VERSION ? parseConnectTarget(value).ref : parseTargetRef(value, { targetRefVersion: version }).ref;
}

export function artifactModelForClient(state, client) {
  if (state?.artifactModels?.[client] !== undefined) return state.artifactModels[client];
  const target = state?.targets?.[client];
  if (target !== undefined) return state.targetRefVersion === TARGET_REF_VERSION ? requestModelForTarget(target) : target;
  return (client === 'pi' ? state?.piModel : client === 'codex' ? state?.codexModel : undefined) ?? 'aios-auto';
}

export function validateConnectTarget(value, registry) {
  const parsed = parseConnectTarget(value);
  if (parsed.kind === 'auto' || parsed.kind === 'native') return parsed.ref;
  if (!Object.hasOwn(parsed.kind === 'group' ? registry?.routingGroups || {} : registry?.models || {}, parsed.id)) {
    throw Object.assign(new Error(`unknown registered ${parsed.kind}: ${parsed.ref}`), { code: 'INVALID_CONNECT_TARGET' });
  }
  return parsed.ref;
}

export function clientGatewayUrl(gatewayUrl, client) {
  return `${String(gatewayUrl || '').replace(/\/+$/u, '')}/clients/${client}`;
}

export function gatewayTargetCatalog(registry, eligible) {
  return [
    { target: DEFAULT_CONNECT_TARGET, id: 'aios-auto', name: 'AIOS Auto' },
    ...eligible.map((id) => {
      const target = `model:${encodeURIComponent(id)}`;
      return { target, id: requestModelForTarget(target), name: registry.models[id].name || id };
    }),
    ...Object.entries(registry.routingGroups || {})
      .filter(([id]) => {
        try { return orderedGroupMembers(registry, id).some((member) => eligible.includes(member)); } catch { return false; }
      })
      .map(([id, group]) => {
        const target = `group:${encodeURIComponent(id)}`;
        return { target, id: requestModelForTarget(target), name: group.name || `Group: ${id}` };
      }),
  ];
}

export function connectTargetReadiness({ document, selected, target, codexModel, piModel, env = process.env }) {
  const routes = {};
  const targets = {};
  const catalogs = {};
  const issues = [];
  const warnings = [];
  let error;
  try {
    const eligible = listGatewayModels(document, { env });
    for (const client of selected) {
      const legacy = client === 'codex' ? codexModel : client === 'pi' ? piModel : undefined;
      const selection = validateConnectTarget(target ?? (legacy && legacy !== 'gateway-default' ? `model:${encodeURIComponent(legacy)}` : undefined), document);
      targets[client] = selection;
      if (selection === 'native') {
        error = 'unsupported_native_target';
        issues.push(`${client}: ${connectCapabilities(client).native.reason}`);
        continue;
      }
      const protocol = PROTOCOLS[client];
      const compatible = eligible.filter((id) => {
        const upstream = getProviderForModel(id, document);
        return [false, true].every((stream) => supportsProtocolTranslation(protocol, upstream.protocol, { stream }));
      });
      catalogs[client] = gatewayTargetCatalog(document, compatible);
      let modelId;
      if (selection === DEFAULT_CONNECT_TARGET) {
        // Readiness checks the same client-specific default that the generated URL identifies.
        try {
          modelId = resolveGatewayRoute({ clientId: client, registry: document, env, clientProtocol: protocol }).modelId;
        } catch {
          issues.push(`${client}: no eligible runtime default route; configure activeModel or clientDefaults.${client}`);
          continue;
        }
      } else if (selection.startsWith('group:')) {
        modelId = orderedGroupMembers(document, parseConnectTarget(selection).id).find((id) => compatible.includes(id));
      } else {
        modelId = parseConnectTarget(selection).id;
      }
      if (!compatible.includes(modelId)) {
        issues.push(`${client}: target "${selection}" is not an eligible ${protocol} route`);
      } else {
        routes[client] = modelId;
      }
    }
  } catch (cause) {
    error = cause.code === 'INVALID_CONNECT_TARGET' ? 'invalid_target' : undefined;
    issues.push(error ? cause.message : 'invalid provider/model configuration');
  }
  return { ready: issues.length === 0, routes, targets, catalogs, issues, warnings, ...(error ? { error } : {}) };
}
