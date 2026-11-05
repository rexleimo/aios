// scripts/lib/clients/mcp/install-policy.mjs — 归属门 + 允许集合门 + w2 写入门的合成层（w3）。
//
// 顺序就是安全顺序，任何一步失败都不许留下「配置已改但没人认领」的孤儿：
//   1. 每客户端允许集合（`entry-classes.mjs`）——身份不对的条目连落点都不去碰；
//   2. 账本先读得到才允许动磁盘：读不到 = `ledger-unavailable`，**只读面**（计划的回退点）；
//   3. 归属判定（`ledger.mjs` 的 absent/owned/kept-differs/external/conflict）；
//   4. 落点白名单 + 文本手术（`server-writer.mjs`）；
//   5. 记账；记账失败即回滚配置（有备份用备份，本次新建的文件则删掉自己建的那份）。
//
// 三条产品性拒绝，都是 ADR 0008 决策 3/5/8 的直接兑现，不给糊话理由：
//   · `external` 未被接管 → 不写不删，`nextAction` 指 `adopt`；
//   · `kept-differs` → 用户手改过的条目归用户，默认拒绝，理由沿用 headroom 的原文
//     `entry-changed-after-aios-registration`（`headroom-mcp/lifecycle.mjs:119`）；
//   · pi 的 shell/auth → 拒绝并附策略原文与引用行。
// `force` / `adopt` 是**人工决定**的入口，必须由上层（w4 CLI、w6 界面）显式传 true；
// 本层绝不从关键词或默认值里猜出「用户大概想覆盖」。
import fs from 'node:fs';

import { readServers, removeServer, writeServer } from './server-writer.mjs';
import { assertEntryClassAllowed } from './entry-classes.mjs';
import {
  classifyMcpOwnership,
  fingerprintMcpEntry,
  ledgerKeyFor,
  readMcpLedger,
  recordOwnership,
  releaseOwnership,
  touchVerified,
} from './ledger.mjs';

function ledgerUnavailable(error) {
  return { status: 'rejected', reason: 'ledger-unavailable', detail: error instanceof Error ? error.message : String(error) };
}

