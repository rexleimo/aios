import type { LogEntry } from './types.js';

export class HttpClient {
  private endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint.replace(/\/$/, '');
  }

  async sendLog(entry: LogEntry): Promise<void> {
    const res = await fetch(`${this.endpoint}/api/logs/single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (!res.ok) {
      throw new Error(`Failed to send log: ${res.status} ${res.statusText}`);
    }
  }

  async sendLogs(entries: LogEntry[]): Promise<void> {
    const res = await fetch(`${this.endpoint}/api/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entries),
    });
    if (!res.ok) {
      throw new Error(`Failed to send logs: ${res.status} ${res.statusText}`);
    }
  }
}
