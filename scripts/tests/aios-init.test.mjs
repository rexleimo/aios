import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildSaveGuardCommand, ensureHook } from '../aios-init.mjs';

test('buildSaveGuardCommand uses AIOS ctx-agent and save-guard mode for external workspaces', () => {
  const workspaceRoot = "/tmp/rex workspace/$unsafe'sub";
  const installRoot = "/opt/rex cli/$install";
  const command = buildSaveGuardCommand('claude', workspaceRoot, {
    env: { ROOTPATH: installRoot },
  });

  assert.match(command, /node '\/opt\/rex cli\/\$install\/scripts\/ctx-agent\.mjs'/u);
  assert.doesNotMatch(command, /rex workspace\/.*\/scripts\/ctx-agent\.mjs/u);
  assert.doesNotMatch(command, new RegExp(path.resolve('scripts', 'ctx-agent.mjs').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  assert.match(command, /--save-guard/u);
  assert.match(command, /--status done/u);
  assert.doesNotMatch(command, /--checkpoint-status/u);
});

test('buildSaveGuardCommand accepts AIOS_ROOT alias for installed runtime root', () => {
  const command = buildSaveGuardCommand('claude', '/tmp/rex-workspace', {
    env: { AIOS_ROOT: '/opt/aios-root' },
  });

  assert.match(command, /node \/opt\/aios-root\/scripts\/ctx-agent\.mjs/u);
  assert.match(command, /--save-guard/u);
});

test('ensureHook writes Claude Stop hook using nested command schema', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-init-claude-hook-'));
  const result = ensureHook(workspaceRoot, 'claude', {
    env: { AIOS_ROOT_DIR: '/opt/aios-runtime' },
  });

  assert.equal(result.action, 'added');
  const settings = JSON.parse(fs.readFileSync(path.join(workspaceRoot, '.claude', 'settings.local.json'), 'utf8'));
  assert.equal(settings.hooks.Stop.length, 1);
  assert.deepEqual(Object.keys(settings.hooks.Stop[0]).sort(), ['hooks', 'matcher']);
  assert.equal(settings.hooks.Stop[0].hooks[0].type, 'command');
  assert.match(settings.hooks.Stop[0].hooks[0].command, /\/opt\/aios-runtime\/scripts\/ctx-agent\.mjs/u);
  assert.match(settings.hooks.Stop[0].hooks[0].command, /--save-guard/u);
});

test('ensureHook upgrades stale nested Claude save guard hook to installed runtime', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-init-claude-stale-hook-'));
  fs.mkdirSync(path.join(workspaceRoot, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, '.claude', 'settings.local.json'), `${JSON.stringify({
    hooks: {
      Stop: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: `node ${workspaceRoot}/scripts/ctx-agent.mjs --agent claude-code --workspace ${workspaceRoot} --project stale --checkpoint-status completed`,
            },
          ],
        },
      ],
    },
  }, null, 2)}\n`, 'utf8');

  const result = ensureHook(workspaceRoot, 'claude', {
    env: { AIOS_ROOT_DIR: '/opt/aios-runtime' },
  });

  assert.equal(result.action, 'updated');
  const settings = JSON.parse(fs.readFileSync(path.join(workspaceRoot, '.claude', 'settings.local.json'), 'utf8'));
  const command = settings.hooks.Stop[0].hooks[0].command;
  assert.match(command, /\/opt\/aios-runtime\/scripts\/ctx-agent\.mjs/u);
  assert.doesNotMatch(command, new RegExp(`${workspaceRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/scripts\\/ctx-agent\\.mjs`, 'u'));
  assert.match(command, /--save-guard/u);
  assert.doesNotMatch(command, /--checkpoint-status/u);
});

test('ensureHook converts top-level Claude save guard hook to nested command schema', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-init-claude-top-level-hook-'));
  const command = buildSaveGuardCommand('claude', workspaceRoot, {
    env: { AIOS_ROOT_DIR: '/opt/aios-runtime' },
  });
  fs.mkdirSync(path.join(workspaceRoot, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, '.claude', 'settings.local.json'), `${JSON.stringify({
    hooks: {
      Stop: [
        {
          matcher: '',
          command,
        },
      ],
    },
  }, null, 2)}\n`, 'utf8');

  const result = ensureHook(workspaceRoot, 'claude', {
    env: { AIOS_ROOT_DIR: '/opt/aios-runtime' },
  });

  assert.equal(result.action, 'updated');
  const settings = JSON.parse(fs.readFileSync(path.join(workspaceRoot, '.claude', 'settings.local.json'), 'utf8'));
  assert.equal(settings.hooks.Stop.length, 1);
  assert.equal(settings.hooks.Stop[0].command, undefined);
  assert.equal(settings.hooks.Stop[0].hooks[0].command, command);
  assert.equal(settings.hooks.Stop[0].hooks[0].type, 'command');
});
