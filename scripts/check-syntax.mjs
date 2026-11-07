#!/usr/bin/env node
/*
 * 中文注释：全仓 .mjs 语法体检。串行实测 72.7s（1276 个文件 × 一次 node spawn），
 * 所以它**不进回归**——它是一条按需门（提交大改后、发布前跑一次）。
 *
 * 它存在的原因是一次真实事故：帮助文案是 template literal，我在里面写了反引号，
 * 模块当场变成 SyntaxError。当时只对"新建文件"跑了 node --check，没覆盖"只改了文案的文件"，
 * 于是要等某个恰好 spawn CLI 的测试才炸。**改文案等于改代码**，这条命令把这件事变成
 * 一条自己能主动跑的 cheap 检查（并发版实测见输出）。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

// 中文注释：默认只扫宿主自己的运行时。rex-harness 是子模块，内核有它自己的 CI；
// 把别人仓库的语法纳入宿主门禁，得到的不是安全而是跨仓粉红。需要时显式 --root。
const DEFAULT_ROOTS = ['scripts'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.aios', 'coverage']);
const CONCURRENCY = Number(process.env.AIOS_SYNTAX_CHECK_JOBS || 8);

function parseArgs(argv) {
  const roots = [];
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') roots.push(String(argv[++i] || ''));
    else if (arg === '--json') json = true;
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write('Usage: node scripts/check-syntax.mjs [--root <dir>]... [--json]\n');
      process.exit(0);
    }
  }
  return { roots: roots.length ? roots : DEFAULT_ROOTS, json };
}

async function collectMjs(dir, out) {
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out; // 目录不存在就跳过：本仓子模块可能未检出
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await collectMjs(full, out);
    } else if (entry.name.endsWith('.mjs')) {
      out.push(full);
    }
  }
  return out;
}

function checkFile(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--check', file], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolve({ file, ok: false, message: error.message }));
    child.on('close', (code) => {
      if (code === 0) return resolve({ file, ok: true });
      const line = stderr.split(/\r?\n/u).find((text) => /Error|error:/u.test(text)) || stderr.trim() || `exit ${code}`;
      resolve({ file, ok: false, message: line.slice(0, 300) });
    });
  });
}

async function runPool(files, worker, limit) {
  const results = [];
  let cursor = 0;
  const lanes = Array.from({ length: Math.min(limit, files.length) }, async () => {
    while (cursor < files.length) {
      const index = cursor;
      cursor += 1;
      results.push(await worker(files[index]));
    }
  });
  await Promise.all(lanes);
  return results;
}

async function main() {
  const { roots, json } = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  const files = [];
  for (const root of roots) {
    await collectMjs(root, files);
  }
  const results = await runPool(files, checkFile, CONCURRENCY);
  const failures = results.filter((result) => !result.ok);
  const elapsedMs = Date.now() - startedAt;

  if (json) {
    process.stdout.write(`${JSON.stringify({
      checked: files.length,
      failures: failures.length,
      elapsedMs,
      concurrency: CONCURRENCY,
      items: failures.map((failure) => ({ file: failure.file, message: failure.message })),
    }, null, 2)}\n`);
  } else {
    for (const failure of failures) {
      process.stdout.write(`[syntax] FAIL ${failure.file}\n         ${failure.message}\n`);
    }
    process.stdout.write(`[syntax] checked=${files.length} failures=${failures.length} elapsed_ms=${elapsedMs} concurrency=${CONCURRENCY}\n`);
  }
  process.exitCode = failures.length ? 1 : 0;
}

await main();
