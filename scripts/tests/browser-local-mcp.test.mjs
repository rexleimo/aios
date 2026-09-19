import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildLocalBrowserMcpServer,
  buildPreferredMcpServer,
} from '../lib/components/browser/mcp-server-builders.mjs';
import { ensurePiBrowserMcpServer, installBrowserMcp } from '../lib/components/browser/install.mjs';
import { isBrowserMcpRuntimeInstalled } from '../lib/components/browser/runtime-readiness.mjs';
import { resolveLocalBrowserMcpScript } from '../lib/components/browser/runtime-paths.mjs';

test('local browser MCP uses the platform-neutral Node entrypoint', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-local-browser-mcp-'));
  const entry = buildLocalBrowserMcpServer(rootDir, {
    env: {
      AIOS_BROWSER_USE_REPO: '/missing/ai-browser-book',
      BROWSER_USE_CDP_URL: 'http://127.0.0.1:9222',
    },
  }, {
    platform: 'linux',
    nodeCommand: '/custom/node',
  });

  assert.equal(entry.type, 'stdio');
  assert.equal(entry.command, '/custom/node');
  assert.deepEqual(entry.args, [resolveLocalBrowserMcpScript(rootDir)]);
  assert.equal(entry.cwd, rootDir);
  assert.equal(entry.env.BROWSER_USE_CDP_URL, 'http://127.0.0.1:9222');
  assert.equal('AIOS_BROWSER_USE_REPO' in entry.env, false);
});

test('preferred browser MCP falls back locally on any platform when external repo is absent', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-browser-fallback-'));

  for (const platform of ['win32', 'darwin', 'linux']) {
    const entry = buildPreferredMcpServer(rootDir, {}, {
      platform,
      nodeCommand: `/node/${platform}`,
    });

    assert.equal(entry.command, `/node/${platform}`);
    assert.deepEqual(entry.args, [resolveLocalBrowserMcpScript(rootDir)]);
    assert.equal(entry.cwd, rootDir);
  }
});

test('preferred browser MCP ignores retired external checkouts', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-browser-retired-external-'));
  const repoDir = path.join(rootDir, 'ai-browser-book');
  await mkdir(path.join(repoDir, 'mcp-browser-use'), { recursive: true });
  await writeFile(path.join(repoDir, 'mcp-browser-use', 'pyproject.toml'), '[project]\nname = "mcp-browser-use"\n');

  const entry = buildPreferredMcpServer(rootDir, {
    env: { AIOS_BROWSER_USE_REPO: repoDir },
  }, {
    platform: 'linux',
  });

  assert.equal(entry.command, 'node');
  assert.deepEqual(entry.args, [resolveLocalBrowserMcpScript(rootDir)]);
  assert.equal(entry.env.AIOS_BROWSER_USE_REPO, undefined);
});

test('browser install uses local MCP when external browser-use is absent', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-browser-install-local-'));
  const localScript = resolveLocalBrowserMcpScript(rootDir);
  await mkdir(path.dirname(localScript), { recursive: true });
  await mkdir(path.join(rootDir, 'mcp-server', 'node_modules', 'playwright'), { recursive: true });
  await mkdir(path.join(rootDir, 'config'), { recursive: true });
  await writeFile(localScript, '#!/usr/bin/env node\n');
  await writeFile(path.join(rootDir, 'mcp-server', 'package.json'), '{"name":"local-test","scripts":{"build":"node --version"}}\n');
  await writeFile(path.join(rootDir, 'mcp-server', 'node_modules', 'playwright', 'package.json'), '{}\n');
  await writeFile(path.join(rootDir, 'config', 'browser-profiles.json'), '{"profiles":{}}\n');

  const logs = [];
  const result = await installBrowserMcp({
    rootDir,
    skipPlaywrightInstall: true,
    io: { log: (line) => logs.push(String(line)) },
    clientHomes: { codex: '', claude: '', gemini: '', opencode: '', pi: '' },
  });

  assert.equal(result.piBridge.status, 'skipped', 'injected empty homes must not touch the real Pi config');
  assert.equal(result.browserUseProjectDir, null);
  assert.equal(result.launcherPath, localScript);
  assert.equal(logs.some((line) => line.includes('using repository-local Node/Playwright MCP')), true);
  assert.equal(logs.some((line) => line.includes('"command": "node"')), true);
});

test('browser runtime readiness needs the launcher, package, and Playwright', () => {
  const probed = [];
  const exists = (target) => {
    probed.push(target);
    return true;
  };
  assert.equal(isBrowserMcpRuntimeInstalled({ rootDir: '/aios', existsSync: exists }), true);
  assert.deepEqual(probed, [
    resolveLocalBrowserMcpScript('/aios'),
    path.join('/aios', 'mcp-server', 'package.json'),
    path.join('/aios', 'mcp-server', 'node_modules', 'playwright', 'package.json'),
  ]);
  assert.equal(isBrowserMcpRuntimeInstalled({ rootDir: '/aios', existsSync: () => false }), false);
  assert.equal(isBrowserMcpRuntimeInstalled({ rootDir: '', existsSync: () => true }), false);
});

test('browser install advertises the browser server in the Pi-global mcp.json', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-pi-bridge-root-'));
  const piHome = await mkdtemp(path.join(os.tmpdir(), 'aios-pi-bridge-home-'));
  const logs = [];
  const result = await ensurePiBrowserMcpServer({ rootDir, piHome, io: { log: (line) => logs.push(String(line)) } });
  assert.equal(result.status, 'updated');
  assert.deepEqual(result.added, ['mcp-browser-use']);

  const saved = JSON.parse(await readFile(path.join(piHome, 'mcp.json'), 'utf8'));
  assert.deepEqual(Object.keys(saved.mcpServers), ['mcp-browser-use']);
  assert.deepEqual(saved.mcpServers['mcp-browser-use'], {
    command: 'node',
    args: [resolveLocalBrowserMcpScript(rootDir)],
    lifecycle: 'lazy',
  });

  const again = await ensurePiBrowserMcpServer({ rootDir, piHome, io: { log: () => {} } });
  assert.equal(again.status, 'present', 'idempotent on a second run');
});

test('missing Pi home skips the bridge instead of writing user config', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-pi-bridge-skip-'));
  const result = await ensurePiBrowserMcpServer({ rootDir, piHome: '', io: { log: () => {} } });
  assert.equal(result.status, 'skipped');
});
