import fs from 'node:fs';

import {
  classifyHeadroomOwnership,
  fingerprintHeadroomEntry,
  readHeadroomLedger,
  writeHeadroomLedger,
} from './ownership.mjs';
import { buildDesiredHeadroomEntry } from './commands.mjs';
import { inspectHeadroomMcpRegistration, resolveHeadroomConfigTargets } from './config-readers.mjs';
import { removeServer, writeServer } from '../../../clients/mcp/server-writer.mjs';
import { resolveClientFromRuntimeId } from '../../../foundation/clients/execution/runtime/identifiers.mjs';

const MCP_RUNTIME_BY_AGENT = Object.freeze({
  gemini: 'gemini-cli',
  hermes: 'hermes-agent',
  grok: 'grok-build',
});
const REQUIRED_HEADROOM_TOOLS = Object.freeze(['headroom_compress', 'headroom_retrieve', 'headroom_stats']);
const SERVER_NAME = 'headroom';
const SCOPE = 'home';

function hermesEntryUsable(entry) {
  if (!entry || entry.enabled !== true) return false;
  const tools = new Set(entry.tools || []);
  return REQUIRED_HEADROOM_TOOLS.every((name) => tools.has(name));
}

/**
 * 期望形状 → 该客户端落点上的条目。
 *
 * **w5c 的决定（2026-11-05，人拍）**：AIOS 自己写配置文件，不再 spawn 厂商 CLI（`gemini|hermes|grok mcp add`）。
 * 于是「写什么」必须由本模块自己说清楚，而不是让厂商 CLI 决定字节：
 *   · gemini / grok：`{command, args, env}`——grok 落成 `[mcp_servers.headroom]` + `[mcp_servers.headroom.env]`
 *     （真实 `~/.grok/config.toml` 就是这个形状，通用 TOML family 已支持对象→子表）；
 *   · hermes：再加 `enabled: true` 与三个工具名——hermes 会跳过没启用的 server，而这正是
 *     `hermesEntryUsable` 判「可用」的条件。**未验证**：这两列原本由 hermes CLI 写出，
 *     “手写同样两列 hermes 也认”没有实证，已在落点表标成 `unverifiedFields`，交给 w7 用真客户端验。
 */
function toHeadroomLandingEntry(runtimeId, desired) {
  const entry = {
    command: String(desired.command),
    args: [...desired.args],
    env: { ...desired.env },
  };
  if (runtimeId === 'hermes-agent') {
    entry.enabled = true;
    entry.tools = [...REQUIRED_HEADROOM_TOOLS];
  }
  return entry;
}

