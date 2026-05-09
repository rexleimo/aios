import { readFile, writeFile, appendFile, mkdir, readdir, unlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type {
  CompactContext,
  DebugEvent,
  DebugEventKind,
  DebugSession,
  HealthReport,
  LogEntry,
  LogLevel,
  SessionDetail,
  SpanSummary,
  TimelineItem,
  Trace,
  Stats,
  SearchQuery,
} from './types.js';

export class Storage {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  private logsDir() { return join(this.baseDir, 'logs'); }
  private tracesDir() { return join(this.baseDir, 'traces'); }
  private sessionsDir() { return join(this.baseDir, 'sessions'); }
  private eventsDir() { return join(this.baseDir, 'events'); }

  private async ensureDirs(): Promise<void> {
    await mkdir(this.logsDir(), { recursive: true });
    await mkdir(this.tracesDir(), { recursive: true });
    await mkdir(this.sessionsDir(), { recursive: true });
    await mkdir(this.eventsDir(), { recursive: true });
  }

  private dailyFile(): string {
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return join(this.logsDir(), `${date}.jsonl`);
  }

  private dailyEventsFile(): string {
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return join(this.eventsDir(), `${date}.jsonl`);
  }

  private sessionFile(sessionId: string): string {
    return join(this.sessionsDir(), `${sessionId}.json`);
  }

  async writeLog(entry: LogEntry): Promise<void> {
    await this.ensureDirs();
    const line = JSON.stringify(entry) + '\n';
    await appendFile(this.dailyFile(), line, 'utf-8');
    if (entry.trace?.traceId) {
      await this.materializeTrace(entry.trace.traceId);
    }
  }

  private levelSeverity(level: LogLevel): number {
    return { debug: 0, info: 1, warn: 2, error: 3, fatal: 4 }[level];
  }

  private async materializeTrace(traceId: string): Promise<void> {
    const logs = (await this.readLogs(10000))
      .filter(entry => entry.trace?.traceId === traceId)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (logs.length === 0) return;

    const spanMap = new Map<string, SpanSummary>();
    const firstSeen = new Map<string, number>();
    const lastSeen = new Map<string, number>();
    const parentBySpan = new Map<string, string | undefined>();

    for (const entry of logs) {
      const spanId = entry.trace.spanId;
      const existing = spanMap.get(spanId);
      if (!existing) {
        spanMap.set(spanId, {
          spanId,
          message: entry.message,
          level: entry.level,
        });
        firstSeen.set(spanId, entry.timestamp);
      } else if (this.levelSeverity(entry.level) > this.levelSeverity(existing.level)) {
        existing.level = entry.level;
      }

      lastSeen.set(spanId, entry.timestamp);
      if (!parentBySpan.has(spanId)) {
        parentBySpan.set(spanId, entry.trace.parentSpanId);
      }
    }

    for (const [spanId, span] of spanMap) {
      const start = firstSeen.get(spanId) ?? logs[0].timestamp;
      const end = lastSeen.get(spanId) ?? start;
      if (end > start) span.duration = end - start;
      span.children = [];
    }

    for (const [spanId, span] of spanMap) {
      const parentSpanId = parentBySpan.get(spanId);
      const parent = parentSpanId ? spanMap.get(parentSpanId) : undefined;
      if (parent) parent.children?.push(span);
    }

    for (const span of spanMap.values()) {
      if (span.children?.length === 0) delete span.children;
    }

    const rootEntry = logs.find(entry => !entry.trace.parentSpanId) ?? logs[0];
    const rootSpan = spanMap.get(rootEntry.trace.spanId) ?? {
      spanId: rootEntry.trace.spanId,
      message: rootEntry.message,
      level: rootEntry.level,
    };
    const startTime = logs[0].timestamp;
    const endTime = logs[logs.length - 1].timestamp;
    const trace: Trace = {
      traceId,
      startTime,
      endTime,
      duration: endTime - startTime,
      spanCount: spanMap.size,
      errorCount: logs.filter(entry => entry.level === 'error' || entry.level === 'fatal').length,
      rootSpan,
      tags: logs.reduce<Record<string, string>>((acc, entry) => ({ ...acc, ...(entry.tags ?? {}) }), {}),
    };

    if (Object.keys(trace.tags ?? {}).length === 0) delete trace.tags;
    await this.writeTrace(trace);
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

  async createSession(input: {
    sessionId?: string;
    objective: string;
    workspace?: string;
    agent?: string;
    tags?: Record<string, string>;
  }): Promise<DebugSession> {
    await this.ensureDirs();
    const now = Date.now();
    const session: DebugSession = {
      sessionId: input.sessionId ?? randomUUID(),
      objective: input.objective,
      workspace: input.workspace,
      agent: input.agent,
      tags: input.tags,
      status: 'active',
      startedAt: now,
      updatedAt: now,
    };
    await writeFile(this.sessionFile(session.sessionId), JSON.stringify(session, null, 2), 'utf-8');
    return session;
  }

  async getSession(sessionId: string): Promise<DebugSession | null> {
    const filePath = this.sessionFile(sessionId);
    if (!existsSync(filePath)) return null;
    return JSON.parse(await readFile(filePath, 'utf-8'));
  }

  private async updateSessionTimestamp(sessionId: string, timestamp: number): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) return;
    session.updatedAt = Math.max(session.updatedAt, timestamp);
    await writeFile(this.sessionFile(sessionId), JSON.stringify(session, null, 2), 'utf-8');
  }

  async recordEvent(input: {
    eventId?: string;
    timestamp?: number;
    kind?: DebugEventKind;
    level?: LogLevel;
    message: string;
    sessionId?: string;
    runId?: string;
    hypothesisId?: string;
    trace?: DebugEvent['trace'];
    source?: DebugEvent['source'];
    payload?: Record<string, unknown>;
    tags?: Record<string, string>;
  }): Promise<DebugEvent> {
    await this.ensureDirs();
    const event: DebugEvent = {
      eventId: input.eventId ?? randomUUID(),
      timestamp: input.timestamp ?? Date.now(),
      kind: input.kind ?? 'note',
      level: input.level ?? 'info',
      message: input.message,
      sessionId: input.sessionId,
      runId: input.runId,
      hypothesisId: input.hypothesisId,
      trace: input.trace,
      source: input.source,
      payload: input.payload,
      tags: input.tags,
    };
    await appendFile(this.dailyEventsFile(), JSON.stringify(event) + '\n', 'utf-8');
    if (event.sessionId) {
      await this.updateSessionTimestamp(event.sessionId, event.timestamp);
    }
    return event;
  }

  async readEvents(limit = 1000): Promise<DebugEvent[]> {
    if (!existsSync(this.eventsDir())) return [];
    const files = (await readdir(this.eventsDir()))
      .filter(f => f.endsWith('.jsonl'))
      .sort()
      .reverse();

    const events: DebugEvent[] = [];
    for (const file of files) {
      const content = await readFile(join(this.eventsDir(), file), 'utf-8');
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
          events.push(JSON.parse(line));
        } catch { /* health reports invalid counts in a later schema version */ }
      }
      if (events.length >= limit) break;
    }
    return events.slice(0, limit);
  }

  async getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    const events = (await this.readEvents()).filter(event => event.sessionId === sessionId);
    const traceIds = new Set(events.map(event => event.trace?.traceId).filter(Boolean) as string[]);
    const traces = (await Promise.all([...traceIds].map(id => this.getTrace(id))))
      .filter((trace): trace is Trace => Boolean(trace));
    return { session, events, traces };
  }

  async listSessions(): Promise<DebugSession[]> {
    if (!existsSync(this.sessionsDir())) return [];
    const files = (await readdir(this.sessionsDir())).filter(f => f.endsWith('.json')).sort().reverse();
    const sessions: DebugSession[] = [];
    for (const file of files) {
      try {
        sessions.push(JSON.parse(await readFile(join(this.sessionsDir(), file), 'utf-8')));
      } catch { /* skip malformed session files */ }
    }
    return sessions;
  }

  async getTimeline(query: { sessionId?: string; limit?: number } = {}): Promise<TimelineItem[]> {
    const limit = query.limit ?? 100;
    const events = (await this.readEvents(limit * 2))
      .filter(event => !query.sessionId || event.sessionId === query.sessionId)
      .map<TimelineItem>(event => ({
        timestamp: event.timestamp,
        kind: event.kind,
        level: event.level,
        message: event.message,
        sessionId: event.sessionId,
        runId: event.runId,
        traceId: event.trace?.traceId,
        spanId: event.trace?.spanId,
        hypothesisId: event.hypothesisId,
        payload: event.payload,
      }));

    const logs = (await this.readLogs(limit * 2))
      .filter(entry => !query.sessionId || entry.tags?.sessionId === query.sessionId)
      .map<TimelineItem>(entry => ({
        timestamp: entry.timestamp,
        kind: 'log',
        level: entry.level,
        message: entry.message,
        sessionId: entry.tags?.sessionId,
        traceId: entry.trace?.traceId,
        spanId: entry.trace?.spanId,
        payload: entry.data,
      }));

    return [...events, ...logs]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-limit);
  }

  async getHealth(): Promise<HealthReport> {
    const logs = await this.readLogs();
    const traces = await this.listTraces();
    const sessions = await this.listSessions();
    const events = await this.readEvents();
    const latestLogTimestamp = logs.reduce<number | undefined>((latest, entry) => {
      if (latest === undefined) return entry.timestamp;
      return Math.max(latest, entry.timestamp);
    }, undefined);

    return {
      status: 'ok',
      schemaVersion: '0.2.0',
      dataDir: this.baseDir,
      totalLogs: logs.length,
      totalTraces: traces.length,
      totalSessions: sessions.length,
      totalEvents: events.length,
      invalidEvents: 0,
      latestLogTimestamp,
    };
  }

  async getCompactContext(query: { sessionId?: string; limit?: number } = {}): Promise<CompactContext> {
    const stats = await this.getStats();
    const session = query.sessionId ? await this.getSession(query.sessionId) : undefined;
    return {
      session: session ?? undefined,
      stats,
      timeline: await this.getTimeline({ sessionId: query.sessionId, limit: query.limit ?? 20 }),
      recentErrors: stats.recentErrors,
    };
  }
}
