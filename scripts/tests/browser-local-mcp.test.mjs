import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildLocalBrowserMcpServer,
  buildPreferredMcpServer,
} from '../lib/components/browser/mcp-server-builders.mjs';
import { installBrowserMcp } from '../lib/components/browser/install.mjs';
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
    clientHomes: { codex: '', claude: '', gemini: '', opencode: '' },
  });

  assert.equal(result.browserUseProjectDir, null);
  assert.equal(result.launcherPath, localScript);
  assert.equal(logs.some((line) => line.includes('using repository-local Node/Playwright MCP')), true);
  assert.equal(logs.some((line) => line.includes('"command": "node"')), true);
});
