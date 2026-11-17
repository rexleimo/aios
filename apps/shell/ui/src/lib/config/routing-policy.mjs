// Configuration-only gateway policy. Runtime parity is tested without importing scripts into the UI.
import { assignmentReferences, orderedGroupMembers, parseTargetRef, toModelCatalog, validateDocument } from './model-routing.mjs';

const PROTOCOLS = Object.freeze(['openai-chat', 'openai-response', 'claude', 'gemini']);
// UI-safe mirror of client modelRouting eligibility; parity tests pin every definition and alias.
const GATEWAY_CLIENTS = new Set(['codex', 'codex-cli', 'claude', 'claude-code', 'opencode', 'opencode-cli', 'hermes', 'hermes-agent', 'pi', 'pi-coding-agent']);
const lower = (value) => String(value || '').trim().toLowerCase();
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Whitelist routing inputs; never project arbitrary metadata, environment, or provider credentials. */
export function toPolicyContext(document) {
  const select = (value, keys) => Object.fromEntries(keys.filter((key) => typeof value?.[key] === 'string').map((key) => [key, value[key]]));
  const targetReferences = assignmentReferences(document).filter(({ path }) => path.startsWith('envModels.') || /^roleDefaults\..+\.fallback\[\d+\]$/u.test(path));
  return {
    ...(document.targetRefVersion !== undefined ? { targetRefVersion: document.targetRefVersion } : {}),
    ...(targetReferences.length ? { targetReferences } : {}),
    roleDefaults: Object.fromEntries(Object.entries(document.roleDefaults || {}).filter(([, value]) => isRecord(value)).map(([role, value]) => [role, select(value, ['taskType', 'preferredModel'])])),
    routingRules: (Array.isArray(document.routingRules) ? document.routingRules : []).filter(isRecord).map((rule) => ({
      ...select(rule, ['taskType', 'primary']),
      ...(Array.isArray(rule.fallback) ? { fallback: rule.fallback.filter((id) => typeof id === 'string') } : {}),
    })),
  };
}

function normalizedRoles(map) {
  const normalized = {};
  for (const [role, modelId] of Object.entries(map || {})) {
    if (lower(role) && modelId) normalized[lower(role)] = modelId;
  }
  return normalized;
}

function policyChain(document, role, clientId) {
  const active = document.activeModel;
  const matrix = document.clientRoleMatrix || {};
  const clients = Object.fromEntries(Object.entries(matrix.clients || {}).map(([client, roles]) => [lower(client), normalizedRoles(roles)]));
  const clientRole = role && clientId ? clients[clientId]?.[role] : '';
  const globalRole = normalizedRoles(matrix.default)[role];
  const roleDefault = document.roleDefaults?.[role];
  const taskType = lower(roleDefault?.taskType) || role;
  const rule = (Array.isArray(document.routingRules) ? document.routingRules : []).find((item) => lower(item?.taskType) === taskType);
  // Only ONE preferred target is selected. An unusable higher preference never retries lower ones.
  const preferred = clientRole ? { id: clientRole, source: '客户端例外' }
    : globalRole ? { id: globalRole, source: '全局角色指定' }
      : roleDefault?.preferredModel ? { id: roleDefault.preferredModel, source: '角色默认' }
        : { id: rule?.primary || '', source: '任务规则' };
  // Role/rule targets intentionally retain their raw spelling, as gatewayCandidateChain does.
  // Empty-role legacy preferences/rules still precede clientDefaults, without inferring "general".
  const clientDefault = role ? '' : Object.entries(document.clientDefaults || {}).find(([key]) => lower(key) === clientId)?.[1];
  return [preferred, { id: clientDefault, source: '客户端例外' }, ...(Array.isArray(rule?.fallback) ? rule.fallback : []).map((id) => ({ id, source: '规则回落' })), { id: active, source: '全局指定' }];
}

/**
 * @param {object} document Complete saved or draft registry (not the legacy auto projection).
 * @param {{role?: string, clientId?: string}} options Gateway role/client overrides; no process env.
 * @returns {{modelId: string, source: string, configuredModelId: string, unavailableModelId: string, candidateIds: string[], byProtocol: Array<{protocol: string, modelId: string}>, note: string}}
 */
