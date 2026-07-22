/* 中文注释：Doctor 链路负责修复默认配置，并检查 MCP 代理、能力矩阵和指标出口是否连通。 */
import { readFile } from 'node:fs/promises';

import { getClientHomes } from '../platform/paths.mjs';
import { PRIMARY_BROWSER_ALIAS, SHELL_ALIAS } from '../components/browser/constants.mjs';
import { migrateBrowserMcpConfig } from '../components/browser.mjs';
import { buildCapabilityMatrix, inspectMcpProxyTargets } from './clients/capabilities.mjs';
import { runInterceptionProof } from './proof.mjs';
import { resolveMetricsFile } from './tail.mjs';

/* 中文注释：浏览器 MCP 必须直连；shell MCP 保留代理时只作为兼容状态展示。 */
function statusFromTargets(targets = []) {
  const existing = targets.filter((item) => item.exists);
  const browserResults = targets.flatMap((item) => item.aliasResults || [])
    .filter((item) => item.alias === PRIMARY_BROWSER_ALIAS);
  const requiredBrowserResults = targets.filter((item) => item.required).map((item) => (
    (item.aliasResults || []).find((result) => result.alias === PRIMARY_BROWSER_ALIAS)
  ));
  const shellResults = targets.flatMap((item) => item.aliasResults || [])
    .filter((item) => item.alias === SHELL_ALIAS);
  const missingRequiredBrowser = requiredBrowserResults.filter((item) => !item?.hasAlias).length;
  const legacyRequiredBrowserProxy = requiredBrowserResults.filter((item) => item?.hasAlias && item.proxied).length;
  return {
    total: targets.length,
    existing: existing.length,
    direct_browser: browserResults.filter((item) => item.hasAlias && !item.proxied).length,
    legacy_browser_proxy: browserResults.filter((item) => item.hasAlias && item.proxied).length,
    missing_required_browser: missingRequiredBrowser,
    legacy_required_browser_proxy: legacyRequiredBrowserProxy,
    proxied_shell: shellResults.filter((item) => item.hasAlias && item.proxied).length,
    ok: missingRequiredBrowser === 0 && legacyRequiredBrowserProxy === 0,
  };
}

