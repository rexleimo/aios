import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ALL_CLIENTS,
  CLIENT_CAPABILITIES,
  CLIENT_SELECTIONS,
} from '../lib/clients/core/definitions.mjs';
import {
  getClientCapability,
  resolveClientsWithCapability,
  supportsClientCapability,
} from '../lib/clients/capabilities/index.mjs';
import {
  assertKnownCapability,
  assertKnownClient,
  isKnownCapability,
  isKnownClient,
  resolveClientSelection,
} from '../lib/clients/core/selection.mjs';
import {
  resolveClientSkillRoots,
} from '../lib/clients/paths/index.mjs';
import {
  getClientInstructionFileName,
  getClientMcpTarget,
  resolveClientMcpTargetPath,
} from '../lib/clients/native/index.mjs';
import {
  buildRuntimeClientProviderMap,
  buildRuntimeClientModelArgs,
  getClientCommandName,
  getClientUnattendedArgs,
  getClientRuntimeId,
  resolveClientFromCommandName,
  resolveClientFromRuntimeId,
  resolveClientCommandNames,
  resolveClientRuntimeIds,
} from '../lib/clients/runtime/index.mjs';
import {
  buildTeamProviderRuntimeClientMap,
  resolveClientHarnessProviders,
  resolveClientTeamProviders,
} from '../lib/clients/providers/index.mjs';
import * as registry from '../lib/clients/registry.mjs';

test('client registry exposes stable canonical client order', () => {
  assert.deepEqual(ALL_CLIENTS, ['codex', 'claude', 'gemini', 'antigravity', 'opencode', 'crush']);
  assert.deepEqual(CLIENT_SELECTIONS, ['all', 'codex', 'claude', 'gemini', 'antigravity', 'opencode', 'crush']);
  assert.deepEqual(CLIENT_CAPABILITIES, ['skills', 'agents', 'superpowers', 'native', 'team', 'harness']);
});

test('client registry resolves selection lists without reordering', () => {
  assert.deepEqual(resolveClientSelection('all'), ['codex', 'claude', 'gemini', 'antigravity', 'opencode', 'crush']);
  assert.deepEqual(resolveClientSelection('  claude  '), ['claude']);
});

test('client registry validation returns normalized values for reuse', () => {
  assert.equal(assertKnownClient('  CODEX  '), 'codex');
  assert.equal(assertKnownCapability('  AGENTS  '), 'agents');
  assert.equal(isKnownClient(' OpenCode '), true);
  assert.equal(isKnownCapability(' SuperPowers '), true);
});

test('client registry keeps capability-specific ordering', () => {
  assert.deepEqual(resolveClientsWithCapability('agents', 'all'), ['claude', 'codex', 'opencode', 'crush']);
  assert.deepEqual(resolveClientsWithCapability('superpowers', 'all'), ['codex', 'claude', 'gemini', 'antigravity', 'opencode', 'crush']);
  assert.deepEqual(resolveClientsWithCapability('team', 'all'), ['codex', 'claude', 'gemini', 'antigravity']);
  assert.deepEqual(resolveClientsWithCapability('harness', 'all'), ['codex', 'claude', 'gemini', 'antigravity', 'opencode', 'crush']);
});

test('client registry exposes shared skill roots for selected clients', () => {
  assert.deepEqual(resolveClientSkillRoots('all'), [
    '.codex/skills',
    '.claude/skills',
    '.gemini/skills',
    '.opencode/skills',
    '.crush/skills',
    '.agents/skills',
  ]);
  assert.deepEqual(resolveClientSkillRoots('opencode'), ['.opencode/skills', '.agents/skills']);
});

test('client registry exposes runtime command and client identifiers', () => {
  assert.equal(getClientCommandName('claude'), 'claude');
  assert.equal(getClientRuntimeId('claude'), 'claude-code');
  assert.equal(resolveClientFromCommandName('opencode'), 'opencode');
  assert.equal(resolveClientFromRuntimeId('opencode-cli'), 'opencode');
  assert.deepEqual(resolveClientCommandNames('all'), ['codex', 'claude', 'gemini', 'antigravity', 'opencode', 'crush']);
  assert.deepEqual(resolveClientRuntimeIds('all'), ['codex-cli', 'claude-code', 'gemini-cli', 'antigravity-cli', 'opencode-cli', 'crush-cli']);
  assert.deepEqual(buildRuntimeClientProviderMap('all'), {
    'codex-cli': 'codex',
    'claude-code': 'claude',
    'gemini-cli': 'gemini',
    'opencode-cli': 'opencode',
    'crush-cli': 'crush',
    'antigravity-cli': 'antigravity',
  });
});

test('client registry exposes team and harness provider subsets', () => {
  assert.deepEqual(resolveClientTeamProviders('all'), ['codex', 'claude', 'gemini', 'antigravity']);
  assert.deepEqual(resolveClientTeamProviders('opencode'), []);
  assert.deepEqual(resolveClientHarnessProviders('opencode'), ['opencode']);
  assert.deepEqual(buildTeamProviderRuntimeClientMap('all'), {
    codex: 'codex-cli',
    claude: 'claude-code',
    gemini: 'gemini-cli',
    antigravity: 'antigravity-cli',
  });
});

test('client registry exposes runtime argument adapters without consumer if-else', () => {
  assert.deepEqual(buildRuntimeClientModelArgs('codex-cli', 'gpt-5'), ['-m', 'gpt-5']);
  assert.deepEqual(buildRuntimeClientModelArgs('claude-code', 'claude-sonnet'), ['--model', 'claude-sonnet']);
  assert.deepEqual(buildRuntimeClientModelArgs('gemini-cli', 'gemini-2.5-pro'), ['-m', 'gemini-2.5-pro']);
  assert.deepEqual(buildRuntimeClientModelArgs('opencode-cli', 'qwen3'), []);
  assert.deepEqual(getClientUnattendedArgs('codex'), ['--dangerously-bypass-approvals-and-sandbox']);
  assert.deepEqual(getClientUnattendedArgs('opencode'), []);
});

