/* 中文注释：tools/list 的完整 schema 必须留在本地 ref，返回给模型的只是一份可调用目录。 */
import { writeMetricsRecord } from '../metrics/metrics-sink.mjs';
import { estimateTokensFromBytes } from '../metrics/token-estimator.mjs';
import { writeRawRef } from '../refs/raw-ref-store.mjs';
import { shrinkToolsList } from './tools-list-shrink.mjs';

/* 中文注释：构建 compact catalog，同时把完整 catalog 写入 raw ref 供后续精准召回。 */
export async function buildToolsListPacket({ result, workspaceRoot, sessionId, host, now, metrics }) {
  const compact = shrinkToolsList(result);
  const rawText = JSON.stringify(result ?? {}, null, 2);
  const compactText = JSON.stringify(compact);
  const rawBytes = Buffer.byteLength(rawText, 'utf8');
  const compactBytes = Buffer.byteLength(compactText, 'utf8');
  const ref = await writeRawRef({
    workspaceRoot,
    sessionId,
    host,
    kind: 'mcp.tools_list',
    source: 'mcp',
    raw: rawText,
    toolName: 'tools/list',
    strategy: 'compact-tools-catalog',
    now,
  });

  const packet = {
    ...compact,
    refs: [{
      ref_id: ref.refId,
      kind: 'raw',
      sha256: ref.sha256,
      bytes: ref.rawBytes,
    }],
    metrics: {
      raw_bytes: rawBytes,
      compact_bytes: compactBytes,
      saved_bytes: Math.max(0, rawBytes - compactBytes),
      saving_ratio: rawBytes > 0 ? Number(((rawBytes - compactBytes) / rawBytes).toFixed(4)) : 0,
      raw_tokens_estimate: estimateTokensFromBytes(rawBytes),
      compact_tokens_estimate: estimateTokensFromBytes(compactBytes),
      strategy: 'compact-tools-catalog',
    },
    recall: [
      `node scripts/aios.mjs refs read ${ref.refId}`,
      `node scripts/aios.mjs refs grep "toolName" --ref ${ref.refId}`,
    ],
    safety: {
      redacted: false,
      requires_human: false,
    },
  };

  if (metrics?.enabled === true) {
    await writeMetricsRecord({
      workspaceRoot,
      sessionId,
      packet: { ...packet, host, source: 'mcp' },
      request: { kind: 'mcp.tools_list' },
      ref,
      now,
    });
  }

  return packet;
}
