import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MCP_DIR } from './common.mjs';
import { ensureSuccess, runCommand } from './common.mjs';

const COMPILED_CONTEXTDB_CLI = path.join(MCP_DIR, 'dist', 'contextdb', 'cli.js');
const CONTEXTDB_SOURCE_DIR = path.join(MCP_DIR, 'src', 'contextdb');
const CONTEXTDB_TEXT_FILE_THRESHOLD = 2048;

function newestSourceMtimeMs(dirPath) {
  let newest = 0;
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestSourceMtimeMs(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) newest = Math.max(newest, statSync(entryPath).mtimeMs);
  }
  return newest;
}

function shouldUseCompiledContextDbCli() {
  if (!existsSync(COMPILED_CONTEXTDB_CLI)) return false;
  try {
    const compiledMtime = statSync(COMPILED_CONTEXTDB_CLI).mtimeMs;
    const sourceMtime = newestSourceMtimeMs(CONTEXTDB_SOURCE_DIR);
    return compiledMtime + 1000 >= sourceMtime;
  } catch {
    return false;
  }
}

const USE_COMPILED_CONTEXTDB_CLI = shouldUseCompiledContextDbCli();

function materializeLongContextDbTextArg(workspaceRoot, subcommand, args = []) {
  if (subcommand !== 'event:add') return { args, cleanup: null };
  const textIndex = args.findIndex((arg) => arg === '--text');
  if (textIndex < 0 || textIndex + 1 >= args.length) return { args, cleanup: null };

  const text = String(args[textIndex + 1] ?? '');
  if (text.length <= CONTEXTDB_TEXT_FILE_THRESHOLD && !/[\r\n]/u.test(text)) return { args, cleanup: null };

  const tmpRoot = path.join(workspaceRoot || os.tmpdir(), '.aios', 'tmp');
  mkdirSync(tmpRoot, { recursive: true });
  const filePath = path.join(tmpRoot, `contextdb-event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
  writeFileSync(filePath, text, 'utf8');
  return {
    args: [...args.slice(0, textIndex), '--text-file', filePath, ...args.slice(textIndex + 2)],
    cleanup: () => {
      try { rmSync(filePath, { force: true }); } catch { /* 临时文件清理失败不影响已写入的事件。 */ }
    },
  };
}

export function ctx(workspaceRoot, subcommand, args) {
  const materialized = materializeLongContextDbTextArg(workspaceRoot, subcommand, args);
  let firstResult;
  try {
    if (USE_COMPILED_CONTEXTDB_CLI) {
      firstResult = runCommand(process.execPath, [COMPILED_CONTEXTDB_CLI, subcommand, '--workspace', workspaceRoot, ...materialized.args], { cwd: MCP_DIR });
    } else {
      firstResult = runCommand('npm', ['run', '-s', 'contextdb', '--', subcommand, '--workspace', workspaceRoot, ...materialized.args], { cwd: MCP_DIR });
    }
  } finally {
    if (materialized.cleanup) materialized.cleanup();
  }

  if (!firstResult.error && firstResult.status === 0) return (firstResult.stdout || '').trim();
  ensureSuccess(firstResult, `contextdb ${subcommand} failed`);
  return (firstResult.stdout || '').trim();
}

function parseJsonValue(text, getter) {
  if (!text) return '';
  const data = JSON.parse(text);
  return getter(data) || '';
}

export function extractLatestSessionId(jsonText) {
  return parseJsonValue(jsonText, (x) => x?.data?.session?.sessionId || x?.session?.sessionId);
}

export function extractCreatedSessionId(jsonText) {
  return parseJsonValue(jsonText, (x) => x?.data?.sessionId || x?.sessionId);
}
