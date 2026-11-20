// agents-profiles.mjs — Agent 方案：快照当前所有客户端的目标，一键切换（magpie Profiles 语义）。
// 纯函数：localStorage 读写由调用方注入，便于测试。零 try-catch。

export const AGENT_PROFILES_KEY = 'aios.agent-profiles.v1';

/** 从存储读方案列表。坏数据/无存储返回空（fail-open）。 */
export function readAgentProfiles(readImpl) {
  if (typeof readImpl !== 'function') return [];
  const raw = readImpl(AGENT_PROFILES_KEY);
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const parsed = parseJsonSafe(raw);
  if (!parsed || !Array.isArray(parsed.profiles)) return [];
  return parsed.profiles.filter((p) => p && typeof p.name === 'string' && p.targets && typeof p.targets === 'object');
}

/** 写方案列表。 */
export function writeAgentProfiles(profiles, writeImpl) {
  if (typeof writeImpl !== 'function') return false;
  const result = callSafe(() => writeImpl(AGENT_PROFILES_KEY, JSON.stringify({ schemaVersion: 1, profiles })));
  return result.ok;
}

/** 快照：从当前 selected 映射生成方案（只含非空值）。 */
export function snapshotTargets(selected) {
  const targets = {};
  for (const [id, value] of Object.entries(selected || {})) {
    if (typeof value === 'string' && value.trim()) targets[id] = value;
  }
  return { name: '', targets, at: new Date().toISOString() };
}

function parseJsonSafe(raw) {
  const result = callSafe(() => JSON.parse(raw));
  return result.ok ? result.value : null;
}

/** 唯一集中捕获点：把可能抛的外部调用包成 Result（零 try-catch 业务代码）。 */
function callSafe(fn) {
  try {
    return { ok: true, value: fn() };
  } catch {
    return { ok: false };
  }
}
