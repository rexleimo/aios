// scripts/lib/clients/mcp/install-policy.mjs — 归属门 + 允许集合门 + w2 写入门的合成层（w3）。
//
// Safety order: refuse unsafe writes; compensate only while committed bytes still match.
//   1. 每客户端允许集合（`entry-classes.mjs`）——身份不对的条目连落点都不去碰；
//   2. 账本先读得到才允许动磁盘：读不到 = `ledger-unavailable`，**只读面**（计划的回退点）；
//   3. 归属判定（`ledger.mjs` 的 absent/owned/kept-differs/external/conflict）；
//   4. 落点白名单 + 文本手术（`server-writer.mjs`）；
//   5. Save ownership; on failure restore/delete unchanged committed bytes or report recovery.
//
// 三条产品性拒绝，都是 ADR 0008 决策 3/5/8 的直接兑现，不给糊话理由：
//   · `external` 未被接管 → 不写不删，`nextAction` 指 `adopt`；
//   · `kept-differs` → 用户手改过的条目归用户，默认拒绝，理由沿用 headroom 的原文
//     `entry-changed-after-aios-registration`（`headroom-mcp/lifecycle.mjs:119`）；
//   · pi 的 shell/auth → 拒绝并附策略原文与引用行。
// `force` / `adopt` 是**人工决定**的入口，必须由上层（w4 CLI、w6 界面）显式传 true；
// 本层绝不从关键词或默认值里猜出「用户大概想覆盖」。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFileSnapshot, writeFileChecked } from '../../environment/fs/checked-atomic-write.mjs';

import { readServers, removeServer, replaceServer, writeServer } from './server-writer.mjs';
import { normalizeEntryForLanding } from './entry-transforms.mjs';
import { resolveLanding } from './landing-schema.mjs';
import { assertEntryClassAllowed } from './entry-classes.mjs';
import {
  classifyMcpOwnership,
  fingerprintMcpEntry,
  ledgerKeyFor,
  readMcpLedger,
  resolveMcpLedgerPath,
  recordOwnership,
  releaseOwnership,
  touchVerified,
} from './ledger.mjs';

function transactionRevision(files) {
  const hash = createHash('sha256');
  for (const file of files) {
    let bytes;
    try { bytes = fs.readFileSync(file); } catch (error) {
      if (error.code !== 'ENOENT') { error.mcpRevisionFile = file; throw error; }
      bytes = null;
    }
    hash.update(JSON.stringify([file, bytes?.toString('base64') ?? null]));
  }
  return hash.digest('hex');
}

