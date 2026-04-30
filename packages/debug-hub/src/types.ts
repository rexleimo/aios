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
