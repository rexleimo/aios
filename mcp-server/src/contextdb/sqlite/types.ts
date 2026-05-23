import type { CheckpointTelemetry, EventTurnEnvelope } from '../core.js';

export interface SqliteSessionRow {
  sessionId: string;
  agent: string;
  project: string;
  goal: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SqliteEventRow {
  eventId: string;
  sessionId: string;
  seq: number;
  ts: string;
  tsEpoch: number;
  project: string;
  agent: string;
  role: string;
  kind: string;
  text: string;
  refs: string[];
  turn?: EventTurnEnvelope;
  textHash: string;
  signatureHash: string;
}

export interface SqliteCheckpointRow {
  checkpointId: string;
  sessionId: string;
  seq: number;
  ts: string;
  tsEpoch: number;
  project: string;
  agent: string;
  status: string;
  summary: string;
  nextActions: string[];
  artifacts: string[];
  telemetry?: CheckpointTelemetry;
}

export interface SqliteSearchInput {
  project?: string;
  sessionId?: string;
  role?: string;
  kinds?: string[];
  refs?: string[];
  query?: string;
  limit: number;
}

export interface SqliteTimelineInput {
  project?: string;
  sessionId?: string;
  limit: number;
}

export interface SqliteSessionIndexedSeqs {
  eventSeq: number;
  checkpointSeq: number;
}

export interface SqliteCheckpointSearchInput {
  project?: string;
  sessionId?: string;
  statuses?: string[];
  query?: string;
  limit: number;
}

export interface EventSelectRow {
  event_id: string;
  session_id: string;
  seq: number;
  ts: string;
  ts_epoch: number;
  project: string;
  agent: string;
  role: string;
  kind: string;
  text: string;
  refs_json: string;
  turn_json: string | null;
  text_hash: string;
  signature_hash: string;
}

export interface SessionSelectRow {
  session_id: string;
  agent: string;
  project: string;
  goal: string;
  tags_json: string;
  created_at: string;
  updated_at: string;
}

export interface CheckpointSelectRow {
  checkpoint_id: string;
  session_id: string;
  seq: number;
  ts: string;
  ts_epoch: number;
  project: string;
  agent: string;
  status: string;
  summary: string;
  next_actions_json: string;
  artifacts_json: string;
  verification_result: string | null;
  retry_count: number | null;
  failure_category: string | null;
  elapsed_ms: number | null;
  cost_json: string | null;
  telemetry_json: string | null;
}