async function readMetricsFileRecords(filePath) {
  const text = await readFile(filePath, 'utf8');
  return text.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

function analyzeTurnCompliance(records = []) {
  const turnRecords = records.filter((record) => String(record.kind || '').startsWith('agent.')
    || ['pre_send', 'post_receive', 'uncontrolled_host_output'].includes(String(record.event_kind || '')));
  const preSend = turnRecords.filter((record) => record.event_kind === 'pre_send');
  const postReceive = turnRecords.filter((record) => record.event_kind === 'post_receive');
  const violations = turnRecords.filter((record) => record.policy_violation === true || record.event_kind === 'uncontrolled_host_output');
  return {
    ok: preSend.length > 0 && postReceive.length > 0 && violations.length === 0,
    pre_send: preSend.length,
    post_receive: postReceive.length,
    policy_violations: violations.length,
    latest_event_kind: turnRecords.at(-1)?.event_kind || '',
    latest_client_id: turnRecords.at(-1)?.client_id || '',
  };
}

async function checkLatestTurnCompliance({ workspaceRoot, session = '', latest = true } = {}) {
  const file = await resolveMetricsFile(workspaceRoot, { session, latest });
  if (!file) {
    return {
      ok: false,
      session_id: session || '',
      file_path: '',
      error: 'No interception metrics session found',
      pre_send: 0,
      post_receive: 0,
      policy_violations: 0,
    };
  }
  const records = await readMetricsFileRecords(file.path);
  return {
    session_id: file.sessionId,
    file_path: file.path,
    total_records: records.length,
    ...analyzeTurnCompliance(records),
  };
}

/* 中文注释：doctor 是运维入口：先看配置，必要时修复，再跑 proof 用真实指标证明链路可用。 */
export async function runInterceptionDoctor(options = {}, { rootDir = process.cwd(), projectRoot = rootDir, io = console, env = process.env, clientHomes = null } = {}) {
  const homes = clientHomes || getClientHomes(env);
  const mcpAliases = [PRIMARY_BROWSER_ALIAS, SHELL_ALIAS];
  const beforeTargets = inspectMcpProxyTargets({ rootDir, clientHomes: homes, aliases: mcpAliases });
  const shouldEnforceTurns = Boolean(options.enforceTurns);
  const turnCompliancePromise = shouldEnforceTurns
    ? checkLatestTurnCompliance({
      workspaceRoot: projectRoot || rootDir,
      session: options.session || '',
      latest: true,
    })
    : Promise.resolve({ ok: true, enforced: false });
  let migrationResult = null;
  if (options.fix) {
    /* 中文注释：--fix 只迁移浏览器 MCP 到直连 launcher，不写入未托管的上游服务。 */
    migrationResult = await migrateBrowserMcpConfig({
      rootDir,
      dryRun: Boolean(options.dryRun),
      clientHomes: homes,
      io: options.json ? { log() {} } : io,
    });
  }
  const afterTargets = inspectMcpProxyTargets({ rootDir, clientHomes: homes, aliases: mcpAliases });
  /* 中文注释：配置看起来正确不代表链路真的压缩，所以 doctor 必须再跑一次 live proof。 */
  const proof = await runInterceptionProof({ sessionId: options.sessionId || options.session, json: false }, { rootDir: projectRoot || rootDir, io: { log() {} }, clientHomes: homes });
  const mcpDelivery = statusFromTargets(afterTargets);
  const turnCompliance = { enforced: shouldEnforceTurns, ...(await turnCompliancePromise) };
  const result = {
    ok: proof.ok && mcpDelivery.ok && turnCompliance.ok,
    exitCode: proof.ok && mcpDelivery.ok && turnCompliance.ok ? 0 : 1,
    rootDir,
    projectRoot,
    fix: Boolean(options.fix),
    dryRun: Boolean(options.dryRun),
    mcp_delivery: mcpDelivery,
    migration: migrationResult,
    targets_before: beforeTargets,
    targets_after: afterTargets,
    proof: {
      session_id: proof.session_id,
      shell: proof.shell,
      mcp: proof.mcp,
      metrics: proof.metrics,
      turn_compression_matrix: proof.turn_compression_matrix,
    },
    turn_compliance: turnCompliance,
    capability_matrix: buildCapabilityMatrix(rootDir),
  };

  /* 中文注释：JSON 模式给 CI/发布门禁读，文本模式给本地 operator 看。 */
  if (options.json) {
    io.log(JSON.stringify(result, null, 2));
  } else {
    io.log('AIOS Interception Doctor');
    io.log('------------------------');
    io.log(`MCP delivery: direct_browser=${mcpDelivery.direct_browser} legacy_browser_proxy=${mcpDelivery.legacy_browser_proxy} missing_required_browser=${mcpDelivery.missing_required_browser} proxied_shell=${mcpDelivery.proxied_shell}`);
    if (migrationResult) {
      io.log(`Migration: created=${migrationResult.created} updated=${migrationResult.updated} unchanged=${migrationResult.unchanged} errors=${migrationResult.errors} dryRun=${migrationResult.dryRun}`);
    }
    io.log(`Proof: session=${proof.session_id} total_saved=${proof.metrics.total_saved_bytes}/${proof.metrics.total_raw_bytes} ratio=${proof.metrics.saving_ratio}`);
    if (shouldEnforceTurns) {
      io.log(`Turn compliance: session=${turnCompliance.session_id || '(none)'} pre_send=${turnCompliance.pre_send} post_receive=${turnCompliance.post_receive} violations=${turnCompliance.policy_violations}`);
    } else {
      io.log('Turn compliance: not enforced; pass --enforce-turns to check latest real agent metrics');
    }
    io.log(result.ok ? '[ok] MCP delivery and interception runtime verified' : '[fail] browser MCP needs direct migration or turn compression is missing');
  }
  return result;
}
