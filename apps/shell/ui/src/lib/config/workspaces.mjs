// apps/shell/ui/src/lib/config/workspaces.mjs — Console 侧的工作区清单读取（CLI 的瘦客户端）。
//
// 为什么不 import `scripts/lib/foundation/workspaces/*`：
//   1) README 约定 3 不把 `scripts/lib/**` 拖进客户端打包图；
//   2) 工作区身份（`key`）的所有者是 registry.mjs，界面复制那份哈希就会出现第二个写者。
// 所以这里只跑 `aios workspaces list --json`，和 capability.mjs 读 `mcp list` 的方式一致。
//
// 失败如实返回：清单读不到 ≠ 本机没有工作区（路线图 P1-4 要分开的两条事实）。
import { runCapabilityJson } from '../data/capability.mjs';

const SCHEMA = 'aios.workspaces.v1';

/**
 * 本机工作区清单。返回 `{ ok, workspaces, scanRoots, error }`，调用方按 `ok` 分支，
 * 不要把失败降级成空数组——那会让下拉框显示「没有别的工作区」这句假话。
 */
export async function loadWorkspaces({ rootDir, runImpl } = {}) {
  const result = await runCapabilityJson(['workspaces', 'list', '--json'], { rootDir, runImpl });
  if (!result || result.ok !== true) {
    return { ok: false, workspaces: [], scanRoots: [], error: String(result?.error ?? '工作区命令没有返回结果') };
  }
  // `runCapabilityJson` 的契约是 `{ ok:true, data }`，所以这里得先拆 data。
  // 拆错的结果实测过一次：schema 判断拿到 undefined，把一条止确的清单报成协议不匹配。
  const payload = result.data;
  if (!payload || typeof payload !== 'object') {
    return { ok: false, workspaces: [], scanRoots: [], error: '工作区清单没有返回可读的 JSON' };
  }
  if (payload.schema !== SCHEMA) {
    return { ok: false, workspaces: [], scanRoots: [], error: `工作区清单协议版本不是 ${SCHEMA}，而是 ${String(payload.schema)}` };
  }
  const workspaces = Array.isArray(payload.workspaces) ? payload.workspaces : [];
  return { ok: true, workspaces, scanRoots: payload.scanRoots ?? [], error: null };
}

/**
 * 把页面交来的 key 解析成一个可采集的根目录。
 * 只有清单里的 key 会被接受；**路径参数在这里不存在**，所以这个界面不是任意目录读取器。
 */
export async function resolveWorkspace({ key, rootDir, runImpl }) {
  const list = await loadWorkspaces({ rootDir, runImpl });
  if (!list.ok) return { ok: false, reason: 'list-unreadable', detail: list.error };
  const wanted = String(key ?? '').trim();
  if (!/^[0-9a-f]{12}$/u.test(wanted)) {
    return { ok: false, reason: 'bad-key', detail: `工作区标识必须是 12 位十六进制摘要，收到「${wanted || '(空)'}」` };
  }
  const hit = list.workspaces.find((item) => item.key === wanted);
  if (!hit) return { ok: false, reason: 'not-listed', detail: '这个标识不在本机工作区清单里；重新加载页面即可拿到最新清单' };
  if (hit.missing) return { ok: false, reason: 'missing', detail: `登记的路径 ${hit.path} 在本机已不存在` };
  return { ok: true, workspace: hit, list };
}
