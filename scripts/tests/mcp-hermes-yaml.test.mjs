import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { migrateOneHermesYaml } from '../lib/components/browser/mcp-hermes-yaml.mjs';
import { AUTH_TOOLS_ALIAS, PRIMARY_BROWSER_ALIAS, SHELL_ALIAS } from '../lib/components/browser/constants.mjs';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

test('migrateOneHermesYaml creates config.yaml when missing', () => {
  const tmpFile = path.join(os.tmpdir(), `hermes-mcp-test-${Date.now()}.yaml`);
  try {
    const result = migrateOneHermesYaml(tmpFile, rootDir);
    assert.equal(result.status, 'created');
    assert.ok(result.nextRaw);
    // Verify YAML content
    const content = result.nextRaw;
    assert.ok(content.includes('mcp_servers:'), 'should contain mcp_servers');
    assert.ok(content.includes(PRIMARY_BROWSER_ALIAS), `should contain ${PRIMARY_BROWSER_ALIAS}`);
    assert.ok(content.includes(AUTH_TOOLS_ALIAS), `should contain ${AUTH_TOOLS_ALIAS}`);
    assert.ok(content.includes(SHELL_ALIAS), `should contain ${SHELL_ALIAS}`);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
});

test('migrateOneHermesYaml is idempotent', () => {
  const tmpFile = path.join(os.tmpdir(), `hermes-mcp-test-${Date.now()}.yaml`);
  try {
    // First write
    const first = migrateOneHermesYaml(tmpFile, rootDir);
    assert.equal(first.status, 'created');
    fs.writeFileSync(tmpFile, first.nextRaw, 'utf8');

    // Second write should be unchanged
    const second = migrateOneHermesYaml(tmpFile, rootDir);
    assert.equal(second.status, 'unchanged');
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
});

test('migrateOneHermesYaml preserves existing user config', () => {
  const tmpFile = path.join(os.tmpdir(), `hermes-mcp-test-${Date.now()}.yaml`);
  try {
    // Write a pre-existing config with unrelated settings
    fs.writeFileSync(tmpFile, `model: claude-sonnet-4\ntools:\n  enabled: [web, terminal]\n`, 'utf8');
    const result = migrateOneHermesYaml(tmpFile, rootDir);

    assert.ok(result.nextRaw.includes('model: claude-sonnet-4'), 'should preserve user model setting');
    assert.ok(result.nextRaw.includes('enabled:'), 'should preserve user tools setting');
    assert.ok(result.nextRaw.includes('mcp_servers:'), 'should add mcp_servers');
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
});

test('migrateOneHermesYaml preserves existing YAML comments', () => {
  const tmpFile = path.join(os.tmpdir(), `hermes-mcp-test-${Date.now()}.yaml`);
  try {
    fs.writeFileSync(
      tmpFile,
      '# user config\nmodel: claude-sonnet-4 # selected model\nmcp_servers:\n  custom: # keep custom server\n    command: custom\n',
      'utf8',
    );

    const result = migrateOneHermesYaml(tmpFile, rootDir);

    assert.equal(result.status, 'updated');
    assert.match(result.nextRaw, /# user config/u);
    assert.match(result.nextRaw, /# selected model/u);
    assert.match(result.nextRaw, /# keep custom server/u);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
});

test('migrateOneHermesYaml repairs changed nested environment values', () => {
  const tmpFile = path.join(os.tmpdir(), `hermes-mcp-test-${Date.now()}.yaml`);
  try {
    const first = migrateOneHermesYaml(tmpFile, rootDir);
    const config = parseYaml(first.nextRaw);
    const browserEnv = config.mcp_servers[PRIMARY_BROWSER_ALIAS].env;
    const [envKey] = Object.keys(browserEnv);
    const expectedValue = browserEnv[envKey];
    browserEnv[envKey] = 'stale-value';
    fs.writeFileSync(tmpFile, stringifyYaml(config), 'utf8');

    const second = migrateOneHermesYaml(tmpFile, rootDir);

    assert.equal(second.status, 'updated');
    const repaired = parseYaml(second.nextRaw);
    assert.equal(repaired.mcp_servers[PRIMARY_BROWSER_ALIAS].env[envKey], expectedValue);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
});

test('migrateOneHermesYaml adds mcp_servers to existing config with pre-existing servers', () => {
  const tmpFile = path.join(os.tmpdir(), `hermes-mcp-test-${Date.now()}.yaml`);
  try {
    fs.writeFileSync(tmpFile, `model: claude-sonnet-4\nmcp_servers:\n  code-review-graph:\n    command: npx\n    args: [code-review-graph]\n`, 'utf8');
    const result = migrateOneHermesYaml(tmpFile, rootDir);

    assert.ok(result.nextRaw.includes('code-review-graph'), 'should preserve existing MCP server');
    assert.ok(result.nextRaw.includes(PRIMARY_BROWSER_ALIAS), `should add ${PRIMARY_BROWSER_ALIAS}`);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
});

test('collectClientMcpTargets includes hermes home scope with createIfMissing', async () => {
  // Dynamic import to avoid hoisting issues
  const { collectClientMcpTargets } = await import('../lib/components/browser/mcp-targets.mjs');

  const targets = collectClientMcpTargets({
    projectRoot: '/tmp/test-project',
    clientHomes: { hermes: '/home/user/.hermes' },
  });

  const hermesTargets = targets.filter((t) => t.client === 'hermes');
  const homeTarget = hermesTargets.find((t) => t.scope === 'home');

  assert.ok(homeTarget, 'hermes home scope target should exist');
  assert.equal(homeTarget.format, 'yaml');
  assert.equal(homeTarget.namespace, 'mcp_servers');
  assert.equal(homeTarget.createIfMissing, true, 'hermes home scope should be creatable');
});
