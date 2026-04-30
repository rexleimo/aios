import { readFile, writeFile, appendFile, mkdir, readdir, unlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { LogEntry, Trace, Stats, SearchQuery } from './types.js';

export class Storage {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  private logsDir() { return join(this.baseDir, 'logs'); }
  private tracesDir() { return join(this.baseDir, 'traces'); }

  private async ensureDirs(): Promise<void> {
    await mkdir(this.logsDir(), { recursive: true });
    await mkdir(this.tracesDir(), { recursive: true });
  }

  private dailyFile(): string {
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return join(this.logsDir(), `${date}.jsonl`);
  }

  async writeLog(entry: LogEntry): Promise<void> {
    await this.ensureDirs();
    const line = JSON.stringify(entry) + '\n';
    await appendFile(this.dailyFile(), line, 'utf-8');
  }

  async readLogs(limit = 1000): Promise<LogEntry[]> {
    if (!existsSync(this.logsDir())) return [];
    const files = (await readdir(this.logsDir()))
      .filter(f => f.endsWith('.jsonl'))
      .sort()
      .reverse();

    const entries: LogEntry[] = [];
    for (const file of files) {
      const content = await readFile(join(this.logsDir(), file), 'utf-8');
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
          entries.push(JSON.parse(line));
        } catch { /* skip malformed lines */ }
      }
      if (entries.length >= limit) break;
    }
    return entries.slice(0, limit);
  }

  async searchLogs(query: SearchQuery): Promise<LogEntry[]> {
    const limit = query.limit ?? 100;
    const all = await this.readLogs(limit * 5);

    return all.filter(entry => {
      if (query.keyword && !entry.message.includes(query.keyword)) return false;
      if (query.level && entry.level !== query.level) return false;
      if (query.since && entry.timestamp < query.since) return false;
      if (query.module && entry.source?.module !== query.module) return false;
      if (query.traceId && entry.trace?.traceId !== query.traceId) return false;
      return true;
    }).slice(0, limit);
  }

  async writeTrace(trace: Trace): Promise<void> {
    await this.ensureDirs();
    const filePath = join(this.tracesDir(), `${trace.traceId}.json`);
    await writeFile(filePath, JSON.stringify(trace, null, 2), 'utf-8');
  }

  async getTrace(traceId: string): Promise<Trace | null> {
    const filePath = join(this.tracesDir(), `${traceId}.json`);
    if (!existsSync(filePath)) return null;
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  }

  async listTraces(limit = 50): Promise<Trace[]> {
    if (!existsSync(this.tracesDir())) return [];
    const files = (await readdir(this.tracesDir()))
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);

    const traces: Trace[] = [];
    for (const file of files) {
      const content = await readFile(join(this.tracesDir(), file), 'utf-8');
      try { traces.push(JSON.parse(content)); } catch { /* skip */ }
    }
    return traces;
  }

  async getStats(): Promise<Stats> {
    const logs = await this.readLogs();
    const levelCounts = { debug: 0, info: 0, warn: 0, error: 0, fatal: 0 };
    const recentErrors: Stats['recentErrors'] = [];

    for (const entry of logs) {
      levelCounts[entry.level]++;
      if (entry.level === 'error' || entry.level === 'fatal') {
        recentErrors.push({
          message: entry.message,
          timestamp: entry.timestamp,
          traceId: entry.trace?.traceId,
        });
      }
    }

    const traces = await this.listTraces();

    return {
      totalLogs: logs.length,
      totalTraces: traces.length,
      errorCount: levelCounts.error + levelCounts.fatal,
      levelCounts,
      recentErrors: recentErrors.slice(0, 20),
    };
  }

  async clearLogs(olderThan?: number): Promise<void> {
    if (!existsSync(this.logsDir())) return;
    if (!olderThan) {
      await rm(this.logsDir(), { recursive: true, force: true });
      await rm(this.tracesDir(), { recursive: true, force: true });
      return;
    }
    const files = await readdir(this.logsDir());
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const content = await readFile(join(this.logsDir(), file), 'utf-8');
      const kept = content.split('\n').filter(line => {
        if (!line.trim()) return false;
        try {
          const entry: LogEntry = JSON.parse(line);
          return entry.timestamp >= olderThan;
        } catch { return false; }
      });
      if (kept.length === 0) {
        await unlink(join(this.logsDir(), file));
      } else {
        await writeFile(join(this.logsDir(), file), kept.join('\n') + '\n', 'utf-8');
      }
    }
  }
}
