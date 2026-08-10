import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  applyOpenCodeRuntimeDefaults,
  OPENCODE_DEFAULT_BASH_TIMEOUT_MS,
} from '../lib/opencode/runtime-env.mjs';
import {
  buildOpenCodeStrictAgentArgs,
  shouldUseOpenCodePureMode,
} from '../lib/opencode/strict-primary-agent.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BRIDGE = path.join(ROOT, 'scripts', 'contextdb-shell-bridge.mjs');

test('managed OpenCode runtime defaults bound shell waits and disable duplicate external skills', () => {
  const env = applyOpenCodeRuntimeDefaults({ KEEP_ME: 'yes' }, { managed: true });

  assert.equal(env.KEEP_ME, 'yes');
  assert.equal(env.OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS, String(OPENCODE_DEFAULT_BASH_TIMEOUT_MS));
  assert.equal(env.OPENCODE_DISABLE_EXTERNAL_SKILLS, '1');
});

test('OpenCode runtime defaults preserve explicit user overrides', () => {
  const env = applyOpenCodeRuntimeDefaults({
    OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: '600000',
    OPENCODE_DISABLE_EXTERNAL_SKILLS: '0',
  }, { managed: true });

  assert.equal(env.OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS, '600000');
  assert.equal(env.OPENCODE_DISABLE_EXTERNAL_SKILLS, '0');
});

test('unmanaged OpenCode runs retain external skill discovery', () => {
  const env = applyOpenCodeRuntimeDefaults({}, { managed: false });

  assert.equal('OPENCODE_DISABLE_EXTERNAL_SKILLS' in env, false);
});

test('AIOS OpenCode invocations default to pure mode and allow an explicit plugin opt-out', () => {
  assert.equal(shouldUseOpenCodePureMode({}), true);
  assert.deepEqual(buildOpenCodeStrictAgentArgs([], {}), ['--agent', 'aios-build', '--pure']);

  const env = { AIOS_OPENCODE_ENABLE_EXTERNAL_PLUGINS: '1' };
  assert.equal(shouldUseOpenCodePureMode(env), false);
  assert.deepEqual(buildOpenCodeStrictAgentArgs([], env), ['--agent', 'aios-build']);
});

async function createFakeCodexCommand() {
  const binDir = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-bin-'));
  if (process.platform === 'win32') {
    const file = path.join(binDir, 'codex.cmd');
    await writeFile(file, '@echo off\r\necho CODEX_HOME=%CODEX_HOME%\r\n', 'utf8');
    return binDir;
  }

  const file = path.join(binDir, 'codex');
  await writeFile(file, '#!/usr/bin/env bash\necho "CODEX_HOME=${CODEX_HOME:-<unset>}"\n', 'utf8');
  await chmod(file, 0o755);
  return binDir;
}

async function createFakePassthroughCommand(commandName, marker) {
  const binDir = await mkdtemp(path.join(os.tmpdir(), `aios-bridge-${commandName}-`));
  const markerLiteral = JSON.stringify(marker);

  if (process.platform === 'win32') {
    const script = path.join(binDir, `${commandName}-fake.mjs`);
    await writeFile(
      script,
      `process.stdout.write(JSON.stringify({ marker: ${markerLiteral}, argv: process.argv.slice(2) }) + "\\n");\n`,
      'utf8'
    );
    const shim = path.join(binDir, `${commandName}.cmd`);
    await writeFile(shim, `@echo off\r\nnode "${script}" %*\r\n`, 'utf8');
    return binDir;
  }

  const file = path.join(binDir, commandName);
  await writeFile(
    file,
    `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ marker: ${markerLiteral}, argv: process.argv.slice(2) }) + "\\n");\n`,
    'utf8'
  );
  await chmod(file, 0o755);
  return binDir;
}

