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
  {
    name: 'debug_hub.start_session',
    description: 'Create or attach to an agent debugging session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Optional stable session ID' },
        objective: { type: 'string', description: 'Debugging objective' },
        workspace: { type: 'string', description: 'Workspace path or project name' },
        agent: { type: 'string', description: 'Agent/client name' },
        tags: { type: 'object', description: 'Session tags' },
      },
      required: ['objective'],
    },
  },
  {
    name: 'debug_hub.record_event',
    description: 'Record structured debugging evidence in a session',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        runId: { type: 'string' },
        hypothesisId: { type: 'string' },
        kind: {
          type: 'string',
          enum: ['log', 'hypothesis', 'tool_call', 'artifact', 'environment', 'verification', 'span', 'note'],
        },
        level: { type: 'string', enum: ['debug', 'info', 'warn', 'error', 'fatal'] },
        message: { type: 'string' },
        payload: { type: 'object' },
        trace: { type: 'object' },
        source: { type: 'object' },
        tags: { type: 'object' },
      },
      required: ['message'],
    },
  },
  {
    name: 'debug_hub.get_session',
    description: 'Get a debugging session with recorded evidence',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'debug_hub.timeline',
    description: 'Get compact chronological debugging events',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        limit: { type: 'number', default: 100 },
      },
    },
  },
  {
    name: 'debug_hub.health',
    description: 'Get debug-hub ingest and storage health',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'debug_hub.compact_context',
    description: 'Get a token-bounded debugging handoff context pack',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        limit: { type: 'number', default: 20 },
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

      case 'debug_hub.start_session':
        return await storage.createSession({
          sessionId: args.sessionId as string | undefined,
          objective: args.objective as string,
          workspace: args.workspace as string | undefined,
          agent: args.agent as string | undefined,
          tags: args.tags as Record<string, string> | undefined,
        });

      case 'debug_hub.record_event':
        return await storage.recordEvent({
          sessionId: args.sessionId as string | undefined,
          runId: args.runId as string | undefined,
          hypothesisId: args.hypothesisId as string | undefined,
          kind: args.kind as any,
          level: args.level as LogLevel | undefined,
          message: args.message as string,
          payload: args.payload as Record<string, unknown> | undefined,
          trace: args.trace as any,
          source: args.source as any,
          tags: args.tags as Record<string, string> | undefined,
        });

      case 'debug_hub.get_session':
        return await storage.getSessionDetail(args.sessionId as string);

      case 'debug_hub.timeline':
        return await storage.getTimeline({
          sessionId: args.sessionId as string | undefined,
          limit: args.limit as number | undefined,
        });

      case 'debug_hub.health':
        return await storage.getHealth();

      case 'debug_hub.compact_context':
        return await storage.getCompactContext({
          sessionId: args.sessionId as string | undefined,
          limit: args.limit as number | undefined,
        });

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  };
}
