import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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
  getClientAgentTargetRoot,
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

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

test('client registry exposes stable canonical client order', () => {
  assert.deepEqual(ALL_CLIENTS, ['codex', 'claude', 'gemini', 'opencode', 'hermes', 'grok', 'workbuddy', 'pi', 'zcode', 'qoder']);
  assert.deepEqual(CLIENT_SELECTIONS, ['all', 'codex', 'claude', 'gemini', 'opencode', 'hermes', 'grok', 'workbuddy', 'pi', 'zcode', 'qoder']);
  assert.deepEqual(CLIENT_CAPABILITIES, ['skills', 'agents', 'native', 'team', 'harness']);
});

test('client registry resolves selection lists without reordering', () => {
  assert.deepEqual(resolveClientSelection('all'), ['codex', 'claude', 'gemini', 'opencode', 'hermes', 'grok', 'workbuddy', 'pi', 'zcode', 'qoder']);
  assert.deepEqual(resolveClientSelection('  claude  '), ['claude']);
});

test('client registry validation returns normalized values for reuse', () => {
  assert.equal(assertKnownClient('  CODEX  '), 'codex');
  assert.equal(assertKnownCapability('  AGENTS  '), 'agents');
  assert.equal(isKnownClient(' OpenCode '), true);
  assert.equal(isKnownCapability(' SuperPowers '), false);
});

test('client registry keeps capability-specific ordering', () => {
  assert.deepEqual(resolveClientsWithCapability('agents', 'all'), ['claude', 'codex', 'opencode', 'grok']);
  assert.deepEqual(resolveClientsWithCapability('team', 'all'), ['codex', 'claude', 'gemini', 'opencode', 'grok', 'zcode', 'pi', 'qoder']);
  assert.deepEqual(resolveClientsWithCapability('harness', 'all'), ['codex', 'claude', 'gemini', 'opencode', 'hermes', 'grok', 'workbuddy', 'pi', 'zcode', 'qoder']);
});

test('client registry exposes shared skill roots for selected clients', () => {
  assert.deepEqual(resolveClientSkillRoots('all'), [
    '.codex/skills',
    '.claude/skills',
    '.gemini/skills',
    '.opencode/skills',
    '.hermes/skills',
    '.grok/skills',
    '.workbuddy/skills',
    '.agents/skills',
    '.qoder/skills',
  ]);
  assert.deepEqual(resolveClientSkillRoots('opencode'), ['.opencode/skills', '.agents/skills']);
  assert.deepEqual(resolveClientSkillRoots('grok'), ['.grok/skills', '.agents/skills']);
  assert.deepEqual(resolveClientSkillRoots('workbuddy'), ['.workbuddy/skills', '.agents/skills']);
  // Pi installs into the shared root only: its own .pi/skills would make Pi
  // report the skill as already loaded and skip the shared copy.
  assert.deepEqual(resolveClientSkillRoots('pi'), ['.agents/skills']);
  // ZCode natively scans the shared root too (after .zcode/skills); the shared
  // root is the single project-scope install target, same rule as Pi.
  assert.deepEqual(resolveClientSkillRoots('zcode'), ['.agents/skills']);
  // Qoder's verified project skill root is its own .qoder/skills; the shared
  // legacy root is still appended for selection completeness.
  assert.deepEqual(resolveClientSkillRoots('qoder'), ['.qoder/skills', '.agents/skills']);
});

test('native sync manifest declares generated agent outputs for every agent-capable client', async () => {
  const manifest = JSON.parse(await readFile(path.join(resolveRepoRoot(), 'config', 'native-sync-manifest.json'), 'utf8'));

  for (const client of resolveClientsWithCapability('agents', 'all')) {
    const agentRoot = getClientAgentTargetRoot(client);
    assert.ok(agentRoot, `${client} must expose an agent target root`);
    assert.ok(
      manifest.clients?.[client]?.outputs?.includes(agentRoot),
      `${client} native sync outputs must include ${agentRoot}`
    );
  }
});