export function projectPolicyAssignment(document, { role = '', clientId = '' } = {}) {
  const blockedClient = Boolean(lower(clientId)) && !GATEWAY_CLIENTS.has(lower(clientId));
  const chain = policyChain(document, lower(role), lower(clientId)).filter((entry) => typeof entry.id === 'string' && entry.id);
  const seen = new Set();
  const unique = chain.filter((entry) => !seen.has(entry.id) && seen.add(entry.id));
  let catalog = [];
  let invalidProviders = false;
  try {
    // Runtime validates the whole provider table, including disabled/unrelated providers.
    validateDocument({ providers: document.providers });
    catalog = toModelCatalog(document);
  } catch {
    invalidProviders = true;
  }
  const eligible = new Set(catalog.map((model) => model.id));
  let invalidTarget = false;
  const parse = (ref) => {
    try { return parseTargetRef(ref, document); } catch { invalidTarget = true; return null; }
  };
  const parsed = unique.map((entry) => ({ ...entry, target: parse(entry.id) }));
  const expand = (entry) => {
    const target = parse(entry.id);
    if (!target || target.kind === 'auto') return [];
    if (target.kind === 'model') return [{ ...entry, id: target.id }];
    try { return orderedGroupMembers(document, target.id).filter((id) => eligible.has(id)).map((id) => ({ ...entry, id })); }
    catch { return []; }
  };
  const configuredModelId = chain[0]?.id || '';
  const configured = parse(configuredModelId);
  const unavailableModelId = configuredModelId && configured?.kind !== 'auto' && !expand(chain[0]).some((entry) => eligible.has(entry.id)) ? configuredModelId : '';
  const hasGroup = parsed.some((entry) => entry.target?.kind === 'group');
  const expanded = [];
  let groupBlocked = false;
  for (const entry of unique) {
    expanded.push(...expand(entry));
    // A selected group is a single explicit ordered target, never a fallback into other groups/models.
    if (parse(entry.id)?.kind === 'group') {
      groupBlocked = !expanded.some((candidate) => eligible.has(candidate.id));
      break;
    }
  }
  const candidates = blockedClient || invalidTarget ? [] : catalog.length === 1 && !hasGroup ? [{ id: catalog[0].id, source: '单模型直连' }] : expanded.filter((entry, index) => expanded.findIndex((other) => other.id === entry.id) === index);
  const selected = candidates.find((entry) => eligible.has(entry.id));
  // Gateway translation means input protocols currently share a chain, not native-protocol filtering.
  const byProtocol = PROTOCOLS.map((protocol) => ({ protocol, modelId: selected?.id || '' }));
  const outcomes = new Set(byProtocol.map((entry) => entry.modelId));
  const modelId = outcomes.size === 1 ? byProtocol[0].modelId : '';
  const notes = ['仅网关配置推演；不含环境覆盖、意图分类、凭据校验或实时可用性。'];
  if (unavailableModelId) notes.push(groupBlocked ? `配置组 ${unavailableModelId} 无可用成员或模式不受支持；不会改用其他固定目标。` : `配置目标 ${unavailableModelId} 不可用，按配置候选链回落。`);
  if (hasGroup && modelId) notes.push('模型组按已保存成员顺序选择；不实现权重、轮询或成本优选。');
  if (invalidProviders) notes.push('供应商配置无效，不能确定路由。');
  if (invalidTarget) notes.push('目标引用版本或编码无效，不能确定路由。');
  if (blockedClient) notes.push('该客户端不参与网关模型分配；保留配置不表示会向该客户端派发模型。');
  if (outcomes.size > 1) notes.push('各协议结果不同，请查看 byProtocol，不汇总为单一模型。');
  if (!modelId && outcomes.size === 1 && !blockedClient) notes.push('没有可用的配置默认路由。');
  return {
    modelId,
    source: blockedClient ? '客户端不参与网关分配' : modelId ? selected.source : '未配置默认路由',
    configuredModelId,
    unavailableModelId,
    candidateIds: candidates.map((entry) => entry.id),
    byProtocol,
    note: notes.join(''),
  };
}

/** Remove only the edited target; callers retain every unrelated exception and context field. */
export function inheritPolicyDocument(document, role = '', clientId = '') {
  const next = structuredClone(document);
  const roleKey = lower(role);
  const clientKey = lower(clientId);
  if (!roleKey) {
    if (clientKey) delete next.clientDefaults?.[clientKey];
    else delete next.activeModel;
  } else {
    const maps = clientKey
      ? Object.entries(next.clientRoleMatrix?.clients || {}).filter(([key]) => lower(key) === clientKey).map(([, map]) => map)
      : [next.clientRoleMatrix?.default];
    for (const map of maps) if (map) for (const key of Object.keys(map)) if (lower(key) === roleKey) delete map[key];
  }
  return next;
}

/** Human-readable saved/draft summaries, independent of runtime monitoring. */
export function describePolicyChanges(before, after) {
  if (!before || !after) return [];
  const changes = [];
  const scalar = (title, previous, next) => {
    if ((previous || '') !== (next || '')) changes.push(`${title}：${previous || '继承'} → ${next || '继承'}`);
  };
  const map = (title, previous = {}, next = {}) => {
    for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) scalar(`${title} ${key}`, previous[key], next[key]);
  };
  scalar('全局默认', before.activeModel, after.activeModel);
  map('客户端默认', before.clientDefaults, after.clientDefaults);
  map('全局角色', before.matrix?.default, after.matrix?.default);
  for (const client of new Set([...Object.keys(before.matrix?.clients || {}), ...Object.keys(after.matrix?.clients || {})])) map(`客户端 ${client} / 角色`, before.matrix?.clients?.[client], after.matrix?.clients?.[client]);
  for (const [field, label] of [['providers', '供应商来源'], ['customModels', '自定义模型'], ['routingGroups', '模型组'], ['intentRouting', '意图路由']]) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) changes.push(`${label}已修改`);
  }
  return changes;
}
