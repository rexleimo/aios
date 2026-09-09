import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  parseExternalFacts,
  parseRooModes,
  splitMarkdownFacts,
} from '../lib/memo/import-external.mjs';
import { importExternalMemories } from '../lib/memo/import-external.mjs';
import { collectEvents } from '../lib/memo/storage/events-read.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(HERE, '..', 'aios.mjs');

const MEMORY_MD = `# Claude Memory

## Preferences
- Prefer pnpm over npm in this monorepo
- Always run typecheck before pushing

## Context
1. The API gateway lives under services/gateway
`;

const ROOMODES_JSON = JSON.stringify({
  modes: [
    { slug: 'architect', roleDefinition: 'Plans system design and reviews implementation proposals' },
    { slug: 'debugger', customInstructions: 'Reproduces failures with minimal fixtures before patching' },
    { slug: 'empty', roleDefinition: '' },
  ],
});

test('markdown facts split bullets, numbered lines, and skip headings', () => {
  const facts = splitMarkdownFacts(MEMORY_MD);
  assert.deepEqual(facts, [
    'Prefer pnpm over npm in this monorepo',
    'Always run typecheck before pushing',
    'The API gateway lives under services/gateway',
  ]);
});

test('roo modes extract role definitions and skip empty bodies', () => {
  const facts = parseRooModes(ROOMODES_JSON);
  assert.equal(facts.length, 2);
  assert.match(facts[0], /Roo mode architect: Plans system design/);
  assert.throws(() => parseRooModes('not json'), /valid JSON/);
});

test('parseExternalFacts routes roo to the JSON parser and others to markdown', () => {
  assert.deepEqual(parseExternalFacts({ format: 'roo', content: ROOMODES_JSON }), parseRooModes(ROOMODES_JSON));
  assert.deepEqual(parseExternalFacts({ format: 'claude', content: MEMORY_MD }), splitMarkdownFacts(MEMORY_MD));
  assert.deepEqual(parseExternalFacts({ format: 'conventions', content: 'Use LF line endings repo-wide' }), [
    'Use LF line endings repo-wide',
  ]);
});

test('import lands candidates, dedupes, and supports dry-run', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'memo-import-'));
  const file = path.join(rootDir, 'MEMORY.md');
  await writeFile(file, MEMORY_MD, 'utf8');
  try {
    const dry = await importExternalMemories(rootDir, { format: 'claude', file, dryRun: true });
    assert.equal(dry.imported, 0);
    assert.equal(dry.facts.length, 3);

    const first = await importExternalMemories(rootDir, { format: 'claude', file });
    assert.equal(first.imported, 3);
    assert.ok(first.eventIds.every((id) => id.length > 0));

    const { events } = await collectEvents(rootDir, { space: '', tolerateMalformed: true });
    const imported = events.filter((event) => event.claimStatus === 'candidate' && (event.refs || []).includes('import-claude'));
    assert.equal(imported.length, 3, 'imported facts must land as reviewable candidates with a source tag');

    const second = await importExternalMemories(rootDir, { format: 'claude', file });
    assert.equal(second.imported, 0, 're-import is a no-op');
    assert.equal(second.skipped, 3);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('aios import CLI wires format, dry-run, json, and rejects unknown formats', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'memo-import-cli-'));
  await mkdir(rootDir, { recursive: true });
  const file = path.join(rootDir, 'rules.md');
  await writeFile(file, '- Continue rules say keep modules under 300 lines', 'utf8');
  const run = (args) => spawnSync(process.execPath, [CLI_PATH, 'import', ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, AIOS_AGENT_ID: '' },
  });
  try {
    const dry = run(['--format', 'continue', '--file', file, '--dry-run', '--json']);
    assert.equal(dry.status, 0, dry.stderr || dry.stdout);
    const parsed = JSON.parse(String(dry.stdout || ''));
    assert.equal(parsed.dryRun, true);
    assert.equal(parsed.facts.length, 1);

    const live = run(['--format', 'continue', '--file', file]);
    assert.equal(live.status, 0, live.stderr || live.stdout);
    assert.match(String(live.stdout || ''), /imported 1 fact/);

    const bad = run(['--format', 'notion', '--file', file]);
    assert.notEqual(bad.status, 0);
    assert.match(`${bad.stderr}${bad.stdout}`, /unsupported import format/u);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
