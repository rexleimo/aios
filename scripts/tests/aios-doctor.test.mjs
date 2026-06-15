import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { doctorBrowserMcp } from '../lib/components/browser.mjs';
import { countEffectiveWarnLines } from '../lib/doctor/aggregate.mjs';

test('countEffectiveWarnLines ignores missing codex/claude/gemini path warnings', () => {
  const count = countEffectiveWarnLines([
    '[warn] codex not found in PATH',
    '[warn] claude not found in PATH',
    '[warn] gemini not found in PATH',
  ]);
  assert.equal(count, 0);
});

test('countEffectiveWarnLines counts actionable warnings', () => {
  const count = countEffectiveWarnLines([
    '[warn] rc file not found: /tmp/.zshrc',
    '[warn] CODEX_HOME directory does not exist (/tmp/.codex)',
  ]);
  assert.equal(count, 2);
});

test('doctor-security-config scans agent-sources markdown role cards', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-doctor-agents-'));
  const roleDir = path.join(rootDir, 'agent-sources', 'roles');
  await mkdir(roleDir, { recursive: true });
  await writeFile(
    path.join(roleDir, 'rex-planner.md'),
    [
      '---',
      'schemaVersion: 1',
      'id: "rex-planner"',
      'role: "planner"',
      'name: "rex-planner"',
      'description: "planner"',
      'tools: ["Read"]',
      'model: "sonnet"',
      'handoffTarget: "next-phase"',
      '---',
      '',
      '-----BEGIN PRIVATE KEY-----',
      '',
    ].join('\n'),
    'utf8'
  );

  const result = spawnSync(process.execPath, ['scripts/doctor-security-config.mjs', '--workspace', rootDir, '--strict'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /agent-sources\/roles\/rex-planner\.md/);
  assert.match(`${result.stdout}\n${result.stderr}`, /private_key/);
});

test('doctor-security-config scans Codex TOML agent roles', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-doctor-codex-agent-'));
  const agentDir = path.join(rootDir, '.codex', 'agents');
  await mkdir(agentDir, { recursive: true });
  await writeFile(
    path.join(agentDir, 'rex-planner.toml'),
    [
      'name = "rex-planner"',
      'description = "planner"',
      'developer_instructions = "-----BEGIN PRIVATE KEY-----"',
      '',
    ].join('\n'),
    'utf8'
  );

  const result = spawnSync(process.execPath, ['scripts/doctor-security-config.mjs', '--workspace', rootDir, '--strict'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /\.codex\/agents\/rex-planner\.toml/);
  assert.match(`${result.stdout}\n${result.stderr}`, /private_key/);
});

test('doctorBrowserMcp --fix auto-heals default cdpPort when service start succeeds', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-browser-doctor-fix-root-'));
  const scriptsDir = path.join(rootDir, 'scripts');
  const configDir = path.join(rootDir, 'config');
  const browserUseDir = path.join(rootDir, 'ai-browser-book', 'mcp-browser-use');
  await mkdir(scriptsDir, { recursive: true });
  await mkdir(path.join(browserUseDir, '.venv', 'bin'), { recursive: true });
  await mkdir(configDir, { recursive: true });
  await writeFile(path.join(scriptsDir, 'run-browser-use-mcp.sh'), '#!/usr/bin/env bash\n', 'utf8');
  await writeFile(path.join(scriptsDir, 'browser-use-bootstrap.py'), 'print("ok")\n', 'utf8');
  await writeFile(path.join(browserUseDir, 'pyproject.toml'), '[project]\nname="mcp-browser-use"\n', 'utf8');
  await writeFile(path.join(browserUseDir, '.venv', 'bin', 'python'), '#!/usr/bin/env bash\n', 'utf8');
  await writeFile(path.join(configDir, 'browser-profiles.json'), JSON.stringify({
    profiles: {
      default: { cdpPort: 9333 },
    },
  }, null, 2), 'utf8');

  const logs = [];
  let startCalls = 0;
  let probeCount = 0;
  const result = await doctorBrowserMcp({
    rootDir,
    fix: true,
    io: { log: (line) => logs.push(String(line)) },
    runtime: {
      platform: 'darwin',
      commandExists: () => true,
      captureCommand: (command, args) => {
        if (command === 'node' && args?.[0] === '-p') {
          return { status: 0, stdout: '22.11.0\n', stderr: '', error: null };
        }
        return { status: 0, stdout: '', stderr: '', error: null };
      },
      testPortOpen: async () => {
        probeCount += 1;
        return probeCount > 1;
      },
      startCdpService: async () => {
        startCalls += 1;
      },
    },
  });

  assert.equal(startCalls, 1);
  assert.equal(result.errors, 0);
  assert.equal(result.effectiveWarnings, 0);
  assert.equal(result.autoFixApplied, 1);
  assert.equal(result.autoFixHealed, 1);
  assert.match(logs.join('\n'), /default CDP port auto-healed: 9333/);
});

test('doctorBrowserMcp --fix --dry-run reports plan without starting CDP service', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'aios-browser-doctor-dry-run-root-'));
  const scriptsDir = path.join(rootDir, 'scripts');
  const configDir = path.join(rootDir, 'config');
  const browserUseDir = path.join(rootDir, 'ai-browser-book', 'mcp-browser-use');
  await mkdir(scriptsDir, { recursive: true });
  await mkdir(path.join(browserUseDir, '.venv', 'bin'), { recursive: true });
  await mkdir(configDir, { recursive: true });
  await writeFile(path.join(scriptsDir, 'run-browser-use-mcp.sh'), '#!/usr/bin/env bash\n', 'utf8');
  await writeFile(path.join(scriptsDir, 'browser-use-bootstrap.py'), 'print("ok")\n', 'utf8');
  await writeFile(path.join(browserUseDir, 'pyproject.toml'), '[project]\nname="mcp-browser-use"\n', 'utf8');
  await writeFile(path.join(browserUseDir, '.venv', 'bin', 'python'), '#!/usr/bin/env bash\n', 'utf8');
  await writeFile(path.join(configDir, 'browser-profiles.json'), JSON.stringify({
    profiles: {
      default: { cdpPort: 9333 },
    },
  }, null, 2), 'utf8');

  const logs = [];
  let startCalls = 0;
  const result = await doctorBrowserMcp({
    rootDir,
    fix: true,
    dryRun: true,
    io: { log: (line) => logs.push(String(line)) },
    runtime: {
      platform: 'darwin',
      commandExists: () => true,
      captureCommand: (command, args) => {
        if (command === 'node' && args?.[0] === '-p') {
          return { status: 0, stdout: '22.11.0\n', stderr: '', error: null };
        }
        return { status: 0, stdout: '', stderr: '', error: null };
      },
      testPortOpen: async () => false,
      startCdpService: async () => {
        startCalls += 1;
      },
    },
  });

  assert.equal(startCalls, 0);
  assert.equal(result.errors, 0);
  assert.equal(result.effectiveWarnings, 1);
  assert.equal(result.autoFixPlanned, 1);
  assert.equal(result.autoFixApplied, 0);
  assert.equal(result.autoFixHealed, 0);
  assert.match(logs.join('\n'), /\[plan\] browser doctor fix would run:/);
});
