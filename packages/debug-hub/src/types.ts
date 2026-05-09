export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogSource {
  file?: string;
  line?: number;
  function?: string;
  module?: string;
}

export interface LogTrace {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

export interface LogError {
  name: string;
  message: string;
  stack?: string;
}

export interface SdkMeta {
  name: string;
  version: string;
  runtime: 'node' | 'browser' | 'go';
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  source: LogSource;
  trace: LogTrace;
  tags?: Record<string, string>;
  data?: Record<string, unknown>;
  error?: LogError;
  sdk: SdkMeta;
}

export interface SpanSummary {
  spanId: string;
  message: string;
  level: LogLevel;
  duration?: number;
  children?: SpanSummary[];
}

export interface Trace {
  traceId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  spanCount: number;
  errorCount: number;
  rootSpan: SpanSummary;
  tags?: Record<string, string>;
}

export interface Stats {
  totalLogs: number;
  totalTraces: number;
  errorCount: number;
  levelCounts: Record<LogLevel, number>;
  recentErrors: Array<{ message: string; timestamp: number; traceId?: string }>;
}

export interface SearchQuery {
  keyword?: string;
  level?: LogLevel;
  since?: number;
  module?: string;
  traceId?: string;
  limit?: number;
}

export type DebugSessionStatus = 'active' | 'completed' | 'failed';

export interface DebugSession {
  sessionId: string;
  objective: string;
  status: DebugSessionStatus;
  startedAt: number;
  updatedAt: number;
  endedAt?: number;
  workspace?: string;
  agent?: string;
  tags?: Record<string, string>;
}

export type DebugEventKind =
  | 'log'
  | 'hypothesis'
  | 'tool_call'
  | 'artifact'
  | 'environment'
  | 'verification'
  | 'span'
  | 'note';

export interface DebugEvent {
  eventId: string;
  timestamp: number;
  kind: DebugEventKind;
  level: LogLevel;
  message: string;
  sessionId?: string;
  runId?: string;
  hypothesisId?: string;
  trace?: LogTrace;
  source?: LogSource;
  payload?: Record<string, unknown>;
  tags?: Record<string, string>;
}

export interface SessionDetail {
  session: DebugSession;
  events: DebugEvent[];
  traces: Trace[];
}

export interface TimelineItem {
  timestamp: number;
  kind: DebugEventKind;
  level: LogLevel;
  message: string;
  sessionId?: string;
  runId?: string;
  traceId?: string;
  spanId?: string;
  hypothesisId?: string;
  payload?: Record<string, unknown>;
}

export interface HealthReport {
  status: 'ok';
  schemaVersion: string;
  dataDir: string;
  totalLogs: number;
  totalTraces: number;
  totalSessions: number;
  totalEvents: number;
  invalidEvents: number;
  latestLogTimestamp?: number;
}

export interface CompactContext {
  session?: DebugSession;
  stats: Stats;
  timeline: TimelineItem[];
  recentErrors: Stats['recentErrors'];
}
