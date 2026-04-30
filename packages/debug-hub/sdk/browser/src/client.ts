import type { LogEntry } from './types.js';

export class HttpClient {
  private endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint.replace(/\/$/, '');
  }

  async sendLog(entry: LogEntry): Promise<void> {
    await fetch(`${this.endpoint}/api/logs/single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
      keepalive: true,
    });
  }

  async sendLogs(entries: LogEntry[]): Promise<void> {
    await fetch(`${this.endpoint}/api/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entries),
      keepalive: true,
    });
  }
}
