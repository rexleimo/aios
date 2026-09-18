import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { sanitizeFileSegment } from './file-segment.mjs';

/**
 * The temp name is derived from the target name, so an id inside the target
 * basename (for example `session:eval-001` on an evolution verdict) would be
 * copied into the temp name too and silently create an NTFS alternate data
 * stream instead of a file. Derived names are always sanitized.
 */
export function atomicTempPath(filePath) {
  return path.join(path.dirname(filePath), `.${sanitizeFileSegment(path.basename(filePath))}.${process.pid}.${randomUUID()}.tmp`);
}

export async function writeFileAtomic(filePath, content, encoding = 'utf8') {
  const dirPath = path.dirname(filePath);
  const tempPath = atomicTempPath(filePath);

  await mkdir(dirPath, { recursive: true });

  try {
    await writeFile(tempPath, content, encoding);
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}
