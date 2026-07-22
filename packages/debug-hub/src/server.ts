import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Storage } from './storage.js';
import { EventBus } from './events.js';
import { createApiServer, type ApiServer } from './api.js';
import { createMcpHandler, mcpToolDefinitions } from './mcp.js';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface ServerOptions {
  port?: number;
  dataDir?: string;
  transport?: Transport;
}

export async function startServer(options: ServerOptions = {}): Promise<{ http: ApiServer; mcp: Server }> {
  const port = options.port ?? 39200;
  const dataDir = options.dataDir ?? join(homedir(), '.debug-hub');

  const storage = new Storage(dataDir);
  const events = new EventBus();
  const handler = createMcpHandler(storage);

  // Start HTTP API
  const http = createApiServer(storage, events);
  let httpPort = port;
  let ownsHttpPort = true;
  try {
    await http.listen(port);
    httpPort = http.address().port;
  } catch (error) {
    if (!(error instanceof Error && (error as NodeJS.ErrnoException).code === 'EADDRINUSE')) {
      throw error;
    }
    ownsHttpPort = false;
    console.error(`⚠ debug-hub HTTP API port ${port} is already in use; continuing MCP on stdio`);
  }

  // Create MCP server
  const mcp = new Server(
    { name: 'debug-hub', version: '0.3.0' },
    { capabilities: { tools: {} } }
  );

  mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: mcpToolDefinitions,
  }));

  mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await handler(name, (args ?? {}) as Record<string, unknown>);
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }) }],
        isError: true,
      };
    }
  });

  // Keep MCP startup independent from optional HTTP port ownership.
  const transport = options.transport ?? new StdioServerTransport();
  await mcp.connect(transport);

  console.error(`✓ debug-hub server started`);
  console.error(`  HTTP API:  http://127.0.0.1:${httpPort}/api${ownsHttpPort ? '' : ' (existing listener)'}`);
  console.error(`  Web UI:    http://127.0.0.1:${httpPort}${ownsHttpPort ? '' : ' (existing listener)'}`);
  console.error(`  MCP:       stdio mode`);

  return { http, mcp };
}

// Re-export for programmatic use
export { Storage } from './storage.js';
export { EventBus } from './events.js';
export { createApiServer } from './api.js';
export { createMcpHandler, mcpToolDefinitions } from './mcp.js';
export type * from './types.js';
