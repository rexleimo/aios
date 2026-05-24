/* 中文注释：Proof 链路用唯一哨兵、raw ref 和 metrics 同时证明压缩真实发生。 */
import { createJsonRpcProxyHandler } from './mcp/json-rpc-proxy.mjs';
import { readMetricsRecords } from './metrics/metrics-sink.mjs';
import { readRawRef } from './refs/raw-ref-store.mjs';
import { runShellEnvelope } from './shell/shell-wrapper.mjs';
import { buildCapabilityMatrix, inspectMcpProxyTargets } from './clients/capabilities.mjs';

/* 中文注释：没有显式 session 时生成时间戳 session，避免 proof 多次运行互相污染指标。 */
function makeSessionId(raw = '') {
  const value = String(raw || '').trim();
  if (value) return value;
  /* 中文注释：默认 session 必须带毫秒、pid 和随机后缀，避免 proof/doctor 并发运行时写进同一个 metrics 文件。 */
  const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 17);
  const nonce = Math.random().toString(36).slice(2, 8);
  return `interception-proof-${stamp}-${process.pid}-${nonce}`;
}

/* 中文注释：proof 失败必须抛出明确错误；不能用“看起来省了”这种主观判断。 */
function assertProof(condition, message) {
  if (!condition) throw new Error(message);
}

/* 中文注释：单包验证同时检查 packet 不泄漏、ref 可召回、指标有节省，三者缺一不可。 */
async function verifyPacket({ workspaceRoot, sessionId, packet, sentinel, source }) {
  /* 中文注释：sentinel 是可机读泄漏探针：raw 里必须存在，compact packet 里必须不存在。 */
  assertProof(packet?.type === 'aios.compact_packet', `${source}: missing compact packet`);
  assertProof(JSON.stringify(packet).includes(sentinel) === false, `${source}: raw sentinel leaked into compact packet`);
  assertProof(Array.isArray(packet.refs) && packet.refs.length === 1, `${source}: expected exactly one raw ref`);
  assertProof(packet.metrics?.raw_bytes > 64, `${source}: raw_bytes metric missing`);
  assertProof(packet.metrics?.saved_bytes > 0, `${source}: saved_bytes metric missing`);
  assertProof(packet.metrics?.saving_ratio > 0.5, `${source}: saving_ratio too low`);
  const recalled = await readRawRef({ workspaceRoot, sessionId, refId: packet.refs[0].ref_id });
  assertProof(recalled?.raw?.includes(sentinel), `${source}: raw ref recall failed`);
  return {
    ok: true,
    ref_id: packet.refs[0].ref_id,
    raw_bytes: packet.metrics.raw_bytes,
    compact_bytes: packet.metrics.compact_bytes,
    saved_bytes: packet.metrics.saved_bytes,
    saving_ratio: packet.metrics.saving_ratio,
    raw_tokens_estimate: packet.metrics.raw_tokens_estimate,
    compact_tokens_estimate: packet.metrics.compact_tokens_estimate,
  };
}

/* 中文注释：端到端 proof 同时打 shell 和 MCP 两条链路，避免只证明其中一侧。 */
export async function runInterceptionProof(options = {}, { rootDir = process.cwd(), io = console, clientHomes = {} } = {}) {
  const sessionId = makeSessionId(options.sessionId || options.session);
  const shellSentinel = `AIOS_SHELL_PROOF_${sessionId}`.replace(/[^A-Z0-9_]/gi, '_');
  const mcpSentinel = `AIOS_MCP_PROOF_${sessionId}`.replace(/[^A-Z0-9_]/gi, '_');

  /* 中文注释：shell proof 构造大 stdout 加一条错误行，验证摘要、错误提取、raw ref 和 metrics。 */
  const shellPacket = await runShellEnvelope({
    envelope: {
      command: process.execPath,
      args: ['-e', `console.log(${JSON.stringify(shellSentinel)}.repeat(200)); console.error('ERROR at src/interception-proof-shell.ts:9')`],
      cwd: rootDir,
    },
    workspaceRoot: rootDir,
    sessionId,
    host: 'aios-harness',
    thresholds: { minRawBytes: 64 },
    metrics: { enabled: true },
  });

  /* 中文注释：MCP proof 用假的 forward 模拟大 tools/call 响应，验证代理不需要真实浏览器也能自测。 */
  const mcpHandler = createJsonRpcProxyHandler({
    workspaceRoot: rootDir,
    sessionId,
    host: 'generic-mcp',
    thresholds: { minRawBytes: 64 },
    metrics: { enabled: true },
    forward: async (message) => ({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        content: [{ type: 'text', text: `<main>${mcpSentinel.repeat(200)}</main>` }],
      },
    }),
  });
  const mcpResponse = await mcpHandler({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'page.get_html', arguments: {} },
  });
  const mcpPacket = mcpResponse.result;

  const shell = await verifyPacket({ workspaceRoot: rootDir, sessionId, packet: shellPacket, sentinel: shellSentinel, source: 'shell' });
  const mcp = await verifyPacket({ workspaceRoot: rootDir, sessionId, packet: mcpPacket, sentinel: mcpSentinel, source: 'mcp' });
  const metrics = await readMetricsRecords({ workspaceRoot: rootDir, sessionId });
  /* 中文注释：只统计本次 proof 生成的 ref，避免同 session 历史记录影响节省率判断。 */
  const currentMetrics = metrics.filter((item) => item.ref_id === shell.ref_id || item.ref_id === mcp.ref_id);
  const metricRefIds = new Set(currentMetrics.map((item) => item.ref_id));
  assertProof(metricRefIds.has(shell.ref_id), 'metrics: shell ref missing');
  assertProof(metricRefIds.has(mcp.ref_id), 'metrics: mcp ref missing');

  const totalRawBytes = currentMetrics.reduce((sum, item) => sum + Number(item.raw_bytes || 0), 0);
  const totalCompactBytes = currentMetrics.reduce((sum, item) => sum + Number(item.compact_bytes || 0), 0);
  const totalSavedBytes = currentMetrics.reduce((sum, item) => sum + Number(item.saved_bytes || 0), 0);
  const result = {
    ok: true,
    session_id: sessionId,
    shell,
    mcp,
    metrics: {
      records: currentMetrics.length,
      total_raw_bytes: totalRawBytes,
      total_compact_bytes: totalCompactBytes,
      total_saved_bytes: totalSavedBytes,
      saving_ratio: totalRawBytes > 0 ? Number((totalSavedBytes / totalRawBytes).toFixed(4)) : 0,
      raw_contains_sentinel: false,
    },
    mcp_proxy_targets: inspectMcpProxyTargets({ rootDir, clientHomes }),
    capability_matrix: buildCapabilityMatrix(rootDir),
    exitCode: 0,
  };

  /* 中文注释：JSON 输出给自动化验收用；文本输出给人快速看节省率和 ref。 */
  if (options.json) {
    io.log(JSON.stringify(result, null, 2));
  } else {
    io.log('AIOS Interception Proof');
    io.log('-----------------------');
    io.log(`session=${result.session_id}`);
    io.log(`shell saved=${shell.saved_bytes}/${shell.raw_bytes} ratio=${shell.saving_ratio} ref=${shell.ref_id}`);
    io.log(`mcp saved=${mcp.saved_bytes}/${mcp.raw_bytes} ratio=${mcp.saving_ratio} ref=${mcp.ref_id}`);
    io.log(`total saved=${result.metrics.total_saved_bytes}/${result.metrics.total_raw_bytes} ratio=${result.metrics.saving_ratio}`);
    io.log('raw_sentinel_leaked=false');
  }
  return result;
}
