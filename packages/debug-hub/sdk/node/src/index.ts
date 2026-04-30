import type { DebugHubConfig, LogLevel } from './types.js';
import { HttpClient } from './client.js';
import { Trace, Span } from './trace.js';

export { Trace, Span } from './trace.js';
export type { DebugHubConfig, LogEntry, LogLevel } from './types.js';

let idCounter = 0;
function nextId(): string {
  return `${Date.now().toString(36)}-${(++idCounter).toString(36)}`;
}

export class DebugHub {
  private client: HttpClient;
  private config: DebugHubConfig;

  constructor(config: DebugHubConfig) {
    this.config = config;
    this.client = new HttpClient(config.endpoint ?? 'http://localhost:39200');
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>, error?: Error): void {
    const entry = {
      id: nextId(),
      timestamp: Date.now(),
      level,
      message,
      source: {},
      trace: { traceId: nextId(), spanId: nextId() },
      data,
      error: error ? { name: error.name, message: error.message, stack: error.stack } : undefined,
      sdk: { name: '@debug-hub/node', version: '0.1.0', runtime: 'node' as const },
      tags: this.config.tags,
    };
    this.client.sendLog(entry).catch(() => {});
  }

  debug(message: string, data?: Record<string, unknown>) { this.log('debug', message, data); }
  info(message: string, data?: Record<string, unknown>) { this.log('info', message, data); }
  warn(message: string, data?: Record<string, unknown>) { this.log('warn', message, data); }
  error(message: string, data?: Record<string, unknown>, error?: Error) { this.log('error', message, data, error); }
  fatal(message: string, data?: Record<string, unknown>, error?: Error) { this.log('fatal', message, data, error); }

  startTrace(message: string): Trace {
    return new Trace(nextId(), message, this.config, this.client);
  }
}
