import { PassThrough } from 'node:stream';

export const searchResult = {
  rerank_score: 2.4, title: 'Example', url: 'https://example.com/article',
  snippet: 'Short snippet', summary: 'Long summary', content: '',
  site_name: null, site_icon: null, date: null, authority: -1,
};

export const fakeEnv = () => ({ DEEPSEEK_API_KEY: 'fake-key-for-offline-tests' });
export const jsonResponse = (value, options) => Response.json(value, options);
export const unexpectedHttp = async () => { throw new Error('Unexpected HTTP call in offline test'); };

export function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

export async function createHarness(options = {}) {
  const { startSearchMcp } = await import('../../../aios-search-mcp.mjs');
  const input = new PassThrough();
  const output = new PassThrough();
  const messages = [];
  const waiting = new Map();
  let buffer = '';
  output.on('data', (chunk) => {
    buffer += chunk.toString();
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const message = JSON.parse(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      messages.push(message);
      waiting.get(message.id)?.(message);
      waiting.delete(message.id);
    }
  });
  const diagnostics = [];
  const server = await startSearchMcp({
    input, output, getEnv: fakeEnv, fetchImpl: unexpectedHttp,
    onDiagnostic: (event) => diagnostics.push(event), ...options,
  });
  const closed = new Promise((resolve) => { server.onclose = resolve; });
  let nextId = 1;
  const request = (method, params) => {
    const id = nextId++;
    const reply = new Promise((resolve) => waiting.set(id, resolve));
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params && { params }) })}\n`);
    return reply;
  };
  const notify = (method, params) => input.write(`${JSON.stringify({ jsonrpc: '2.0', method, ...(params && { params }) })}\n`);
  return {
    input, output, server, closed, messages, diagnostics, request, notify,
    async initialize(protocolVersion = '2025-06-18') {
      const reply = await request('initialize', {
        protocolVersion, capabilities: {}, clientInfo: { name: 'offline-test', version: '1' },
      });
      notify('notifications/initialized');
      await request('ping');
      return reply;
    },
    async close() { await server.close(); input.destroy(); output.destroy(); },
  };
}
