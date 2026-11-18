/**
 * Test scope contract — `aios plan statusline`
 *
 * User goal:
 *   Claude Code renders one status line. Today AIOS writes its statusLine only under
 *   `aiosNative`, a key Claude Code never reads, so the slot is effectively empty and
 *   the caveman badge has nowhere to live. This command is the composer for that slot.
 *
 * In-scope behavior (observed at the public CLI seam):
 *   S1  With no active plan the line is non-empty and says so, exit 0.
 *   S2  With a plan the line carries status + short file name + task progress.
 *   S3  A caveman mode file yields a badge; off/unknown/missing yields no badge.
 *   S4  `statusline` is part of the declared subcommand vocabulary.
 *   S5  Mode-file content is filtered: control bytes and path traversal never reach stdout.
 *
 * Explicit non-goals:
 *   ANSI styling choices, terminal width handling, plan ledger writes.
 */

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parsePlanArgs } from '../../../../lib/tooling/cli/parse-args/govern/plan.mjs';
import { PLAN_SUBCOMMANDS, runPlanCommand } from '../../../../lib/foundation/planning/ops/cli.mjs';
import { composeStatusline, renderCavemanBadge } from '../../../../lib/foundation/planning/ops/statusline.mjs';

function makeIo() {
  let stdoutText = '';
  return {
    stdout: { write(chunk) { stdoutText += String(chunk); } },
    stderr: { write() {} },
    read() { return stdoutText; },
  };
}

async function runStatusline(rootDir, env = {}) {
  const io = makeIo();
  const saved = { CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR };
  if (env.CLAUDE_CONFIG_DIR) process.env.CLAUDE_CONFIG_DIR = env.CLAUDE_CONFIG_DIR;
  else delete process.env.CLAUDE_CONFIG_DIR;
  try {
    const outcome = await runPlanCommand({ subcommand: 'statusline' }, { rootDir, ...io });
    return { outcome, line: io.read() };
  } finally {
    if (saved.CLAUDE_CONFIG_DIR === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = saved.CLAUDE_CONFIG_DIR;
  }
}

async function makeWorkspace(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test('S1: statusline with no active plan prints a non-empty line and exits 0', async () => {
  const rootDir = await makeWorkspace('aios-statusline-empty-');
  try {
    const { outcome, line } = await runStatusline(rootDir);
    assert.equal(outcome.exitCode, 0);
    assert.ok(line.trim().length > 0, 'an empty status line reads as a rendering failure');
    assert.match(line, /no active plan/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('S2: statusline carries plan status, short file name and progress', async () => {
  const rootDir = await makeWorkspace('aios-statusline-plan-');
  try {
    const started = await runPlanCommand(
      { subcommand: 'start', title: 'statusline probe', task: 'statusline probe' },
      { rootDir, stdout: { write() {} }, stderr: { write() {} } },
    );
    assert.equal(started.exitCode, 0);

    const { line } = await runStatusline(rootDir);
    assert.match(line, /plan active/);
    assert.match(line, /\.md/);
    assert.doesNotMatch(line, /docs\/plans\//, 'status line uses the short name, not the full path');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('S3: badge renders only for a known caveman mode', async () => {
  assert.equal(renderCavemanBadge(''), '');
  assert.equal(renderCavemanBadge('off'), '');
  assert.equal(renderCavemanBadge('nonsense'), '');
  assert.match(renderCavemanBadge('full'), /\[CAVEMAN\]/);
  assert.match(renderCavemanBadge('ultra'), /\[CAVEMAN:ULTRA\]/);

  const configDir = await makeWorkspace('aios-statusline-caveman-');
  try {
    const rootDir = await makeWorkspace('aios-statusline-caveman-root-');
    try {
      await writeFile(path.join(configDir, '.caveman-active'), 'full', 'utf8');
      const withBadge = await runStatusline(rootDir, { CLAUDE_CONFIG_DIR: configDir });
      assert.match(withBadge.line, /CAVEMAN/);

      await writeFile(path.join(configDir, '.caveman-active'), 'off', 'utf8');
      const withoutBadge = await runStatusline(rootDir, { CLAUDE_CONFIG_DIR: configDir });
      assert.doesNotMatch(withoutBadge.line, /CAVEMAN/);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('S4: statusline is declared in the plan subcommand vocabulary', () => {
  assert.ok(PLAN_SUBCOMMANDS.includes('statusline'));
  assert.equal(parsePlanArgs(['plan', 'statusline']).options.subcommand, 'statusline');
});

test('S5: hostile mode-file content never reaches stdout', async () => {
  const configDir = await makeWorkspace('aios-statusline-hostile-');
  const rootDir = await makeWorkspace('aios-statusline-hostile-root-');
  try {
    await writeFile(
      path.join(configDir, '.caveman-active'),
      ']0;pwned../../../../etc/passwd\n',
      'utf8',
    );
    const { line } = await runStatusline(rootDir, { CLAUDE_CONFIG_DIR: configDir });
    assert.doesNotMatch(line, /\]/u, 'OSC escape sequence must not be echoed');
    assert.doesNotMatch(line, /etc\/passwd/);
    assert.doesNotMatch(line, /CAVEMAN/);
  } finally {
    await rm(configDir, { recursive: true, force: true });
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('S6: composeStatusline is a pure function of its inputs', () => {
  assert.equal(
    composeStatusline({ cavemanMode: 'lite', planState: null }),
    `${renderCavemanBadge('lite')} · no active plan`,
  );
  const line = composeStatusline({
    cavemanMode: '',
    planState: { status: 'executing', relativePath: path.join('docs', 'plans', '2026-01-01-x.md') },
    progress: { tasksDone: 2, tasksTotal: 5 },
  });
  assert.equal(line, 'plan executing 2026-01-01-x.md 2/5');
});