async function createFakeRunner() {
  const binDir = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-runner-'));
  const runnerScript = path.join(binDir, 'runner-script.mjs');
  await writeFile(runnerScript, [
    'const args = process.argv.slice(2);',
    "const index = args.indexOf('--workspace');",
    "const workspace = index >= 0 ? (args[index + 1] || '') : '';",
    "console.log(`RUNNER_WORKSPACE=${workspace}`);",
    "console.log(`RUNNER_ARGS=${JSON.stringify(args)}`);",
    "console.log(`RUNNER_PATH=${process.env.PATH || process.env.Path || ''}`);",
    "console.log(`RUNNER_IMPLICIT_PROMPT_ENV_JSON=${JSON.stringify(process.env.AIOS_IMPLICIT_PROMPT || '')}`);",
  ].join('\n'), 'utf8');

  if (process.platform === 'win32') {
    const file = path.join(binDir, 'ctx-runner.cmd');
    await writeFile(file, `@echo off\r\nnode "${runnerScript}" %*\r\n`, 'utf8');
    return file;
  }

  const file = path.join(binDir, 'ctx-runner');
  await writeFile(file, `#!/usr/bin/env bash\nnode "${runnerScript}" "$@"\n`, 'utf8');
  await chmod(file, 0o755);
  return file;
}

function runBridge({
  cwd,
  codeHome,
  pathPrefix,
  env: envOverrides = {},
  args = ['--help'],
  agent = 'codex-cli',
  command = 'codex',
}) {
  const env = { ...process.env, ...envOverrides };
  const nextPath = `${pathPrefix}${path.delimiter}${env.PATH || env.Path || ''}`;
  env.PATH = nextPath;
  if (process.platform === 'win32') {
    env.Path = nextPath;
  }

  if (codeHome !== undefined) {
    env.CODEX_HOME = codeHome;
  }

  const result = spawnSync('node', [
    BRIDGE,
    '--agent', agent,
    '--command', command,
    '--cwd', cwd,
    '--',
    ...args,
  ], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
  });

  return result;
}

function parseReportedCodeHome(stdout) {
  const line = (stdout || '').trim().split(/\r?\n/).find((x) => x.startsWith('CODEX_HOME='));
  return line ? line.slice('CODEX_HOME='.length) : '';
}

function parseRunnerWorkspace(stdout) {
  const line = (stdout || '').trim().split(/\r?\n/).find((x) => x.startsWith('RUNNER_WORKSPACE='));
  return line ? line.slice('RUNNER_WORKSPACE='.length) : '';
}

function parseRunnerArgs(stdout) {
  const line = (stdout || '').trim().split(/\r?\n/).find((x) => x.startsWith('RUNNER_ARGS='));
  if (!line) return [];
  return JSON.parse(line.slice('RUNNER_ARGS='.length));
}

function parseRunnerPath(stdout) {
  const line = (stdout || '').trim().split(/\r?\n/).find((x) => x.startsWith('RUNNER_PATH='));
  return line ? line.slice('RUNNER_PATH='.length) : '';
}

function parseRunnerImplicitPromptEnv(stdout) {
  const line = (stdout || '').trim().split(/\r?\n/).find((x) => x.startsWith('RUNNER_IMPLICIT_PROMPT_ENV_JSON='));
  if (!line) return '';
  return JSON.parse(line.slice('RUNNER_IMPLICIT_PROMPT_ENV_JSON='.length));
}

function parseLastJsonPayload(stdout) {
  const line = (stdout || '').trim().split(/\r?\n/).at(-1) || '{}';
  return JSON.parse(line);
}

test('relative CODEX_HOME is resolved against invocation cwd', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-cwd-'));
  await mkdir(path.join(cwd, 'rel-home'), { recursive: true });
  const fakeBin = await createFakeCodexCommand();

  const result = runBridge({
    cwd,
    codeHome: './rel-home',
    pathPrefix: fakeBin,
  });

  assert.equal(result.status, 0);
  assert.equal(parseReportedCodeHome(result.stdout), path.resolve(cwd, 'rel-home'));
});

