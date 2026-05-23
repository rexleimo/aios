import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function pathExists(filePath) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

export async function ensureParentDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function writeText(filePath, content) {
  await ensureParentDir(filePath);
  await fs.writeFile(filePath, content, 'utf8');
}

export async function atomicWriteText(filePath, content) {
  await ensureParentDir(filePath);
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tempPath, content, 'utf8');
  await fs.rename(tempPath, filePath);
}

export async function appendText(filePath, content) {
  await ensureParentDir(filePath);
  await fs.appendFile(filePath, content, 'utf8');
}

export function sha256Hex(content) {
  return createHash('sha256').update(content).digest('hex');
}

// 纯函数：按相对路径和内容生成派生索引摘要，确保跨平台路径分隔符不影响结果。
export function hashParts(parts) {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(String(part.relativePath || ''), 'utf8');
    hash.update('\0');
    hash.update(part.content || '');
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function createParseError(message, code, details = {}) {
  const error = new Error(message);
  const { message: parseMessage, ...rest } = details;
  error.code = code;
  Object.assign(error, rest);
  if (parseMessage) {
    error.parseMessage = parseMessage;
  }
  return error;
}

export async function collectRecursiveFiles(rootDir, predicate = () => true) {
  const output = [];
  async function visit(currentDir) {
    let entries = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && predicate(entryPath, entry)) {
        output.push(entryPath);
      }
    }
  }
  await visit(rootDir);
  return output;
}
