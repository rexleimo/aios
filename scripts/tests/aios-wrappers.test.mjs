import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repoRoot = process.cwd();

async function createFakeNode(tempDir, captureFile) {
  const nodePath = path.join(tempDir, 'node');
  const script = `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "-p" ]]; then
  printf '24\n'
  exit 0
fi
printf '%s\n' "$@" > "$AIOS_CAPTURE_FILE"
exit 0
`;
  await writeFile(nodePath, script, 'utf8');
  await chmod(nodePath, 0o755);
  return nodePath;
}

async function runWrapper(scriptPath, args) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'aios-wrapper-test-'));
  const captureFile = path.join(tempDir, 'capture.txt');
  await createFakeNode(tempDir, captureFile);
  const env = {
    ...process.env,
    PATH: `${tempDir}:${process.env.PATH}`,
    AIOS_CAPTURE_FILE: captureFile,
  };

  const result = spawnSync('bash', [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
  });

  const captured = await readFile(captureFile, 'utf8');
  return {
    result,
    captured: captured.split(/\r?\n/).filter(Boolean),
  };
}

test('install-contextdb-shell.sh forwards to internal shell install', async () => {
  const { result, captured } = await runWrapper('scripts/install-contextdb-shell.sh', ['--mode', 'repo-only', '--force']);
  assert.equal(result.status, 0);
  assert.equal(captured[1], 'internal');
  assert.equal(captured[2], 'shell');
  assert.equal(captured[3], 'install');
  assert.deepEqual(captured.slice(4), ['--mode', 'repo-only', '--force']);
});

test('update-contextdb-skills.sh forwards to internal skills update', async () => {
  const { result, captured } = await runWrapper('scripts/update-contextdb-skills.sh', ['--client', 'gemini']);
  assert.equal(result.status, 0);
  assert.equal(captured[1], 'internal');
  assert.equal(captured[2], 'skills');
  assert.equal(captured[3], 'update');
  assert.deepEqual(captured.slice(4), ['--client', 'gemini']);
});

test('doctor-browser-mcp.sh forwards help to internal browser doctor', async () => {
  const { result, captured } = await runWrapper('scripts/doctor-browser-mcp.sh', ['--help']);
  assert.equal(result.status, 0);
  assert.equal(captured[1], 'internal');
  assert.equal(captured[2], 'browser');
  assert.equal(captured[3], 'doctor');
  assert.deepEqual(captured.slice(4), ['--help']);
});

test('start-browser-cdp.sh forwards to internal browser cdp-start', async () => {
  const { result, captured } = await runWrapper('scripts/start-browser-cdp.sh', ['--help']);
  assert.equal(result.status, 0);
  assert.equal(captured[1], 'internal');
  assert.equal(captured[2], 'browser');
  assert.equal(captured[3], 'cdp-start');
  assert.deepEqual(captured.slice(4), ['--help']);
});

test('install-contextdb-shell.ps1 is a thin wrapper', async () => {
  const content = await readFile(path.join(repoRoot, 'scripts', 'install-contextdb-shell.ps1'), 'utf8');
  assert.match(content, /internal shell install/);
});

test('contextdb PowerShell transparent wrappers preserve native stdout TTY', async () => {
  const content = await readFile(path.join(repoRoot, 'scripts', 'contextdb-shell.ps1'), 'utf8');

  assert.doesNotMatch(content, /\$global:LASTEXITCODE\s*=\s*Invoke-BridgeOrPassthrough/u);
  assert.doesNotMatch(content, /return\s+\(Invoke-NativeCommand/u);
  assert.doesNotMatch(content, /return\s+\$LASTEXITCODE/u);

  for (const name of ['codex', 'claude', 'gemini', 'opencode']) {
    assert.match(
      content,
      new RegExp(`function ${name} \\{[\\s\\S]*?\\n\\s+Invoke-BridgeOrPassthrough -Agent`, 'u')
    );
  }

  assert.match(content, /& node \$bridge "--agent" \$Agent "--command" \$Passthrough "--" @Arguments\r?\n\s+\$global:LASTEXITCODE = \$LASTEXITCODE/u);
});


test('contextdb zsh wrapper resolves bridge from AIOS_ROOT_DIR before ROOTPATH', async () => {
  const content = await readFile(path.join(repoRoot, 'scripts', 'contextdb-shell.zsh'), 'utf8');

  assert.match(content, /local rootpath="\$\{AIOS_ROOT_DIR:-\$\{AIOS_ROOT:-\$\{ROOTPATH:-\}\}\}"/u);
  assert.match(content, /\[warn\] AIOS_ROOT_DIR is not set/u);
});

test('contextdb PowerShell wrapper resolves bridge from AIOS_ROOT_DIR before ROOTPATH', async () => {
  const content = await readFile(path.join(repoRoot, 'scripts', 'contextdb-shell.ps1'), 'utf8');

  assert.match(content, /\$rootPath = if \(\$env:AIOS_ROOT_DIR\)/u);
  assert.match(content, /\[warn\] AIOS_ROOT_DIR is not set/u);
});

test('doctor-contextdb-skills.ps1 is a thin wrapper', async () => {
  const content = await readFile(path.join(repoRoot, 'scripts', 'doctor-contextdb-skills.ps1'), 'utf8');
  assert.match(content, /internal skills doctor/);
  assert.doesNotMatch(content, /\$ClientName:/);
});

test('status-browser-cdp.ps1 is a thin wrapper', async () => {
  const content = await readFile(path.join(repoRoot, 'scripts', 'status-browser-cdp.ps1'), 'utf8');
  assert.match(content, /internal browser cdp-status/);
});
