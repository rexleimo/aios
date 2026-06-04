import assert from 'node:assert/strict';
import test from 'node:test';

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
