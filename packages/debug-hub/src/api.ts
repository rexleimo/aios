import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import type { Storage } from './storage.js';
import type { EventBus } from './events.js';
import type { LogEntry } from './types.js';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseQuery(url: string): Record<string, string> {
  const idx = url.indexOf('?');
  if (idx < 1) return {};
  const params = new URLSearchParams(url.slice(idx + 1));
  const result: Record<string, string> = {};
  for (const [k, v] of params) result[k] = v;
  return result;
}

export interface ApiServer {
  listen(port: number): Promise<void>;
  close(): Promise<void>;
  address(): { port: number };
}

export function createApiServer(storage: Storage, events: EventBus): ApiServer {
  const clients = new Set<ServerResponse>();

  const server = createServer(async (req, res) => {
    const url = req.url || '/';
    const method = req.method || 'GET';

    try {
      // POST /api/logs/single
      if (method === 'POST' && url === '/api/logs/single') {
        const body = JSON.parse(await readBody(req));
        await storage.writeLog(body as LogEntry);
        events.emit('log', body);
        sendJson(res, 200, { success: true });
        return;
      }

      // POST /api/logs
      if (method === 'POST' && url === '/api/logs') {
        const entries: LogEntry[] = JSON.parse(await readBody(req));
        for (const entry of entries) {
          await storage.writeLog(entry);
          events.emit('log', entry);
        }
        sendJson(res, 200, { success: true, count: entries.length });
        return;
      }

      // GET /api/traces
      if (method === 'GET' && url === '/api/traces') {
        const traces = await storage.listTraces();
        sendJson(res, 200, traces);
        return;
      }

      // GET /api/traces/:id
      const traceMatch = /^\/api\/traces\/([^/]+)$/.exec(url);
      if (method === 'GET' && traceMatch) {
        const trace = await storage.getTrace(traceMatch[1]);
        if (!trace) { sendJson(res, 404, { error: 'Trace not found' }); return; }
        sendJson(res, 200, trace);
        return;
      }

      // GET /api/logs/search
      if (method === 'GET' && url.startsWith('/api/logs/search')) {
        const q = parseQuery(url);
        const results = await storage.searchLogs({
          keyword: q.keyword,
          level: q.level as any,
          since: q.since ? Number(q.since) : undefined,
          module: q.module,
          traceId: q.traceId,
          limit: q.limit ? Number(q.limit) : undefined,
        });
        sendJson(res, 200, results);
        return;
      }

      // GET /api/stats
      if (method === 'GET' && url === '/api/stats') {
        const stats = await storage.getStats();
        sendJson(res, 200, stats);
        return;
      }

      // DELETE /api/logs
      if (method === 'DELETE' && url === '/api/logs') {
        await storage.clearLogs();
        sendJson(res, 200, { success: true });
        return;
      }

      // GET /api/events (SSE)
      if (method === 'GET' && url === '/api/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }

      // Serve Web UI
      if (method === 'GET' && (url === '/' || url === '/index.html')) {
        const { readFile } = await import('node:fs/promises');
        const { join } = await import('node:path');
        const { fileURLToPath } = await import('node:url');
        const dir = fileURLToPath(new URL('.', import.meta.url));
        const html = await readFile(join(dir, 'ui.html'), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  // SSE broadcast on new logs
  events.on('log', (entry) => {
    const data = `data: ${JSON.stringify(entry)}\n\n`;
    for (const client of clients) {
      client.write(data);
    }
  });

  let httpServer: Server;

  return {
    listen(port: number): Promise<void> {
      return new Promise((resolve) => {
        httpServer = server.listen(port, '127.0.0.1', () => {
          resolve();
        });
      });
    },
    close(): Promise<void> {
      return new Promise((resolve) => {
        for (const client of clients) {
          client.end();
        }
        httpServer.close(() => resolve());
      });
    },
    address(): { port: number } {
      const addr = httpServer.address();
      if (typeof addr === 'string' || !addr) return { port: 0 };
      return { port: addr.port };
    },
  };
}
