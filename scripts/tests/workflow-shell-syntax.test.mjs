import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import YAML from 'yaml';

/**
 * Workflow shell integrity.
 *
 * Why this exists (2026-09-21, A6): `release-health-watch.yml` failed every scheduled
 * run for days with "Process completed with exit code 2" while every later step in the
 * same job succeeded. The cause was indentation, not logic: the `Run release strict
 * health gate` step's `node - <<'NODE'` heredoc was indented 12 spaces while the YAML
 * block's base indentation was 10. YAML strips the base indentation, so the terminator
 * survived as `"  NODE"` — and bash only accepts a heredoc terminator at column 0 (only
 * `<<-` strips *tabs*). The heredoc never closed, bash consumed the rest of the script,
 * and the whole step died before running a single command with `syntax error: unexpected
 * end of file from \`if' command` — exit 2. Job logs need admin rights, so the failure
 * was invisible from the public API; this guard makes it a local, deterministic failure.
 *
 * Two assertions per workflow `run:` block:
 *   S1 No heredoc terminator line may carry leading whitespace after YAML processing
 *      (bash cannot accept it), which is also what makes the failure obvious by name.
 *   S2 `bash -n` accepts the block, which catches this and any other shell syntax error.
 *
 * Non-bash steps (`shell: pwsh`, `python`, ...) are out of scope: `windows-shell-smoke.yml`
 * uses pwsh deliberately.
 */

const WORKFLOWS_DIR = path.join(process.cwd(), '.github', 'workflows');

function workflowFiles() {
  return fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort();
}

/**
 * Heredoc terminators that bash cannot accept: for `<<WORD` the terminator must be at
 * column 0, and for `<<-WORD` it may be indented with tabs only.
 */
export function heredocTerminatorProblems(script) {
  const lines = script.split('\n');
  const problems = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /<<(-?)\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/u.exec(lines[index]);
    if (!match) continue;
    const [, stripMode, word] = match;
    const terminator = lines.findIndex((line, at) => at > index && line.trim() === word);
    if (terminator < 0) {
      problems.push(`here-document <<${stripMode}${word} at line ${index + 1} is never closed after YAML processing`);
      continue;
    }
    const terminatorLine = lines[terminator];
    if (terminatorLine === word) continue;
    const leading = terminatorLine.slice(0, terminatorLine.length - terminatorLine.trimStart().length);
    const tabsOnly = leading.length > 0 && leading.split('').every((ch) => ch === '\t');
    if (stripMode === '-' && tabsOnly) continue;
    problems.push(
      `here-document <<${stripMode}${word} terminator at line ${terminator + 1} is indented (${JSON.stringify(terminatorLine)}); `
      + 'bash only accepts column 0 for <<WORD',
    );
  }
  return problems;
}

/** Every `run:` block that GitHub would execute with bash. */
export function bashRunBlocks() {
  const blocks = [];
  for (const file of workflowFiles()) {
    const doc = YAML.parse(fs.readFileSync(path.join(WORKFLOWS_DIR, file), 'utf8'));
    for (const [jobName, job] of Object.entries(doc.jobs || {})) {
      for (const step of job.steps || []) {
        if (typeof step.run !== 'string') continue;
        const shell = String(step.shell || '');
        // Default runner shell on ubuntu is bash; an explicit non-bash shell opts out.
        if (shell && !/bash/u.test(shell)) continue;
        blocks.push({ file, job: jobName, step: String(step.name || '(unnamed)'), script: step.run });
      }
    }
  }
  return blocks;
}

function bashAvailable() {
  const probe = spawnSync('bash', ['--version'], { encoding: 'utf8' });
  return probe.status === 0;
}

test('S1: every heredoc in a workflow run block closes at a bash-legal indentation', () => {
  const offenders = [];
  for (const block of bashRunBlocks()) {
    for (const problem of heredocTerminatorProblems(block.script)) {
      offenders.push(`${block.file} :: ${block.job} :: ${block.step} -> ${problem}`);
    }
  }
  assert.deepEqual(offenders, [], `bash cannot close these here-documents: ${offenders.join('; ')}`);
});

test('S2: every bash run block passes `bash -n`', (t) => {
  if (!bashAvailable()) {
    t.skip('bash is not available on PATH; this guard runs in CI (ubuntu) and locally with Git Bash');
    return;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-workflow-syntax-'));
  try {
    const failures = [];
    for (const block of bashRunBlocks()) {
      const scriptPath = path.join(dir, `${block.file}-${block.step.replace(/[^\w.-]+/gu, '_')}.sh`);
      fs.writeFileSync(scriptPath, block.script, 'utf8');
      const result = spawnSync('bash', ['-n', scriptPath], { encoding: 'utf8' });
      if (result.status === 0) continue;
      const firstLine = String(result.stderr || '').trim().split('\n').slice(0, 2).join(' | ');
      failures.push(`${block.file} :: ${block.job} :: ${block.step} -> ${firstLine}`);
    }
    assert.deepEqual(failures, [], `bash rejected these workflow scripts: ${failures.join('; ')}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
