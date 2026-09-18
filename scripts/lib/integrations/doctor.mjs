// scripts/lib/integrations/doctor.mjs — 厂商集成的体检。
// 硬门槛只有两个：文档 MCP 端点真实握手成功，且声明的工具全部存在；
// 客户端侧如实区分 registered / external / conflict / client-missing / manual-step-required，
// 未验证的客户端绝不写成 "installed"。
import os from 'node:os';

import { getClientHomes } from '../platform/paths.mjs';
import { describeManualTarget, getIntegrationClientEntry, resolveIntegrationClientCommand, resolveIntegrationClientOrder } from './clients.mjs';
import { defaultCommandExistsImpl } from './install.mjs';
import { fingerprintMcpEntry, normalizeMcpEntry, readIntegrationLedger } from './ledger.mjs';
import { buildClientDesiredEntry, probeDocsMcp, readConfigEntryFor } from './mcp.mjs';
import { hashCatalogEntry, hashCatalogUpstreamBody, skillCatalogDir } from './skill.mjs';

export function checkEnvVars(integration, { env = process.env } = {}) {
  return integration.env.map((entry) => ({
    name: entry.name,
    required: entry.required,
    present: Object.prototype.hasOwnProperty.call(env, entry.name),
    // 只报告存在性，永不读取或回显值。
    issueUrl: entry.issueUrl,
  }));
}

export function checkSkillPlane({ rootDir, integration, ledger }) {
  const catalogPath = skillCatalogDir(rootDir, integration);
  // 归属判定看的是"剥掉 AIOS 注入的 frontmatter 后是否仍等于上游钉住的内容"，
  // 因为 AIOS 自己会往 catalog 副本里写内部 frontmatter，全文件哈希必然不同。
  const upstreamBody = hashCatalogUpstreamBody(rootDir, integration);
  const fullFile = hashCatalogEntry(rootDir, integration);
  const recorded = ledger?.skill || null;
  if (!upstreamBody) {
    return { status: 'absent', catalogPath, expectedSha256: integration.skill.sha256 };
  }
  if (!recorded) {
    return { status: 'external', catalogPath, currentSha256: upstreamBody };
  }
  const pinnedChanged = recorded.sha256 !== integration.skill.sha256;
  const bodyMatches = upstreamBody === recorded.sha256;
  const catalogMatches = !recorded.catalogSha256 || fullFile === recorded.catalogSha256;
  if (!bodyMatches) {
    return {
      status: 'modified',
      catalogPath,
      recordedSha256: recorded.sha256,
      currentSha256: upstreamBody,
    };
  }
  if (pinnedChanged) {
    return {
      status: 'drift',
      catalogPath,
      recordedSha256: recorded.sha256,
      expectedSha256: integration.skill.sha256,
      currentSha256: upstreamBody,
    };
  }
  return {
    status: 'ok',
    catalogPath,
    currentSha256: upstreamBody,
    commit: recorded.commit,
    catalogMatches,
  };
}