test('client registry reports capability support explicitly', () => {
  assert.equal(supportsClientCapability('codex', 'agents'), true);
  assert.equal(supportsClientCapability(' CODEX ', ' AGENTS '), true);
  assert.equal(supportsClientCapability('opencode', 'agents'), true);
  assert.equal(getClientCapability('opencode', 'superpowers'), true);
  assert.equal(getClientCapability('gemini', 'superpowers'), true);
  assert.equal(supportsClientCapability('gemini', 'agents'), false);
});

test('client registry exposes native instruction filenames per client', () => {
  assert.equal(getClientInstructionFileName('claude'), 'CLAUDE.md');
  assert.equal(getClientInstructionFileName('codex'), 'AGENTS.md');
  assert.equal(getClientInstructionFileName('gemini'), 'GEMINI.md');
  assert.equal(getClientInstructionFileName('opencode'), 'AGENTS.md');
  assert.equal(getClientInstructionFileName('  CLAUDE  '), 'CLAUDE.md');
  assert.equal(getClientInstructionFileName('crush'), 'AGENTS.md');
  assert.equal(getClientInstructionFileName('antigravity'), 'GEMINI.md');
});

test('client registry exposes per-client MCP target conventions (single source of truth)', () => {
  const codexTarget = getClientMcpTarget('codex');
  assert.equal(codexTarget.format, 'toml');
  assert.equal(codexTarget.namespace, 'mcp_servers');
  assert.deepEqual(codexTarget.scopes, [
    { scope: 'home', file: 'config.toml' },
    { scope: 'project', file: '.codex/config.toml' },
  ]);

  const claudeTarget = getClientMcpTarget('claude');
  assert.equal(claudeTarget.format, 'json');
  assert.equal(claudeTarget.namespace, 'mcpServers');
  assert.deepEqual(claudeTarget.scopes, [
    { scope: 'project', file: '.mcp.json' },
    { scope: 'home', file: '.mcp.json' },
  ]);

  const geminiTarget = getClientMcpTarget('gemini');
  assert.equal(geminiTarget.format, 'json');
  assert.equal(geminiTarget.namespace, 'mcpServers');
  assert.deepEqual(geminiTarget.scopes, [
    { scope: 'project', file: '.gemini/settings.json' },
    { scope: 'home', file: 'settings.json' },
  ]);

  const ocTarget = getClientMcpTarget('opencode');
  assert.equal(ocTarget.format, 'opencode-json');
  assert.equal(ocTarget.namespace, 'mcp');
  assert.deepEqual(ocTarget.scopes, [
    { scope: 'home', file: 'opencode.json' },
  ]);
});

test('resolveClientMcpTargetPath honors home vs project scope', () => {
  // home-scoped clients resolve under their client home
  assert.equal(
    resolveClientMcpTargetPath('codex', { projectRoot: '/proj', clientHome: '/home/.codex' }),
    '/home/.codex/config.toml',
  );
  assert.equal(
    resolveClientMcpTargetPath('opencode', { projectRoot: '/proj', clientHome: '/home/.config/opencode' }),
    '/home/.config/opencode/opencode.json',
  );
  // project-scoped clients resolve under the project root
  assert.equal(
    resolveClientMcpTargetPath('claude', { projectRoot: '/proj', clientHome: '/home/.claude' }),
    '/proj/.mcp.json',
  );
  assert.equal(
    resolveClientMcpTargetPath('gemini', { projectRoot: '/proj', clientHome: '/home/.gemini' }),
    '/proj/.gemini/settings.json',
  );
  // codex has dual scope: falls back to project when home is absent
  assert.equal(resolveClientMcpTargetPath('codex', { projectRoot: '/proj' }), '/proj/.codex/config.toml');
});

test('every client declares instruction filename and a valid MCP target', () => {
  for (const client of ALL_CLIENTS) {
    assert.ok(getClientInstructionFileName(client), `${client} instruction filename`);
    const mcp = getClientMcpTarget(client);
    assert.ok(Array.isArray(mcp.scopes) && mcp.scopes.length > 0, `${client} mcp.scopes`);
    for (const s of mcp.scopes) {
      assert.ok(['home', 'project'].includes(s.scope), `${client} mcp.scope value ${s.scope}`);
      assert.ok(s.file, `${client} mcp.scope file`);
    }
    assert.ok(['json', 'toml', 'opencode-json', 'crush-json'].includes(mcp.format), `${client} mcp.format ${mcp.format}`);
    assert.ok(mcp.namespace, `${client} mcp.namespace present`);
  }
});

test('client registry facade re-exports split module APIs', () => {
  assert.equal(registry.ALL_CLIENTS, ALL_CLIENTS);
  assert.equal(registry.resolveClientSelection, resolveClientSelection);
  assert.equal(registry.resolveClientsWithCapability, resolveClientsWithCapability);
  assert.equal(registry.resolveClientSkillRoots, resolveClientSkillRoots);
  assert.equal(registry.getClientRuntimeId, getClientRuntimeId);
  assert.equal(registry.resolveClientTeamProviders, resolveClientTeamProviders);
  assert.equal(registry.buildRuntimeClientModelArgs, buildRuntimeClientModelArgs);
  assert.equal(registry.getClientInstructionFileName, getClientInstructionFileName);
  assert.equal(registry.getClientMcpTarget, getClientMcpTarget);
  assert.equal(registry.resolveClientMcpTargetPath, resolveClientMcpTargetPath);
});