export async function ensureHeadroomMcpRegistration(options = {}) {
  const {
    runtimeId,
    headroomPath,
    mode = 'auto',
    consent = false,
    dryRun = false,
    profile = '',
    inspectImpl = inspectHeadroomMcpRegistration,
    // **默认 probe 不再假装成功**：旧默认是 `async () => ({ status: 'registered' })`，也就是说生产路径
    // 从来没有做过真握手，却把状态报成已验证。没有真探针时唯一诚实的说法是 `pending-smoke`
    // （“写进去了，但还没有证据证明客户端真能连上”）。真探针接入前不得把它改成 verified。
    probeImpl = async () => ({ status: 'pending-smoke' }),
    readLedgerImpl = readHeadroomLedger,
    writeLedgerImpl = writeHeadroomLedger,
    now = () => new Date().toISOString(),
  } = options;

  if (!['auto', 'on', 'off'].includes(mode)) return { status: 'failed', reason: `invalid AIOS_HEADROOM_MCP=${mode}` };

  const desired = buildDesiredHeadroomEntry(runtimeId, headroomPath);
  const landingEntry = toHeadroomLandingEntry(runtimeId, desired);
  const ledger = await readLedgerImpl(options);
  const before = await inspectImpl({ ...options, runtimeId, desired, profile });
  if (before.parseError) return { status: 'failed', reason: `config-parse-failed: ${before.parseError}` };

  const ownership = classifyHeadroomOwnership({ actual: before.actual, desired, ledgerEntry: ledger.entries?.[runtimeId] });
  if (ownership.status === 'conflict') return { status: 'conflict', configPath: before.configPath, projectShadow: before.projectShadow === true };
  if (ownership.status === 'external') return { status: 'external', configPath: before.configPath, projectShadow: before.projectShadow === true };
  if (ownership.status === 'owned') return { status: 'registered', configPath: before.configPath, projectShadow: before.projectShadow === true };
  if (mode === 'off') return { status: 'disabled', reason: 'registration-disabled' };
  if (!consent) return { status: 'pending-consent' };

  const clientId = resolveClientFromRuntimeId(runtimeId);
  if (!clientId) return { status: 'failed', reason: `unsupported-runtime: ${runtimeId}` };
  const targets = resolveHeadroomConfigTargets({ ...options, runtimeId, profile });
  const target = targets.user;
  if (!target?.path) return { status: 'failed', reason: 'no-user-config-target' };

  if (dryRun) {
    return {
      status: 'pending-smoke',
      planned: { clientId, scope: SCOPE, serverName: SERVER_NAME, configPath: target.path, entry: landingEntry },
      projectShadow: before.projectShadow === true,
    };
  }

  // 自写：与 CLI / codemap / browser / pi 同一条通用写路径（白名单 + 落盘前复核 + 备份 + 原子写）。
  const written = await writeServer({
    clientId,
    scope: SCOPE,
    serverName: SERVER_NAME,
    entry: landingEntry,
    filePath: target.path,
  });
  if (written.status !== 'created' && written.status !== 'updated' && written.status !== 'unchanged') {
    return { status: 'failed', reason: `mcp-write-${written.status}: ${written.reason || 'unknown'}`, configPath: target.path };
  }

  const after = await inspectImpl({ ...options, runtimeId, desired, profile });
  const afterFingerprint = after.actual ? fingerprintHeadroomEntry(after.actual) : '';
  const desiredFingerprint = fingerprintHeadroomEntry(desired);
  if (afterFingerprint !== desiredFingerprint) return { status: 'failed', reason: 'post-write-fingerprint-mismatch' };
  if (runtimeId === 'hermes-agent' && !hermesEntryUsable(after.actual)) {
    return { status: 'failed', reason: 'hermes-tools-not-enabled' };
  }

  const timestamp = now();
  ledger.entries[runtimeId] = {
    runtimeId,
    profile: profile || null,
    configPath: after.configPath,
    command: desired.command,
    fingerprint: afterFingerprint,
    createdAt: timestamp,
    lastVerifiedAt: timestamp,
  };
  await writeLedgerImpl(ledger, options);

  const probe = await probeImpl(desired);
  if (probe.status !== 'pending-smoke' && probe.status !== 'verified' && probe.status !== 'registered') {
    const current = await inspectImpl({ ...options, runtimeId, desired, profile });
    const safeToRollback = current.actual && fingerprintHeadroomEntry(current.actual) === afterFingerprint;
    if (safeToRollback) {
      if (written.status === 'created') {
        // 文件是本次写入新建的 → 回滚就是把它删掉。留一个空 JSON 壳不是「回到没装过的样子」，
        // 而且下一次 inspect 会把空文件当成「配置存在」，让状态更难读。
        try { await fs.promises.unlink(target.path); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
      } else {
        await removeServer({
          clientId,
          scope: SCOPE,
          serverName: SERVER_NAME,
          filePath: target.path,
          // 桶是我们建的就一起收掉：回滚不是留一个空桶。
          dropEmptyBucket: written.createdBucket === true,
        });
      }
    }
    return { status: 'failed', reason: probe.reason || 'mcp-probe-failed', rolledBack: Boolean(safeToRollback) };
  }
  return { status: probe.status, configPath: after.configPath, projectShadow: after.projectShadow === true };
}

export async function removeOwnedHeadroomMcp(options = {}) {
  const { runtimeId, profile = '', inspectImpl = inspectHeadroomMcpRegistration, ledgerEntry } = options;
  const current = await inspectImpl(options);
  if (!current.actual) return { status: 'not-found' };
  if (!ledgerEntry || fingerprintHeadroomEntry(current.actual) !== ledgerEntry.fingerprint) {
    return { status: 'conflict', reason: 'entry-changed-after-aios-registration' };
  }
  const clientId = resolveClientFromRuntimeId(runtimeId);
  if (!clientId) return { status: 'failed', reason: `unsupported-runtime: ${runtimeId}` };
  const targets = resolveHeadroomConfigTargets({ ...options, runtimeId, profile });
  const target = targets.user;
  if (!target?.path) return { status: 'failed', reason: 'no-user-config-target' };

  const removed = await removeServer({ clientId, scope: SCOPE, serverName: SERVER_NAME, filePath: target.path });
  if (removed.status !== 'removed' && removed.status !== 'not-found') {
    return { status: 'failed', reason: `mcp-remove-${removed.status}: ${removed.reason || 'unknown'}` };
  }
  const after = await inspectImpl(options);
  return after.actual ? { status: 'failed', reason: 'post-remove-entry-still-present' } : { status: 'removed' };
}

export async function ensureHeadroomMcpRegistrations({ agents = [], ...options } = {}) {
  const detected = new Set(agents.map((agent) => MCP_RUNTIME_BY_AGENT[agent]).filter(Boolean));
  const statuses = {};
  for (const runtimeId of Object.values(MCP_RUNTIME_BY_AGENT)) {
    statuses[runtimeId] = detected.has(runtimeId)
      ? (await ensureHeadroomMcpRegistration({ ...options, runtimeId })).status
      : 'not-detected';
  }
  return statuses;
}