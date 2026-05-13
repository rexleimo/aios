import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BRIDGE = path.join(ROOT, 'scripts', 'contextdb-shell-bridge.mjs');
const CTX_AGENT_CLI = path.join(ROOT, 'scripts', 'ctx-agent.mjs');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
    "console.log(`RUNNER_AUTO_PROMPT_JSON=${JSON.stringify(process.env.CTXDB_AUTO_PROMPT || '')}`);",
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
  const env = { ...process.env, CTXDB_AUTO_PROMPT: "", ...envOverrides };
  env.PATH = `${pathPrefix}${path.delimiter}${env.PATH || ''}`;

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

function parseRunnerAutoPrompt(stdout) {
  const line = (stdout || '').trim().split(/\r?\n/).find((x) => x.startsWith('RUNNER_AUTO_PROMPT_JSON='));
  if (!line) return '';
  return JSON.parse(line.slice('RUNNER_AUTO_PROMPT_JSON='.length));
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

test('wrapped interactive codex runs inject route auto prompt by default', async () => {
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
  const autoPrompt = parseRunnerAutoPrompt(result.stdout);
  assert.match(autoPrompt, /Routing policy: default to single-route execution\./u);
  assert.match(autoPrompt, /Privacy boundary: LLM instructions are advisory/u);
  assert.match(autoPrompt, /Use `aios privacy read --file <path>` for sensitive files/u);
  assert.match(autoPrompt, /Do not claim strict privacy compliance unless AIOS gates verified it/u);
  assert.match(autoPrompt, /Do NOT spawn built-in explorer\/worker subagents just to scan a codebase/u);
  assert.match(autoPrompt, /post a heartbeat every 30s and stop waiting after 120s/u);
  assert.match(autoPrompt, /Only choose harness for explicit long-running, overnight, resumable/u);
  assert.match(
    autoPrompt,
    new RegExp(`node ${escapeRegExp(CTX_AGENT_CLI)} --agent codex-cli --workspace ${escapeRegExp(cwd)} --project ${escapeRegExp(path.basename(cwd))} --route team --route-execute live --team-provider codex --team-workers 3 --prompt "<task>" --no-bootstrap`, 'u')
  );
  assert.match(
    autoPrompt,
    new RegExp(`node ${escapeRegExp(CTX_AGENT_CLI)} --agent codex-cli --workspace ${escapeRegExp(cwd)} --project ${escapeRegExp(path.basename(cwd))} --route subagent --route-execute live --team-provider codex --team-workers 3 --blueprint feature --prompt "<task>" --no-bootstrap`, 'u')
  );
  assert.match(
    autoPrompt,
    new RegExp(`node .*scripts/aios\.mjs harness run --objective "<task>" --provider codex --max-iterations 8 --worktree --workspace ${escapeRegExp(cwd)}`, 'u')
  );
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

test('wrapped interactive codex runs honors harness route env overrides', async () => {
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
  const autoPrompt = parseRunnerAutoPrompt(result.stdout);
  assert.match(
    autoPrompt,
    new RegExp(`node .*scripts/aios\.mjs harness run --objective "<task>" --provider claude --max-iterations 4 --worktree --workspace ${escapeRegExp(cwd)}`, 'u')
  );
});

test('wrapped interactive codex runs can disable route auto prompt injection via env', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-interactive-route-disabled-'));
  const fakeBin = await createFakeCodexCommand();
  const fakeRunner = await createFakeRunner();

  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    args: [],
    env: {
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'all',
      CTXDB_INTERACTIVE_AUTO_ROUTE: '0',
    },
  });

  assert.equal(result.status, 0);
  const autoPrompt = parseRunnerAutoPrompt(result.stdout);
  assert.equal(autoPrompt, '');
});

test('wrapped interactive codex runs preserve explicit CTXDB_AUTO_PROMPT overrides', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-interactive-auto-prompt-override-'));
  const fakeBin = await createFakeCodexCommand();
  const fakeRunner = await createFakeRunner();

  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    args: [],
    env: {
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'all',
      CTXDB_AUTO_PROMPT: 'custom-auto-prompt',
    },
  });

  assert.equal(result.status, 0);
  assert.equal(parseRunnerAutoPrompt(result.stdout), 'custom-auto-prompt');
});