test('client registry exposes runtime command and client identifiers', () => {
  assert.equal(getClientCommandName('claude'), 'claude');
  assert.equal(getClientRuntimeId('claude'), 'claude-code');
  assert.equal(resolveClientFromCommandName('opencode'), 'opencode');
  assert.equal(resolveClientFromRuntimeId('opencode-cli'), 'opencode');
  assert.deepEqual(resolveClientCommandNames('all'), ['codex', 'claude', 'gemini', 'opencode', 'hermes', 'grok', 'codebuddy', 'pi', 'zcode', 'qoder']);
  assert.deepEqual(resolveClientRuntimeIds('all'), ['codex-cli', 'claude-code', 'gemini-cli', 'opencode-cli', 'hermes-agent', 'grok-build', 'workbuddy-agent', 'pi-coding-agent', 'zcode-cli', 'qoder-cli']);
  assert.deepEqual(buildRuntimeClientProviderMap('all'), {
    'codex-cli': 'codex',
    'claude-code': 'claude',
    'gemini-cli': 'gemini',
    'opencode-cli': 'opencode',
    'hermes-agent': 'hermes',
    'grok-build': 'grok',
    'workbuddy-agent': 'workbuddy',
    'pi-coding-agent': 'pi',
    'zcode-cli': 'zcode',
    'qoder-cli': 'qoder',
  });
});

test('client registry exposes team and harness provider subsets', () => {
  assert.deepEqual(resolveClientTeamProviders('all'), ['codex', 'claude', 'gemini', 'opencode', 'grok', 'zcode', 'pi', 'qoder']);
  assert.deepEqual(resolveClientTeamProviders('opencode'), ['opencode']);
  assert.deepEqual(resolveClientTeamProviders('grok'), ['grok']);
  assert.deepEqual(resolveClientTeamProviders('zcode'), ['zcode']);
  assert.deepEqual(resolveClientTeamProviders('pi'), ['pi']);
  assert.deepEqual(resolveClientTeamProviders('qoder'), ['qoder']);
  assert.deepEqual(resolveClientHarnessProviders('opencode'), ['opencode']);
  assert.deepEqual(resolveClientHarnessProviders('grok'), ['grok']);
  assert.deepEqual(buildTeamProviderRuntimeClientMap('all'), {
    codex: 'codex-cli',
    claude: 'claude-code',
    gemini: 'gemini-cli',
    opencode: 'opencode-cli',
    grok: 'grok-build',
    zcode: 'zcode-cli',
    pi: 'pi-coding-agent',
    qoder: 'qoder-cli',
  });
});

test('client registry exposes runtime argument adapters without consumer if-else', () => {
  assert.deepEqual(buildRuntimeClientModelArgs('codex-cli', 'gpt-5'), ['-m', 'gpt-5']);
  assert.deepEqual(buildRuntimeClientModelArgs('claude-code', 'claude-sonnet'), ['--model', 'claude-sonnet']);
  assert.deepEqual(buildRuntimeClientModelArgs('gemini-cli', 'gemini-2.5-pro'), ['-m', 'gemini-2.5-pro']);
  assert.deepEqual(buildRuntimeClientModelArgs('opencode-cli', 'qwen3'), ['-m', 'qwen3']);
  assert.deepEqual(buildRuntimeClientModelArgs('grok-build', 'grok-build'), ['-m', 'grok-build']);
  assert.deepEqual(buildRuntimeClientModelArgs('pi-coding-agent', 'openai/gpt-4o'), ['--model', 'openai/gpt-4o']);
  // ZCode has no headless --model flag (verified against zcode 0.16.5): model
  // routing degrades to an empty arg vector instead of inventing a flag.
  assert.deepEqual(buildRuntimeClientModelArgs('zcode-cli', 'glm-4.7'), []);
  // Qoder has no verified headless --model (model is chosen interactively via /model).
  assert.deepEqual(buildRuntimeClientModelArgs('qoder-cli', 'qoder-default'), []);
  assert.deepEqual(getClientUnattendedArgs('codex'), ['--dangerously-bypass-approvals-and-sandbox']);
  assert.deepEqual(getClientUnattendedArgs('opencode'), ['run', '--dangerously-skip-permissions']);
  assert.deepEqual(getClientUnattendedArgs('grok'), ['--always-approve']);
  assert.deepEqual(getClientUnattendedArgs('pi'), []);
  assert.deepEqual(getClientUnattendedArgs('zcode'), ['--mode', 'yolo']);
  assert.deepEqual(getClientUnattendedArgs('qoder'), ['--yolo']);
});

test('client registry reports capability support explicitly', () => {
  assert.equal(supportsClientCapability('codex', 'agents'), true);
  assert.equal(supportsClientCapability(' CODEX ', ' AGENTS '), true);
  assert.equal(supportsClientCapability('opencode', 'agents'), true);
  assert.throws(() => getClientCapability('opencode', 'superpowers'), /unsupported client capability: superpowers/u);
  assert.equal(supportsClientCapability('gemini', 'agents'), false);
});

