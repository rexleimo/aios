#!/usr/bin/env node
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { loadHarnessConfig } from './config.schema.mjs';
import { ensureDir, writeText } from './lib/io.mjs';
import { writeCheckpointArtifacts } from './lib/checkpoint.mjs';
import { evaluateHumanGate } from './lib/human-gate.mjs';
import { findRepoRoot, formatRunTimestamp, slugify, resolveRunRoot } from './lib/paths.mjs';

function parseArgs(argv) {
  const args = { provider: '', task: '', name: '', config: '', allowRisk: false };
  const raw = argv.slice(2);
  for (let i = 0; i < raw.length; i += 1) {
    const token = raw[i];
    if (token === '--provider' && raw[i + 1]) {
      args.provider = raw[i + 1];
      i += 1;
      continue;
    }
    if (token === '--task' && raw[i + 1]) {
      args.task = raw[i + 1];
      i += 1;
      continue;
    }
    if (token === '--name' && raw[i + 1]) {
      args.name = raw[i + 1];
      i += 1;
      continue;
    }
    if (token === '--config' && raw[i + 1]) {
      args.config = raw[i + 1];
      i += 1;
      continue;
    }
    if (token === '--allow-risk') {
      args.allowRisk = true;
      continue;
    }
    if (token === '--help' || token === '-h') {
      return { ...args, help: true };
    }
  }
  return args;
}

async function readStdinText() {
  try {
    return await fs.readFile(0, 'utf8');
  } catch {
    return '';
  }
}

function expandPlaceholders(value, vars) {
  return String(value || '').replace(/\$\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));
}

function buildProviderCommand(providerConfig, vars) {
  const cmd = String(providerConfig?.cmd || '').trim();
  const args = Array.isArray(providerConfig?.args) ? providerConfig.args.map((arg) => expandPlaceholders(arg, vars)) : [];
  const env = providerConfig?.env && typeof providerConfig.env === 'object' ? providerConfig.env : {};
  const stdin = Boolean(providerConfig?.stdin);
  const output = providerConfig?.output === 'json' ? 'json' : 'text';
  return { cmd, args, env, stdin, output };
}

function usage() {
  return [
    'Usage:',
    '  node harness/run.mjs --provider <codex|claude|gemini|opencode> [--task "…"] [--name "…"] [--config path] [--allow-risk]',
    '',
    'Notes:',
    '  - If --task is omitted, the runner reads task text from stdin.',
    '  - Runtime artifacts are written under ./.harness/runs/* by default.',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const repoRoot = findRepoRoot(process.cwd());
  const configPath = args.config
    ? path.resolve(process.cwd(), args.config)
    : path.join(repoRoot, 'harness.config.json');
  const config = await loadHarnessConfig({ configPath });

  const providerId = String(args.provider || '').trim();
  if (!providerId) {
    throw new Error('Missing required --provider');
  }

  const taskText = String(args.task || '').trim() || (await readStdinText()).trim();
  if (!taskText) {
    throw new Error('Missing task text. Provide --task "..." or pipe text via stdin.');
  }

  const gate = evaluateHumanGate({ taskText, enabled: config.humanGate.enabled, allowRisk: args.allowRisk });
  if (gate.allowed && Array.isArray(gate.warnings) && gate.warnings.length > 0) {
    process.stderr.write('[harness] human gate warning; continuing:\n');
    for (const warning of gate.warnings) {
      process.stderr.write(`- ${warning}\n`);
    }
  }
  if (!gate.allowed) {
    process.stderr.write('[harness] confirmation required by human gate:\n');
    for (const reason of gate.reasons) {
      process.stderr.write(`- ${reason}\n`);
    }
    if (gate.question) {
      process.stderr.write(`Question: ${gate.question}\n`);
    }
    if (gate.recommendedAction) {
      process.stderr.write(`Recommended action: ${gate.recommendedAction}\n`);
    }
    process.stderr.write(`${gate.resumeHint || 'After explicit approval, rerun with --allow-risk.'}\n`);
    process.exitCode = 2;
    return;
  }

  const runTimestamp = formatRunTimestamp(new Date());
  const slug = slugify(args.name || taskText, { maxLength: 48 });
  const runRoot = resolveRunRoot({ repoRoot, config });
  const runDir = path.join(runRoot, `${runTimestamp}-${providerId}-${slug}`);
  await ensureDir(runDir);

  const promptFile = path.join(runDir, 'prompt.md');
  const stdoutFile = path.join(runDir, 'stdout.txt');
  const stderrFile = path.join(runDir, 'stderr.txt');
  const runMetaFile = path.join(runDir, 'run.json');

  const prompt = [
    '# Task',
    '',
    taskText,
    '',
    '---',
    '',
    '## Harness Notes',
    '',
    '- Keep output concise and actionable.',
    '- If the task is ambiguous or blocked on auth/payment/policy actions, say so clearly.',
  ].join('\n');
  await writeText(promptFile, `${prompt}\n`);

  const providerConfig = config.providers[providerId];
  if (!providerConfig) {
    throw new Error(`Unknown provider "${providerId}". Configure it in harness.config.json under providers.${providerId}`);
  }

  const vars = {
    repoRoot,
    runDir,
    promptFile,
  };
  const command = buildProviderCommand(providerConfig, vars);
  if (!command.cmd) {
    throw new Error(`Provider "${providerId}" is missing cmd in harness.config.json`);
  }

  const startedAt = Date.now();
  const child = spawn(command.cmd, command.args, {
    cwd: repoRoot,
    env: { ...process.env, ...command.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const stdoutStream = fsSync.createWriteStream(stdoutFile, { flags: 'w' });
  const stderrStream = fsSync.createWriteStream(stderrFile, { flags: 'w' });
  child.stdout.pipe(stdoutStream);
  child.stderr.pipe(stderrStream);

  if (command.stdin) {
    child.stdin.write(`${prompt}\n`);
    child.stdin.end();
  } else {
    child.stdin.end();
  }

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });

  stdoutStream.end();
  stderrStream.end();
  await Promise.allSettled([
    once(stdoutStream, 'close'),
    once(stderrStream, 'close'),
  ]);

  const elapsedMs = Date.now() - startedAt;
  const runMeta = {
    schemaVersion: 1,
    provider: providerId,
    cmd: command.cmd,
    args: command.args,
    cwd: repoRoot,
    exitCode,
    elapsedMs,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
  };
  await writeText(runMetaFile, `${JSON.stringify(runMeta, null, 2)}\n`);

  await writeCheckpointArtifacts({
    runDir,
    providerId,
    taskText,
    exitCode,
    elapsedMs,
  });

  process.stdout.write(`[harness] run saved: ${path.relative(repoRoot, runDir)}\n`);
}

main().catch((err) => {
  process.stderr.write(`[harness] error: ${err?.stack || err?.message || String(err)}\n`);
  process.exitCode = 1;
});
