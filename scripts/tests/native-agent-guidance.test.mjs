import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { resolveNativeClients } from '../lib/native/source-tree.mjs';
import { composeNativeMarkdown } from '../lib/native/emitters/compose.mjs';

test('native agent instructions explain client capability gates and memo scope usage', () => {
  const markdown = composeNativeMarkdown({ rootDir: process.cwd(), client: 'codex' });
  assert.match(markdown, /node scripts\/aios\.mjs clients doctor --json/);
  assert.match(markdown, /pending-smoke/i);
  assert.match(markdown, /project_shared/);
  assert.match(markdown, /agent_private/);
  assert.match(markdown, /node scripts\/aios\.mjs search/);
  assert.match(markdown, /project memory, docs, plans, and code references/i);
});

test('all native clients inherit unified search guidance from shared instructions', () => {
  for (const client of resolveNativeClients('all')) {
    const markdown = composeNativeMarkdown({ rootDir: process.cwd(), client });
    assert.match(markdown, /Unified Project Search/, `${client} missing search heading`);
    assert.match(markdown, /node scripts\/aios\.mjs search/, `${client} missing search command`);
    assert.match(markdown, /project_shared/, `${client} missing shared memory scope guidance`);
    assert.match(markdown, /agent_private/, `${client} missing private memory scope guidance`);
  }
});

test('all native clients inherit strict AIOS turn compression enforcement', () => {
  for (const client of resolveNativeClients('all')) {
    const markdown = composeNativeMarkdown({ rootDir: process.cwd(), client });
    assert.match(markdown, /AIOS Turn Compression Enforcement/, `${client} missing turn compression heading`);
    assert.match(markdown, /bidirectional-turn-compression/, `${client} missing shared compression metric`);
    assert.match(markdown, /pre_send/, `${client} missing pre_send requirement`);
    assert.match(markdown, /post_receive/, `${client} missing post_receive requirement`);
    assert.match(markdown, /direct host/i, `${client} missing direct host bypass policy`);
    assert.match(markdown, /policy violation/i, `${client} missing policy violation wording`);
  }
});

test('compatibility client project notes repeat the turn compression policy', () => {
  for (const file of [
    'client-sources/native-base/opencode/project/AIOS.md',
  ]) {
    const markdown = readFileSync(path.join(process.cwd(), file), 'utf8');
    assert.match(markdown, /Turn Compression Compliance/, `${file} missing compatibility heading`);
    assert.match(markdown, /bidirectional-turn-compression/, `${file} missing shared compression metric`);
    assert.match(markdown, /pre_send/, `${file} missing pre_send wording`);
    assert.match(markdown, /post_receive/, `${file} missing post_receive wording`);
    assert.match(markdown, /policy violation/i, `${file} missing violation wording`);
  }
});
