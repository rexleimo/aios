#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSearchMcpServer } from './lib/tooling/search/mcp-server.mjs';
import { BoundedStdioTransport } from './lib/tooling/search/stdio-transport.mjs';

export async function startSearchMcp({
  input = process.stdin, output = process.stdout,
  onDiagnostic = (event) => process.stderr.write(`${JSON.stringify(event)}\n`),
  ...clientOptions
} = {}) {
  const server = createSearchMcpServer(clientOptions);
  // SDK errors can include received data. Only emit a fixed, structured event.
  server.onerror = () => {
    try { onDiagnostic({ level: 'error', component: 'aios-search', code: 'protocol_or_transport_error' }); } catch { /* Diagnostics must not break stdio. */ }
  };
  await server.connect(new BoundedStdioTransport(input, output));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const server = await startSearchMcp();
    const stop = () => { void server.close(); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch {
    process.stderr.write('{"level":"error","component":"aios-search","code":"startup_failed"}\n');
    process.exitCode = 1;
  }
}
