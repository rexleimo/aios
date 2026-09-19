import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveLocalBrowserMcpScript } from '../lib/components/browser/runtime-paths.mjs';
import {
  PI_MCP_ADAPTER_PACKAGE,
  PI_MCP_ADAPTER_VERSION,
  buildAdapterInstallArgs,
  buildAiosPiBrowserServer,
  buildAiosPiMcpServers,
  ensurePiMcpAdapter,
  ensurePiMcpServers,
  isAdapterInstalled,
  piMcpAdapterSpec,
  resolvePiMcpJsonPath,
} from '../lib/components/pi/mcp-adapter.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test('adapter spec is pinned and install args match pi CLI', () => {
  assert.equal(PI_MCP_ADAPTER_PACKAGE, 'pi-mcp-adapter');
  assert.match(PI_MCP_ADAPTER_VERSION, /^\d+\.\d+\.\d+$/u);
  assert.equal(piMcpAdapterSpec(), `npm:pi-mcp-adapter@${PI_MCP_ADAPTER_VERSION}`);
  assert.deepEqual(buildAdapterInstallArgs(), ['install', `npm:pi-mcp-adapter@${PI_MCP_ADAPTER_VERSION}`]);
});

test('aios-managed servers carry code-review-graph first, cwd-less', () => {
  const servers = buildAiosPiMcpServers();
  assert.deepEqual(Object.keys(servers), ['code-review-graph']);
  assert.equal(servers['code-review-graph'].command, 'uvx');
  assert.deepEqual(servers['code-review-graph'].args, ['code-review-graph', 'serve']);
  assert.ok(!('cwd' in servers['code-review-graph']), 'global entry follows the Pi session cwd');
});

test('aios-managed servers add session-following memory and bridge servers when root known', () => {
  const servers = buildAiosPiMcpServers({ aiosRoot: '/aios' });
  assert.deepEqual(Object.keys(servers), ['code-review-graph', 'aios-memory', 'aios-bridge']);
  assert.equal(servers['aios-memory'].command, 'node');
  assert.deepEqual(servers['aios-memory'].args, [path.join('/aios', 'scripts', 'memory-mcp-server.mjs')]);
  assert.equal(servers['aios-bridge'].command, 'node');
  assert.deepEqual(servers['aios-bridge'].args, [path.join('/aios', 'scripts', 'aios-mcp-server.mjs')]);
  for (const name of ['aios-memory', 'aios-bridge']) {
    assert.ok(!('cwd' in servers[name]), `${name} follows the Pi session cwd`);
    assert.ok(!('env' in servers[name]), `${name} pins no workspace root`);
    assert.ok(path.isAbsolute(servers[name].args[0]), `${name} resolves against the injected install root`);
  }
});

