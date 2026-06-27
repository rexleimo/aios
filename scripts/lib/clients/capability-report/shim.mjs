// scripts/lib/clients/capability-report/shim.mjs — native shim 检测辅助函数
// 从 capability-report.mjs 拆分出的独立模块

import { constants as fsConstants, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CLIENT_DEFINITIONS } from '../registry.mjs';

const NATIVE_SHIM_MARK = 'AIOS_NATIVE_SHIM managed';

export { NATIVE_SHIM_MARK };

function resolveNativeShimDir(env = process.env) {
  const explicit = String(env.AIOS_NATIVE_SHIM_DIR || '').trim();
  if (explicit && path.isAbsolute(explicit)) return explicit;
  const home = String(env.HOME || env.USERPROFILE || '').trim();
  return path.join(path.isAbsolute(home) ? home : os.homedir(), '.aios', 'bin');
}

export { resolveNativeShimDir };

function pathEntries(env = process.env) {
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH';
  return String(env[pathKey] || '').split(path.delimiter).filter(Boolean);
}

function samePath(left, right) {
  const a = path.resolve(String(left || ''));
  const b = path.resolve(String(right || ''));
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function pathExtEntries(env = process.env) {
  const pathExtKey = Object.keys(env).find((key) => key.toLowerCase() === 'pathext') || 'PATHEXT';
  return String(env[pathExtKey] || '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (entry.startsWith('.') ? entry : `.${entry}`).toLowerCase());
}

function buildPathEnvWithoutShim(env, shimDir) {
  const next = { ...env };
  const pathKeys = Object.keys(next).filter((key) => key.toLowerCase() === 'path');
  for (const key of pathKeys.length > 0 ? pathKeys : ['PATH']) {
    const entries = String(next[key] || '').split(path.delimiter);
    next[key] = entries.filter((entry) => entry && !samePath(entry, shimDir)).join(path.delimiter);
  }
  return next;
}

async function fileExists(filePath) {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) return false;
    if (process.platform !== 'win32') {
      await fs.access(filePath, fsConstants.X_OK);
    }
    return true;
  } catch (error) {
    if (['EACCES', 'ENOENT', 'ENOTDIR'].includes(error?.code)) return false;
    throw error;
  }
}

async function findCommandInPath(commandName, env = process.env) {
  const entries = pathEntries(env);
  const names = process.platform === 'win32' && !path.extname(commandName)
    ? pathExtEntries(env).map((ext) => `${commandName}${ext}`)
    : [commandName];

  for (const entry of entries) {
    for (const name of names) {
      const candidate = path.join(entry, name);
      if (await fileExists(candidate)) return candidate;
    }
  }
  return '';
}

async function inspectNativeShim(clientId, { env = process.env } = {}) {
  const definition = CLIENT_DEFINITIONS[clientId];
  const shimDir = resolveNativeShimDir(env);
  if (!definition?.commandName) {
    return {
      required: false,
      shimDir,
      expectedPath: '',
      installed: false,
      inPath: false,
      pathPrecedence: false,
      realCommandAvailable: false,
      realCommandPath: '',
      error: `unknown client: ${clientId}`,
    };
  }
  const fileName = process.platform === 'win32' ? `${definition.commandName}.cmd` : definition.commandName;
  const shimPath = path.join(shimDir, fileName);
  const entries = pathEntries(env);
  let managed = false;
  try {
    const content = await fs.readFile(shimPath, 'utf8');
    managed = content.includes(NATIVE_SHIM_MARK);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const realCommandPath = await findCommandInPath(definition.commandName, buildPathEnvWithoutShim(env, shimDir));
  return {
    required: false,
    shimDir,
    expectedPath: shimPath,
    installed: managed,
    inPath: entries.some((entry) => samePath(entry, shimDir)),
    pathPrecedence: entries.length > 0 && samePath(entries[0], shimDir),
    realCommandAvailable: Boolean(realCommandPath),
    realCommandPath,
  };
}

export { inspectNativeShim };
