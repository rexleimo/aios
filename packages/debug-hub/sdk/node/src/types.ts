export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  source: {
    file?: string;
    line?: number;
    function?: string;
    module?: string;
  };
  trace: {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
  };
  tags?: Record<string, string>;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  sdk: {
    name: string;
    version: string;
    runtime: 'node';
  };
}

export interface DebugHubConfig {
  service: string;
  endpoint?: string;
  tags?: Record<string, string>;
}
