// Shipped-content hygiene gate for the Pi client surface.
// Customers run global AIOS installs without this repo. Everything AIOS
// ships into prompts, tool descriptors, MCP configs, doctor output, and
// skill docs must invoke the global `aios` CLI or runtime-resolved install
// roots — never repo-relative invocations like `node scripts/aios.mjs`.
// Scope: only the artifacts this change stream touches, so it never fights
// the repo-wide legacy-path cleanup.
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildAiosPiMcpServers, resolvePiMcpJsonPath } from '../lib/components/pi/mcp-adapter.mjs';
import { doctorPiBridge } from '../lib/components/pi/doctor.mjs';
import { AIOS_SYSTEM_PROMPT_ADDITION, buildBeforeAgentStartMessage } from '../../packages/aios-pi/lib/gates.mjs';
import { buildToolDefs } from '../../packages/aios-pi/lib/tools.mjs';
import { memoCheckpointArgs, memoRecallArgs, memoWriteArgs, resolveAiosRoot } from '../../packages/aios-pi/lib/aios-cli.mjs';
import { readProjectedSkill } from './fixtures/skill-projection.mjs';

// Repo-relative invocations only. The first two alternatives are exact
// shapes (`node scripts/...` and the `scripts/aios.mjs` entrypoint). The
// third catches a Windows-style relative script path (`scripts\...`) and is
// anchored to a token boundary: an absolute install-root path such as
// /opt/global-aios\scripts\memory-mcp-server.mjs contains the same segment
// after a path separator, and that rooted shape is what this gate demands —
// only a token-initial `scripts\` is repo-relative.
const REPO_RELATIVE_INVOCATION = /node scripts\/|scripts\/aios\.mjs|(?:^|[\s"'`(),=:.])scripts\\/u;

function assertClean(label, text) {
  assert.doesNotMatch(String(text ?? ''), REPO_RELATIVE_INVOCATION, `${label} must not embed repo-relative invocations`);
}

function stubTypeBox() {
  return {
    Object: (props) => ({ kind: 'object', props }),
    String: (opts) => ({ kind: 'string', opts }),
    Number: (opts) => ({ kind: 'number', opts }),
    Array: (items, opts) => ({ kind: 'array', items, opts }),
    Optional: (inner) => ({ kind: 'optional', inner }),
  };
}

test('Pi system prompt and session injection stay free of repo-relative invocations', () => {
  assertClean('AIOS_SYSTEM_PROMPT_ADDITION', AIOS_SYSTEM_PROMPT_ADDITION);
  const withDigest = buildBeforeAgentStartMessage({ memoryDigest: 'some memory text' });
  const withoutDigest = buildBeforeAgentStartMessage({ memoryDigest: '' });
  assertClean('before_agent_start message (digest)', withDigest.content);
  assertClean('before_agent_start message (no digest)', withoutDigest.content);
});

test('Pi tool descriptors and argv builders reference only the global aios CLI', () => {
  const defs = buildToolDefs({ Type: stubTypeBox(), run: async () => ({ text: '' }) });
  assert.equal(defs.length, 6);
  for (const def of defs) {
    assertClean(`tool ${def.name} label`, def.label);
    assertClean(`tool ${def.name} description`, def.description);
  }
  for (const argv of [
    memoRecallArgs({ query: 'x' }),
    memoWriteArgs({ text: 'x' }),
    memoCheckpointArgs({ text: 'x' }),
  ]) {
    assert.equal(argv[0], 'memo', 'argv builders target the aios memo CLI surface');
    assertClean(`argv ${argv.join(' ')}`, argv.join(' '));
  }
});

test('managed Pi MCP servers resolve against the injected install root, never literals', () => {
  const servers = buildAiosPiMcpServers({ aiosRoot: '/opt/global-aios' });
  assert.deepEqual(Object.keys(servers), ['code-review-graph', 'aios-memory', 'aios-bridge']);
  for (const [name, definition] of Object.entries(servers)) {
    for (const arg of definition.args) {
      assertClean(`server ${name} arg`, arg);
    }
  }
  assert.equal(path.isAbsolute(servers['aios-memory'].args[0]), true);
  assert.equal(servers['aios-memory'].args[0], path.join('/opt/global-aios', 'scripts', 'memory-mcp-server.mjs'));
  assert.equal(servers['aios-bridge'].args[0], path.join('/opt/global-aios', 'scripts', 'aios-mcp-server.mjs'));
});

test('pi bridge doctor output carries global-CLI hints only', async () => {
  const piHome = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-pi-hygiene-doctor-'));
  try {
    const mcpJsonPath = resolvePiMcpJsonPath(piHome);
    await fs.mkdir(path.dirname(mcpJsonPath), { recursive: true });
    await fs.writeFile(mcpJsonPath, JSON.stringify({ mcpServers: {} }, null, 2), 'utf8');
    const logs = [];
    const result = await doctorPiBridge({
      aiosRoot: '/opt/global-aios',
      env: { ...process.env, PI_CODING_AGENT_DIR: piHome },
      io: { log: (line) => logs.push(String(line)) },
      commandExistsImpl: () => true,
      captureImpl: () => ({ stdout: '' }),
    });
    assert.equal(result.effectiveWarnings > 0, true, 'empty mcp.json is a warning state');
    assertClean('doctor output', logs.join('\n'));
    assert.match(logs.join('\n'), /aios init --agent pi/u, 'repair hint uses the global CLI');
  } finally {
    await fs.rm(piHome, { recursive: true, force: true });
  }
});

test('init project .mcp.json hint literals use the global CLI phrasing', async () => {
  const source = await fs.readFile(path.join(process.cwd(), 'scripts', 'aios-init.mjs'), 'utf8');
  // Both advisories are about the project-level .mcp.json; match on that
  // subject so rewording the server list cannot silently drop this guard.
  const hintLines = source.split(/\r?\n/u).filter((line) => line.includes('[hint]') && line.includes('.mcp.json'));
  assert.equal(hintLines.length, 2, 'both advisory lines are present');
  for (const line of hintLines) {
    assertClean('init hint', line);
  }
  assert.match(hintLines.join('\n'), /aios init --agent claude/u, 'advisory points at the global CLI');
});

test('memo skill projections document the checkpoint command via the global CLI', async () => {
  // Pi reads the shared root natively: AIOS must not project a .pi/skills
  // copy (Pi reports it as already loaded and skips the shared one).
  const surfaces = ['agents', 'codex', 'claude', 'hermes', 'gemini', 'workbuddy', 'opencode'];
  for (const surface of surfaces) {
    // Each generated root is gitignored, so a clean checkout has none of them;
    // project through the production materializer instead of reading the disk.
    const content = await readProjectedSkill(process.cwd(), 'memo', surface);
    assert.match(content, /`aios memo checkpoint/u, `${surface} projection documents aios memo checkpoint`);
    assert.doesNotMatch(content, REPO_RELATIVE_INVOCATION, `${surface} projection must not embed repo-relative invocations`);
  }
  await assert.rejects(
    fs.stat(path.join(process.cwd(), '.pi', 'skills')),
    'the retired .pi/skills projection must not exist; Pi double-scans it against the shared root',
  );
});

test('extension root resolution works customer-style: env root + arbitrary cwd', async () => {
  const fakeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-pi-hygiene-root-'));
  const arbitraryCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'aios-pi-hygiene-cwd-'));
  try {
    // Customer shape: AIOS is installed elsewhere; the Pi session cwd is a
    // plain project directory with no repo markers in between.
    const resolved = resolveAiosRoot({
      env: { AIOS_ROOT_DIR: fakeRoot },
      startDir: path.join(arbitraryCwd, 'deeply', 'nested'),
      existsSync: (p) => p === path.join(fakeRoot, 'scripts', 'aios.mjs'),
    });
    assert.equal(resolved, fakeRoot);
  } finally {
    await fs.rm(fakeRoot, { recursive: true, force: true });
    await fs.rm(arbitraryCwd, { recursive: true, force: true });
  }
});
