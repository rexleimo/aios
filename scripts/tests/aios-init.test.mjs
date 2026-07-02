import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildCavemanWindowsInstallCommand,
  buildRTKInitCommandForAgent,
  getCavemanVerificationPaths,
} from '../lib/aios-init/compression-tools.mjs';
import { buildCommandRewriteHookCommand, buildSaveGuardCommand, ensureHook } from '../lib/aios-init/hooks.mjs';

function normalizeSlashes(value) {
  return String(value).replace(/\\/g, '/');
}

function runtimeScriptPath(rootDir, scriptName) {
  return normalizeSlashes(path.join(path.resolve(rootDir), 'scripts', scriptName));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('buildCavemanWindowsInstallCommand downloads install.ps1 before execution', () => {
  const command = buildCavemanWindowsInstallCommand();

  assert.match(command, /Invoke-WebRequest/u);
  assert.match(command, /-OutFile \$installer/u);
  assert.match(command, /-ExecutionPolicy Bypass/u);
  assert.match(command, /-File \$installer/u);
  assert.doesNotMatch(command, /\|\s*iex/u);
});

test('getCavemanVerificationPaths covers current installer targets', () => {
  const home = normalizeSlashes(path.join(os.tmpdir(), 'aios-home'));
  const cwd = normalizeSlashes(path.join(os.tmpdir(), 'aios-repo'));
  const opencodeHome = normalizeSlashes(path.join(os.tmpdir(), 'opencode-home'));
  const paths = getCavemanVerificationPaths({
    home,
    cwd,
    env: { OPENCODE_HOME: opencodeHome },
  }).map((entry) => normalizeSlashes(entry.path));

  assert.ok(paths.includes(`${cwd}/.agents/skills/caveman`));
  assert.ok(paths.includes(`${opencodeHome}/skills/caveman`));
  assert.ok(paths.includes(`${home}/.claude/plugins/cache/caveman`));
});

test('buildRTKInitCommandForAgent uses current RTK flags', () => {
  assert.equal(buildRTKInitCommandForAgent('claude'), 'rtk init -g');
  assert.equal(buildRTKInitCommandForAgent('codex'), 'rtk init -g --codex');
  assert.equal(buildRTKInitCommandForAgent('gemini'), 'rtk init -g --gemini');
  assert.equal(buildRTKInitCommandForAgent('opencode'), 'rtk init -g --opencode');
  assert.equal(buildRTKInitCommandForAgent('hermes'), 'rtk init -g --agent hermes');
  assert.equal(buildRTKInitCommandForAgent('unknown'), null);
});

test('buildSaveGuardCommand uses AIOS ctx-agent and save-guard mode for external workspaces', () => {
  const workspaceRoot = "/tmp/rex workspace/$unsafe'sub";
  const installRoot = "/opt/rex cli/$install";
  const command = buildSaveGuardCommand('claude', workspaceRoot, {
    env: { ROOTPATH: installRoot },
  });

  const normalizedCommand = normalizeSlashes(command);
  assert.match(normalizedCommand, new RegExp(`node '${escapeRegExp(runtimeScriptPath(installRoot, 'ctx-agent.mjs'))}'`, 'u'));
  assert.doesNotMatch(normalizedCommand, /rex workspace\/.*\/scripts\/ctx-agent\.mjs/u);
  assert.doesNotMatch(normalizedCommand, new RegExp(escapeRegExp(normalizeSlashes(path.resolve('scripts', 'ctx-agent.mjs'))), 'u'));
  assert.match(command, /--save-guard/u);
  assert.match(command, /--status done/u);
  assert.doesNotMatch(command, /--checkpoint-status/u);
});

test('buildSaveGuardCommand accepts AIOS_ROOT alias for installed runtime root', () => {
  const command = buildSaveGuardCommand('claude', '/tmp/rex-workspace', {
    env: { AIOS_ROOT: '/opt/aios-root' },
  });

  assert.match(normalizeSlashes(command), new RegExp(`node '?${escapeRegExp(runtimeScriptPath('/opt/aios-root', 'ctx-agent.mjs'))}'?`, 'u'));
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
  assert.match(normalizeSlashes(settings.hooks.Stop[0].hooks[0].command), new RegExp(escapeRegExp(runtimeScriptPath('/opt/aios-runtime', 'ctx-agent.mjs')), 'u'));
  assert.match(settings.hooks.Stop[0].hooks[0].command, /--save-guard/u);
});

test('ensureHook writes Claude PostToolUse offload capture hook', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-init-claude-offload-hook-'));
  ensureHook(workspaceRoot, 'claude', {
    env: { AIOS_ROOT_DIR: '/opt/aios-runtime' },
  });

  const settings = JSON.parse(fs.readFileSync(path.join(workspaceRoot, '.claude', 'settings.local.json'), 'utf8'));
  assert.equal(settings.hooks.PostToolUse.length, 1);
  assert.deepEqual(Object.keys(settings.hooks.PostToolUse[0]).sort(), ['hooks', 'matcher']);
  const command = settings.hooks.PostToolUse[0].hooks[0].command;
  assert.match(normalizeSlashes(command), new RegExp(escapeRegExp(runtimeScriptPath('/opt/aios-runtime', 'aios.mjs')), 'u'));
  assert.match(command, /internal offload capture/u);
  assert.match(command, /--workspace/u);
});