test('absolute CODEX_HOME is preserved', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-cwd-'));
  const absoluteHome = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-codex-home-'));
  const fakeBin = await createFakeCodexCommand();

  const result = runBridge({
    cwd,
    codeHome: absoluteHome,
    pathPrefix: fakeBin,
  });

  assert.equal(result.status, 0);
  assert.equal(parseReportedCodeHome(result.stdout), absoluteHome);
});

test('all mode wraps a non-git cwd using fallback workspace', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-fallback-all-'));
  const fakeBin = await createFakeCodexCommand();
  const fakeRunner = await createFakeRunner();

  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    args: ['hello'],
    env: {
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'all',
    },
  });

  assert.equal(result.status, 0);
  assert.equal(parseRunnerWorkspace(result.stdout), cwd);
});

test('repo-only mode wraps a non-git cwd when it matches ROOTPATH', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-fallback-root-'));
  const fakeBin = await createFakeCodexCommand();
  const fakeRunner = await createFakeRunner();

  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    args: ['hello'],
    env: {
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'repo-only',
      ROOTPATH: cwd,
    },
  });

  assert.equal(result.status, 0);
  assert.equal(parseRunnerWorkspace(result.stdout), cwd);
});

test('bridge discovers runner from AIOS_ROOT_DIR', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-aios-root-workspace-'));
  const installRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-aios-root-install-'));
  const scriptsDir = path.join(installRoot, 'scripts');
  await mkdir(scriptsDir, { recursive: true });
  const runner = path.join(scriptsDir, 'ctx-agent.mjs');
  await writeFile(runner, [
    '#!/usr/bin/env node',
    'const args = process.argv.slice(2);',
    "const index = args.indexOf('--workspace');",
    "const workspace = index >= 0 ? (args[index + 1] || '') : '';",
    "console.log(`RUNNER_WORKSPACE=${workspace}`);",
    "console.log(`RUNNER_ARGS=${JSON.stringify(args)}`);",
  ].join('\n'), 'utf8');
  await chmod(runner, 0o755);

  const fakeBin = await createFakeCodexCommand();
  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    args: ['hello'],
    env: {
      AIOS_ROOT_DIR: installRoot,
      CTXDB_WRAP_MODE: 'all',
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(parseRunnerWorkspace(result.stdout), cwd);
});

test('bridge discovers runner from AIOS_ROOT alias', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-aios-root-alias-workspace-'));
  const installRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-aios-root-alias-install-'));
  const scriptsDir = path.join(installRoot, 'scripts');
  await mkdir(scriptsDir, { recursive: true });
  const runner = path.join(scriptsDir, 'ctx-agent.mjs');
  await writeFile(runner, [
    '#!/usr/bin/env node',
    'const args = process.argv.slice(2);',
    "const index = args.indexOf('--workspace');",
    "const workspace = index >= 0 ? (args[index + 1] || '') : '';",
    "console.log(`RUNNER_WORKSPACE=${workspace}`);",
    "console.log(`RUNNER_ARGS=${JSON.stringify(args)}`);",
  ].join('\n'), 'utf8');
  await chmod(runner, 0o755);

  const fakeBin = await createFakeCodexCommand();
  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    args: ['hello'],
    env: {
      AIOS_ROOT_DIR: '',
      AIOS_ROOT: installRoot,
      CTXDB_WRAP_MODE: 'all',
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(parseRunnerWorkspace(result.stdout), cwd);
});

test('repo-only mode still passes through when fallback cwd does not match ROOTPATH', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-fallback-other-'));
  const rootpath = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-rootpath-'));
  const fakeBin = await createFakeCodexCommand();
  const fakeRunner = await createFakeRunner();

  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    args: ['hello'],
    env: {
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'repo-only',
      ROOTPATH: rootpath,
    },
  });

  assert.equal(result.status, 0);
  assert.equal(parseRunnerWorkspace(result.stdout), '');
  assert.match(result.stdout, /CODEX_HOME=/);
});

