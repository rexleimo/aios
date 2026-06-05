/* 中文注释：核心层定义拦截数据契约，把原始输出标准化成可压缩、可计量的 envelope。 */
import { normalizeInterceptionRequest, normalizeToolOutput, DEFAULT_THRESHOLDS } from './types.mjs';
import { buildCompactPacket } from '../packets/compact-packet.mjs';
import { writeRawRef } from '../refs/raw-ref-store.mjs';
import { shrinkToolOutput } from '../shell/output-shrinker.mjs';
import { writeMetricsRecord } from '../metrics/metrics-sink.mjs';

/* 中文注释：Engine 是所有入口的唯一压缩核心；Shell、MCP、Harness 都把结果转成同一份 request 后进入这里。 */
export function createInterceptionEngine(options = {}) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(options.thresholds ?? {}) };
  const now = options.now ?? (() => new Date());
  const workspaceRoot = options.workspaceRoot;

  return {
    async interceptToolResult(request) {
      /* 中文注释：先统一输入形状，避免 shell stdout、MCP content、JSON result 分别走不同压缩逻辑。 */
      const normalized = normalizeInterceptionRequest(request);
      const output = normalizeToolOutput(normalized.payload);
      /* 中文注释：超过阈值的原文不再进入上下文，而是写入 raw ref；小输出则保持 inline，避免过度工程化。 */
      const rawBytes = Buffer.byteLength(output.raw, 'utf8');
      const shouldStoreRaw = rawBytes >= thresholds.minRawBytes;

      /* 中文注释：shrink 只负责提炼摘要、错误行和关键路径行；是否落 ref 由 Engine 统一决定。 */
      const shrink = shrinkToolOutput(output.raw, {
        exitCode: output.exitCode,
        thresholds,
      });

      let ref = null;
      if (shouldStoreRaw) {
        /* 中文注释：完整原文只写本地 ref，compact packet 只携带 ref_id 与 hash，防止大文本泄漏回模型。 */
        ref = await writeRawRef({
          workspaceRoot: workspaceRoot || normalized.cwd,
          sessionId: normalized.sessionId,
          host: normalized.host,
          kind: normalized.kind,
          source: sourceFromKind(normalized.kind),
          raw: output.raw,
          command: output.command,
          toolName: output.toolName,
          cwd: normalized.cwd,
          strategy: shrink.strategy,
          now,
        });
      }

      /* 中文注释：packet 是最终返回给 Agent 的对象，所有可读摘要、召回命令和节省指标都在这里汇合。 */
      const packet = buildCompactPacket({
        request: normalized,
        output,
        shrink,
        ref,
        rawBytes,
      });

      /* 中文注释：metrics 是“真的省流量”的审计证据；proof/doctor 后续会读取它做验收。 */
      if (options.metrics?.enabled === true) {
        await writeMetricsRecord({
          workspaceRoot: workspaceRoot || normalized.cwd,
          sessionId: normalized.sessionId,
          packet,
          request: normalized,
          ref,
          now,
        });
      }

      return packet;
    },
  };
}

/* 中文注释：kind 是内部事件类型，source 是用户读指标时看到的大类，两者分开方便未来扩展。 */
function sourceFromKind(kind) {
  if (kind.startsWith('agent.')) return 'agent';
  if (kind.startsWith('mcp.')) return 'mcp';
  if (kind === 'shell') return 'shell';
  if (kind === 'browser') return 'browser';
  return kind;
}
