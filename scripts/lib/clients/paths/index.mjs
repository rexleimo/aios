import {
  CLIENT_DEFINITIONS,
  SHARED_AGENT_SKILL_ROOT,
} from '../core/definitions.mjs';
import {
  assertKnownClient,
  isKnownClient,
  normalizeClientValue,
  resolveClientSelection,
} from '../core/selection.mjs';

// 纯函数：读取单个客户端路径定义，不直接访问磁盘。
function getClientDefinition(client) {
  const normalized = assertKnownClient(normalizeClientValue(client));
  return CLIENT_DEFINITIONS[normalized];
}

// 纯函数：返回项目内该客户端的 skills 根目录。
export function getClientProjectSkillRoot(client) {
  return getClientDefinition(client).projectSkillRoot;
}

// 纯函数：返回该客户端 skill 输出格式——单一事实来源，消除各处 hardcoded SKILL.md 假设。
// gemini 返回 'toml-command'（.gemini/commands/*.toml），其他客户端返回 'markdown-directory'。
// 对于非客户端合成 surface（如 'agents'），安全回退到 'markdown-directory'。
export function getClientSkillFormat(client) {
  if (!isKnownClient(client)) return 'markdown-directory';
  const def = getClientDefinition(client);
  return def.skillFormat || 'markdown-directory';
}

// 纯函数：返回 agents 输出目录；不支持 agents 的客户端保持空字符串。
export function getClientAgentTargetRoot(client) {
  return getClientDefinition(client).agentTargetRoot || '';
}

// 纯函数：返回 native 同步元数据根目录，让生命周期模块不再硬编码路径。
export function getClientNativeMetadataRoot(client) {
  return getClientDefinition(client).nativeMetadataRoot;
}

// 纯函数：按客户端选择生成 skills 搜索根，并确保共享 legacy 根只出现一次。
export function resolveClientSkillRoots(client = 'all', { includeSharedAgentRoot = true } = {}) {
  const roots = resolveClientSelection(client).map((clientId) => getClientProjectSkillRoot(clientId));
  if (includeSharedAgentRoot) {
    roots.push(SHARED_AGENT_SKILL_ROOT);
  }
  return [...new Set(roots)];
}
