import assert from 'node:assert/strict';
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
