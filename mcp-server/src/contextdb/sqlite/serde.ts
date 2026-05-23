import type { CheckpointCost, CheckpointTelemetry, EventTurnEnvelope, VerificationResult } from '../core.js';
import type { CheckpointSelectRow, EventSelectRow, SqliteCheckpointRow, SqliteEventRow } from './types.js';

// 纯函数：保持 refs_flat 的哨兵格式，兼容历史 LIKE 查询。
export function refsToFlat(refs: string[]): string {
  if (refs.length === 0) return '';
  return `|${refs.join('|')}|`;
}

export function parseJsonStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

export function parseJsonObject<T>(raw?: string | null): T | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    return parsed as T;
  } catch {
    return undefined;
  }
}

export function parseCheckpointTelemetry(row: CheckpointSelectRow): CheckpointTelemetry | undefined {
  const parsed = parseJsonObject<CheckpointTelemetry>(row.telemetry_json);
  if (parsed) return parsed;

  const cost = parseJsonObject<CheckpointCost>(row.cost_json);
  const telemetry: CheckpointTelemetry = {};
  if (row.verification_result) telemetry.verification = { result: row.verification_result as VerificationResult };
  if (typeof row.retry_count === 'number' && Number.isFinite(row.retry_count) && row.retry_count >= 0) {
    telemetry.retryCount = row.retry_count;
  }
  if (row.failure_category) telemetry.failureCategory = row.failure_category;
  if (typeof row.elapsed_ms === 'number' && Number.isFinite(row.elapsed_ms) && row.elapsed_ms >= 0) {
    telemetry.elapsedMs = row.elapsed_ms;
  }
  if (cost) telemetry.cost = cost;
  return Object.keys(telemetry).length > 0 ? telemetry : undefined;
}

export function mapEventRow(row: EventSelectRow): SqliteEventRow {
  const turn = parseJsonObject<EventTurnEnvelope>(row.turn_json);
  return {
    eventId: row.event_id,
    sessionId: row.session_id,
    seq: row.seq,
    ts: row.ts,
    tsEpoch: row.ts_epoch,
    project: row.project,
    agent: row.agent,
    role: row.role,
    kind: row.kind,
    text: row.text,
    refs: parseJsonStringArray(row.refs_json),
    ...(turn ? { turn } : {}),
    textHash: row.text_hash,
    signatureHash: row.signature_hash,
  };
}

export function mapCheckpointRow(row: CheckpointSelectRow): SqliteCheckpointRow {
  return {
    checkpointId: row.checkpoint_id,
    sessionId: row.session_id,
    seq: row.seq,
    ts: row.ts,
    tsEpoch: row.ts_epoch,
    project: row.project,
    agent: row.agent,
    status: row.status,
    summary: row.summary,
    nextActions: parseJsonStringArray(row.next_actions_json),
    artifacts: parseJsonStringArray(row.artifacts_json),
    telemetry: parseCheckpointTelemetry(row),
  };
}
