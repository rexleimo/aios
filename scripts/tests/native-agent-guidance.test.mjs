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

test('native instructions use adaptive workflow dispositions instead of every-message planning', () => {
  for (const client of resolveNativeClients('all')) {
    const markdown = composeNativeMarkdown({ rootDir: process.cwd(), client });
    assert.match(markdown, /AIOS Workflow Policy/, `${client} missing workflow policy`);
    assert.match(markdown, /`direct`/, `${client} missing direct disposition`);
    assert.match(markdown, /`guarded`/, `${client} missing guarded disposition`);
    assert.match(markdown, /`planned`/, `${client} missing planned disposition`);
    assert.doesNotMatch(markdown, /AIOS ALWAYS-ON Intelligent Planning/i, `${client} still forces always-on planning`);
    assert.doesNotMatch(markdown, /every user input automatically enters AIOS intelligent planning/i, `${client} still plans every input`);
  }
});

test('native instructions describe rex workflow ownership without a fixed Matt chain', () => {
  for (const client of resolveNativeClients('all')) {
    const markdown = composeNativeMarkdown({ rootDir: process.cwd(), client });
    assert.match(markdown, /rex-harness Software Workflow/, `${client} missing rex workflow guidance`);
    assert.match(markdown, /Current default Providers are the bundled `rex-\*` Skills/, `${client} missing rex-native default`);
    assert.match(markdown, /explicit AIOS compatibility mode/, `${client} missing external compatibility boundary`);
    assert.match(markdown, /current `capabilityDecision`/i, `${client} must execute only the current Capability`);
    assert.match(markdown, /Observation -> Fact -> Activation -> Command -> Provider -> Evidence/u, `${client} missing the executable workflow loop`);
    assert.match(markdown, /command-scoped projection.*not a fixed pipeline/i, `${client} missing adaptive recipe projection boundary`);
    assert.match(markdown, /persist them independently under `.rex-harness\/`/i, `${client} missing standalone rex persistence boundary`);
    assert.doesNotMatch(markdown, /matt-requirements`?\s*->\s*`?matt-test-design`?\s*->/i, `${client} still injects a fixed Matt chain`);
    assert.doesNotMatch(markdown, /unclear design or a new capability.*brainstorming/i, `${client} still routes Superpowers from user intent`);
    assert.doesNotMatch(markdown, /behavior change or bug fix.*test-driven-development/i, `${client} still routes Superpowers from user intent`);
  }
});

test('root instruction files keep Superpowers on demand', () => {
  for (const file of ['AGENTS.md', 'CLAUDE.md']) {
    const markdown = readFileSync(path.join(process.cwd(), file), 'utf8');
    assert.match(markdown, /AIOS Workflow Policy/, `${file} missing workflow policy`);
    assert.doesNotMatch(markdown, /Superpowers skills MUST be invoked before any implementation action/i, `${file} still globally requires Superpowers`);
    assert.doesNotMatch(markdown, /Invoke `using-superpowers` skill first/i, `${file} still bootstraps using-superpowers globally`);
    assert.doesNotMatch(markdown, /unclear design or a new capability.*brainstorming/i, `${file} still routes Superpowers outside rex`);
    assert.doesNotMatch(markdown, /behavior change or bug fix.*test-driven-development/i, `${file} still routes Superpowers outside rex`);
  }
});

test('Codex and Claude native sources use their verified workflow surfaces', () => {
  const codex = readFileSync(path.join(process.cwd(), 'client-sources/native-base/codex/project/AGENTS.md'), 'utf8');
  const claude = readFileSync(path.join(process.cwd(), 'client-sources/native-base/claude/project/CLAUDE.md'), 'utf8');
  const claudeSettings = JSON.parse(readFileSync(
    path.join(process.cwd(), 'client-sources/native-base/claude/project/settings.local.json'),
    'utf8'
  ));

  assert.match(codex, /native skill discovery.*no SessionStart bootstrap/i);
  assert.match(claude, /SessionStart.*read-only status/i);
  assert.match(claude, /UserPromptSubmit.*workflow-policy adapter/i);
  assert.deepEqual(claudeSettings.hooks.SessionStart, ['node scripts/aios.mjs plan status --client claude']);
  assert.equal(claudeSettings.hooks.UserPromptSubmit[0].hooks[0].command, 'node scripts/aios.mjs plan hook-user-prompt');
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
