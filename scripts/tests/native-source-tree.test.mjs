import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildNativeOutputPlan,
  loadNativeSyncManifest,
  resolveNativeClients,
} from '../lib/native/source-tree.mjs';
import { NATIVE_SYNC_META_FILE } from '../lib/native/install-metadata.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

test('native manifest resolves deep and compatibility tiers by client', async () => {
  const rootDir = await makeTemp('aios-native-source-root-');
  await writeJson(path.join(rootDir, 'config', 'native-sync-manifest.json'), {
    schemaVersion: 1,
    managedBy: 'aios',
    markers: {
      markdownBegin: '<!-- AIOS NATIVE BEGIN -->',
      markdownEnd: '<!-- AIOS NATIVE END -->',
    },
    clients: {
      codex: { tier: 'deep', metadataRoot: '.codex', outputs: ['AGENTS.md', '.codex/agents', '.codex/skills'] },
      claude: { tier: 'deep', metadataRoot: '.claude', outputs: ['CLAUDE.md', '.claude/settings.local.json', '.claude/agents', '.claude/skills'] },
      gemini: { tier: 'compatibility', metadataRoot: '.gemini', outputs: ['.gemini/AIOS.md', '.gemini/skills'] },
      opencode: { tier: 'compatibility', metadataRoot: '.opencode', outputs: ['.opencode/AIOS.md', '.opencode/skills'] },
      kiro: { tier: 'deep', metadataRoot: '.kiro', outputs: ['.kiro/steering/AIOS.md', '.kiro/settings/mcp.json', '.kiro/agents', '.kiro/skills'] },
    },
  });

  const manifest = loadNativeSyncManifest(rootDir);
  assert.deepEqual(resolveNativeClients('all'), ['codex', 'claude', 'gemini', 'opencode', 'kiro']);
  assert.equal(manifest.clients.codex.tier, 'deep');
  assert.equal(manifest.clients.claude.tier, 'deep');
  assert.equal(manifest.clients.gemini.tier, 'compatibility');
  assert.equal(manifest.clients.opencode.tier, 'compatibility');
  assert.equal(manifest.clients.kiro.tier, 'deep');
});

test('native output plan maps repo outputs with per-client metadata roots', async () => {
  const rootDir = await makeTemp('aios-native-plan-root-');
  await writeJson(path.join(rootDir, 'config', 'native-sync-manifest.json'), {
    schemaVersion: 1,
    managedBy: 'aios',
    markers: {
      markdownBegin: '<!-- AIOS NATIVE BEGIN -->',
      markdownEnd: '<!-- AIOS NATIVE END -->',
    },
    clients: {
      codex: { tier: 'deep', metadataRoot: '.codex', outputs: ['AGENTS.md', '.codex/agents', '.codex/skills'] },
      claude: { tier: 'deep', metadataRoot: '.claude', outputs: ['CLAUDE.md', '.claude/settings.local.json', '.claude/agents', '.claude/skills'] },
      gemini: { tier: 'compatibility', metadataRoot: '.gemini', outputs: ['.gemini/AIOS.md', '.gemini/skills'] },
      opencode: { tier: 'compatibility', metadataRoot: '.opencode', outputs: ['.opencode/AIOS.md', '.opencode/skills'] },
      kiro: { tier: 'deep', metadataRoot: '.kiro', outputs: ['.kiro/steering/AIOS.md', '.kiro/settings/mcp.json', '.kiro/agents', '.kiro/skills'] },
    },
  });

  const manifest = loadNativeSyncManifest(rootDir);
  const codexPlan = buildNativeOutputPlan({ rootDir, manifest, client: 'codex' });
  const claudePlan = buildNativeOutputPlan({ rootDir, manifest, client: 'claude' });
  const kiroPlan = buildNativeOutputPlan({ rootDir, manifest, client: 'kiro' });

  assert.equal(codexPlan.client, 'codex');
  assert.equal(codexPlan.metadataPath, path.join(rootDir, '.codex', NATIVE_SYNC_META_FILE));
  assert.deepEqual(codexPlan.outputs, ['AGENTS.md', '.codex/agents', '.codex/skills']);

  assert.equal(claudePlan.client, 'claude');
  assert.equal(claudePlan.metadataPath, path.join(rootDir, '.claude', NATIVE_SYNC_META_FILE));
  assert.deepEqual(claudePlan.outputs, ['CLAUDE.md', '.claude/settings.local.json', '.claude/agents', '.claude/skills']);

  assert.equal(kiroPlan.client, 'kiro');
  assert.equal(kiroPlan.metadataPath, path.join(rootDir, '.kiro', NATIVE_SYNC_META_FILE));
  assert.deepEqual(kiroPlan.outputs, ['.kiro/steering/AIOS.md', '.kiro/settings/mcp.json', '.kiro/agents', '.kiro/skills']);
});
