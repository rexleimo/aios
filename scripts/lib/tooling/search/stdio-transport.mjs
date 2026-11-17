import {
  CallToolRequestSchema, InitializeRequestSchema, JSONRPCMessageSchema,
  ListToolsRequestSchema, PingRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { LIMITS } from './contracts.mjs';
import { SearchError } from './errors.mjs';

const PROTOCOL_ERRORS = new Map([
  [-32700, 'Parse error'], [-32600, 'Invalid request'], [-32601, 'Method not found'],
  [-32602, 'Invalid params'], [-32603, 'Internal error'],
  [-32002, 'Server not initialized'],
]);
const REQUEST_SCHEMAS = new Map([
  ['initialize', InitializeRequestSchema], ['ping', PingRequestSchema],
  ['tools/list', ListToolsRequestSchema], ['tools/call', CallToolRequestSchema],
]);

function safeProtocolError(message) {
  if (!message.error) return message;
  const code = PROTOCOL_ERRORS.has(message.error.code) ? message.error.code : -32603;
  return { jsonrpc: '2.0', id: message.id, error: { code, message: PROTOCOL_ERRORS.get(code) } };
}

// The SDK owns MCP; this transport only bounds and sanitizes newline-delimited IO.
export class BoundedStdioTransport {
  constructor(input, output) {
    this.input = input;
    this.output = output;
    this.buffer = Buffer.alloc(LIMITS.lineBytes);
    this.used = 0;
    this.dropping = false;
    this.started = false;
    this.closed = false;
    this.ending = false;
    this.queuedBytes = 0;
    this.pendingWrites = new Set();
    this.onData = (chunk) => this.readChunk(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    this.onEnd = () => {
      this.ending = true;
      if (this.used && !this.dropping) this.readLine(this.buffer.subarray(0, this.used));
      // Let already-dispatched synchronous RPC replies flush before aborting HTTP.
      setImmediate(() => { void this.close(); });
    };
    this.onStreamError = () => {
      if (this.closed) return;
      this.onerror?.(new SearchError('internal'));
      void this.close();
    };
    this.onStreamClose = () => { void this.close(); };
    this.onInputClose = () => { if (!this.ending) void this.close(); };
  }

  async start() {
    if (this.started || this.closed) throw new SearchError('internal');
    this.started = true;
    this.input.on('data', this.onData);
    this.input.on('end', this.onEnd);
    this.input.on('close', this.onInputClose);
    this.input.on('error', this.onStreamError);
    this.output.on('error', this.onStreamError);
    this.output.on('close', this.onStreamClose);
  }

  readChunk(chunk) {
    let offset = 0;
    while (offset < chunk.length && !this.closed) {
      const newline = chunk.indexOf(10, offset);
      const end = newline === -1 ? chunk.length : newline;
      const bytes = end - offset;
      if (!this.dropping && this.used + bytes > LIMITS.lineBytes) {
        this.used = 0;
        this.dropping = true;
        this.replyError(-32600);
      }
      if (!this.dropping) {
        chunk.copy(this.buffer, this.used, offset, end);
        this.used += bytes;
      }
      if (newline === -1) break;
      if (!this.dropping) this.readLine(this.buffer.subarray(0, this.used));
      this.used = 0;
      this.dropping = false;
      offset = newline + 1;
    }
  }

  readLine(bytes) {
    let text;
    let message;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (!text.trim()) return;
      message = JSON.parse(text);
    } catch {
      this.replyError(-32700);
      return;
    }
    const parsed = JSONRPCMessageSchema.safeParse(message);
    if (!parsed.success) {
      this.replyError(-32600);
      return;
    }
    const requestSchema = REQUEST_SCHEMAS.get(parsed.data.method);
    if (parsed.data.id !== undefined && requestSchema && !requestSchema.safeParse(parsed.data).success) {
      this.replyError(-32602, parsed.data.id);
      return;
    }
    try { this.onmessage?.(parsed.data); } catch { this.onStreamError(); }
  }

  replyError(code, id = null) {
    void this.send({ jsonrpc: '2.0', id, error: { code, message: '' } }).catch(() => {});
  }

  send(message) {
    if (this.closed) return Promise.reject(new SearchError('cancelled'));
    let frame;
    try { frame = `${JSON.stringify(safeProtocolError(message))}\n`; } catch {
      return Promise.reject(new SearchError('internal'));
    }
    const bytes = Buffer.byteLength(frame);
    if (bytes > LIMITS.outputBytes) return Promise.reject(new SearchError('response_too_large'));
    if (this.queuedBytes + bytes > LIMITS.queuedOutputBytes) {
      this.onStreamError();
      return Promise.reject(new SearchError('busy'));
    }
    return new Promise((resolve, reject) => {
      const pending = { reject, bytes };
      this.pendingWrites.add(pending);
      this.queuedBytes += bytes;
      const finish = (error) => {
        if (!this.pendingWrites.delete(pending)) return;
        this.queuedBytes -= bytes;
        if (error) {
          reject(new SearchError('internal'));
          this.onStreamError();
        } else resolve();
      };
      try { this.output.write(frame, finish); } catch { finish(true); }
    });
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.input.off('data', this.onData);
    this.input.off('end', this.onEnd);
    this.input.off('close', this.onInputClose);
    this.input.off('error', this.onStreamError);
    this.output.off('close', this.onStreamClose);
    // Keep the safe error listener until queued writes have left the stream.
    if (this.pendingWrites.size === 0) this.output.off('error', this.onStreamError);
    if (this.input.listenerCount('data') === 0) this.input.pause();
    this.used = 0;
    this.buffer = Buffer.alloc(0);
    for (const pending of this.pendingWrites) pending.reject(new SearchError('cancelled'));
    this.pendingWrites.clear();
    this.queuedBytes = 0;
    this.onclose?.();
  }
}