export function checkClientPlane({ client, integration, clientHome, projectRoot, ledger, commandExistsImpl, isTTY = false }) {
  const entry = getIntegrationClientEntry(client);
  const ledgerEntry = ledger.entries?.[client] || null;
  if (!entry) return { client, status: 'unsupported', reason: 'no-client-table-entry' };
  if (entry.transport === 'manual') {
    // 客户端根本没装时，先报这个：往一个不存在的 home 里写配置是无效动作。
    if (!commandExistsImpl(entry.binary || resolveIntegrationClientCommand(client))) {
      return {
        client,
        status: 'client-missing',
        reason: `client binary "${entry.binary || resolveIntegrationClientCommand(client)}" not found on PATH`,
      };
    }
    const target = describeManualTarget(client, { clientHome, projectRoot, integration });
    return {
      client,
      status: 'manual-step-required',
      reason: entry.unverifiedReason,
      evidence: entry.evidence,
      configPath: target?.path || '',
      snippet: target?.snippet || null,
    };
  }

  if (entry.transport === 'config') {
    const current = readConfigEntryFor({ client, serverName: integration.mcp.serverName, clientHome, projectRoot });
    if (current.parseError) return { client, status: 'failed', reason: `config-parse-failed: ${current.parseError}` };
    if (!current.entry) {
      return ledgerEntry
        ? { client, status: 'missing', reason: 'ledger-records-registration-but-config-entry-is-gone' }
        : { client, status: 'absent', configPath: current.targetPath };
    }
    const desired = buildClientDesiredEntry(client, integration);
    const currentFingerprint = fingerprintMcpEntry(normalizeMcpEntry(current.entry));
    const desiredFingerprint = fingerprintMcpEntry(normalizeMcpEntry(desired));
    if (currentFingerprint !== desiredFingerprint) {
      return { client, status: 'conflict', reason: 'entry-differs-from-desired', configPath: current.targetPath };
    }
    if (!ledgerEntry) return { client, status: 'external', configPath: current.targetPath };
    if (ledgerEntry.fingerprint !== currentFingerprint) {
      return { client, status: 'conflict', reason: 'entry-changed-after-aios-registration', configPath: current.targetPath };
    }
    return { client, status: 'ok', configPath: current.targetPath, fingerprint: currentFingerprint };
  }

  const binary = entry.binary || resolveIntegrationClientCommand(client);
  if (!commandExistsImpl(binary)) {
    return {
      client,
      status: 'client-missing',
      reason: `client binary "${binary}" not found on PATH`,
      verified: entry.verified,
    };
  }
  if (!entry.verified) {
    return { client, status: 'manual-step-required', reason: entry.unverifiedReason, evidence: entry.evidence };
  }
  if (!ledgerEntry) {
    if (entry.interactive && !isTTY) {
      return {
        client,
        status: 'pending-interactive',
        reason: entry.manualHint || 'client requires an interactive terminal',
      };
    }
    return { client, status: 'absent', reason: 'aios has no registration record for this client' };
  }
  if (entry.interactive) {
    return {
      client,
      status: 'ok',
      recordedAt: ledgerEntry.lastVerifiedAt || ledgerEntry.createdAt,
      verification: 'manual-interactive',
    };
  }
  return { client, status: 'ok', recordedAt: ledgerEntry.lastVerifiedAt || ledgerEntry.createdAt, verification: 'cli-exit-0' };
}

export async function runIntegrationDoctor({
  rootDir,
  projectRoot = rootDir,
  integration,
  clients = 'all',
  env = process.env,
  homeDir = os.homedir(),
  fetchImpl = globalThis.fetch,
  commandExistsImpl,
  isTTY = Boolean(process.stdin.isTTY),
  probeImpl = probeDocsMcp,
  ledgerOptions = {},
  timeoutMs,
} = {}) {
  const homes = getClientHomes(env, homeDir);
  const ledger = readIntegrationLedger(integration.id, { ...ledgerOptions, env, homeDir });
  const requested = !clients || clients === 'all'
    ? resolveIntegrationClientOrder()
    : (Array.isArray(clients) ? clients : String(clients).split(',').map((item) => item.trim()).filter(Boolean));

  const exists = commandExistsImpl || defaultCommandExistsImpl;
  const clientsReport = requested.map((client) => checkClientPlane({
    client,
    integration,
    clientHome: homes[client],
    projectRoot,
    ledger,
    commandExistsImpl: exists,
    isTTY,
  }));

  const probe = await probeImpl(integration, { ...(fetchImpl ? { fetchImpl } : {}), ...(timeoutMs ? { timeoutMs } : {}) });

  const registeredOk = clientsReport.filter((item) => item.status === 'ok').length;
  const blocking = clientsReport.filter((item) => ['conflict', 'failed', 'missing'].includes(item.status));
  const ok = probe.status === 'verified' && blocking.length === 0;

  return {
    vendor: integration.id,
    displayName: integration.displayName,
    ok,
    probe,
    env: checkEnvVars(integration, { env }),
    skill: checkSkillPlane({ rootDir, integration, ledger }),
    clients: clientsReport,
    summary: {
      registered: registeredOk,
      blocking: blocking.length,
      clientMissing: clientsReport.filter((item) => item.status === 'client-missing').length,
      manualStepRequired: clientsReport.filter((item) => item.status === 'manual-step-required').length,
      pendingInteractive: clientsReport.filter((item) => item.status === 'pending-interactive').length,
      external: clientsReport.filter((item) => item.status === 'external').length,
      absent: clientsReport.filter((item) => item.status === 'absent').length,
    },
    ledgerPath: ledger.__path || '',
  };
}
