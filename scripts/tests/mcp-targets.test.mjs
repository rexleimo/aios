import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { collectClientMcpTargets } from '../lib/components/browser/mcp-targets.mjs';

test('collectClientMcpTargets routes each client to its real location/format with dual-scope support', () => {
  const projectRoot = '/proj';
  const clientHomes = {
    codex: '/home/u/.codex',
    claude: '/home/u/.claude',
    gemini: '/home/u/.gemini',
    opencode: '/home/u/.config/opencode',
  };
  const targets = collectClientMcpTargets({ projectRoot, clientHomes });

  // codex: dual scope — home + project
  const codexTargets = targets.filter((t) => t.client === 'codex');
  assert.equal(codexTargets.length, 2);
  assert.equal(codexTargets.find((t) => t.scope === 'home').path, path.resolve('/home/u/.codex/config.toml'));
  assert.equal(codexTargets.find((t) => t.scope === 'home').createIfMissing, false);
  assert.equal(codexTargets.find((t) => t.scope === 'project').path, path.resolve('/proj/.codex/config.toml'));
  assert.equal(codexTargets.find((t) => t.scope === 'project').format, 'toml');
  assert.equal(codexTargets.find((t) => t.scope === 'project').createIfMissing, true);

  // claude: dual scope — project + home
  const claudeTargets = targets.filter((t) => t.client === 'claude');
  assert.equal(claudeTargets.length, 2);
  assert.equal(claudeTargets.find((t) => t.scope === 'project').path, path.resolve('/proj/.mcp.json'));
  assert.equal(claudeTargets.find((t) => t.scope === 'project').format, 'json');
  assert.equal(claudeTargets.find((t) => t.scope === 'project').namespace, 'mcpServers');
  assert.equal(claudeTargets.find((t) => t.scope === 'project').createIfMissing, true);
  assert.equal(claudeTargets.find((t) => t.scope === 'home').path, path.resolve('/home/u/.claude/.mcp.json'));

  // gemini: dual scope — project + home
  const geminiTargets = targets.filter((t) => t.client === 'gemini');
  assert.equal(geminiTargets.length, 2);
  assert.equal(geminiTargets.find((t) => t.scope === 'project').path, path.resolve('/proj/.gemini/settings.json'));
  assert.equal(geminiTargets.find((t) => t.scope === 'project').format, 'json');
  assert.equal(geminiTargets.find((t) => t.scope === 'project').createIfMissing, true);
  assert.equal(geminiTargets.find((t) => t.scope === 'home').path, path.resolve('/home/u/.gemini/settings.json'));

  // opencode: single scope — home only
  const ocTargets = targets.filter((t) => t.client === 'opencode');
  assert.equal(ocTargets.length, 1);
  assert.equal(ocTargets[0].path, path.resolve('/home/u/.config/opencode/opencode.json'));
  assert.equal(ocTargets[0].format, 'opencode-json');
  assert.equal(ocTargets[0].namespace, 'mcp');
  assert.equal(ocTargets[0].createIfMissing, false);
});

test('collectClientMcpTargets includes project-scoped fallbacks when home is unavailable', () => {
  const targets = collectClientMcpTargets({ projectRoot: '/proj', clientHomes: { claude: '' } });
  const clients = [...new Set(targets.map((t) => t.client))].sort();
  // codex: home scope skipped (no home) → project scope present
  // claude: project scope present
  // gemini: home scope skipped → project scope present
  // opencode: home only -> skipped (no project scope)
  // crush: project AGENTS.md fallback shares the codex/opencode instruction surface.
  assert.deepEqual(clients, ['claude', 'codex', 'crush', 'gemini']);
});
