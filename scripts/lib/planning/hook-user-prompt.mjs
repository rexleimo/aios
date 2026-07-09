#!/usr/bin/env node
/**
 * Claude Code UserPromptSubmit hook runner.
 * Usage: node scripts/lib/planning/hook-user-prompt.mjs
 * Reads hook JSON from stdin, writes JSON additionalContext to stdout.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runClaudeUserPromptSubmitHook } from './auto-gate.mjs';

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const stdinText = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');

  // Prefer CLAUDE_PROJECT_DIR / cwd from payload later; default repo root near this file
  const here = path.dirname(fileURLToPath(import.meta.url));
  const defaultRoot = process.env.CLAUDE_PROJECT_DIR
    || process.env.AIOS_ROOT
    || path.resolve(here, '../../..');

  let cwd = defaultRoot;
  try {
    const parsed = JSON.parse(stdinText || '{}');
    if (parsed.cwd && path.isAbsolute(parsed.cwd)) cwd = parsed.cwd;
  } catch {
    // ignore
  }

  const { exitCode, output } = await runClaudeUserPromptSubmitHook({
    rootDir: cwd,
    stdinText,
    client: 'claude',
  });
  process.stdout.write(`${JSON.stringify(output)}\n`);
  process.exitCode = exitCode;
}

main().catch((error) => {
  process.stderr.write(`[aios-plan-hook] ${error.message}\n`);
  // Fail open with a minimal directive so planning still surfaces
  process.stdout.write(`${JSON.stringify({
    additionalContext: '## AIOS ALWAYS-ON PLANNING\nHook error — still run writing-plans and update docs/plans before implementing.\n',
  })}\n`);
  process.exitCode = 0;
});
