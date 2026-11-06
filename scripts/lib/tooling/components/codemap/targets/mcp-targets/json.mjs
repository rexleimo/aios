// scripts/lib/tooling/components/codemap/targets/mcp-targets/json.mjs — codemap 的 JSON 落点（含 pi 与 nested）。
//
// w5b 收编后这层只剩**策略**：写哪个条目、要不要与用户既有字段合并、pi 的整条替换、
// zcode 的 schema 规范化；**文本手术**（插入/替换/删除、落盘前重解析、备份、dry-run）已交给
// `clients/mcp/server-writer.mjs`（经 `landing-writer.mjs`）。`inspect*` 仍是纯读：解析一份文本，
// 不改盘、不写备份。
import { CRG_MCP_ALIAS } from '../../constants.mjs';
import { buildCrgEntryForTarget, isCrgServeEntry, isObjectRecord } from './entries.mjs';
import { readTargetEntry, removeTargetEntry, writeTargetEntry } from './landing-writer.mjs';

/**
 * 纯函数：按点路径下钻到 server 桶，**只读**（`inspect` 用）。
 *
 * namespaceKey 支持点路径（zcode 是 `mcp.servers`，qoder/claude 是单层 `mcpServers`）。
 * 单层取值 `parsed?.['mcp.servers']` 恒为 undefined —— 那会让 zcode 的 inspect 静默变成 missing。
 * 写路径不再用这个函数：桶路径的唯一所有者是落点表（`clients/mcp/landing-schema.mjs`）。
 */
function resolveNamespaceBucket(parsed, namespaceKey) {
  const segments = String(namespaceKey || '').split('.').filter(Boolean);
  let container = parsed;
  for (const segment of segments.slice(0, -1)) {
    if (!isObjectRecord(container[segment])) return null;
    container = container[segment];
  }
  const leaf = segments[segments.length - 1] || 'mcpServers';
  return isObjectRecord(container[leaf]) ? container[leaf] : null;
}

/** 现有条目 → 合并策略（pi 整条替换：它的 doctor 做 JSON.stringify 精确比对，多一个字段就红）。 */
function mergeForWrite(clientKey, desired, existing) {
  const merged = clientKey === 'pi' || !isObjectRecord(existing) ? { ...desired } : { ...existing, ...desired };
  // 用户级配置里残留的 `cwd` 要拔掉：它会把全局注册钉死在某一个仓库上。
  if (!('cwd' in desired)) delete merged.cwd;
  return merged;
}

export async function injectCrgIntoMcpJson(target, projectRoot, { dryRun = false, normalizeEntry = null } = {}) {
  const current = readTargetEntry({ target, projectRoot });
  if (current.status === 'error') return { status: 'error', reason: current.reason };

  const desired = buildCrgEntryForTarget(target.clientKey, projectRoot, target.path);
  const merged = mergeForWrite(target.clientKey, desired, current.entry);
  // 严格 schema 宿主（zcode）在落盘前规范化；用户自有的其它 server 不受影响。
  const entry = typeof normalizeEntry === 'function' ? normalizeEntry(merged) : merged;
  return writeTargetEntry({ target, projectRoot, entry, dryRun });
}

export async function injectCrgIntoOpencodeJson(target, _projectRoot, { dryRun = false } = {}) {
  const current = readTargetEntry({ target, projectRoot: _projectRoot });
  if (current.status === 'error') return { status: 'error', reason: current.reason };

  const desired = {
    type: 'local',
    command: ['uvx', CRG_MCP_ALIAS, 'serve'],
    enabled: true,
  };
  // opencode 的整条形状与 claude 家族不同源，合并语义与旧写入器一致：用户既有字段保留、我们的字段压过。
  const entry = isObjectRecord(current.entry) ? { ...current.entry, ...desired } : desired;
  return writeTargetEntry({ target, projectRoot: _projectRoot, entry, dryRun });
}

export async function removeCrgFromMcpJson(target, { io = console, projectRoot = '', dryRun = false } = {}) {
  return removeTargetEntry({ target, projectRoot, io, dryRun });
}

/** zcode 的点路径桶由落点表负责；调用方传 clientKey 只为选对落点，不再传 namespace。 */
export async function removeCrgFromNestedJson(target, options = {}) {
  return removeTargetEntry({ target, io: options.io || console, projectRoot: options.projectRoot || '', dryRun: Boolean(options.dryRun) });
}

export async function removeCrgFromOpencodeJson(target, options = {}) {
  return removeTargetEntry({ target, io: options.io || console, projectRoot: options.projectRoot || '', dryRun: Boolean(options.dryRun) });
}

export function inspectJsonNamespace(raw, namespaceKey) {
  const parsed = raw.trim() ? JSON.parse(raw) : {};
  const namespace = resolveNamespaceBucket(parsed, namespaceKey);
  const entry = namespace ? namespace[CRG_MCP_ALIAS] : null;
  return {
    exists: true,
    hasCrg: Boolean(entry),
    valid: isCrgServeEntry(entry),
    reason: entry ? 'invalid' : 'missing',
  };
}