test('client registry exposes native instruction filenames per client', () => {
  assert.equal(getClientInstructionFileName('claude'), 'CLAUDE.md');
  assert.equal(getClientInstructionFileName('codex'), 'AGENTS.md');
  assert.equal(getClientInstructionFileName('gemini'), 'GEMINI.md');
  assert.equal(getClientInstructionFileName('opencode'), 'AGENTS.md');
  assert.equal(getClientInstructionFileName('grok'), 'AGENTS.md');
  assert.equal(getClientInstructionFileName('workbuddy'), 'AGENTS.md');
  assert.equal(getClientInstructionFileName('pi'), 'AGENTS.md');
  assert.equal(getClientInstructionFileName('zcode'), 'AGENTS.md');
  assert.equal(getClientInstructionFileName('qoder'), 'AGENTS.md');
  assert.equal(getClientInstructionFileName('  CLAUDE  '), 'CLAUDE.md');
});

test('client registry exposes per-client MCP target conventions (single source of truth)', () => {
  const codexTarget = getClientMcpTarget('codex');
  assert.equal(codexTarget.format, 'toml');
  assert.equal(codexTarget.namespace, 'mcp_servers');
  assert.deepEqual(codexTarget.scopes, [
    { scope: 'home', file: 'config.toml', createIfMissing: true },
    { scope: 'project', file: '.codex/config.toml' },
  ]);

  const claudeTarget = getClientMcpTarget('claude');
  assert.equal(claudeTarget.format, 'json');
  assert.equal(claudeTarget.namespace, 'mcpServers');
  assert.deepEqual(claudeTarget.scopes, [
    { scope: 'project', file: '.mcp.json' },
    // Claude Code 的用户级 MCP 文件是与 `~/.claude` 同级的 `~/.claude.json`。
    { scope: 'home', file: '../.claude.json', createIfMissing: true },
  ]);

  const geminiTarget = getClientMcpTarget('gemini');
  assert.equal(geminiTarget.format, 'json');
  assert.equal(geminiTarget.namespace, 'mcpServers');
  assert.deepEqual(geminiTarget.scopes, [
    { scope: 'project', file: '.gemini/settings.json', format: 'gemini-json' },
    { scope: 'home', file: 'settings.json', format: 'gemini-json', createIfMissing: true },
  ]);

  const ocTarget = getClientMcpTarget('opencode');
  assert.equal(ocTarget.format, 'opencode-json');
  assert.equal(ocTarget.namespace, 'mcp');
  assert.deepEqual(ocTarget.scopes, [
    { scope: 'home', file: 'opencode.json', createIfMissing: true },
  ]);

  const hermesTarget = getClientMcpTarget('hermes');
  assert.equal(hermesTarget.format, 'json');
  assert.equal(hermesTarget.namespace, 'mcpServers');
  assert.deepEqual(hermesTarget.scopes, [
    { scope: 'project', file: '.mcp.json' },
    { scope: 'home', file: 'config.yaml', format: 'yaml', namespace: 'mcp_servers', createIfMissing: true },
  ]);

  const grokTarget = getClientMcpTarget('grok');
  assert.equal(grokTarget.format, 'toml');
  assert.equal(grokTarget.namespace, 'mcp_servers');
  assert.deepEqual(grokTarget.scopes, [
    { scope: 'home', file: 'config.toml', createIfMissing: true },
    { scope: 'project', file: '.grok/config.toml' },
  ]);

  const workbuddyTarget = getClientMcpTarget('workbuddy');
  assert.equal(workbuddyTarget.format, 'json');
  assert.equal(workbuddyTarget.namespace, 'mcpServers');
  assert.deepEqual(workbuddyTarget.scopes, [
    { scope: 'home', file: 'mcp.json', createIfMissing: true },
  ]);

  // Pi has no built-in MCP surface: empty scopes, bridged via the AIOS Pi extension.
  const piTarget = getClientMcpTarget('pi');
  assert.equal(piTarget.format, 'none');
  assert.deepEqual(piTarget.scopes, []);

  // ZCode: nested mcp.servers inside the shared CLI config (home + project).
  // 'zcode-json' normalizes AIOS servers to ZCode's strict server schema.
  const zcodeTarget = getClientMcpTarget('zcode');
  assert.equal(zcodeTarget.format, 'json');
  assert.equal(zcodeTarget.namespace, 'mcp.servers');
  assert.deepEqual(zcodeTarget.scopes, [
    { scope: 'home', file: 'cli/config.json', format: 'zcode-json', namespace: 'mcp.servers', createIfMissing: true },
    { scope: 'project', file: '.zcode/config.json', format: 'zcode-json', namespace: 'mcp.servers' },
  ]);

  // Qoder: standard mcpServers namespace inside the CLI settings files
  // (home ~/.qoder/settings.json user scope + project .qoder/settings.json).
  const qoderTarget = getClientMcpTarget('qoder');
  assert.equal(qoderTarget.format, 'json');
  assert.equal(qoderTarget.namespace, 'mcpServers');
  assert.deepEqual(qoderTarget.scopes, [
    { scope: 'home', file: 'settings.json', createIfMissing: true },
    { scope: 'project', file: '.qoder/settings.json' },
  ]);
});

