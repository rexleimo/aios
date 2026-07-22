import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { startServer } from '../src/server.js';

async function startTestServer(port: number, dataDir: string) {
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const running = await startServer({ port, dataDir, transport: serverTransport });
  const client = new Client({ name: 'debug-hub-test-client', version: '1.0.0' });
  await client.connect(clientTransport);
  return { ...running, client };
}

describe('debug-hub MCP startup', () => {
  it('completes MCP initialize when the HTTP port is already owned', async () => {
    const firstDataDir = mkdtempSync(join(tmpdir(), 'debug-hub-first-'));
    const secondDataDir = mkdtempSync(join(tmpdir(), 'debug-hub-second-'));
    let first: Awaited<ReturnType<typeof startTestServer>> | undefined;
    let second: Awaited<ReturnType<typeof startTestServer>> | undefined;

    try {
      first = await startTestServer(0, firstDataDir);
      const port = first.http.address().port;
      second = await startTestServer(port, secondDataDir);

      const result = await second.client.listTools();
      assert.ok(result.tools.some((tool) => tool.name === 'debug_hub.get_stats'));
    } finally {
      await second?.client.close();
      await second?.mcp.close();
      await second?.http.close();
      await first?.client.close();
      await first?.mcp.close();
      await first?.http.close();
      rmSync(firstDataDir, { recursive: true, force: true });
      rmSync(secondDataDir, { recursive: true, force: true });
    }
  });
});