test('mcp.json merge creates file and preserves other keys', async () => {
  const home = await makeTemp('aios-pi-mcp-new-');
  try {
    const mcpJsonPath = resolvePiMcpJsonPath(home);
    assert.equal(mcpJsonPath, path.join(home, 'mcp.json'));
    const result = ensurePiMcpServers({ mcpJsonPath });
    assert.equal(result.action, 'updated');
    assert.deepEqual(result.added, ['code-review-graph']);
    const saved = JSON.parse(await readFile(mcpJsonPath, 'utf8'));
    assert.equal(saved.mcpServers['code-review-graph'].command, 'uvx');
    // Second run is idempotent.
    const again = ensurePiMcpServers({ mcpJsonPath });
    assert.equal(again.action, 'present');
    assert.deepEqual(again.present, ['code-review-graph']);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('mcp.json merge adds newly-managed servers without touching present ones', async () => {
  const home = await makeTemp('aios-pi-mcp-upgrade-');
  try {
    const mcpJsonPath = resolvePiMcpJsonPath(home);
    const first = ensurePiMcpServers({ mcpJsonPath });
    assert.deepEqual(first.added, ['code-review-graph']);
    const second = ensurePiMcpServers({ mcpJsonPath, servers: buildAiosPiMcpServers({ aiosRoot: '/aios' }) });
    assert.equal(second.action, 'updated');
    assert.deepEqual(second.added, ['aios-memory', 'aios-bridge']);
    assert.deepEqual(second.present, ['code-review-graph']);
    const saved = JSON.parse(await readFile(mcpJsonPath, 'utf8'));
    assert.deepEqual(Object.keys(saved.mcpServers).sort(), ['aios-bridge', 'aios-memory', 'code-review-graph']);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
test('mcp.json merge never clobbers user-edited servers', async () => {
  const home = await makeTemp('aios-pi-mcp-keep-');
  try {
    const mcpJsonPath = resolvePiMcpJsonPath(home);
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(path.dirname(mcpJsonPath), { recursive: true });
    await writeFile(mcpJsonPath, JSON.stringify({
      mcpServers: {
        'code-review-graph': { command: 'custom', args: ['serve'] },
        personal: { command: 'npx', args: ['-y', 'x'] },
      },
    }, null, 2), 'utf8');
    const result = ensurePiMcpServers({ mcpJsonPath });
    assert.equal(result.action, 'present');
    assert.deepEqual(result.keptDiffers, ['code-review-graph']);
    const kept = JSON.parse(await readFile(mcpJsonPath, 'utf8'));
    assert.equal(kept.mcpServers['code-review-graph'].command, 'custom');
    assert.equal(kept.mcpServers.personal.command, 'npx');
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('mcp.json merge dry-run previews without writing', async () => {
  const home = await makeTemp('aios-pi-mcp-dry-');
  try {
    const mcpJsonPath = resolvePiMcpJsonPath(home);
    const logs = [];
    const result = ensurePiMcpServers({ mcpJsonPath, dryRun: true, io: { log: (line) => logs.push(String(line)) } });
    assert.equal(result.action, 'would-update');
    assert.ok(logs.some((line) => line.includes('would add Pi MCP servers')));
    await assert.rejects(readFile(mcpJsonPath, 'utf8'), /ENOENT/iu);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('mcp.json merge fails closed on invalid JSON', async () => {
  const home = await makeTemp('aios-pi-mcp-bad-');
  try {
    const mcpJsonPath = resolvePiMcpJsonPath(home);
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(path.dirname(mcpJsonPath), { recursive: true });
    await writeFile(mcpJsonPath, '{not json', 'utf8');
    assert.throws(() => ensurePiMcpServers({ mcpJsonPath }), /refusing to clobber/iu);
    assert.throws(() => ensurePiMcpServers({}), /requires mcpJsonPath/iu);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('adapter presence parses pi list output', () => {
  assert.equal(isAdapterInstalled('pi-mcp-adapter 2.33.0\naios-pi 0.1.0'), true);
  assert.equal(isAdapterInstalled('aios-pi 0.1.0'), false);
  assert.equal(isAdapterInstalled(''), false);
});

test('full setup skips install when adapter present', async () => {
  const home = await makeTemp('aios-pi-mcp-full-');
  try {
    const calls = [];
    const result = await ensurePiMcpAdapter({
      mcpJsonPath: resolvePiMcpJsonPath(home),
      run: async (cmd, args) => {
        calls.push([cmd, ...args].join(' '));
        if (args[0] === 'list') return { stdout: 'pi-mcp-adapter 2.33.0' };
        return { stdout: '' };
      },
    });
    assert.equal(result.adapter, 'present');
    assert.equal(result.mcpAction, 'updated');
    assert.deepEqual(calls, ['pi list']);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('full setup tolerates missing pi binary under dry-run, fails clear when live', async () => {
  const home = await makeTemp('aios-pi-mcp-nopi-');
  try {
    const failingRun = async () => { throw new Error('spawn pi ENOENT'); };
    const dryLogs = [];
    const dry = await ensurePiMcpAdapter({
      mcpJsonPath: resolvePiMcpJsonPath(home),
      dryRun: true,
      io: { log: (line) => dryLogs.push(String(line)) },
      run: failingRun,
    });
    assert.equal(dry.adapter, 'would-install');
    assert.ok(dryLogs.some((line) => line.includes('cannot check pi package list')));
    await assert.rejects(
      ensurePiMcpAdapter({ mcpJsonPath: resolvePiMcpJsonPath(home), run: failingRun }),
      /cannot check pi packages/iu,
    );
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
test('full setup installs adapter when missing, previews under dry-run', async () => {
  const home = await makeTemp('aios-pi-mcp-inst-');
  try {
    const calls = [];
    const result = await ensurePiMcpAdapter({
      mcpJsonPath: resolvePiMcpJsonPath(home),
      run: async (cmd, args) => {
        calls.push([cmd, ...args].join(' '));
        return { stdout: '' };
      },
    });
    assert.equal(result.adapter, 'installed');
    assert.ok(calls.some((line) => line.includes('pi install npm:pi-mcp-adapter@')));

    const dryHome = await makeTemp('aios-pi-mcp-instdry-');
    const dryLogs = [];
    try {
      const dry = await ensurePiMcpAdapter({
        mcpJsonPath: resolvePiMcpJsonPath(dryHome),
        dryRun: true,
        io: { log: (line) => dryLogs.push(String(line)) },
        run: async () => ({ stdout: '' }),
      });
      assert.equal(dry.adapter, 'would-install');
      assert.ok(dryLogs.some((line) => line.includes('would run: pi install')));
      await assert.rejects(readFile(resolvePiMcpJsonPath(dryHome), 'utf8'), /ENOENT/iu);
    } finally {
      await rm(dryHome, { recursive: true, force: true });
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('browser server joins the managed set only when the runtime is installed', () => {
  const withoutRuntime = buildAiosPiMcpServers({ aiosRoot: '/aios' });
  assert.ok(!('mcp-browser-use' in withoutRuntime), 'no runtime, no advertised browser server');

  const withRuntime = buildAiosPiMcpServers({ aiosRoot: '/aios', browserRuntime: true });
  assert.deepEqual(
    Object.keys(withRuntime),
    ['code-review-graph', 'aios-memory', 'aios-bridge', 'mcp-browser-use'],
  );
  const entry = withRuntime['mcp-browser-use'];
  assert.equal(entry.command, 'node');
  assert.deepEqual(entry.args, [resolveLocalBrowserMcpScript('/aios')]);
  assert.equal(entry.lifecycle, 'lazy');
  assert.ok(!('cwd' in entry) && !('env' in entry), 'follows the Pi session cwd like the other servers');
  assert.ok(!('startupTimeoutSec' in entry), 'pi-mcp-adapter drops unknown fields, so AIOS never writes them');
});

test('browser entry needs an AIOS root, and readiness alone is not enough', () => {
  assert.equal(buildAiosPiBrowserServer({ aiosRoot: '' }), null);
  assert.deepEqual(Object.keys(buildAiosPiMcpServers({ browserRuntime: true })), ['code-review-graph']);
});
