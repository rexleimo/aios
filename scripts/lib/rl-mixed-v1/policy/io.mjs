import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { normalizeOpeLogRow } from './ope.mjs';

export async function readJsonObject(filePath) {
  try {
    const value = JSON.parse(await readFile(filePath, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('json payload must be an object');
    }
    return { status: 'ok', value };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { status: 'missing', value: null };
    }
    return { status: 'error', value: null, error };
  }
}

export async function readNdjsonRows(filePath) {
  try {
    const content = await readFile(filePath, 'utf8');
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        try {
          return normalizeOpeLogRow(JSON.parse(line));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function writeNdjsonRows(filePath, rows = []) {
  const serialized = rows
    .map((row) => normalizeOpeLogRow(row))
    .filter(Boolean)
    .map((row) => JSON.stringify(row))
    .join('\n');
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${serialized}${serialized ? '\n' : ''}`, 'utf8');
}
