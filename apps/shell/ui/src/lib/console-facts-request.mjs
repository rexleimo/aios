// apps/shell/ui/src/lib/console-facts-request.mjs — 一次页面请求要采集哪个工作区。
//
// 这里是「选择」落到服务端的唯一一处：页面只交出 `ws`（12 位工作区摘要），
// 由 `resolveWorkspace` 在本机清单里查它的绝对路径。路径不作为查询参数存在，
// 所以这个界面不是任意目录读取器；不在清单里的 key 一律退回默认根并如实说明原因。
import { collectConsoleFacts, CONSOLE_FACTS_KIND } from './data/console-facts.mjs';
import { repoRoot } from './data/capability.mjs';
import { resolveWorkspace } from './config/workspaces.mjs';

/**
 * @param {{ ws?: string | null }} searchParams
 * @returns {Promise<{ facts: Awaited<ReturnType<typeof collectConsoleFacts>>, selection: { requested: string, ok: boolean, reason?: string, detail?: string, workspace?: Record<string, unknown> } }>}
 */
export async function collectForRequest(searchParams = {}) {
  const requested = String(searchParams.ws ?? '').trim();
  const defaultRoot = repoRoot();
  if (!requested) {
    return { facts: await collectConsoleFacts({ rootDir: defaultRoot }), selection: { requested: '', ok: true } };
  }
  const resolved = await resolveWorkspace({ key: requested, rootDir: defaultRoot });
  if (!resolved.ok) {
    // 退回默认根，但把「你要的那个工作区没被采用，原因是 X」带在 selection 里给界面说出去。
    // 静默退回会被读成「那个工程是空的」，那是假话。
    const facts = await collectConsoleFacts({ rootDir: defaultRoot });
    return { facts, selection: { requested, ok: false, reason: resolved.reason, detail: resolved.detail } };
  }
  const facts = await collectConsoleFacts({ rootDir: resolved.workspace.path, workspaces: { ok: true, workspaces: resolved.list.workspaces, scanRoots: resolved.list.scanRoots, error: null } });
  // 中文注释：上一步解析 key 时已经拿过一次清单，这里直接注入，不再跑第二条
  // `workspaces list`。实测重复那一次把外部根的请求从 ~400ms 推到 ~590ms。
  facts.kind = CONSOLE_FACTS_KIND;
  return { facts, selection: { requested, ok: true, workspace: resolved.workspace } };
}