test('native shim path is removed before direct passthrough to avoid recursion', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-shim-strip-direct-'));
  const realBin = await createFakeCodexCommand();
  const shimDir = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-shim-dir-'));
  const shimPath = path.join(shimDir, process.platform === 'win32' ? 'codex.cmd' : 'codex');
  if (process.platform === 'win32') {
    await writeFile(shimPath, '@echo off\r\necho SHIM_RECURSED\r\n', 'utf8');
  } else {
    await writeFile(shimPath, '#!/usr/bin/env bash\necho SHIM_RECURSED\n', 'utf8');
    await chmod(shimPath, 0o755);
  }

  const result = runBridge({
    cwd,
    pathPrefix: `${shimDir}${path.delimiter}${realBin}`,
    args: ['hello'],
    env: {
      AIOS_NATIVE_SHIM_DIR: shimDir,
      CTXDB_WRAP_MODE: 'repo-only',
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /CODEX_HOME=/u);
  assert.doesNotMatch(result.stdout, /SHIM_RECURSED/u);
});

test('AIOS workspace blocks direct interactive native agent when shell wrapping is disabled', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-direct-native-block-'));
  const fakeBin = await createFakeCodexCommand();
  const fakeRunner = await createFakeRunner();
  await writeFile(path.join(cwd, 'AGENTS.md'), '<!-- AIOS: .aios/context-db/index.json -->\n', 'utf8');

  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    args: [],
    env: {
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'off',
    },
  });

  assert.equal(result.status, 66);
  assert.match(result.stderr, /direct native agent execution blocked/u);
  assert.match(result.stderr.replace(/\\/g, '/'), /scripts\/ctx-agent\.mjs/u);
  assert.doesNotMatch(result.stdout, /CODEX_HOME=/u);
  assert.equal(parseRunnerWorkspace(result.stdout), '');
});

test('AIOS direct native block can be bypassed explicitly for diagnostics', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-direct-native-allow-'));
  const fakeBin = await createFakeCodexCommand();
  const fakeRunner = await createFakeRunner();
  await writeFile(path.join(cwd, 'AGENTS.md'), '<!-- AIOS: .aios/context-db/index.json -->\n', 'utf8');

  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    args: [],
    env: {
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'off',
      CTXDB_ALLOW_DIRECT_NATIVE_AGENT: '1',
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /CODEX_HOME=/u);
  assert.doesNotMatch(result.stderr, /direct native agent execution blocked/u);
  assert.equal(parseRunnerWorkspace(result.stdout), '');
});

test('opt-in mode auto-creates marker and wraps a non-git cwd', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-fallback-optin-'));
  const fakeBin = await createFakeCodexCommand();
  const fakeRunner = await createFakeRunner();
  const markerPath = path.join(cwd, '.contextdb-enable');

  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    args: ['hello'],
    env: {
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'opt-in',
      CTXDB_AUTO_CREATE_MARKER: '1',
    },
  });

  assert.equal(result.status, 0);
  assert.equal(parseRunnerWorkspace(result.stdout), cwd);
  assert.equal(existsSync(markerPath), true);
});

test('wrapped interactive runs do not get rewritten to one-shot continue prompts', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-interactive-'));
  const fakeBin = await createFakeCodexCommand();
  const fakeRunner = await createFakeRunner();

  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    args: [],
    env: {
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'all',
    },
  });

  assert.equal(result.status, 0);
  const runnerArgs = parseRunnerArgs(result.stdout);
  assert.equal(runnerArgs.includes('--prompt'), false);
  assert.equal(runnerArgs.at(-1), '--');
});

