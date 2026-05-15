#!/usr/bin/env node
import path from 'node:path';
import { spawn } from 'node:child_process';

import { loadHarnessConfig } from './config.schema.mjs';
import { findRepoRoot } from './lib/paths.mjs';

function spawnOnce(cmd, args, { cwd, env } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      if (stderr.length > 2000) {
        stderr = `${stderr.slice(0, 1999)}…`;
      }
    });
    child.on('error', (error) => resolve({ ok: false, error }));
    child.on('close', (code) => resolve({ ok: true, code, stderr }));
  });
}

async function main() {
  const repoRoot = findRepoRoot(process.cwd());
  const configPath = path.join(repoRoot, 'harness.config.json');
  const config = await loadHarnessConfig({ configPath });

  const providers = Object.entries(config.providers || {});
  if (providers.length === 0) {
    process.stderr.write('[harness] no providers configured in harness.config.json\n');
    process.exitCode = 1;
    return;
  }

  let ok = true;
  for (const [providerId, provider] of providers) {
    const cmd = String(provider?.cmd || '').trim();
    if (!cmd) {
      ok = false;
      process.stderr.write(`[harness] provider ${providerId}: missing cmd\n`);
      continue;
    }
    const result = await spawnOnce(cmd, ['--help'], { cwd: repoRoot, env: process.env });
    if (!result.ok) {
      ok = false;
      const code = result.error?.code ? ` code=${result.error.code}` : '';
      process.stderr.write(`[harness] provider ${providerId}: failed to spawn "${cmd}"${code}\n`);
      continue;
    }
    process.stdout.write(`[harness] provider ${providerId}: cmd="${cmd}" ok (exit=${result.code})\n`);
  }

  if (!ok) {
    process.stderr.write('[harness] doctor failed. Fix harness.config.json provider commands and try again.\n');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  process.stderr.write(`[harness] doctor error: ${err?.stack || err?.message || String(err)}\n`);
  process.exitCode = 1;
});

