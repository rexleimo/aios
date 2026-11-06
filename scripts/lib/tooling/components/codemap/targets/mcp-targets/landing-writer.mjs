// scripts/lib/tooling/components/codemap/targets/mcp-targets/landing-writer.mjs — codemap 的文件写入改经通用路径（w5b）。
//
// 收编的是什么、不收编的是什么，划清楚才不会把「换实现」写成「换策略」：
//   • 收编 = **文本手术**：解析→改→落盘这一步交给 `clients/mcp/server-writer.mjs`
//     （单一条目的定点插入/原地替换/删除、落盘前重解析、原子写、整份原文备份、`dryRun` 真不写盘）。
//   • 不收编 = **策略**：写哪个条目（`code-review-graph` 的形状按 client 不同）、要不要与用户既有
//     字段合并、pi 的整条替换、hermes 的字段收敛与 env 键序、zcode 的 schema 规范化、cwd 只在项目级钉住。
//     这些都留在 `json.mjs` / `toml.mjs` / `yaml.mjs` 里，由调用方先算出 `entry` 再交进来。
//
// 为什么值得换：旧写入器（`json.mjs:78`、`toml.mjs`、`yaml.mjs`）都是**整份重排**
// （`JSON.stringify(parsed, null, 2)` / 整段 `document.setIn`），于是「装一个条目」的副作用是
// 别人写在同一份文件里的字节（缩进、键序、注释位置）也一起变。收编后托管条目之外的字节不动——
// 这正是 w2 已经钉住、用户真正关心的那条门。
//
// 状态词表按调用方（codemap install/uninstall）的现有契约收口：它只认
// `created | updated | unchanged | planned | error`。通用层的 `replaced` 映射成 `updated`
// （同一个语义：「这条目这次被改写了」），`rejected | conflict | not-found` 一律映射成 `error` 并带回原文理由，
// 不静默成功——收编写成静默失效正是本切片要根治的病。
import { isDeepStrictEqual } from 'node:util';

import { readServers, removeServer, replaceServer, writeServer } from '../../../../../clients/mcp/server-writer.mjs';
import { resolveLanding } from '../../../../../clients/mcp/landing-schema.mjs';

import { CRG_MCP_ALIAS } from '../../constants.mjs';
import { isProjectScopedTarget } from './entries.mjs';

const PARSE_LABEL = Object.freeze({ json: 'JSON', toml: 'TOML', yaml: 'YAML' });

/**
 * 落点 scope：写进项目目录内的配置文件是 project，否则是 home。
 * 这不是新判断——`isProjectScopedTarget` 早就是 codemap「只有项目级才钉 cwd」的判据，
 * 这里复用同一个事实，避免出现第二套「什么算项目级」。
 */
export function targetScope(target, projectRoot) {
  return isProjectScopedTarget(target.path, projectRoot) ? 'project' : 'home';
}

function errorReason(read, landing) {
  const label = PARSE_LABEL[landing.format] || landing.format;
  return `${label} parse failed: ${read.reason}`;
}

/** 只读：拿到该条目在磁盘上的现状（不存在即 `undefined`），解析失败即 `error`。 */
export function readTargetEntry({ target, projectRoot, serverName = CRG_MCP_ALIAS }) {
  const scope = targetScope(target, projectRoot);
  const landing = resolveLanding(target.clientKey, scope);
  const read = readServers({ clientId: target.clientKey, scope, filePath: target.path });
  if (read.status === 'error') return { status: 'error', reason: errorReason(read, landing), landing, scope };
  return { status: read.status, entry: read.entries?.[serverName], landing, scope };
}

/**
 * upsert 一个条目：缺就插、同就 `unchanged`、不同就**原地替换**（不是先删再插——位置会变）。
 * 这就是旧 `doctor --fix` / `install` 的语义，只是把文本手术换成了定点手术。
 */
export async function writeTargetEntry({ target, projectRoot, serverName = CRG_MCP_ALIAS, entry, dryRun = false }) {
  const scope = targetScope(target, projectRoot);
  const landing = resolveLanding(target.clientKey, scope);
  const read = readServers({ clientId: target.clientKey, scope, filePath: target.path });
  if (read.status === 'error') return { status: 'error', reason: errorReason(read, landing) };

  const existing = read.entries?.[serverName];
  const common = { clientId: target.clientKey, scope, serverName, entry, filePath: target.path, dryRun };
  // 同形状再写一次是 no-op：旧写入器在 dry-run 下也返回 `unchanged`（先比后判），这里保持同序。
  if (existing !== undefined && isDeepStrictEqual(existing, entry)) return { status: 'unchanged' };
  const written = existing === undefined
    ? await writeServer(common)
    : await replaceServer(common);

  if (written.status === 'created' || written.status === 'updated' || written.status === 'replaced') {
    return { status: written.status === 'replaced' ? 'updated' : written.status, backupPath: written.backupPath };
  }
  if (written.status === 'planned') return { status: 'planned' };
  if (written.status === 'unchanged') return { status: 'unchanged' };
  return {
    status: 'error',
    reason: written.reason || written.status,
    // 白名单拒绝要说清是哪一列，否则 install 只报「失败」而没人知道该改什么。
    detail: written.unknownFields?.length ? `unknown fields: ${written.unknownFields.join(', ')}` : undefined,
  };
}

/**
 * 删一个条目。`absent`（文件或条目本来就不在）不是错误，与旧实现一致（旧实现直接 return）。
 * 桶外根键（opencode 的 `experimental.mcp_timeout`）按落点声明的默认值回收：
 * 值仍是当初那个默认值才删，被改成别人的值就留着——与 CLI 走账本的那套 provenance 是同一条规则的低配版，
 * 差别只在 codemap 没有账本可查，所以门槛更严（只认「值一模一样」）。
 */
export async function removeTargetEntry({ target, projectRoot, serverName = CRG_MCP_ALIAS, io = console, dryRun = false }) {
  const scope = targetScope(target, projectRoot);
  const landing = resolveLanding(target.clientKey, scope);
  if (!landing.requiresRootKeys.length) {
    const off = await removeServer({ clientId: target.clientKey, scope, serverName, filePath: target.path, dryRun });
    if (off.status === 'removed' && !dryRun) io.log(`OK   codemap removed ${serverName} from ${target.path}`);
    return { status: off.status, reason: off.reason };
  }
  const off = await removeServer({
    clientId: target.clientKey,
    scope,
    serverName,
    filePath: target.path,
    dryRun,
    dropRootKeys: landing.requiresRootKeys.map((key) => key.path),
    rootKeyValues: Object.fromEntries(landing.requiresRootKeys.map((key) => [key.path, key.createWith])),
  });
  if (off.status === 'removed' && !dryRun) io.log(`OK   codemap removed ${serverName} from ${target.path}`);
  return { status: off.status, reason: off.reason };
}