test('native shim path is removed before launching the AIOS runner', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-shim-strip-runner-'));
  const fakeBin = await createFakeCodexCommand();
  const fakeRunner = await createFakeRunner();
  const shimDir = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-runner-shim-dir-'));

  const result = runBridge({
    cwd,
    pathPrefix: `${shimDir}${path.delimiter}${fakeBin}`,
    args: [],
    env: {
      AIOS_NATIVE_SHIM_DIR: shimDir,
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'all',
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const runnerPath = parseRunnerPath(result.stdout).split(path.delimiter).filter(Boolean);
  assert.equal(runnerPath.includes(shimDir), false);
});

test('wrapped interactive codex runs without implicit prompt injection', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-interactive-route-'));
  const fakeBin = await createFakeCodexCommand();
  const fakeRunner = await createFakeRunner();

  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    args: [],
    env: {
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'all',
    },
  });

  assert.equal(result.status, 0);
  assert.equal(parseRunnerImplicitPromptEnv(result.stdout), '');
});

async function assertAiosInitMarkerDisablesBootstrapOnly(marker) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-interactive-aios-init-'));
  const fakeBin = await createFakeCodexCommand();
  const fakeRunner = await createFakeRunner();
  await writeFile(path.join(cwd, 'AGENTS.md'), `${marker}\n`, 'utf8');

  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    args: [],
    env: {
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'all',
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(parseRunnerImplicitPromptEnv(result.stdout), '');
  const runnerArgs = parseRunnerArgs(result.stdout);
  assert.equal(runnerArgs.includes('--context-mode'), false);
  assert.equal(runnerArgs.includes('slim'), false);
  assert.equal(runnerArgs.includes('--no-bootstrap'), true);
}

test('aios init marker wraps interactive runs without context injection flags', async () => {
  await assertAiosInitMarkerDisablesBootstrapOnly('<!-- AIOS: .aios/context-db/index.json -->');
});

test('legacy aios init marker wraps interactive runs without context injection flags', async () => {
  await assertAiosInitMarkerDisablesBootstrapOnly('<!-- AIOS: memory/context-db/index.json -->');
});

test('wrapped interactive runs print privacy banner to stderr', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-privacy-banner-'));
  const fakeBin = await createFakeCodexCommand();
  const fakeRunner = await createFakeRunner();

  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    args: [],
    env: {
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'all',
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stderr, /AIOS Privacy Shield/u);
  assert.match(result.stderr, /Privacy Guard/u);
  assert.match(result.stderr, /Model compliance/u);
});

test('privacy banner reports custom relay host without credentials or path', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-privacy-relay-'));
  const fakeBin = await createFakeCodexCommand();
  const fakeRunner = await createFakeRunner();

  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    args: [],
    env: {
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'all',
      ANTHROPIC_BASE_URL: '',
      GOOGLE_GEMINI_BASE_URL: '',
      OPENAI_BASE_URL: 'https://user:secret@relay.example.com/v1/private?token=abc',
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stderr, /relay\.example\.com/u);
  assert.doesNotMatch(result.stderr, /user:secret/u);
  assert.doesNotMatch(result.stderr, /\/v1\/private/u);
  assert.doesNotMatch(result.stderr, /token=abc/u);
});

test('privacy banner can be disabled via CTXDB_PRIVACY_BANNER', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-privacy-banner-off-'));
  const fakeBin = await createFakeCodexCommand();
  const fakeRunner = await createFakeRunner();

  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    args: [],
    env: {
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'all',
      CTXDB_PRIVACY_BANNER: '0',
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.doesNotMatch(result.stderr, /AIOS Privacy Shield/u);
});

test('wrapped interactive codex ignores harness route env overrides for startup prompts', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-interactive-harness-env-'));
  const fakeBin = await createFakeCodexCommand();
  const fakeRunner = await createFakeRunner();

  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    args: [],
    env: {
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'all',
      CTXDB_HARNESS_PROVIDER: 'claude',
      CTXDB_HARNESS_MAX_ITERATIONS: '4',
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(parseRunnerImplicitPromptEnv(result.stdout), '');
});