// Cooperative CLI transactions lock both resources, including the shared client ledger.
// Never steal an old lock: a crashed writer requires inspection, not a timed takeover.
async function transact(options, operation) {
  const ledgerFile = path.resolve(resolveMcpLedgerPath(options.clientId, options));
  const files = [path.resolve(options.filePath), ledgerFile].sort();
  const locks = [];
  try {
    if (!options.dryRun) {
      const deadline = Date.now() + 5000;
      for (const file of files) {
        const lock = path.join(os.tmpdir(), `aios-mcp-${createHash('sha256').update(file).digest('hex')}.lock`);
        for (;;) {
          try { fs.closeSync(fs.openSync(lock, 'wx', 0o600)); locks.push(lock); break; } catch (error) {
            if (error.code !== 'EEXIST') throw error;
            if (Date.now() >= deadline) return { status: 'rejected', reason: 'transaction-busy' };
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
        }
      }
    }
    const revision = transactionRevision(files);
    const checkRevision = () => transactionRevision(files) === revision;
    if (options.expectedRevision && options.expectedRevision !== revision) return { status: 'stale-preview', reason: 'preview-revision-changed' };
    const result = await operation({ ...options, checkRevision });
    if (options.dryRun && !checkRevision()) return { status: 'stale-preview', reason: 'preview-revision-changed', dryRun: true };
    return options.dryRun ? { ...result, revision } : result;
  } catch (error) {
    if (error.mcpRevisionFile === ledgerFile) return ledgerUnavailable(error);
    return { status: 'rejected', reason: 'transaction-failed', detail: error.message };
  } finally {
    for (const lock of locks.reverse()) fs.rmSync(lock, { force: true });
  }
}

export const installServer = (options = {}) => transact(options, install);
export const uninstallServer = (options = {}) => transact(options, uninstall);

function ledgerUnavailable(error) {
  if (error?.code === 'MCP_LEDGER_INVALID') return { status: 'rejected', reason: 'ledger-invalid' };
  if (error?.code === 'MCP_LEDGER_CHANGED') return { status: 'conflict', reason: 'ledger-revision-changed' };
  return { status: 'rejected', reason: 'ledger-unavailable', detail: error instanceof Error ? error.message : String(error) };
}

/**
 * 账本要记的落点事实（`entryPath` / `format` / 桶外根键的默认值）。
 * w3 之前把 `written.landing` / `read.landing` 传进来，而 `server-writer` 的 `describe()` 是**平铺**的
 * （返回 `format`、`entryPath` 两个键，没有 `landing` 这个对象），于是每条记录的这两个字段一直是空串——
 * 没有测试断言它们，所以没人疼。现在从 `resolveLanding` 直接取，账本的落点列才是事实。
 */
function landingFor(clientId, scope) {
  const landing = resolveLanding(clientId, scope);
  return {
    landing,
    rootKeyValues: Object.freeze(Object.fromEntries(landing.requiresRootKeys.map((key) => [key.path, key.createWith]))),
  };
}

/** 配置改完但账本没记上时的补偿：能回滚就回滚，不能就把事实说清楚。 */
async function rollbackConfig(filePath, backupPath, existedBefore, committedFingerprint) {
  const incomplete = (reason) => ({ rolledBack: 'rollback-incomplete', recovery: { reason, configPath: filePath, backupPath } });
  try {
    const committed = readFileSnapshot(filePath);
    if (!committed || createHash('sha256').update(committed).digest('hex') !== committedFingerprint) return incomplete('config-changed-after-commit');
    if (existedBefore && backupPath) {
      const original = await fs.promises.readFile(backupPath);
      if (!await writeFileChecked(filePath, original, { original: committed })) return incomplete('config-changed-after-commit');
      return { rolledBack: 'restored-from-backup' };
    }
    if (!existedBefore) {
      // No await since the post-commit byte check. Never delete another writer's edit.
      fs.unlinkSync(filePath);
      return { rolledBack: 'removed-created-file' };
    }
    return incomplete('no-rollback-available');
  } catch {
    return incomplete('rollback-io-failed');
  }
}

async function openLedger(clientId, options) {
  try {
    const ledger = await readMcpLedger(clientId, options);
    return { ok: true, ledger };
  } catch (error) {
    return { ok: false, failure: ledgerUnavailable(error) };
  }
}

/**
 * 「不是 AIOS 写的」这一道门在装与卸两处都给同一种拒绝：状态、理由、下一步是同一份事实，
 * 只有那句话说的动作不同。两段一样的字面量各自演化，就会长成两种说法描述同一件事。
 */
function refuseExternal({ verdict, serverName, message }) {
  return { status: 'refused-external', classification: verdict, reason: 'not-owned-by-aios', nextAction: 'adopt', message, serverName };
}

// Both mutation paths report incomplete compensation without claiming config was restored.
async function failWithRollback({ error, filePath, backupPath, existedBefore, committedFingerprint, serverName }) {
  const rollback = await rollbackConfig(filePath, backupPath, existedBefore, committedFingerprint);
  const message = rollback.recovery
    ? 'Ledger save failed; rollback incomplete. Preserve the current config and inspect the recovery paths.'
    : 'Ledger save failed; config rolled back.';
  return { ...ledgerUnavailable(error), ...rollback, backupPath, serverName, message };
}

/** 「核验时间刷新」失败不改变磁盘事实：条目在不在、归属是谁都已经判完了，只把没记上说出来。 */
async function markVerified(params, options) {
  try {
    await touchVerified(params, options);
    return '';
  } catch (error) {
    return `ledger-verify-touch-failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * 登记/更新一个 MCP server。`classification` 一律随结果返回，界面上要显示的是判定本身，不是「成功/失败」。
 * `adopt: true` = 人工显式接管：外部条目先按磁盘现状记账，**不覆盖**；接管后要 AIOS 形状仍需 `restore`。
 * `restore: true` = 对已属于 AIOS 但形状过期的条目先卸再装（只在 owned/conflict 路径生效）。
 */
async function install({
  clientId, scope, serverName, entry, filePath,
  dryRun = false, backupDir = '', ledgerDir = '', writeImpl, targets,
  browserRuntimeInstalled = false, adopt = false, restore = false,
  checkRevision,
} = {}) {
  const ledgerOptions = { ledgerDir, writeImpl };
  const allowed = assertEntryClassAllowed({ clientId, serverName, browserRuntimeInstalled });
  if (!allowed.ok) {
    return { status: 'rejected', ...allowed, serverName, clientId, scope };
  }

  // 落地形状先行（w5a 的字段变换位）：**必须在归属判定与指纹之前**改名。
  // 账本认领的是「磁盘上那条目的全字段 sha256」，若按规范形状（`startupTimeoutSec`）记指纹、
  // 却按落点形状（gemini 的 `timeout`）写盘，条目一装上就永久 `kept-differs`——收编等于自造幽灵。
  // 改名只改名与换算，不丢字段；丢字段仍然由白名单判 `unknown-field` 拒掉。
  const landingShape = normalizeEntryForLanding(clientId, scope, entry);
  if (!landingShape.ok) {
    return {
      status: 'rejected',
      reason: landingShape.reason,
      field: landingShape.field,
      conflictFrom: landingShape.conflictFrom,
      message: landingShape.reason === 'transform-target-conflict'
        ? `这条条目同时给了 ${landingShape.conflictFrom} 和 ${landingShape.field}，两家说法不一致，不猜哪一边。`
        : `${landingShape.field} 的值不是数字，换算不了该落点要的时长单位：${landingShape.value}`,
      serverName,
      clientId,
      scope,
    };
  }
  const desired = landingShape.entry;

  const opened = await openLedger(clientId, ledgerOptions);
  if (!opened.ok) return { ...opened.failure, serverName, clientId, scope };
  const key = ledgerKeyFor(scope, serverName);
  const record = opened.ledger.entries[key] || null;

  const read = readServers({ clientId, scope, filePath, targets });
  if (read.status !== 'ok' && read.status !== 'absent') return { ...read, serverName };
  const actual = read.entries?.[serverName] ?? null;
  const existedBefore = read.status === 'ok';
  if (!checkRevision()) return { status: 'stale-preview', reason: 'preview-revision-changed' };
  const verdict = classifyMcpOwnership({ actual, desired, ledgerEntry: record });
  if (opened.ledger.corrupt) return { status: actual && !adopt ? 'refused-external' : 'rejected', reason: 'ledger-invalid', classification: verdict, serverName };

  if (verdict.status === 'owned' && !verdict.desiredFingerprint) {
    const ledgerNote = dryRun ? '' : await markVerified({ clientId, scope, serverName, fingerprint: verdict.actualFingerprint }, ledgerOptions);
    return { status: 'unchanged', classification: verdict, entryClass: allowed.entryClass, serverName, dryRun, ledgerNote };
  }
  if (verdict.status === 'external' && !adopt) {
    return refuseExternal({ verdict, serverName, message: '这个条目不是 AIOS 写的。要控制台接管它，需要显式 adopt；接管之前不写不删。' });
  }
  if (verdict.status === 'kept-differs' && !restore && !adopt) {
    return {
      status: 'kept-differs',
      classification: verdict,
      reason: verdict.reason,
      nextAction: adopt ? 'none' : 'adopt',
      message: '用户（或别的工具）改过这个条目。默认只显示、不覆盖：要按 AIOS 形状恢复需显式 restore，要认下现状需 adopt。',
      serverName,
    };
  }
  if (verdict.status === 'conflict' && !restore) {
    return { status: 'conflict', classification: verdict, reason: 'entry-exists-differs', serverName };
  }

  if (dryRun) {
    // restore 的 dry-run 走 replace：`writeServer` 对同名不同形状会直接给 `conflict`，
    // 那会让「预览一次恢复」显示成一个拒绝，而真跑却是成功——预览与执行必须是同一条判定。
    const restoring = restore && (verdict.status === 'conflict' || verdict.status === 'kept-differs');
    const planned = restoring
      ? await replaceServer({ clientId, scope, serverName, entry: desired, filePath, dryRun: true, targets })
      : await writeServer({ clientId, scope, serverName, entry: desired, filePath, dryRun: true, targets });
    return { status: planned.status === 'planned' ? 'planned' : planned.status, classification: verdict, planned, renamed: landingShape.renamed, serverName, dryRun: true };
  }

  // 接管路径：只按磁盘现状记账，不动配置内容。`kept-differs` 走这里 = 「认下用户改的这份」，
  // 与 `restore`（按 AIOS 形状重装）是两个人工决定，二者互斥。
  if (adopt && !restore && (verdict.status === 'external' || verdict.status === 'kept-differs')) {
    if (!checkRevision()) return { status: 'stale-preview', reason: 'preview-revision-changed' };
    try {
      const recorded = await recordOwnership({ clientId, scope, serverName, entry: actual, configPath: filePath, landing: landingFor(clientId, scope).landing, origin: 'adopted' }, ledgerOptions);
      return { status: 'adopted', classification: classifyMcpOwnership({ actual, desired, ledgerEntry: recorded.record }), record: recorded.record, wrote: false, serverName };
    } catch (error) {
      return { ...ledgerUnavailable(error), serverName };
    }
  }

  // restore 路径：owned/conflict/kept-differs 且形状过期 → **原地替换**（w5a 的 replace 原语）。
  // 为什么不再「先卸再装」：remove+insert 会把 TOML 的 `[mcp_servers.x]` 节搬到文件末尾、
  // 把 JSON 的键挪到桶尾，位置一变，别人写在相邻行上的注释就错位了；条目内容等价不是「无损」，
  // 字节位置也是门的一部分。卸不掉的情况（条目其实不存在）由 replaceServer 如实返回 `not-found`。
  const replacing = restore && (verdict.status === 'conflict' || verdict.status === 'kept-differs');

  const written = replacing
    ? await replaceServer({ clientId, scope, serverName, entry: desired, filePath, backupDir, targets, checkRevision })
    : await writeServer({ clientId, scope, serverName, entry: desired, filePath, backupDir, targets, checkRevision });
  if (written.status === 'unchanged') {
    const ledgerNote = await markVerified({ clientId, scope, serverName, fingerprint: fingerprintMcpEntry(desired) }, ledgerOptions);
    return { ...written, classification: verdict, entryClass: allowed.entryClass, serverName, ledgerNote };
  }
  if (written.status !== 'created' && written.status !== 'updated' && written.status !== 'replaced') return { ...written, classification: verdict, serverName };

  try {
    const { landing, rootKeyValues } = landingFor(clientId, scope);
    const recorded = await recordOwnership({
      clientId, scope, serverName, entry: desired, configPath: filePath, landing,
      origin: 'aios', bucketCreated: written.createdBucket === true || record?.bucketCreated === true,
      // 本次补的桶外根键连着**当时的默认值**一起记：卸载时只有「值仍是这个默认值」才回收它。
      // 值被人改过 = 这条目已被采纳，删它等于改别人的配置（与 `createdBucket` 同一套 provenance）。
      // 同一条目可能先建过桶再补过键，两次写入的 provenance 都要留住，所以这里与旧记录取并集。
      rootKeysCreated: [...new Set([...(record?.rootKeysCreated || []), ...(written.createdRootKeys || [])])],
      rootKeyValues: { ...rootKeyValues, ...(record?.rootKeyValues || {}) },
    }, ledgerOptions);
    return {
      status: restore ? 'restored' : 'installed',
      classification: classifyMcpOwnership({ actual: desired, desired, ledgerEntry: recorded.record }),
      entryClass: allowed.entryClass,
      record: recorded.record,
      backupPath: written.backupPath,
      createdBucket: written.createdBucket,
      createdRootKeys: written.createdRootKeys || [],
      // 界面/证据卡要说「你提交的字段在这里叫什么」——不说这一步，交付方会以为配置里写的是自己给的名字。
      renamed: landingShape.renamed,
      serverName,
    };
  } catch (error) {
    return failWithRollback({ error, filePath, backupPath: written.backupPath, existedBefore, committedFingerprint: written.committedFingerprint, serverName });
  }
}

/**
 * 卸载一个 MCP server。默认只动 AIOS 拥有（或已接管）的条目。
 * `force` 是人工覆盖位，但只覆盖一种：`kept-differs`（AIOS 登记过、之后被人改过）。
 * 从未归 AIOS 的 `external` 条目删前必须 `adopt`，force 不是绕过接管的口子——用户的规则是「别人的要显式接管」。
 */
async function uninstall({
  clientId, scope, serverName, filePath,
  dryRun = false, backupDir = '', ledgerDir = '', writeImpl, targets, adopt = false, force = false,
  checkRevision,
} = {}) {
  const ledgerOptions = { ledgerDir, writeImpl };
  const opened = await openLedger(clientId, ledgerOptions);
  if (!opened.ok) return { ...opened.failure, serverName };
  const record = opened.ledger.entries[ledgerKeyFor(scope, serverName)] || null;

  const read = readServers({ clientId, scope, filePath, targets });
  if (read.status !== 'ok' && read.status !== 'absent') return { ...read, serverName };
  const actual = read.entries?.[serverName] ?? null;
  if (!checkRevision()) return { status: 'stale-preview', reason: 'preview-revision-changed' };
  const verdict = classifyMcpOwnership({ actual, ledgerEntry: record });
  if (opened.ledger.corrupt) return { status: actual && !adopt ? 'refused-external' : 'rejected', reason: 'ledger-invalid', classification: verdict, serverName };

  if (verdict.status === 'absent') return { status: 'not-found', classification: verdict, serverName };
  if (verdict.status === 'external' && !adopt) {
    // 这里不给 force 开口子：force 只覆盖「AIOS 登记过、之后被人改过」那一种，从未归 AIOS 的必须先 adopt。
    return refuseExternal({ verdict, serverName, message: '这个条目从未归 AIOS，删除前必须显式接管（adopt）。force 只覆盖「登记后被改过」那一种。' });
  }
  if (verdict.status === 'kept-differs' && !force) {
    return {
      status: 'kept-differs',
      classification: verdict,
      reason: verdict.reason,
      message: '条目在 AIOS 登记后被改过，默认不删：要删需要人工确认 force。',
      serverName,
    };
  }

  // 桶外根键的回收与桶同理：只有账本证明「这个键是 AIOS 当初补的」才回收，值还被改过就不碰（在 writer 里判）。
  const rootKeyProvenance = {
    dropRootKeys: record?.rootKeysCreated || [],
    rootKeyValues: record?.rootKeyValues || {},
  };

  if (dryRun) {
    const planned = await removeServer({ clientId, scope, serverName, filePath, dryRun: true, targets, ...rootKeyProvenance });
    return { status: planned.status === 'planned' ? 'planned' : planned.status, classification: verdict, serverName, dryRun: true };
  }

  const off = await removeServer({
    clientId, scope, serverName, filePath, backupDir, checkRevision,
    dropEmptyBucket: record?.bucketCreated === true, targets, ...rootKeyProvenance,
  });
  if (off.status !== 'removed') return { ...off, classification: verdict, serverName };

  try {
    const released = await releaseOwnership({ clientId, scope, serverName }, ledgerOptions);
    return { status: 'uninstalled', classification: verdict, backupPath: off.backupPath, residue: off.residue, droppedRootKeys: off.droppedRootKeys, released: released.released, serverName };
  } catch (error) {
    // 卸到这一步配置文件必然是存在的（absent 早在上面就走掉了），所以 existedBefore 传 true。
    return failWithRollback({ error, filePath, backupPath: off.backupPath, existedBefore: true, committedFingerprint: off.committedFingerprint, serverName });
  }
}

/** 只读核验：对象表与 doctor 读它。不写账本、不碰配置。 */
export async function verifyServer({ clientId, scope, serverName, filePath, ledgerDir = '', desired = null, targets } = {}) {
  // `desired` 也走同一条改名：doctor 拿规范形状去比一份落地形状的条目，会比出永不消失的幽灵 conflict。
  const shape = desired === null ? null : normalizeEntryForLanding(clientId, scope, desired);
  const effectiveDesired = shape && shape.ok ? shape.entry : desired;
  const opened = await openLedger(clientId, { ledgerDir });
  if (!opened.ok) return { ...opened.failure, serverName };
  const record = opened.ledger.entries[ledgerKeyFor(scope, serverName)] || null;
  const read = readServers({ clientId, scope, filePath, targets });
  if (read.status !== 'ok' && read.status !== 'absent') return { ...read, serverName };
  const actual = read.entries?.[serverName] ?? null;
  return {
    status: 'verified',
    serverName,
    classification: classifyMcpOwnership({ actual, desired: effectiveDesired, ledgerEntry: record }),
    landing: landingFor(clientId, scope).landing,
    ledgerCorrupt: opened.ledger.corrupt || '',
    record,
  };
}