/** 配置改完但账本没记上时的补偿：能回滚就回滚，不能就把事实说清楚。 */
async function rollbackConfig(filePath, backupPath, existedBefore) {
  try {
    if (existedBefore && backupPath) {
      await fs.promises.copyFile(backupPath, filePath);
      return 'restored-from-backup';
    }
    if (!existedBefore) {
      await fs.promises.rm(filePath, { force: true });
      return 'removed-created-file';
    }
    return 'no-rollback-available';
  } catch (error) {
    return `rollback-failed: ${error instanceof Error ? error.message : String(error)}`;
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

/**
 * 账本写不进去时的补偿，两处写路径共用：配置退回改前，理由照实说。
 * 之前这里有两段几乎一样的 catch——同一件事写两遍就是两条会各自漂移的补偿路径。
 */
async function failWithRollback({ error, filePath, backupPath, existedBefore, serverName, message }) {
  const rolledBack = await rollbackConfig(filePath, backupPath, existedBefore);
  return { ...ledgerUnavailable(error), rolledBack, serverName, message };
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
export async function installServer({
  clientId, scope, serverName, entry, filePath,
  dryRun = false, backupDir = '', ledgerDir = '', writeImpl, targets,
  browserRuntimeInstalled = false, adopt = false, restore = false,
} = {}) {
  const ledgerOptions = { ledgerDir, writeImpl };
  const allowed = assertEntryClassAllowed({ clientId, serverName, browserRuntimeInstalled });
  if (!allowed.ok) {
    return { status: 'rejected', ...allowed, serverName, clientId, scope };
  }

  const opened = await openLedger(clientId, ledgerOptions);
  if (!opened.ok) return { ...opened.failure, serverName, clientId, scope };
  const key = ledgerKeyFor(scope, serverName);
  const record = opened.ledger.entries[key] || null;

  const read = readServers({ clientId, scope, filePath, targets });
  if (read.status !== 'ok' && read.status !== 'absent') return { ...read, serverName };
  const actual = read.entries?.[serverName] ?? null;
  const existedBefore = read.status === 'ok';
  const verdict = classifyMcpOwnership({ actual, desired: entry, ledgerEntry: record });

  if (verdict.status === 'owned' && !verdict.desiredFingerprint) {
    const ledgerNote = await markVerified({ clientId, scope, serverName, fingerprint: verdict.actualFingerprint }, ledgerOptions);
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
    const planned = await writeServer({ clientId, scope, serverName, entry, filePath, dryRun: true, targets });
    return { status: planned.status === 'planned' ? 'planned' : planned.status, classification: verdict, planned, serverName, dryRun: true };
  }

  // 接管路径：只按磁盘现状记账，不动配置内容。`kept-differs` 走这里 = 「认下用户改的这份」，
  // 与 `restore`（按 AIOS 形状重装）是两个人工决定，二者互斥。
  if (adopt && !restore && (verdict.status === 'external' || verdict.status === 'kept-differs')) {
    try {
      const recorded = await recordOwnership({ clientId, scope, serverName, entry: actual, configPath: filePath, landing: read.landing, origin: 'adopted' }, ledgerOptions);
      return { status: 'adopted', classification: classifyMcpOwnership({ actual, desired: entry, ledgerEntry: recorded.record }), record: recorded.record, wrote: false, serverName };
    } catch (error) {
      return { ...ledgerUnavailable(error), serverName };
    }
  }

  // restore 路径：owned/conflict 且形状过期 → 先卸再装。卸不掉就停，不带着旧条目去写新的。
  if (restore && (verdict.status === 'conflict' || verdict.status === 'kept-differs')) {
    const off = await removeServer({ clientId, scope, serverName, filePath, backupDir, dropEmptyBucket: record?.bucketCreated === true, targets });
    if (off.status !== 'removed') return { status: off.status, reason: off.reason, stage: 'restore-remove', classification: verdict, serverName };
  }

  const written = await writeServer({ clientId, scope, serverName, entry, filePath, backupDir, targets });
  if (written.status === 'unchanged') {
    const ledgerNote = await markVerified({ clientId, scope, serverName, fingerprint: fingerprintMcpEntry(entry) }, ledgerOptions);
    return { ...written, classification: verdict, entryClass: allowed.entryClass, serverName, ledgerNote };
  }
  if (written.status !== 'created' && written.status !== 'updated') return { ...written, classification: verdict, serverName };

  try {
    const recorded = await recordOwnership({
      clientId, scope, serverName, entry, configPath: filePath, landing: written.landing,
      origin: 'aios', bucketCreated: written.createdBucket === true || record?.bucketCreated === true,
    }, ledgerOptions);
    return {
      status: restore ? 'restored' : 'installed',
      classification: classifyMcpOwnership({ actual: entry, desired: entry, ledgerEntry: recorded.record }),
      entryClass: allowed.entryClass,
      record: recorded.record,
      backupPath: written.backupPath,
      createdBucket: written.createdBucket,
      serverName,
    };
  } catch (error) {
    return failWithRollback({ error, filePath, backupPath: written.backupPath, existedBefore, serverName, message: '账本写不进去，配置已回滚：没有归属记录的改动不留在线上。' });
  }
}

/**
 * 卸载一个 MCP server。默认只动 AIOS 拥有（或已接管）的条目。
 * `force` 是人工覆盖位，但只覆盖一种：`kept-differs`（AIOS 登记过、之后被人改过）。
 * 从未归 AIOS 的 `external` 条目删前必须 `adopt`，force 不是绕过接管的口子——用户的规则是「别人的要显式接管」。
 */
export async function uninstallServer({
  clientId, scope, serverName, filePath,
  dryRun = false, backupDir = '', ledgerDir = '', writeImpl, targets, adopt = false, force = false,
} = {}) {
  const ledgerOptions = { ledgerDir, writeImpl };
  const opened = await openLedger(clientId, ledgerOptions);
  if (!opened.ok) return { ...opened.failure, serverName };
  const record = opened.ledger.entries[ledgerKeyFor(scope, serverName)] || null;

  const read = readServers({ clientId, scope, filePath, targets });
  if (read.status !== 'ok' && read.status !== 'absent') return { ...read, serverName };
  const actual = read.entries?.[serverName] ?? null;
  const verdict = classifyMcpOwnership({ actual, ledgerEntry: record });

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

  if (dryRun) {
    const planned = await removeServer({ clientId, scope, serverName, filePath, dryRun: true, targets });
    return { status: planned.status === 'planned' ? 'planned' : planned.status, classification: verdict, serverName, dryRun: true };
  }

  const off = await removeServer({
    clientId, scope, serverName, filePath, backupDir,
    dropEmptyBucket: record?.bucketCreated === true, targets,
  });
  if (off.status !== 'removed') return { ...off, classification: verdict, serverName };

  try {
    const released = await releaseOwnership({ clientId, scope, serverName }, ledgerOptions);
    return { status: 'uninstalled', classification: verdict, backupPath: off.backupPath, residue: off.residue, released: released.released, serverName };
  } catch (error) {
    // 卸到这一步配置文件必然是存在的（absent 早在上面就走掉了），所以 existedBefore 传 true。
    return failWithRollback({ error, filePath, backupPath: off.backupPath, existedBefore: true, serverName, message: '账本写不进去，删除已回滚。' });
  }
}

/** 只读核验：对象表与 doctor 读它。不写账本、不碰配置。 */
export async function verifyServer({ clientId, scope, serverName, filePath, ledgerDir = '', desired = null, targets } = {}) {
  const opened = await openLedger(clientId, { ledgerDir });
  if (!opened.ok) return { ...opened.failure, serverName };
  const record = opened.ledger.entries[ledgerKeyFor(scope, serverName)] || null;
  const read = readServers({ clientId, scope, filePath, targets });
  if (read.status !== 'ok' && read.status !== 'absent') return { ...read, serverName };
  const actual = read.entries?.[serverName] ?? null;
  return {
    status: 'verified',
    serverName,
    classification: classifyMcpOwnership({ actual, desired, ledgerEntry: record }),
    landing: read.landing,
    ledgerCorrupt: opened.ledger.corrupt || '',
    record,
  };
}
