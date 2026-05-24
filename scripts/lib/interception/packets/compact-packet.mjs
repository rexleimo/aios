/* 中文注释：Packet 层构造模型可读的精简包，连接摘要、关键行、错误和 raw refs。 */
import { INTERCEPTION_PACKET_TYPE } from '../core/types.mjs';
import { estimateTokensFromBytes } from '../metrics/token-estimator.mjs';

/* 中文注释：Compact packet 是“给模型看的替代输出”，不是 raw 的摘要副本；它必须可读、可召回、可度量。 */
export function buildCompactPacket({ request, output, shrink, ref, rawBytes }) {
  /* 中文注释：只有真正落盘的 raw 才生成 refs；小输出没有 ref，避免产生无意义召回入口。 */
  const refs = ref ? [{
    ref_id: ref.refId,
    kind: 'raw',
    sha256: ref.sha256,
    bytes: ref.rawBytes,
  }] : [];

  const compactBytes = Buffer.byteLength(shrink.compactText || shrink.summary || '', 'utf8');
  const savedBytes = ref ? Math.max(0, rawBytes - compactBytes) : 0;

  return {
    type: INTERCEPTION_PACKET_TYPE,
    version: 1,
    source: sourceFromKind(request.kind),
    host: request.host,
    sessionId: request.sessionId,
    summary: shrink.summary,
    key_lines: shrink.keyLines,
    errors: shrink.errors,
    refs,
    metrics: {
      /* 中文注释：这些数字是 proof/doctor 的核心指标，用来证明节流发生在代码数据面，而不是口头宣称。 */
      raw_bytes: rawBytes,
      compact_bytes: compactBytes,
      saved_bytes: savedBytes,
      saving_ratio: rawBytes > 0 ? Number((savedBytes / rawBytes).toFixed(4)) : 0,
      raw_tokens_estimate: estimateTokensFromBytes(rawBytes),
      compact_tokens_estimate: estimateTokensFromBytes(compactBytes),
      strategy: ref ? shrink.strategy : 'inline-small-output',
    },
    /* 中文注释：召回命令直接放进 packet，Agent 需要原文时可以精准读 ref，而不是重新扫全仓库。 */
    recall: refs.length > 0 ? [
      `node scripts/aios.mjs refs read ${refs[0].ref_id}`,
      `node scripts/aios.mjs refs grep "pattern" --ref ${refs[0].ref_id}`,
    ] : [],
    safety: {
      redacted: false,
      requires_human: output.exitCode !== 0,
    },
  };
}

/* 中文注释：保持和 engine 里的 source 归类一致，方便 metrics、doctor 和用户输出对齐。 */
function sourceFromKind(kind) {
  if (kind.startsWith('mcp.')) return 'mcp';
  if (kind === 'shell') return 'shell';
  if (kind === 'browser') return 'browser';
  return kind;
}
