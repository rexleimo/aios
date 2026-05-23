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
  assert.deepEqual(ALL_CLIENTS, ['codex', 'claude', 'gemini', 'opencode']);
  assert.deepEqual(CLIENT_SELECTIONS, ['all', 'codex', 'claude', 'gemini', 'opencode']);
  assert.deepEqual(CLIENT_CAPABILITIES, ['skills', 'agents', 'superpowers', 'native', 'team', 'harness']);
});

test('client registry resolves selection lists without reordering', () => {
  assert.deepEqual(resolveClientSelection('all'), ['codex', 'claude', 'gemini', 'opencode']);
  assert.deepEqual(resolveClientSelection('  claude  '), ['claude']);
});

test('client registry validation returns normalized values for reuse', () => {
  assert.equal(assertKnownClient('  CODEX  '), 'codex');
  assert.equal(assertKnownCapability('  AGENTS  '), 'agents');
  assert.equal(isKnownClient(' OpenCode '), true);
  assert.equal(isKnownCapability(' SuperPowers '), true);
});

test('client registry keeps capability-specific ordering', () => {
  assert.deepEqual(resolveClientsWithCapability('agents', 'all'), ['claude', 'codex']);
  assert.deepEqual(resolveClientsWithCapability('superpowers', 'all'), ['codex', 'claude']);
  assert.deepEqual(resolveClientsWithCapability('team', 'all'), ['codex', 'claude', 'gemini']);
  assert.deepEqual(resolveClientsWithCapability('harness', 'all'), ['codex', 'claude', 'gemini', 'opencode']);
});

test('client registry exposes shared skill roots for selected clients', () => {
  assert.deepEqual(resolveClientSkillRoots('all'), [
    '.codex/skills',
    '.claude/skills',
    '.gemini/skills',
    '.opencode/skills',
    '.agents/skills',
  ]);
  assert.deepEqual(resolveClientSkillRoots('opencode'), ['.opencode/skills', '.agents/skills']);
});

test('client registry exposes runtime command and client identifiers', () => {
  assert.equal(getClientCommandName('claude'), 'claude');
  assert.equal(getClientRuntimeId('claude'), 'claude-code');
  assert.equal(resolveClientFromCommandName('opencode'), 'opencode');
  assert.equal(resolveClientFromRuntimeId('opencode-cli'), 'opencode');
  assert.deepEqual(resolveClientCommandNames('all'), ['codex', 'claude', 'gemini', 'opencode']);
  assert.deepEqual(resolveClientRuntimeIds('all'), ['codex-cli', 'claude-code', 'gemini-cli', 'opencode-cli']);
  assert.deepEqual(buildRuntimeClientProviderMap('all'), {
    'codex-cli': 'codex',
    'claude-code': 'claude',
    'gemini-cli': 'gemini',
    'opencode-cli': 'opencode',
  });
});

test('client registry exposes team and harness provider subsets', () => {
  assert.deepEqual(resolveClientTeamProviders('all'), ['codex', 'claude', 'gemini']);
  assert.deepEqual(resolveClientTeamProviders('opencode'), []);
  assert.deepEqual(resolveClientHarnessProviders('opencode'), ['opencode']);
  assert.deepEqual(buildTeamProviderRuntimeClientMap('all'), {
    codex: 'codex-cli',
    claude: 'claude-code',
    gemini: 'gemini-cli',
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
  assert.equal(supportsClientCapability('opencode', 'agents'), false);
  assert.equal(getClientCapability('opencode', 'superpowers'), false);
});

test('client registry facade re-exports split module APIs', () => {
  assert.equal(registry.ALL_CLIENTS, ALL_CLIENTS);
  assert.equal(registry.resolveClientSelection, resolveClientSelection);
  assert.equal(registry.resolveClientsWithCapability, resolveClientsWithCapability);
  assert.equal(registry.resolveClientSkillRoots, resolveClientSkillRoots);
  assert.equal(registry.getClientRuntimeId, getClientRuntimeId);
  assert.equal(registry.resolveClientTeamProviders, resolveClientTeamProviders);
  assert.equal(registry.buildRuntimeClientModelArgs, buildRuntimeClientModelArgs);
});
