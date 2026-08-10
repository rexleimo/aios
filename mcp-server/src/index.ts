// mcp-server/src/index.ts
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import {
  tools as browserTools,
  browserLauncher,
  navigate,
  click,
  type,
  setInputFiles,
  snapshot,
  screenshot,
  authCheck,
  challengeCheck,
  getBrowserHealth,
} from './browser/index.js';

// 工具处理器映射
const toolHandlers: Record<string, (args: any) => Promise<any>> = {
  browser_health: async () => {
    return await getBrowserHealth();
  },
  browser_launch: async (args) => {
    const { profile = 'default', url, headless, visible } = args ?? {};
    const state = await browserLauncher.launch(profile, url, headless, visible);
    return {
      success: true,
      profile,
      effectiveProfile: state.effectiveProfile ?? profile,
      headless: state.headless ?? false,
      visible: state.visible ?? true,
      launchMode: state.launchMode ?? 'ephemeral-local',
      connectedOverCdp: state.connectedOverCdp ?? false,
    };
  },
  browser_navigate: async (args) => {
    const { url, profile, newTab } = args ?? {};
    if (!url) throw new Error('browser_navigate requires url');
    return await navigate(url, profile, newTab);
  },
  browser_click: async (args) => {
    const { selector, profile, double } = args ?? {};
    if (!selector) throw new Error('browser_click requires selector');
    return await click(selector, profile, double);
  },
  browser_type: async (args) => {
    const { selector, text, profile } = args ?? {};
    if (!selector) throw new Error('browser_type requires selector');
    if (typeof text !== 'string') throw new Error('browser_type requires text');
    return await type(selector, text, profile);
  },
  browser_set_input_files: async (args) => {
    const { selector, files, profile } = args ?? {};
    if (!selector) throw new Error('browser_set_input_files requires selector');
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error('browser_set_input_files requires a non-empty files array');
    }
    return await setInputFiles(selector, files, profile);
  },
  browser_snapshot: async (args) => {
    return await snapshot(args?.profile, {
      mode: args?.mode,
      includeAx: args?.includeAx,
      axMaxLines: args?.axMaxLines,
      axVerbose: args?.axVerbose,
      includeHtml: args?.includeHtml,
      htmlMaxChars: args?.htmlMaxChars,
    });
  },
  browser_auth_check: async (args) => {
    return await authCheck(args?.profile);
  },
  browser_challenge_check: async (args) => {
    return await challengeCheck(args?.profile);
  },
  browser_screenshot: async (args) => {
    const { fullPage, profile, filePath, selector, redactPii, privacyPreset } = args ?? {};
    return await screenshot({ fullPage, profile, filePath, selector, redactPii, privacyPreset });
  },
  browser_close: async (args) => {
    const profile = args?.profile || 'default';
    await browserLauncher.close(profile);
    return { success: true, profile };
  },
  browser_list_tabs: async (args) => {
    const profile = args?.profile || 'default';
    const state = browserLauncher.getState(profile);
    if (!state) {
      return { tabs: [], profile };
    }
    const tabs = await Promise.all(
      Array.from(state.pages.entries()).map(async ([id, page]) => ({
        id,
        url: page.url(),
        title: await page.title(),
      }))
    );
    return { tabs, profile };
  },
};

function parseBoolEnv(value: string | undefined, fallback = false): boolean {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
}

function parsePortEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) return fallback;
  return parsed;
}

function parseDurationMsEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const parsed = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function startBrowserIdleCleanup() {
  const idleTtlMs = parseDurationMsEnv(process.env.BROWSER_IDLE_TTL_MS, 30 * 60 * 1000);
  const timer = setInterval(() => {
    void browserLauncher.closeIdle(idleTtlMs).then((closed) => {
      if (closed.length > 0) {
        console.error(`[browser_idle_cleanup] closed profiles: ${closed.join(', ')}`);
      }
    });
  }, Math.min(idleTtlMs, 60_000));
  timer.unref?.();
  return () => clearInterval(timer);
}

function installBrowserShutdownHandlers(stopIdleCleanup: () => void) {
  let closePromise: Promise<string[]> | undefined;
  const closeBrowsers = async (reason: string, exitAfter: boolean) => {
    if (!closePromise) {
      stopIdleCleanup();
      closePromise = browserLauncher.closeAll();
    }
    const closed = await closePromise;
    if (closed.length > 0) {
      console.error(`[browser_shutdown] ${reason}; closed profiles: ${closed.join(', ')}`);
    }
    if (exitAfter) process.exit(0);
  };

  process.once('SIGTERM', () => {
    void closeBrowsers('SIGTERM', true);
  });
  process.once('SIGINT', () => {
    void closeBrowsers('SIGINT', true);
  });
  process.stdin.once('end', () => {
    void closeBrowsers('stdin closed', false);
  });
}

function safeTimingEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function extractBearerToken(header: unknown): string {
  const raw = Array.isArray(header) ? header[0] : header;
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return '';
  const match = /^bearer\s+(.+)$/i.exec(text);
  return match ? match[1].trim() : '';
}

function createAiosBrowserServer(): Server {
  const server = new Server(
    {
      name: 'aios-browser-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // 注册工具列表
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        ...browserTools,
        {
          name: 'browser_close',
          description: 'Close browser',
          inputSchema: {
            type: 'object',
            properties: {
              profile: { type: 'string', default: 'default' },
            },
          },
        },
        {
          name: 'browser_list_tabs',
          description: 'List all tabs',
          inputSchema: {
            type: 'object',
            properties: {
              profile: { type: 'string', default: 'default' },
            },
          },
        },
      ],
    };
  });

  // 处理工具调用
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const tool = toolHandlers[name];
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }

      const result = await tool(args);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

async function startStdioServer() {
  const server = createAiosBrowserServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('AIOS Browser MCP Server running on stdio');
}

async function startHttpServer() {
  const host = String(process.env.MCP_HTTP_HOST || '127.0.0.1').trim() || '127.0.0.1';
  const port = parsePortEnv(process.env.MCP_HTTP_PORT, 43110);
  const token = String(process.env.MCP_HTTP_TOKEN || '').trim();
  if (!token) {
    throw new Error('MCP_HTTP_TOKEN is required when MCP_HTTP=1');
  }

  const sessionTtlMs = parseDurationMsEnv(process.env.MCP_HTTP_SESSION_TTL_MS, 30 * 60 * 1000);
  const app = createMcpExpressApp({ host });

  type SessionEntry = {
    transport: StreamableHTTPServerTransport;
    server: Server;
    lastSeenAt: number;
  };
  const sessions = new Map<string, SessionEntry>();

  function touchSession(sessionId: string) {
    const entry = sessions.get(sessionId);
    if (entry) {
      entry.lastSeenAt = Date.now();
    }
  }

  function closeSession(sessionId: string) {
    const entry = sessions.get(sessionId);
    if (!entry) return;
    sessions.delete(sessionId);
    entry.transport.close().catch((error) => {
      console.error(`[mcp-http] failed closing session ${sessionId}:`, error);
    });
  }

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [sessionId, entry] of sessions.entries()) {
      if (now - entry.lastSeenAt > sessionTtlMs) {
        console.error(`[mcp-http] session ttl expired: ${sessionId}`);
        closeSession(sessionId);
      }
    }
  }, Math.min(sessionTtlMs, 60_000));
  cleanupTimer.unref?.();

  app.all('/mcp', async (req: any, res: any) => {
    const headerToken = extractBearerToken(req.headers?.authorization);
    if (!headerToken || !safeTimingEqual(headerToken, token)) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized' },
        id: null,
      });
      return;
    }

    try {
      const rawSessionId = req.headers?.['mcp-session-id'];
      const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
      const sid = typeof sessionId === 'string' ? sessionId.trim() : '';

      if (sid) {
        const entry = sessions.get(sid);
        if (!entry) {
          res.status(404).json({
            jsonrpc: '2.0',
            error: { code: -32004, message: 'Not Found: Unknown session' },
            id: null,
          });
          return;
        }

        entry.lastSeenAt = Date.now();
        await entry.transport.handleRequest(req, res, req.body);
        return;
      }

      if (req.method !== 'POST' || !isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
          id: null,
        });
        return;
      }

      const server = createAiosBrowserServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          sessions.set(newSessionId, {
            transport,
            server,
            lastSeenAt: Date.now(),
          });
        },
      });

      transport.onclose = () => {
        const closedSessionId = transport.sessionId;
        if (closedSessionId) {
          sessions.delete(closedSessionId);
        }
      };

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);

      const initializedSessionId = transport.sessionId;
      if (initializedSessionId) {
        touchSession(initializedSessionId);
      }
    } catch (error) {
      console.error('[mcp-http] error handling request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  const httpServer = app.listen(port, host, () => {
    console.error(`AIOS Browser MCP Server HTTP listening on http://${host}:${port}/mcp`);
  });

  httpServer.on('error', (error: any) => {
    console.error('[mcp-http] failed to start http server:', error);
    process.exit(1);
  });

  process.on('SIGINT', () => {
    console.error('Shutting down MCP HTTP server...');
    for (const sessionId of sessions.keys()) {
      closeSession(sessionId);
    }
    httpServer.close(() => process.exit(0));
  });
}

// 启动服务器
async function main() {
  const stopIdleCleanup = startBrowserIdleCleanup();
  installBrowserShutdownHandlers(stopIdleCleanup);
  await startStdioServer();

  if (parseBoolEnv(process.env.MCP_HTTP, false)) {
    await startHttpServer();
  }
}

main().catch(console.error);