test('wrapped interactive claude and gemini runs inject provider-specific route prompts', async () => {
  const cases = [
    { command: 'claude', agent: 'claude-code', expectedProvider: 'claude', expectedClient: 'claude-code' },
    { command: 'gemini', agent: 'gemini-cli', expectedProvider: 'gemini', expectedClient: 'gemini-cli' },
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
    const autoPrompt = parseRunnerAutoPrompt(result.stdout);
    assert.match(
      autoPrompt,
      new RegExp(`node ${escapeRegExp(CTX_AGENT_CLI)} --agent ${item.expectedClient} --workspace ${escapeRegExp(cwd)} --project ${escapeRegExp(path.basename(cwd))} --route team --route-execute live --team-provider ${item.expectedProvider} --team-workers 3 --prompt "<task>" --no-bootstrap`)
    );
    assert.match(
      autoPrompt,
      new RegExp(`node ${escapeRegExp(CTX_AGENT_CLI)} --agent ${item.expectedClient} --workspace ${escapeRegExp(cwd)} --project ${escapeRegExp(path.basename(cwd))} --route subagent --route-execute live --team-provider ${item.expectedProvider} --team-workers 3 --blueprint feature --prompt "<task>" --no-bootstrap`)
    );
    assert.match(
      autoPrompt,
      new RegExp(`node .*scripts/aios\.mjs harness run --objective "<task>" --provider ${item.expectedProvider} --max-iterations 8 --worktree --workspace ${escapeRegExp(cwd)}`, 'u')
    );
  }
});

test('wrapped interactive opencode runs fallback subagent client to codex-cli by default', async () => {
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
  const autoPrompt = parseRunnerAutoPrompt(result.stdout);
  assert.match(
    autoPrompt,
    new RegExp(`node ${escapeRegExp(CTX_AGENT_CLI)} --agent opencode-cli --workspace ${escapeRegExp(cwd)} --project ${escapeRegExp(path.basename(cwd))} --route team --route-execute live --team-provider codex --team-workers 3 --prompt "<task>" --no-bootstrap`, 'u')
  );
  assert.match(
    autoPrompt,
    new RegExp(`node ${escapeRegExp(CTX_AGENT_CLI)} --agent opencode-cli --workspace ${escapeRegExp(cwd)} --project ${escapeRegExp(path.basename(cwd))} --route subagent --route-execute live --team-provider codex --team-workers 3 --blueprint feature --prompt "<task>" --no-bootstrap`, 'u')
  );
  assert.match(
    autoPrompt,
    new RegExp(`node .*scripts/aios\.mjs harness run --objective "<task>" --provider opencode --max-iterations 8 --worktree --workspace ${escapeRegExp(cwd)}`, 'u')
  );
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

test('kiro-cli interactive runs are wrapped with kiro agent identity', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-kiro-interactive-'));
  const fakeBin = await createFakePassthroughCommand('kiro-cli', 'FAKE_KIRO');
  const fakeRunner = await createFakeRunner();

  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    agent: 'kiro-cli',
    command: 'kiro-cli',
    args: [],
    env: {
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'all',
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(parseRunnerWorkspace(result.stdout), cwd);
  const runnerArgs = parseRunnerArgs(result.stdout);
  const agentIndex = runnerArgs.indexOf('--agent');
  assert.equal(agentIndex >= 0, true);
  assert.equal(runnerArgs[agentIndex + 1], 'kiro-cli');

  const autoPrompt = parseRunnerAutoPrompt(result.stdout);
  assert.match(autoPrompt, /--agent kiro-cli .*--route team/u);
  assert.match(autoPrompt, /--agent kiro-cli .*--route subagent/u);
});

test('kiro-cli admin subcommands pass through without wrapping', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'aios-bridge-kiro-agent-'));
  const fakeBin = await createFakePassthroughCommand('kiro-cli', 'FAKE_KIRO');
  const fakeRunner = await createFakeRunner();

  const result = runBridge({
    cwd,
    pathPrefix: fakeBin,
    agent: 'kiro-cli',
    command: 'kiro-cli',
    args: ['agent', 'list'],
    env: {
      CTXDB_RUNNER: fakeRunner,
      CTXDB_WRAP_MODE: 'all',
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = parseLastJsonPayload(result.stdout);
  assert.equal(payload.marker, 'FAKE_KIRO');
  assert.deepEqual(payload.argv, ['agent', 'list']);
  assert.equal(parseRunnerWorkspace(result.stdout), '');
});
