import type { LogEntry, LogLevel, DebugHubConfig } from './types.js';
import type { HttpClient } from './client.js';

let idCounter = 0;
function nextId(): string {
  return `${Date.now().toString(36)}-${(++idCounter).toString(36)}`;
}

export class Span {
  private entries: LogEntry[] = [];
  private _ended = false;

  constructor(
    readonly spanId: string,
    readonly traceId: string,
    readonly parentSpanId: string | undefined,
    private readonly config: DebugHubConfig,
    private readonly client: HttpClient,
  ) {}

  private log(level: LogLevel, message: string, data?: Record<string, unknown>, error?: Error): void {
    if (this._ended) return;
    const entry: LogEntry = {
      id: nextId(),
      timestamp: Date.now(),
      level,
      message,
      source: {},
      trace: {
        traceId: this.traceId,
        spanId: this.spanId,
        parentSpanId: this.parentSpanId,
      },
      data,
      error: error ? { name: error.name, message: error.message, stack: error.stack } : undefined,
      sdk: { name: '@debug-hub/node', version: '0.1.0', runtime: 'node' },
      tags: this.config.tags,
    };
    this.entries.push(entry);
    this.client.sendLog(entry).catch(() => {});
  }

  debug(message: string, data?: Record<string, unknown>) { this.log('debug', message, data); }
  info(message: string, data?: Record<string, unknown>) { this.log('info', message, data); }
  warn(message: string, data?: Record<string, unknown>) { this.log('warn', message, data); }
  error(message: string, data?: Record<string, unknown>, error?: Error) { this.log('error', message, data, error); }
  fatal(message: string, data?: Record<string, unknown>, error?: Error) { this.log('fatal', message, data, error); }

  span(message: string): Span {
    return new Span(nextId(), this.traceId, this.spanId, this.config, this.client);
  }

  end(): void {
    this._ended = true;
  }

  getEntries(): LogEntry[] { return [...this.entries]; }
}

export class Trace extends Span {
  readonly startTime: number;

  constructor(
    traceId: string,
    message: string,
    config: DebugHubConfig,
    client: HttpClient,
  ) {
    super(traceId, traceId, undefined, config, client);
    this.startTime = Date.now();
    this.info(message);
  }
}
