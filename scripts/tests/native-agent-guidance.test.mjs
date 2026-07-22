import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveNativeClients } from '../lib/native/source-tree.mjs';
import { composeNativeMarkdown } from '../lib/native/emitters/compose.mjs';
import { renderCodexNativeOutputs } from '../lib/native/emitters/codex.mjs';
import { renderGrokNativeOutputs } from '../lib/native/emitters/grok.mjs';
import { renderHermesNativeOutputs } from '../lib/native/emitters/hermes.mjs';
import { renderOpencodeNativeOutputs } from '../lib/native/emitters/opencode.mjs';
import { readNativePartials } from '../lib/native/emitters/shared.mjs';

const AGENTS_CLIENTS = Object.freeze(['codex', 'opencode', 'hermes', 'grok']);
const LEGACY_ALWAYS_LOADED_PARTIALS = Object.freeze([
  'core-instructions.md',
  'contextdb.md',
  'client-capabilities.md',
  'token-discipline.md',
  'agent-routing.md',
  'codemap.md',
  'browser-mcp.md',
  'team-provider.md',
  'model-router.md',
  'harness.md',
]);

function markdownOperationContent(rendered) {
  return rendered.operations.find((operation) => (
    operation.kind === 'markdown-block' && operation.targetPath === 'AGENTS.md'
  ))?.content;
}

function readManagedNativeBlock(file) {
  const markdown = readFileSync(path.join(process.cwd(), file), 'utf8');
  const begin = markdown.indexOf('<!-- AIOS NATIVE BEGIN -->');
  const end = markdown.indexOf('<!-- AIOS NATIVE END -->');
  assert.ok(begin >= 0, `${file} is missing the AIOS native begin marker`);
  assert.ok(end > begin, `${file} is missing the AIOS native end marker`);
  return markdown.slice(begin, end);
}