test('wrapped interactive claude and gemini runs without provider-specific route prompts', async () => {
  const cases = [
    { command: 'claude', agent: 'claude-code' },
    { command: 'gemini', agent: 'gemini-cli' },
  ];

  for (const item of cases) {
    const cwd = await mkdtemp(path.join(os.tmpdir(), `aios-bridge-interactive-${item.command}-route-`));
    const fakeBin = await createFakePassthroughCommand(item.command, `FAKE_${item.command.toUpperCase()}`);
    const fakeRunner = await createFakeRunner();

    const result = runBridge({
      cwd,
      pathPrefix: fakeBin,
      command: item.command,
      agent: item.agent,
      args: [],
      env: {
        CTXDB_RUNNER: fakeRunner,
        CTXDB_WRAP_MODE: 'all',
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(parseRunnerImplicitPromptEnv(result.stdout), '');
  }
});

test('wrapped interactive opencode runs without implicit prompt injection', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-interactive-opencode-route-'));
  const fakeBin = await createFakePassthroughCommand('opencode', 'FAKE_OPENCODE');
  const fakeRunner = await createFakeRunner();

  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    command: 'opencode',
    agent: 'opencode-cli',
    args: [],
    env: {
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'all',
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(parseRunnerImplicitPromptEnv(result.stdout), '');
});

test('wrapped claude print prompt is rewritten to ctx-agent one-shot prompt', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-claude-print-'));
  const fakeBin = await createFakePassthroughCommand('claude', 'FAKE_CLAUDE');
  const fakeRunner = await createFakeRunner();

  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    agent: 'claude-code',
    command: 'claude',
    args: ['--model', 'deepseek-v4-pro', '-p', 'hi'],
    env: {
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'all',
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(parseRunnerWorkspace(result.stdout), cwd);
  assert.equal(parseRunnerImplicitPromptEnv(result.stdout), '');
  const runnerArgs = parseRunnerArgs(result.stdout);
  const promptIndex = runnerArgs.indexOf('--prompt');
  assert.equal(promptIndex >= 0, true);
  assert.equal(runnerArgs[promptIndex + 1], 'hi');
  const passthroughIndex = runnerArgs.indexOf('--');
  assert.deepEqual(runnerArgs.slice(passthroughIndex + 1), ['--model', 'deepseek-v4-pro']);
  assert.equal(runnerArgs.includes('-p'), false);
  assert.equal(runnerArgs.includes('--print'), false);
});

test('opencode interactive runs are wrapped through ctx-agent without prompt rewriting', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-opencode-interactive-'));
  const fakeBin = await createFakePassthroughCommand('opencode', 'FAKE_OPENCODE');
  const fakeRunner = await createFakeRunner();

  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    agent: 'opencode-cli',
    command: 'opencode',
    args: [],
    env: {
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'all',
    },
  });

  assert.equal(result.status, 0);
  assert.equal(parseRunnerWorkspace(result.stdout), cwd);
  const runnerArgs = parseRunnerArgs(result.stdout);
  const agentIndex = runnerArgs.indexOf('--agent');
  assert.equal(agentIndex >= 0, true);
  assert.equal(runnerArgs[agentIndex + 1], 'opencode-cli');
  assert.equal(runnerArgs.includes('--prompt'), false);
  assert.equal(runnerArgs.at(-1), '--');
});

test('opencode run subcommand passes through without wrapping', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-opencode-run-'));
  const fakeBin = await createFakePassthroughCommand('opencode', 'FAKE_OPENCODE');
  const fakeRunner = await createFakeRunner();

  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    agent: 'opencode-cli',
    command: 'opencode',
    args: ['run', 'hello'],
    env: {
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'all',
    },
  });

  assert.equal(result.status, 0);
  const payload = parseLastJsonPayload(result.stdout);
  assert.equal(payload.marker, 'FAKE_OPENCODE');
  assert.deepEqual(payload.argv, ['run', 'hello']);
  assert.equal(parseRunnerWorkspace(result.stdout), '');
});
