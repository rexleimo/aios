// apps/shell/ui/src/lib/config/model-routing.mjs — 模型路由配置（供应商注册表 + 客户端×角色矩阵）的编辑尺子。
//
// 单一配置源 = model-registry.json 的 providers / clientRoleMatrix 两段；CLI/网关/GUI 读写同一份。
// 自包含（不 import scripts/lib，避免 Turbopack 整仓 trace）；校验规则与 routing/providers.mjs 一致。
// 三条守卫同 host-capabilities：密钥只允许 env:VAR（明文拒）、写前备份、写后校验。
export class ConfigError extends Error {
  constructor(message, path = null) {
    super(message);
    this.name = 'ConfigError';
    this.path = path;
  }
}

const ENV_REF = /^env:([A-Za-z_][A-Za-z0-9_]*)$/u;
const HTTP_URL = /^https?:\/\/.+/u;
const PROTOCOLS = Object.freeze(['openai-chat', 'openai-response', 'claude', 'gemini']);

export function parseDocument(text) {
  let document;
  try {
    document = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`registry is not valid JSON: ${error.message}`);
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new ConfigError('registry must be a JSON object');
  }
  return document;
}

/** 投影成界面可编辑的形状：providers 列表 + matrix（default/clients）。 */
export function toEditable(document) {
  const providers = Object.entries(document.providers || {}).map(([id, p]) => ({
    id,
    baseUrl: String(p?.baseUrl || ''),
    apiKeyEnv: String(p?.apiKeyEnv || ''),
    protocols: Array.isArray(p?.protocols) ? [...p.protocols] : [],
    models: Array.isArray(p?.models) ? [...p.models] : [],
  }));
  const matrix = document.clientRoleMatrix || {};
  return {
    providers,
    matrix: { default: { ...(matrix.default || {}) }, clients: { ...(matrix.clients || {}) } },
  };
}

export function validateDocument(document) {
  for (const [id, p] of Object.entries(document.providers || {})) {
    if (p?.apiKey) throw new ConfigError(`provider "${id}": plaintext apiKey forbidden; use apiKeyEnv="env:VAR"`, `providers.${id}.apiKey`);
    if (!HTTP_URL.test(String(p?.baseUrl || ''))) throw new ConfigError(`provider "${id}": baseUrl must be http(s)`, `providers.${id}.baseUrl`);
    if (p?.apiKeyEnv && !ENV_REF.test(String(p.apiKeyEnv))) throw new ConfigError(`provider "${id}": apiKeyEnv must be env:VAR`, `providers.${id}.apiKeyEnv`);
    for (const proto of p?.protocols || []) {
      if (!PROTOCOLS.includes(proto)) throw new ConfigError(`provider "${id}": unknown protocol "${proto}"`, `providers.${id}.protocols`);
    }
  }
  const matrix = document.clientRoleMatrix;
  if (matrix !== undefined) {
    if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) throw new ConfigError('clientRoleMatrix must be an object', 'clientRoleMatrix');
    for (const section of ['default', 'clients']) {
      if (matrix[section] !== undefined && (typeof matrix[section] !== 'object' || Array.isArray(matrix[section]))) {
        throw new ConfigError(`clientRoleMatrix.${section} must be an object`, `clientRoleMatrix.${section}`);
      }
    }
  }
}

/** 用编辑后的形状重建 providers/clientRoleMatrix 两段，保留 registry 其余字段不动。 */
export function applyEdits(document, editable) {
  const next = { ...document };
  const providers = {};
  for (const p of editable?.providers || []) {
    const id = String(p?.id || '').trim();
    if (!id) throw new ConfigError('provider id required', 'providers');
    providers[id] = {
      baseUrl: String(p.baseUrl || ''),
      ...(p.apiKeyEnv ? { apiKeyEnv: String(p.apiKeyEnv) } : {}),
      protocols: Array.isArray(p.protocols) ? [...p.protocols] : [],
      models: Array.isArray(p.models) ? [...p.models] : [],
    };
  }
  next.providers = providers;
  // 中文注释：清空的角色覆盖（空串）落盘前剪掉，避免 {implementer:''} 这类残留；空客户端整段移除。
  const pruneMap = (map) => Object.fromEntries(Object.entries(map || {}).filter(([, v]) => String(v || '').trim()));
  const clients = {};
  for (const [clientId, roles] of Object.entries(editable?.matrix?.clients || {})) {
    const pruned = pruneMap(roles);
    if (Object.keys(pruned).length) clients[clientId] = pruned;
  }
  next.clientRoleMatrix = {
    default: pruneMap(editable?.matrix?.default),
    clients,
  };
  return next;
}

export function diffEditable(before, after) {
  const changes = [];
  if (JSON.stringify(before.providers) !== JSON.stringify(after.providers)) changes.push('providers');
  if (JSON.stringify(before.matrix) !== JSON.stringify(after.matrix)) changes.push('clientRoleMatrix');
  return changes;
}