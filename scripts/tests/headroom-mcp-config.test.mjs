import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  readHeadroomEntry,
  resolveHeadroomConfigTargets,
} from '../lib/aios-init/headroom-mcp/config-readers.mjs';

test('readHeadroomEntry normalizes Gemini JSON, Hermes YAML and Grok TOML', async () => {
  const gemini = await readHeadroomEntry(
    { format: 'json', namespace: 'mcpServers', path: '/tmp/settings.json' },
    { readFileImpl: async () => JSON.stringify({
      mcpServers: {
        headroom: {
          command: '/opt/headroom',
          args: ['mcp', 'serve'],
          env: { HEADROOM_MCP_READ: 'off', HEADROOM_MCP_CLIENT: 'gemini-cli' },
        },
      },
    }) },
  );
  assert.deepEqual(gemini.entry, {
    command: '/opt/headroom',
    args: ['mcp', 'serve'],
    env: { HEADROOM_MCP_CLIENT: 'gemini-cli', HEADROOM_MCP_READ: 'off' },
  });

  const desired = {
    command: '/opt/Headroom Bin/headroom',
    args: ['mcp', 'serve'],
    env: { HEADROOM_MCP_CLIENT: 'hermes-agent', HEADROOM_MCP_READ: 'off' },
  };
  const hermes = await readHeadroomEntry(
    { format: 'yaml', namespace: 'mcp_servers', path: '/tmp/config.yaml' },
    { readFileImpl: async () => `mcp_servers:\n  headroom:\n    command: "${desired.command}"\n    args: [mcp, serve]\n    env:\n      HEADROOM_MCP_CLIENT: hermes-agent\n      HEADROOM_MCP_READ: "off"\n    enabled: true\n    tools: [headroom_compress, headroom_retrieve, headroom_stats]\n` },
  );
  assert.deepEqual(hermes.entry.command, desired.command);
  assert.deepEqual(hermes.entry.args, desired.args);
  assert.equal(hermes.entry.enabled, true);
  assert.deepEqual(hermes.entry.tools, ['headroom_compress', 'headroom_retrieve', 'headroom_stats']);

  const grok = await readHeadroomEntry(
    { format: 'toml', namespace: 'mcp_servers', path: '/tmp/config.toml' },
    { readFileImpl: async () => '[mcp_servers.headroom]\ncommand = "/opt/headroom"\nargs = ["mcp", "serve"]\nenv = { "HEADROOM_MCP_CLIENT" = "grok-build", "HEADROOM_MCP_READ" = "off" }\n' },
  );
  assert.equal(grok.entry.env.HEADROOM_MCP_CLIENT, 'grok-build');
  assert.equal(grok.entry.env.HEADROOM_MCP_READ, 'off');
});

test('Hermes home target is YAML and named profiles resolve below profiles/<name>', () => {
  const targets = resolveHeadroomConfigTargets({
    runtimeId: 'hermes-agent',
    projectRoot: '/work/app',
    homeDir: '/home/test',
    profile: 'research',
    env: {},
  });

  assert.equal(targets.user.path, path.join('/home/test', '.hermes', 'profiles', 'research', 'config.yaml'));
  assert.equal(targets.user.format, 'yaml');
  assert.equal(targets.user.namespace, 'mcp_servers');
  assert.equal(targets.project.path, path.join('/work/app', '.mcp.json'));
  assert.equal(targets.project.format, 'json');
});

test('readHeadroomEntry reports parse errors without throwing', async () => {
  const result = await readHeadroomEntry(
    { format: 'json', namespace: 'mcpServers', path: '/tmp/bad.json' },
    { readFileImpl: async () => '{bad json' },
  );

  assert.equal(result.entry, null);
  assert.match(result.parseError, /JSON/u);
});