test('resolveClientMcpTargetPath honors home vs project scope', () => {
  const slash = (value) => String(value).replace(/\\/g, '/');
  // home-scoped clients resolve under their client home
  assert.equal(
    slash(resolveClientMcpTargetPath('codex', { projectRoot: '/proj', clientHome: '/home/.codex' })),
    '/home/.codex/config.toml',
  );
  assert.equal(
    slash(resolveClientMcpTargetPath('opencode', { projectRoot: '/proj', clientHome: '/home/.config/opencode' })),
    '/home/.config/opencode/opencode.json',
  );
  assert.equal(
    slash(resolveClientMcpTargetPath('grok', { projectRoot: '/proj', clientHome: '/home/.grok' })),
    '/home/.grok/config.toml',
  );
  assert.equal(
    slash(resolveClientMcpTargetPath('grok', { projectRoot: '/proj' })),
    '/proj/.grok/config.toml',
  );
  // workbuddy is home-only: ~/.workbuddy/mcp.json, no project-scope MCP file
  assert.equal(
    slash(resolveClientMcpTargetPath('workbuddy', { projectRoot: '/proj', clientHome: '/home/.workbuddy' })),
    '/home/.workbuddy/mcp.json',
  );
  // project-scoped clients resolve under the project root
  assert.equal(
    slash(resolveClientMcpTargetPath('claude', { projectRoot: '/proj', clientHome: '/home/.claude' })),
    '/proj/.mcp.json',
  );
  // MCP-less clients (format 'none', empty scopes) resolve to no path
  assert.equal(
    resolveClientMcpTargetPath('pi', { projectRoot: '/proj', clientHome: '/home/.pi/agent' }),
    '',
  );
  // ZCode is dual-scope: home config prefers ~/.zcode/cli/config.json, project
  // falls back to .zcode/config.json when no home is resolvable
  assert.equal(
    slash(resolveClientMcpTargetPath('zcode', { projectRoot: '/proj', clientHome: '/home/.zcode' })),
    '/home/.zcode/cli/config.json',
  );
  assert.equal(
    slash(resolveClientMcpTargetPath('zcode', { projectRoot: '/proj' })),
    '/proj/.zcode/config.json',
  );
  assert.equal(
    slash(resolveClientMcpTargetPath('gemini', { projectRoot: '/proj', clientHome: '/home/.gemini' })),
    '/proj/.gemini/settings.json',
  );
  // Qoder is dual-scope: home prefers ~/.qoder/settings.json, project falls
  // back to .qoder/settings.json when no home is resolvable
  assert.equal(
    slash(resolveClientMcpTargetPath('qoder', { projectRoot: '/proj', clientHome: '/home/.qoder' })),
    '/home/.qoder/settings.json',
  );
  assert.equal(
    slash(resolveClientMcpTargetPath('qoder', { projectRoot: '/proj' })),
    '/proj/.qoder/settings.json',
  );
  // codex has dual scope: falls back to project when home is absent
  assert.equal(slash(resolveClientMcpTargetPath('codex', { projectRoot: '/proj' })), '/proj/.codex/config.toml');
});

test('every client declares instruction filename and a valid MCP target', () => {
  for (const client of ALL_CLIENTS) {
    assert.ok(getClientInstructionFileName(client), `${client} instruction filename`);
    const mcp = getClientMcpTarget(client);
    if (mcp.format === 'none') {
      // MCP-less clients (pi): no config surface, bridged via extension instead.
      assert.deepEqual(mcp.scopes, [], `${client} mcp-less scopes`);
      continue;
    }
    assert.ok(Array.isArray(mcp.scopes) && mcp.scopes.length > 0, `${client} mcp.scopes`);
    for (const s of mcp.scopes) {
      assert.ok(['home', 'project'].includes(s.scope), `${client} mcp.scope value ${s.scope}`);
      assert.ok(s.file, `${client} mcp.scope file`);
    }
    assert.ok(['json', 'toml', 'opencode-json'].includes(mcp.format), `${client} mcp.format ${mcp.format}`);
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
