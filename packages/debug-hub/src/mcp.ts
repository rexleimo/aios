import type { Storage } from './storage.js';
import type { SearchQuery, LogLevel } from './types.js';

export const mcpToolDefinitions = [
  {
    name: 'debug_hub.list_traces',
    description: 'List recent debug traces',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max traces to return', default: 20 },
      },
    },
  },
  {
    name: 'debug_hub.get_trace',
    description: 'Get full trace details by trace ID',
    inputSchema: {
      type: 'object',
      properties: {
        traceId: { type: 'string', description: 'The trace ID' },
      },
      required: ['traceId'],
    },
  },
  {
    name: 'debug_hub.search_logs',
    description: 'Search logs by keyword, level, time range, or module',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'Search keyword in message' },
        level: { type: 'string', enum: ['debug', 'info', 'warn', 'error', 'fatal'] },
        since: { type: 'number', description: 'Unix timestamp ms, only return logs after this time' },
        module: { type: 'string', description: 'Filter by source module name' },
        traceId: { type: 'string', description: 'Filter by trace ID' },
        limit: { type: 'number', default: 50 },
      },
    },
  },
  {
    name: 'debug_hub.get_stats',
    description: 'Get log statistics (counts, error summary)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'debug_hub.clear_logs',
    description: 'Clear collected logs',
    inputSchema: {
      type: 'object',
      properties: {
        olderThan: { type: 'number', description: 'Unix timestamp ms, only clear logs older than this' },
      },
    },
  },
];

export function createMcpHandler(storage: Storage) {
  return async function handleTool(name: string, args: Record<string, unknown>): Promise<any> {
    switch (name) {
      case 'debug_hub.list_traces':
        return await storage.listTraces((args.limit as number) ?? 20);

      case 'debug_hub.get_trace':
        return await storage.getTrace(args.traceId as string);

      case 'debug_hub.search_logs':
        return await storage.searchLogs({
          keyword: args.keyword as string | undefined,
          level: args.level as LogLevel | undefined,
          since: args.since as number | undefined,
          module: args.module as string | undefined,
          traceId: args.traceId as string | undefined,
          limit: (args.limit as number) ?? 50,
        });

      case 'debug_hub.get_stats':
        return await storage.getStats();

      case 'debug_hub.clear_logs':
        await storage.clearLogs(args.olderThan as number | undefined);
        return { success: true };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  };
}
