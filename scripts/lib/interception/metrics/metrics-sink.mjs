/* 中文注释：Metrics 层记录节省率、泄漏检查和 ref 命中情况，作为完成度证明。 */
import { mkdir, readFile, appendFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';

import { resolveAiosStateRoot } from '../../aios/state-root.mjs';

/* 中文注释：每个 session 一个 JSONL 文件，方便追加写入，也方便 proof 只读当前会话指标。 */
export function metricsSessionPath(workspaceRoot, sessionId = 'default') {
  return path.join(resolveAiosStateRoot(workspaceRoot), 'interception', 'metrics', `${sanitize(sessionId)}.jsonl`);
}

/* 中文注释：metrics record 只写数字和 ref 指针，不写 raw 内容，避免审计日志反向泄漏大输出。 */
export async function writeMetricsRecord({ workspaceRoot, sessionId = 'default', packet, request, ref = null, now = () => new Date() }) {
  const filePath = metricsSessionPath(workspaceRoot, sessionId);
  await mkdir(path.dirname(filePath), { recursive: true });
  const record = {
    ts: now().toISOString(),
    session_id: sessionId,
    host: packet.host,
    source: packet.source,
    kind: request?.kind || '',
    ref_id: packet.refs?.[0]?.ref_id || ref?.refId || '',
    raw_bytes: packet.metrics.raw_bytes,
    compact_bytes: packet.metrics.compact_bytes,
    saved_bytes: packet.metrics.saved_bytes,
    saving_ratio: packet.metrics.saving_ratio,
    strategy: packet.metrics.strategy,
    raw_tokens_estimate: packet.metrics.raw_tokens_estimate,
    compact_tokens_estimate: packet.metrics.compact_tokens_estimate,
    refs_count: packet.refs?.length || 0,
    safety_requires_human: packet.safety?.requires_human === true,
    raw_contains_sentinel: false,
  };
  await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

/* 中文注释：读取 JSONL 时保持简单失败模型；文件不存在代表该 session 还没有 interception 指标。 */
export async function readMetricsRecords({ workspaceRoot, sessionId = 'default' }) {
  const filePath = metricsSessionPath(workspaceRoot, sessionId);
  if (!fs.existsSync(filePath)) return [];
  const text = await readFile(filePath, 'utf8');
  return text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

/* 中文注释：sessionId 会进入文件名，清洗后可跨 Windows/POSIX 使用。 */
function sanitize(value) {
  return String(value || 'default').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128) || 'default';
}