test('readNativePartials skips missing retired partials instead of throwing ENOENT', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-native-partials-'));
  try {
    const partialsDir = path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials');
    await mkdir(partialsDir, { recursive: true });
    await writeFile(path.join(partialsDir, 'core-instructions.md'), '# core\n', 'utf8');
    const sections = readNativePartials(rootDir, ['core-instructions.md', 'superpowers.md']);
    assert.deepEqual(sections, ['# core']);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('clients sharing AGENTS.md receive one deterministic client-neutral projection', () => {
  const composed = AGENTS_CLIENTS.map((client) => (
    composeNativeMarkdown({ rootDir: process.cwd(), client })
  ));
  assert.equal(new Set(composed).size, 1);

  const rendered = [
    renderCodexNativeOutputs({ rootDir: process.cwd() }),
    renderOpencodeNativeOutputs({ rootDir: process.cwd(), selectedClients: ['opencode'] }),
    renderHermesNativeOutputs({ rootDir: process.cwd(), selectedClients: ['hermes'] }),
    renderGrokNativeOutputs({ rootDir: process.cwd(), selectedClients: ['grok'] }),
  ].map(markdownOperationContent);

  assert.ok(rendered.every(Boolean));
  assert.equal(new Set(rendered).size, 1);
  assert.equal(rendered[0], composed[0]);
  assert.doesNotMatch(rendered[0], /AIOS For OpenCode|AIOS Native Hermes|AIOS Native Grok/u);
});

test('all six native projections keep compact workflow invariants and route details on demand', () => {
  const legacyBytes = LEGACY_ALWAYS_LOADED_PARTIALS.reduce((total, file) => {
    const source = readFileSync(path.join(
      process.cwd(),
      'client-sources',
      'native-base',
      'shared',
      'partials',
      file,
    ));
    return total + source.byteLength;
  }, 0);

  for (const client of resolveNativeClients('all')) {
    const markdown = composeNativeMarkdown({ rootDir: process.cwd(), client });
    assert.match(markdown, /AIOS Workflow Policy/u, `${client} missing workflow policy`);
    assert.match(markdown, /`direct`/u, `${client} missing direct disposition`);
    assert.match(markdown, /`guarded`/u, `${client} missing guarded disposition`);
    assert.match(markdown, /`planned`/u, `${client} missing planned disposition`);
    assert.match(markdown, /current Rex Capability Command/u, `${client} missing Rex command ownership`);
    assert.match(markdown, /pre-edit-safety-gate/u, `${client} missing edit safety gate`);
    assert.match(markdown, /verification-before-completion/u, `${client} missing completion gate`);
    assert.match(markdown, /reversible project-local/u, `${client} missing local-safe boundary`);
    assert.match(markdown, /destructive or hard-to-reverse/u, `${client} missing approval boundary`);
    assert.match(markdown, /Never expose secrets/u, `${client} missing privacy boundary`);
    assert.match(markdown, /On-Demand Routes/u, `${client} missing lazy route guidance`);
    assert.match(markdown, /aios-codemap-ops/u, `${client} missing codemap route`);
    assert.match(markdown, /contextdb-autopilot/u, `${client} missing ContextDB route`);
    assert.match(markdown, /aios-long-running-harness/u, `${client} missing harness route`);
    assert.match(markdown, /model-router/u, `${client} missing model route`);

    assert.doesNotMatch(markdown, /## Context System|## AIOS Client Capability Gates|## AIOS Token Discipline/u);
    assert.doesNotMatch(markdown, /## AIOS Subagent Dispatch|## AIOS Code-Review-Graph|## AIOS Team Provider/u);
    assert.doesNotMatch(markdown, /## AIOS Model Router|## AIOS Interception Runtime/u);
    assert.doesNotMatch(markdown, /chrome\.launch_cdp|memo recall --limit|clients doctor --json|aios harness run/u);
    assert.ok(markdown.length <= 8_000, `${client} ordinary guidance exceeds 8,000 characters`);
  }

  const sharedAgents = composeNativeMarkdown({ rootDir: process.cwd(), client: 'codex' });
  assert.ok(
    Buffer.byteLength(sharedAgents) <= Math.floor(legacyBytes * 0.4),
    'shared AGENTS guidance must be at least 60% smaller than the legacy partial chain',
  );
});

test('native overlays claim only verified client capabilities', () => {
  const claude = composeNativeMarkdown({ rootDir: process.cwd(), client: 'claude' });
  const gemini = composeNativeMarkdown({ rootDir: process.cwd(), client: 'gemini' });

  assert.match(claude, /SessionStart.*read-only status/is);
  assert.match(claude, /UserPromptSubmit.*workflow-policy adapter/is);
  assert.match(gemini, /compatibility-tier/i);
  assert.doesNotMatch(gemini, /SessionStart|UserPromptSubmit/u);

  for (const client of AGENTS_CLIENTS) {
    const markdown = composeNativeMarkdown({ rootDir: process.cwd(), client });
    assert.doesNotMatch(markdown, /SessionStart|UserPromptSubmit/u, `${client} claims an unverified hook`);
  }

  const hermes = composeNativeMarkdown({ rootDir: process.cwd(), client: 'hermes' });
  assert.doesNotMatch(hermes, /Hermes built-in memory|\.hermes\/agents|start team|dispatch agents/iu);
});

test('root native instruction projections are compact and retain Rex ownership', () => {
  for (const file of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']) {
    const markdown = readManagedNativeBlock(file);
    assert.match(markdown, /AIOS Workflow Policy/, `${file} missing workflow policy`);
    assert.match(markdown, /current Rex Capability Command/u, `${file} missing Rex command ownership`);
    assert.match(markdown, /On-Demand Routes/u, `${file} missing lazy route guidance`);
    assert.doesNotMatch(markdown, /## Context System|## AIOS Team Provider|chrome\.launch_cdp/u);
  }
});

test('Claude is the only checked-in native source with prompt-hook settings', () => {
  const codex = readFileSync(path.join(process.cwd(), 'client-sources/native-base/codex/project/AGENTS.md'), 'utf8');
  const claude = readFileSync(path.join(process.cwd(), 'client-sources/native-base/claude/project/CLAUDE.md'), 'utf8');
  const gemini = readFileSync(path.join(process.cwd(), 'client-sources/native-base/gemini/project/GEMINI.md'), 'utf8');
  const claudeSettings = JSON.parse(readFileSync(
    path.join(process.cwd(), 'client-sources/native-base/claude/project/settings.local.json'),
    'utf8',
  ));

  assert.match(codex, /native skill discovery.*no SessionStart bootstrap/i);
  assert.match(claude, /SessionStart.*read-only status/i);
  assert.match(claude, /UserPromptSubmit.*workflow-policy adapter/i);
  assert.doesNotMatch(gemini, /SessionStart|UserPromptSubmit/u);
  assert.deepEqual(claudeSettings.hooks.SessionStart, ['node scripts/aios.mjs plan status --client claude']);
  assert.equal(claudeSettings.hooks.UserPromptSubmit[0].hooks[0].command, 'node scripts/aios.mjs plan hook-user-prompt');
});