test('buildCommandRewriteHookCommand uses installed AIOS hook script', () => {
  const command = buildCommandRewriteHookCommand('claude', '/tmp/rex-workspace', {
    env: { AIOS_ROOT_DIR: "/opt/rex cli/$install" },
  });

  const normalizedCommand = normalizeSlashes(command);
  assert.match(command, /^AIOS_ROOT_DIR=/u);
  assert.match(normalizedCommand, new RegExp(`bash '${escapeRegExp(runtimeScriptPath('/opt/rex cli/$install', 'hooks/claude/aios-rewrite.sh'))}'`, 'u'));
  assert.doesNotMatch(normalizedCommand, /rex-workspace\/scripts\/hooks\/claude\/aios-rewrite\.sh/u);
});

test('ensureHook writes Claude PreToolUse command rewrite hook', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-init-claude-rewrite-hook-'));
  ensureHook(workspaceRoot, 'claude', {
    env: { AIOS_ROOT_DIR: '/opt/aios-runtime' },
  });

  const settings = JSON.parse(fs.readFileSync(path.join(workspaceRoot, '.claude', 'settings.local.json'), 'utf8'));
  assert.equal(settings.hooks.PreToolUse.length, 1);
  assert.equal(settings.hooks.PreToolUse[0].matcher, 'Bash');
  assert.deepEqual(Object.keys(settings.hooks.PreToolUse[0]).sort(), ['hooks', 'matcher']);
  const command = settings.hooks.PreToolUse[0].hooks[0].command;
  assert.match(normalizeSlashes(command), new RegExp(escapeRegExp(runtimeScriptPath('/opt/aios-runtime', 'hooks/claude/aios-rewrite.sh')), 'u'));
  assert.match(command, /^AIOS_ROOT_DIR=/u);
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
  const normalizedCommand = normalizeSlashes(command);
  assert.match(normalizedCommand, new RegExp(escapeRegExp(runtimeScriptPath('/opt/aios-runtime', 'ctx-agent.mjs')), 'u'));
  assert.doesNotMatch(normalizedCommand, new RegExp(`${escapeRegExp(normalizeSlashes(workspaceRoot))}\\/scripts\\/ctx-agent\\.mjs`, 'u'));
  assert.match(command, /--save-guard/u);
  assert.doesNotMatch(command, /--checkpoint-status/u);
});

test('ensureHook upgrades stale Claude PreToolUse rewrite hook without clobbering user hooks', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-init-claude-stale-rewrite-hook-'));
  fs.mkdirSync(path.join(workspaceRoot, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, '.claude', 'settings.local.json'), `${JSON.stringify({
    hooks: {
      PreToolUse: [
        {
          matcher: 'Edit',
          hooks: [
            {
              type: 'command',
              command: 'echo user-owned',
            },
          ],
        },
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'command',
              command: `AIOS_ROOT_DIR=${workspaceRoot} bash ${workspaceRoot}/scripts/hooks/claude/aios-rewrite.sh`,
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
  assert.equal(settings.hooks.PreToolUse.length, 2);
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].command, 'echo user-owned');
  const command = settings.hooks.PreToolUse[1].hooks[0].command;
  const normalizedCommand = normalizeSlashes(command);
  assert.match(normalizedCommand, new RegExp(escapeRegExp(runtimeScriptPath('/opt/aios-runtime', 'hooks/claude/aios-rewrite.sh')), 'u'));
  assert.doesNotMatch(normalizedCommand, new RegExp(`${escapeRegExp(normalizeSlashes(workspaceRoot))}\\/scripts\\/hooks\\/claude\\/aios-rewrite\\.sh`, 'u'));
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
